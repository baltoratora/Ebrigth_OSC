/**
 * lib/scanner-sync.ts
 *
 * Core sync logic: polls every configured Hikvision scanner, then writes
 * AttendanceLog records to the database. Each scanner has its own IP and
 * branch location — scans are tagged with scannerLocation on creation.
 *
 * Called from instrumentation.ts on a setInterval.
 */

import { request } from 'urllib';
import { prisma } from '@/lib/prisma';
import { hrfsPrisma } from '@/lib/hrfs';
import { sendClockInEmail, sendClockOutEmail } from '@/lib/mailer';
import { SCANNERS, ScannerConfig } from '@/lib/scanners';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScanEvent {
  employeeNoString: string;
  time: string;           // ISO-8601, e.g. "2025-04-12T08:31:00+08:00"
  serialNo: string | number;
}

interface AcsResponse {
  AcsEvent?: {
    InfoList?: ScanEvent[];
    numOfMatches?: number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, '0'); }

/** Format a JS Date into the timestamp string Hikvision expects. */
function hikvisionDate(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}+08:00`
  );
}

/** Format an ISO time string for display (HH:MM:SS, 24-hour, KL timezone). */
function displayTime(isoTime: string): string {
  return new Date(isoTime).toLocaleTimeString('en-MY', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    timeZone: 'Asia/Kuala_Lumpur',
  });
}

/** Today's date string in KL timezone, e.g. "2025-04-12". */
function todayKL(): string {
  const kl = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' })
  );
  return `${kl.getFullYear()}-${pad(kl.getMonth() + 1)}-${pad(kl.getDate())}`;
}

/** Yesterday's date string in KL timezone. */
export function yesterdayKL(): string {
  const kl = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' })
  );
  kl.setDate(kl.getDate() - 1);
  return `${kl.getFullYear()}-${pad(kl.getMonth() + 1)}-${pad(kl.getDate())}`;
}

// ─── Scanner fetch ────────────────────────────────────────────────────────────

/**
 * Fetch all scan events for a given date (YYYY-MM-DD) from one Hikvision scanner.
 * When targetDate is omitted it fetches today up to now (live sync behaviour).
 * Paginates automatically until the device returns an empty page.
 */
async function fetchEventsForDate(scanner: ScannerConfig, targetDate?: string): Promise<ScanEvent[]> {
  const { id, ip, user, pass } = scanner;

  if (!ip || !user || !pass) {
    console.error(`[scanner-sync][${id}] Missing ip/user/pass — check SCANNER_${id.toUpperCase().replace('-', '_')}_* env vars`);
    return [];
  }

  const url  = `http://${ip}/ISAPI/AccessControl/AcsEvent?format=json`;
  const auth = `${user}:${pass}`;

  // Build the time window — uses local time so hikvisionDate() formats correctly
  let startOfDay: Date;
  let endOfDay: Date;

  if (targetDate) {
    const [y, m, d] = targetDate.split('-').map(Number);
    startOfDay = new Date(y, m - 1, d, 0, 0, 0, 0);
    endOfDay   = new Date(y, m - 1, d, 23, 59, 59, 0);
  } else {
    startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    endOfDay = new Date();
  }

  const all: ScanEvent[] = [];
  let position = 0;
  let safety   = 0;          // guard against infinite loops

  while (safety < 50) {
    safety++;
    try {
      const { data, res } = await request(url, {
        method: 'POST',
        digestAuth: auth,
        // Use `data` (object) not `content` (raw string) — urllib re-attaches
        // the data object on the Digest Auth retry request. With `content` (raw
        // string), urllib drops the body on the retry and the scanner rejects it.
        data: {
          AcsEventCond: {
            searchID: Date.now().toString(),
            searchResultPosition: position,
            maxResults: 30,
            major: 0,
            minor: 0,
            startTime: hikvisionDate(startOfDay),
            endTime:   hikvisionDate(endOfDay),
          },
        },
        contentType: 'application/json',
        dataType: 'json',
        timeout: 8000,
      });

      if (res.statusCode === 401) {
        console.error(`[scanner-sync][${id}] ✗ 401 Unauthorized — verify credentials`);
        break;
      }
      if (res.statusCode !== 200) {
        console.error(`[scanner-sync][${id}] ✗ Unexpected HTTP ${res.statusCode}`);
        break;
      }

      const batch = (data as AcsResponse).AcsEvent?.InfoList ?? [];
      if (batch.length === 0) break;          // no more pages

      all.push(...batch);
      position += batch.length;

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const hint = msg.includes('ECONNREFUSED')
        ? '— scanner unreachable, check ip and network'
        : msg.includes('ETIMEDOUT')
        ? '— connection timed out, device may be off'
        : '';
      console.error(`[scanner-sync][${id}] ✗ Network error ${hint}:`, msg);
      break;
    }
  }

  return all;
}

