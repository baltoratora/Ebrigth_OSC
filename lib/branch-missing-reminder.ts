/**
 * lib/branch-missing-reminder.ts
 *
 * "You're marked missing today" reminder email for every branch EXCEPT HQ and
 * Subang Taipan (those have a scanner and are handled by lib/missing-reminder.ts).
 * These branches have no scanner — "missing" instead comes from the BM's
 * manual Present/Absent/Late tick on the Manpower Schedule Update page (the
 * same source the Attendance Summary page's "Missing" panel reads), via
 * getAllBranchAttendanceEntries() in lib/manpower-attendance.ts.
 *
 * Unlike the HQ version (which waits 15 min past each person's SCHEDULED
 * start time), there's no reliable per-person start time here — the trigger
 * is instead "30 minutes after this person first appeared in the Missing
 * box", tracked in public.branch_missing_first_seen (claimed on first sight,
 * per person+branch+day). Same claim-before-send email dedup pattern as the
 * HQ version, in its own log table.
 *
 * Names on the Manpower Schedule are BranchStaff.nickname (not the full
 * legal name) — matched case-insensitively to resolve an email address.
 */

import { hrfsPrisma } from '@/lib/hrfs';
import { getAllBranchAttendanceEntries } from '@/lib/manpower-attendance';
import { sendMissingReminderEmail } from '@/lib/mailer';

const WARNING_DELAY_MS = 30 * 60_000; // 30 min after first appearing in the Missing box

function todayKL(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
}
function displayDateKL(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur',
  });
}

let tablesReady = false;
async function ensureTables(): Promise<void> {
  if (tablesReady) return;
  await hrfsPrisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public.branch_missing_first_seen (
      name          text NOT NULL,
      branch        text NOT NULL,
      seen_date     date NOT NULL,
      first_seen_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (name, branch, seen_date)
    )`);
  await hrfsPrisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public.branch_missing_reminder_email_log (
      name        text NOT NULL,
      branch      text NOT NULL,
      remind_date date NOT NULL,
      sent_at     timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (name, branch, remind_date)
    )`);
  tablesReady = true;
}

/** First time this (name, branch) was seen missing today — claims it if this is the first sighting. */
async function claimFirstSeen(name: string, branch: string, date: string): Promise<Date> {
  const rows = await hrfsPrisma.$queryRawUnsafe<{ first_seen_at: Date }[]>(
    `INSERT INTO public.branch_missing_first_seen (name, branch, seen_date)
     VALUES ($1, $2, $3::date)
     ON CONFLICT (name, branch, seen_date) DO UPDATE SET name = EXCLUDED.name
     RETURNING first_seen_at`,
    name, branch, date,
  );
  return rows[0].first_seen_at;
}

async function claimEmailSent(name: string, branch: string, date: string): Promise<boolean> {
  const affected = await hrfsPrisma.$executeRawUnsafe(
    `INSERT INTO public.branch_missing_reminder_email_log (name, branch, remind_date)
     VALUES ($1, $2, $3::date) ON CONFLICT DO NOTHING`,
    name, branch, date,
  );
  return affected === 1;
}
async function unclaimEmailSent(name: string, branch: string, date: string): Promise<void> {
  await hrfsPrisma.$executeRawUnsafe(
    `DELETE FROM public.branch_missing_reminder_email_log WHERE name = $1 AND branch = $2 AND remind_date = $3::date`,
    name, branch, date,
  );
}

async function loadNicknameToStaff(): Promise<Map<string, { email: string | null }>> {
  const rows = await hrfsPrisma.$queryRawUnsafe<{ nickname: string; email: string | null }[]>(
    `SELECT nickname, email FROM "BranchStaff"
      WHERE COALESCE(NULLIF(TRIM(status), ''), 'Active') ILIKE 'Active'
        AND nickname IS NOT NULL AND TRIM(nickname) <> ''`,
  );
  const m = new Map<string, { email: string | null }>();
  for (const r of rows) m.set(r.nickname.trim().toUpperCase(), { email: r.email });
  return m;
}

export interface BranchMissingCandidate {
  name: string;
  branch: string;
  firstSeenAt: Date;
  email: string | null;
}

/**
 * Who is currently "missing" at a non-HQ/ST branch, with their first-seen
 * timestamp and resolved email (if any). Pure computation — claims a
 * first-seen row (so the 30-min clock starts), but sends nothing. Safe to
 * call from a preview endpoint.
 */
export async function computeBranchMissingCandidates(): Promise<BranchMissingCandidate[]> {
  await ensureTables();
  const date = todayKL();
  const entries = await getAllBranchAttendanceEntries(date);
  const missing = entries.filter((e) => e.status === 'Absent'); // explicit Absent OR never ticked
  const staffMap = await loadNicknameToStaff();

  const out: BranchMissingCandidate[] = [];
  for (const m of missing) {
    const firstSeenAt = await claimFirstSeen(m.name, m.branch, date);
    const email = staffMap.get(m.name.trim().toUpperCase())?.email ?? null;
    out.push({ name: m.name, branch: m.branch, firstSeenAt, email });
  }
  return out;
}

/**
 * One pass: email everyone who's been sitting in the Missing box for 30+
 * minutes, once per person+branch per KL day.
 */
export async function sendBranchMissingReminders(): Promise<{ sent: number; alreadySent: number; skippedNoEmail: number; notYetDue: number }> {
  const date = todayKL();
  const display = displayDateKL(date);
  const hrEmail = process.env.HR_JUSTIFY_EMAIL || undefined;
  const candidates = await computeBranchMissingCandidates();

  let sent = 0, alreadySent = 0, skippedNoEmail = 0, notYetDue = 0;
  const now = Date.now();

  for (const c of candidates) {
    const elapsedMs = now - new Date(c.firstSeenAt).getTime();
    if (elapsedMs < WARNING_DELAY_MS) { notYetDue++; continue; }
    if (!c.email) { skippedNoEmail++; continue; }

    if (await claimEmailSent(c.name, c.branch, date)) {
      try {
        await sendMissingReminderEmail(c.email, c.name, { branch: c.branch, date: display, hrEmail });
        sent++;
      } catch (e) {
        await unclaimEmailSent(c.name, c.branch, date);
        console.error(`[branch-missing-reminder] send failed (${c.name} @ ${c.branch}):`, (e as Error).message);
      }
    } else {
      alreadySent++;
    }
  }
  return { sent, alreadySent, skippedNoEmail, notYetDue };
}
