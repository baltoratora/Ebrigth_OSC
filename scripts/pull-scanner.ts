/**
 * scripts/pull-scanner.ts
 *
 * One-shot bulk pull of ALL events stored on every Hikvision scanner.
 * Fetches the full available history (up to 1 year back), groups events by
 * calendar date, then upserts into AttendanceLog — safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/pull-scanner.ts            # last 365 days
 *   npx tsx scripts/pull-scanner.ts 90         # last N days
 *   npx tsx scripts/pull-scanner.ts 2025-01-01 # from a specific date to today
 */

import 'dotenv/config';
import { request } from 'urllib';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Config from env ──────────────────────────────────────────────────────────

interface ScannerConfig {
  id: string;
  location: string;
  ip: string;
  user: string;
  pass: string;
}

const SCANNERS: ScannerConfig[] = [
  {
    id:       'scanner-1',
    location: 'HQ',
    ip:       process.env.SCANNER_1_IP   ?? '',
    user:     process.env.SCANNER_1_USER ?? '',
    pass:     process.env.SCANNER_1_PASS ?? '',
  },
  // Add more scanners here as needed:
  // { id: 'scanner-2', location: 'Subang Taipan',
  //   ip: process.env.SCANNER_2_IP ?? '', user: process.env.SCANNER_2_USER ?? '', pass: process.env.SCANNER_2_PASS ?? '' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, '0'); }

function hikvisionDate(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}+08:00`
  );
}

function displayTime(isoTime: string): string {
  return new Date(isoTime).toLocaleTimeString('en-MY', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: 'Asia/Kuala_Lumpur',
  });
}

/** Extract YYYY-MM-DD (KL timezone) from an ISO timestamp string. */
function dateKey(isoTime: string): string {
  return new Date(isoTime).toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
}

// ─── Scanner fetch ────────────────────────────────────────────────────────────

interface ScanEvent {
  employeeNoString: string;
  time: string;
  serialNo: string | number;
}

async function fetchAllEventsFromScanner(
  scanner: ScannerConfig,
  startDate: Date,
  endDate: Date,
): Promise<ScanEvent[]> {
  const { id, ip, user, pass } = scanner;

  if (!ip || !user || !pass) {
    console.error(`[${id}] Missing ip/user/pass — check env vars`);
    return [];
  }

  const url  = `http://${ip}/ISAPI/AccessControl/AcsEvent?format=json`;
  const auth = `${user}:${pass}`;

  const all: ScanEvent[] = [];
  let position = 0;
  let page     = 0;

  console.log(`[${id}] Fetching events from ${hikvisionDate(startDate)} to ${hikvisionDate(endDate)} …`);

  while (page < 500) {            // hard cap: 500 pages × 30 = 15,000 events max
    page++;
    try {
      const { data, res } = await request(url, {
        method:      'POST',
        digestAuth:  auth,
        data: {
          AcsEventCond: {
            searchID:             Date.now().toString(),
            searchResultPosition: position,
            maxResults:           30,
            major: 0,
            minor: 0,
            startTime: hikvisionDate(startDate),
            endTime:   hikvisionDate(endDate),
          },
        },
        contentType: 'application/json',
        dataType:    'json',
        timeout:     15_000,
      });

      if (res.statusCode === 401) { console.error(`[${id}] 401 Unauthorized — check credentials`); break; }
      if (res.statusCode !== 200) { console.error(`[${id}] HTTP ${res.statusCode}`); break; }

      const batch: ScanEvent[] =
        (data as { AcsEvent?: { InfoList?: ScanEvent[] } }).AcsEvent?.InfoList ?? [];

      if (batch.length === 0) break;

      all.push(...batch);
      position += batch.length;

      process.stdout.write(`\r[${id}] Page ${page} — ${all.length} events so far…`);
    } catch (err) {
      console.error(`\n[${id}] Network error:`, (err as Error).message);
      break;
    }
  }

  console.log(`\n[${id}] Total raw events: ${all.length}`);
  return all;
}

// ─── Process & upsert ─────────────────────────────────────────────────────────