// ─── Per-scanner processing ───────────────────────────────────────────────────

async function processScannerEvents(
  scanner: ScannerConfig,
  staffByEmpNo: Map<string | null, { name: string | null; email: string | null }>,
  date: string,
  sendEmails: boolean,
): Promise<void> {
  const allEvents = await fetchEventsForDate(scanner, date);

  // Drop placeholder / anonymous scans
  const valid = allEvents.filter(
    (e: ScanEvent) => e.employeeNoString && e.employeeNoString !== '0' && e.employeeNoString !== ''
  );
  if (valid.length === 0) return;

  // Sort by serialNo (ascending = chronological order from the scanner)
  const sorted = [...valid].sort((a, b) => Number(a.serialNo) - Number(b.serialNo));

  // Group scans by employee
  const groups = new Map<string, { time: string; serialNo: string }[]>();
  for (const ev of sorted) {
    if (!groups.has(ev.employeeNoString)) groups.set(ev.employeeNoString, []);
    groups.get(ev.employeeNoString)!.push({
      time:     ev.time,
      serialNo: String(ev.serialNo),
    });
  }

  for (const [empNo, scans] of groups) {
    // ── Resolve name + email from BranchStaff ─────────────────────────────
    const staff    = staffByEmpNo.get(empNo);
    // Resolve empName, but never store the raw scanner ID as the name —
    // that pollutes name-based reporting. If lookup fails, store "" so the
    // row is still queryable by empNo and reports can detect "name unknown".
    const resolvedName = staff?.name ?? '';
    const empName  = (!resolvedName || resolvedName === empNo) ? '' : resolvedName;
    const empEmail = staff?.email ?? '';

    const first       = scans[0];
    const last        = scans[scans.length - 1];
    const hasClockOut = scans.length > 1;

    const clockInTime  = displayTime(first.time);
    const clockOutTime = hasClockOut ? displayTime(last.time) : null;

    // ── Check if a record already exists for this employee on this date ────
    const existing = await prisma.attendanceLog.findUnique({
      where: { date_empNo: { date, empNo } },
    });

    if (!existing) {
      // ── First scan of the day — create the record ──────────────────────
      await prisma.attendanceLog.create({
        data: {
          date,
          empNo,
          empName,
          clockInTime,
          clockInSerialNo:   first.serialNo,
          clockInEmailSent:  false,
          clockOutTime,
          clockOutSerialNo:  null,
          clockOutEmailSent: false,
          scannerLocation:   scanner.location,
        },
      });
      console.log(`[scanner-sync][${scanner.id}] ✅ Created — ${empName}  in: ${clockInTime}  loc: ${scanner.location}`);

      if (sendEmails && empEmail) {
        // Fire-and-forget the clock-in notification — never block the sync loop
        // on SMTP. The DB update for clockInEmailSent only happens on success.
        void sendClockInEmail(empEmail, empName, clockInTime)
          .then(() => prisma.attendanceLog.update({
            where: { date_empNo: { date, empNo } },
            data:  { clockInEmailSent: true },
          }))
          .catch((e: Error) => console.error(`[scanner-sync][${scanner.id}] Clock-in email failed (${empName}):`, e.message));
      } else if (sendEmails) {
        console.warn(`[scanner-sync][${scanner.id}] ⚠ No email for ${empName} (empNo: ${empNo}) — clock-in email skipped. Add email to BranchStaff.`);
      }

      // If the same fetch batch already contains a later scan, record the clock-out
      // (DB write happens immediately; email is fire-and-forget).
      if (hasClockOut && clockOutTime) {
        await prisma.attendanceLog.update({
          where: { date_empNo: { date, empNo } },
          data:  { clockOutTime, clockOutSerialNo: last.serialNo, clockOutEmailSent: false },
        });
        if (sendEmails && empEmail) {
          void sendClockOutEmail(empEmail, empName, clockOutTime)
            .then(() => prisma.attendanceLog.update({
              where: { date_empNo: { date, empNo } },
              data:  { clockOutEmailSent: true },
            }))
            .catch((e: Error) => console.error(`[scanner-sync][${scanner.id}] Clock-out email failed (${empName}):`, e.message));
        } else if (sendEmails) {
          console.warn(`[scanner-sync][${scanner.id}] ⚠ No email for ${empName} (empNo: ${empNo}) — clock-out email skipped.`);
        }
      }

    } else {
      // ── Record exists — only update clock-out if a new (later) scan has appeared.
      // Clock-in email retries are intentionally NOT performed: when SMTP is
      // down or rate-limited, retries every 10s create a storm that blocks
      // the sync loop and hides new scans from the dashboard. Clock-in emails
      // are best-effort on first sight; missed ones can be re-sent manually.

      if (hasClockOut && last.serialNo !== existing.clockOutSerialNo && clockOutTime) {
        // Persist the clock-out time immediately, regardless of email outcome.
        await prisma.attendanceLog.update({
          where: { date_empNo: { date, empNo } },
          data:  { clockOutTime, clockOutSerialNo: last.serialNo, clockOutEmailSent: false },
        });
        console.log(`[scanner-sync][${scanner.id}] 🔴 Updated out — ${empName}  out: ${clockOutTime}`);

        // Fire-and-forget the clock-out email; mark sent only on success.
        if (sendEmails && empEmail) {
          void sendClockOutEmail(empEmail, empName, clockOutTime)
            .then(() => prisma.attendanceLog.update({
              where: { date_empNo: { date, empNo } },
              data:  { clockOutEmailSent: true },
            }))
            .catch((e: Error) => console.error(`[scanner-sync][${scanner.id}] Clock-out email failed (${empName}):`, e.message));
        } else if (sendEmails) {
          console.warn(`[scanner-sync][${scanner.id}] ⚠ No email for ${empName} (empNo: ${empNo}) — clock-out email skipped.`);
        }
      }
    }
  }
}

