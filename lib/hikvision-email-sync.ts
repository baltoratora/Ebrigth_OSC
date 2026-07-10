/**
 * lib/hikvision-email-sync.ts
 *
 * Clock-in / clock-out email notifications driven by the LIVE attendance
 * pipeline (public.hikvision_attendance_all), populated by the external
 * Hikvision integration.
 *
 * PER SCAN (so every scan produces an email — used as proof the employee
 * actually used the scanner):
 *   • the FIRST scan of the day (per person)  → Clock-In email
 *   • EVERY later scan that day               → Clock-Out email
 *
 * De-dup is per individual scan (person_id + exact scan timestamp), tracked in
 * public.hikvision_scan_email_log with a claim-before-send insert so concurrent
 * 30s ticks never double-send; the claim is released if the send throws so it
 * retries on the next tick.
 *
 * All in ebright_hrfs (hrfsPrisma): the scans, BranchStaff, and the log all
 * live there. Gated by the HIKVISION_EMAIL_SYNC env flag (see
 * instrumentation.ts) so it only runs where explicitly switched on.
 */

import { hrfsPrisma } from '@/lib/hrfs';
import { sendClockInEmail, sendClockOutEmail } from '@/lib/mailer';

function todayKL(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
}

interface ScanRow {
  person_id: string;
  name: string | null;
  scan_time: Date;     // exact event timestamp (used as the de-dup key)
  hhmm: string;        // HH:MM:SS in KL time, for the email body
  is_first: boolean;   // earliest scan of the day for this person → clock-in
}

let tableReady = false;
async function ensureLogTable(): Promise<void> {
  if (tableReady) return;
  await hrfsPrisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public.hikvision_scan_email_log (
      person_id text        NOT NULL,
      scan_time timestamptz NOT NULL,
      kind      text        NOT NULL,        -- 'in' | 'out'
      sent_at   timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (person_id, scan_time)
    )`);
  tableReady = true;
}

/** Atomically reserve a single scan's email slot. True only if WE inserted it. */
async function claim(personId: string, scanTime: Date, kind: 'in' | 'out'): Promise<boolean> {
  const affected = await hrfsPrisma.$executeRawUnsafe(
    `INSERT INTO public.hikvision_scan_email_log (person_id, scan_time, kind)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    personId, scanTime, kind,
  );
  return affected === 1;
}
async function unclaim(personId: string, scanTime: Date): Promise<void> {
  await hrfsPrisma.$executeRawUnsafe(
    `DELETE FROM public.hikvision_scan_email_log WHERE person_id = $1 AND scan_time = $2`,
    personId, scanTime,
  );
}

/** One pass: e-mail any not-yet-sent scans for today (KL). */
export async function syncHikvisionEmails(): Promise<void> {
  await ensureLogTable();
  const date = todayKL();

  // Every scan today (KL day), each tagged is_first = the person's earliest
  // scan of the day. first → clock-in; all later scans → clock-out.
  // NOTE: event_time is `timestamp WITHOUT time zone` and is already stored in
  // KL local wall-clock by the scanner integration. So we must NOT apply
  // `AT TIME ZONE` — that would shift it 8h. Plain to_char / ::date give the
  // correct KL time and KL date directly.
  const scans = await hrfsPrisma.$queryRawUnsafe<ScanRow[]>(
    `SELECT person_id,
            name,
            event_time AS scan_time,
            to_char(event_time, 'HH24:MI:SS') AS hhmm,
            (event_time = min(event_time) OVER (PARTITION BY person_id)) AS is_first
       FROM public.hikvision_attendance_all
      WHERE event_time::date = $1::date
        AND person_id IS NOT NULL AND person_id <> '' AND person_id <> '0'
      ORDER BY person_id, event_time`,
    date,
  );
  if (scans.length === 0) return;

  // Resolve recipient + display name from BranchStaff (person_id has already
  // been corrected by the remap trigger, so it matches employeeId).
  const ids = Array.from(new Set(scans.map(s => s.person_id)));
  const staff = await hrfsPrisma.branchStaff.findMany({
    where: { employeeId: { in: ids } },
    select: { employeeId: true, name: true, email: true },
  });
  const byId = new Map(staff.map(s => [String(s.employeeId), s]));

  for (const s of scans) {
    const st = byId.get(s.person_id);
    const email = st?.email;
    if (!email) continue; // no address on file → can't notify; skip quietly
    const name = st?.name || s.name || s.person_id;
    const kind: 'in' | 'out' = s.is_first ? 'in' : 'out';

    if (await claim(s.person_id, s.scan_time, kind)) {
      try {
        if (kind === 'in') await sendClockInEmail(email, name, s.hhmm);
        else await sendClockOutEmail(email, name, s.hhmm);
      } catch (e) {
        await unclaim(s.person_id, s.scan_time);
        console.error(`[hikvision-email] ${kind} failed (${name}):`, (e as Error).message);
      }
    }
  }
}