async function processAndStore(
  scanner: ScannerConfig,
  events: ScanEvent[],
  staffByEmpNo: Map<string | null, { name: string | null; email: string | null }>,
): Promise<{ created: number; updated: number }> {
  // Filter + sort
  const valid = events
    .filter(e => e.employeeNoString && e.employeeNoString !== '0')
    .sort((a, b) => Number(a.serialNo) - Number(b.serialNo));

  // Group by [date][empNo]
  const byDateAndEmp = new Map<string, Map<string, ScanEvent[]>>();
  for (const ev of valid) {
    const dk = dateKey(ev.time);
    if (!byDateAndEmp.has(dk)) byDateAndEmp.set(dk, new Map());
    const byEmp = byDateAndEmp.get(dk)!;
    if (!byEmp.has(ev.employeeNoString)) byEmp.set(ev.employeeNoString, []);
    byEmp.get(ev.employeeNoString)!.push(ev);
  }

  const dates = [...byDateAndEmp.keys()].sort();
  console.log(`[${scanner.id}] Processing ${dates.length} unique dates, ${valid.length} valid events…`);

  let created = 0;
  let updated = 0;

  for (const date of dates) {
    const empGroups = byDateAndEmp.get(date)!;

    for (const [empNo, scans] of empGroups) {
      const staff       = staffByEmpNo.get(empNo);
      const resolvedName = staff?.name ?? '';
      const empName      = (!resolvedName || resolvedName === empNo) ? '' : resolvedName;

      const first       = scans[0];
      const last        = scans[scans.length - 1];
      const hasClockOut = scans.length > 1;
      const clockInTime  = displayTime(first.time);
      const clockOutTime = hasClockOut ? displayTime(last.time) : null;

      const existing = await prisma.attendanceLog.findUnique({
        where: { date_empNo: { date, empNo } },
      });

      if (!existing) {
        await prisma.attendanceLog.create({
          data: {
            date,
            empNo,
            empName,
            clockInTime,
            clockInSerialNo:   String(first.serialNo),
            clockInEmailSent:  false,
            clockOutTime,
            clockOutSerialNo:  hasClockOut ? String(last.serialNo) : null,
            clockOutEmailSent: false,
            scannerLocation:   scanner.location,
          },
        });
        created++;
      } else if (hasClockOut && String(last.serialNo) !== existing.clockOutSerialNo && clockOutTime) {
        await prisma.attendanceLog.update({
          where: { date_empNo: { date, empNo } },
          data:  { clockOutTime, clockOutSerialNo: String(last.serialNo) },
        });
        updated++;
      }
    }

    process.stdout.write(`\r[${scanner.id}] ${date} done — ${created} created, ${updated} updated`);
  }

  console.log(`\n[${scanner.id}] Finished — created: ${created}, updated: ${updated}`);
  return { created, updated };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const arg = process.argv[2];

  const endDate = new Date();

  let startDate: Date;
  if (arg && /^\d{4}-\d{2}-\d{2}$/.test(arg)) {
    startDate = new Date(arg + 'T00:00:00');
  } else {
    const daysBack = arg ? parseInt(arg, 10) : 365;
    startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    startDate.setHours(0, 0, 0, 0);
  }

  console.log(`\n=== Scanner Pull ===`);
  console.log(`Range : ${startDate.toDateString()} → ${endDate.toDateString()}`);
  console.log(`Scanners: ${SCANNERS.filter(s => s.ip).length} configured\n`);

  // Load all BranchStaff once
  const allStaff = await prisma.branchStaff.findMany({
    select: { employeeId: true, name: true, email: true },
  });
  const staffByEmpNo = new Map(allStaff.map(s => [s.employeeId, s]));
  console.log(`Loaded ${allStaff.length} BranchStaff records.\n`);

  let totalCreated = 0;
  let totalUpdated = 0;

  for (const scanner of SCANNERS) {
    if (!scanner.ip) { console.warn(`[${scanner.id}] Skipped — no IP configured`); continue; }

    const events = await fetchAllEventsFromScanner(scanner, startDate, endDate);
    if (events.length === 0) { console.log(`[${scanner.id}] No events returned.`); continue; }

    const { created, updated } = await processAndStore(scanner, events, staffByEmpNo);
    totalCreated += created;
    totalUpdated += updated;
  }

  console.log(`\n=== Done ===`);
  console.log(`Total created : ${totalCreated}`);
  console.log(`Total updated : ${totalUpdated}`);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Fatal error:', err);
  prisma.$disconnect();
  process.exit(1);
});
