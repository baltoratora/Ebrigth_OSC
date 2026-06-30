/**
 * lib/missing-reminder.ts
 *
 * Daily "you're marked missing today" reminder email.
 *
 * For each ACTIVE HQ employee scheduled to work today, once the clock passes
 * (their scheduled start time + 15 min grace) WITHOUT a clock-in scan, we email
 * them a reminder to write to HR justifying the absence. This is NOT a
 * clock-in/out email — it's a separate, scheduled nudge.
 *
 * A person is skipped if they have already scanned today (ST-remapped id), are
 * on approved leave today, or already filed an attendance_justification today —
 * the same "accounted for" rules the HR dashboard's missing-today card uses.
 *
 * De-dup: one reminder per person per KL day, via a claim-before-send insert
 * into public.missing_reminder_email_log (released if the send throws so it
 * retries on the next tick). All reads are in ebright_hrfs (hrfsPrisma).
 *
 * Scope is HQ only for now. Gated by the MISSING_REMINDER_EMAIL env flag
 * (see instrumentation.ts).
 */

import { hrfsPrisma } from '@/lib/hrfs';
import { sendMissingReminderEmail } from '@/lib/mailer';
import { remapStScan } from '@/lib/scan-identity';

const GRACE_SECONDS = 15 * 60; // email 15 min after the scheduled start time

// Staff intentionally hidden from attendance tracking — must NOT be nagged.
// Mirrors ATTENDANCE_HIDDEN_EMPLOYEE_IDS in app/api/branch-locations/route.ts
// (kept in sync manually; small + rarely changes).
const HIDDEN_EMPLOYEE_IDS = new Set([
  '33030010', // CHOW CHIN HUI
  '33010041', // ROHAN KUMAR A/L MANOHAR LAL
]);

type WeekHours = Record<string, { start?: string; end?: string } | null> | null;
interface StaffRow {
  code: string;
  name: string | null;
  email: string | null;
  working_hours: WeekHours;
  start_date: string | null;
  end_date: string | null;
}

function todayKL(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
}
function dowKL(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Kuala_Lumpur' });
}
function nowSecondsKL(): number {
  const t = new Date().toLocaleTimeString('en-GB', { hour12: false, timeZone: 'Asia/Kuala_Lumpur' });
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 3600 + (m || 0) * 60;
}
function toSeconds(t?: string): number {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 3600 + (m || 0) * 60;
}
function parseDay(s: string | null): Date | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T00:00:00');
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00`);
  return null;
}

let tableReady = false;
async function ensureLogTable(): Promise<void> {
  if (tableReady) return;
  await hrfsPrisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public.missing_reminder_email_log (
      emp_no      text NOT NULL,
      remind_date date NOT NULL,
      sent_at     timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (emp_no, remind_date)
    )`);
  tableReady = true;
}
/** Reserve one (employee, day) slot. True only if WE inserted it. */
async function claim(empNo: string, date: string): Promise<boolean> {
  const affected = await hrfsPrisma.$executeRawUnsafe(
    `INSERT INTO public.missing_reminder_email_log (emp_no, remind_date)
     VALUES ($1, $2::date) ON CONFLICT DO NOTHING`,
    empNo, date,
  );
  return affected === 1;
}
async function unclaim(empNo: string, date: string): Promise<void> {
  await hrfsPrisma.$executeRawUnsafe(
    `DELETE FROM public.missing_reminder_email_log WHERE emp_no = $1 AND remind_date = $2::date`,
    empNo, date,
  );
}

/** One pass: email HQ staff who are 15 min past their start and still missing. */
export async function sendMissingReminders(): Promise<void> {
  await ensureLogTable();
  const date = todayKL();
  const dow = dowKL();
  const now = nowSecondsKL();

  // Active HQ staff with an employeeId. (Scope = HQ only for now.)
  const staff = await hrfsPrisma.$queryRawUnsafe<StaffRow[]>(
    `SELECT "employeeId" AS code, name, email,
            "workingHours" AS working_hours,
            NULLIF(TRIM(start_date), '') AS start_date,
            NULLIF(TRIM("endDate"), '')  AS end_date
       FROM "BranchStaff"
      WHERE COALESCE(NULLIF(TRIM(status), ''), 'Active') ILIKE 'Active'
        AND "employeeId" IS NOT NULL AND "employeeId" <> ''
        AND branch = 'HQ'`,
  );

  // Today's scans (remapped so ST/collision/agnostic ids match employeeId).
  const scanRows = await hrfsPrisma.$queryRawUnsafe<{ person_id: string; device_id: string | null }[]>(
    `SELECT DISTINCT person_id, device_id
       FROM public.hikvision_attendance_all
      WHERE event_time::date = $1::date
        AND person_id IS NOT NULL AND person_id <> '' AND person_id <> '0'`,
    date,
  );
  const scannedSet = new Set(scanRows.map(r => remapStScan(r.device_id, r.person_id, null).personId));

  const leaveRows = await hrfsPrisma.$queryRawUnsafe<{ code: string }[]>(
    `SELECT DISTINCT bs."employeeId" AS code
       FROM "LeaveTransaction" lt
       JOIN "BranchStaff" bs ON UPPER(TRIM(bs.name)) = UPPER(TRIM(lt."EmployeeName"))
      WHERE lt."ApplyStatus" = 'A' AND lt."LeaveDate"::date = $1::date
        AND bs."employeeId" IS NOT NULL`,
    date,
  );
  const onLeaveSet = new Set(leaveRows.map(r => r.code));

  const justRows = await hrfsPrisma.$queryRawUnsafe<{ code: string }[]>(
    `SELECT emp_no AS code FROM public.attendance_justification WHERE just_date = $1::date`,
    date,
  );
  const justifiedSet = new Set(justRows.map(r => r.code));

  const todayDate = new Date(date + 'T00:00:00');
  const hrEmail = process.env.HR_JUSTIFY_EMAIL || undefined;

  for (const s of staff) {
    // Hidden from attendance → never remind
    if (HIDDEN_EMPLOYEE_IDS.has(s.code)) continue;
    // Within their active employment window
    const sd = parseDay(s.start_date); if (sd && sd > todayDate) continue;
    const ed = parseDay(s.end_date);   if (ed && ed < todayDate) continue;
    // Must be scheduled to work today
    const wh = s.working_hours;
    if (!wh || typeof wh !== 'object') continue;
    const day = (wh as Record<string, { start?: string; end?: string } | null>)[dow];
    if (!day || typeof day !== 'object') continue;
    // Only after start + 15 min grace
    if (now < toSeconds(day.start) + GRACE_SECONDS) continue;
    // Accounted for? (scanned / on leave / already justified)
    if (scannedSet.has(s.code) || onLeaveSet.has(s.code) || justifiedSet.has(s.code)) continue;
    // Need an address to notify
    if (!s.email) continue;

    if (await claim(s.code, date)) {
      try {
        await sendMissingReminderEmail(s.email, s.name || s.code, hrEmail);
      } catch (e) {
        await unclaim(s.code, date);
        console.error(`[missing-reminder] send failed (${s.name || s.code}):`, (e as Error).message);
      }
    }
  }
}