// ─── Main sync functions ──────────────────────────────────────────────────────

/**
 * Sync attendance from all scanners for a specific date.
 * Pass sendEmails=false for backfill (avoids sending stale notifications).
 */
export async function syncDateToDb(date: string, sendEmails = true): Promise<void> {
  const allStaff = await hrfsPrisma.branchStaff.findMany({
    select: { employeeId: true, name: true, email: true },
  });
  const staffByEmpNo = new Map(allStaff.map(s => [s.employeeId, s]));

  await Promise.all(
    SCANNERS.map(scanner => processScannerEvents(scanner, staffByEmpNo, date, sendEmails))
  );
}

/** Live sync for today — called every 10 s from instrumentation.ts.
 *  `sendEmails` defaults to true for backwards-compat; instrumentation now
 *  passes false because clock-in/out emails are handled by the Hikvision
 *  pipeline (lib/hikvision-email-sync.ts), not the AttendanceLog poller. */
export async function syncScannerToDb(sendEmails = true): Promise<void> {
  await syncDateToDb(todayKL(), sendEmails);
}

/**
 * Bulk backfill: sync every day from startDate to endDate (inclusive).
 * No emails are sent. Existing records are only updated if a later clock-out
 * serial is found (safe to re-run).
 *
 * onProgress is called with the date string after each day is processed.
 */
export async function syncRangeToDb(
  startDate: string,   // YYYY-MM-DD
  endDate: string,     // YYYY-MM-DD
  onProgress?: (date: string, index: number, total: number) => void,
): Promise<{ processed: number; skipped: number }> {
  // Build list of dates
  const dates: string[] = [];
  const cur = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate   + 'T00:00:00');
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }

  let processed = 0;
  let skipped   = 0;

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    try {
      await syncDateToDb(date, false);
      processed++;
    } catch (err) {
      console.error(`[scanner-sync] Backfill failed for ${date}:`, (err as Error).message);
      skipped++;
    }
    onProgress?.(date, i + 1, dates.length);
  }

  return { processed, skipped };
}
