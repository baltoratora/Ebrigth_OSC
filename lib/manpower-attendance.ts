/**
 * lib/manpower-attendance.ts
 *
 * Shared "who's Present/Absent/Late per branch, per day" logic for the
 * Manpower Schedule Attendance feature. Single source of truth for three
 * consumers:
 *   - app/api/schedules/attendance/route.ts (Attendance Summary page)
 *   - lib/branch-missing-reminder.ts (the non-HQ missing-reminder email sweep)
 *   - app/api/hr-dashboard/route.ts (MIA card's "Missing today" sub-list)
 *
 * "Expected" that day = union of two sources:
 *   1. Planning ∪ Actual on the ManpowerSchedule row (whoever the BM put in a
 *      slot in the grid).
 *   2. Anyone active at that branch whose configured BranchStaff.workingHours
 *      marks that weekday as a working day (same working-hours check HQ/ST
 *      already uses via lib/working-hours' slotForDate) — this catches staff
 *      who are supposed to work that day but never got put in the schedule
 *      grid at all.
 * "Missing" = expected AND not ticked Present/Late — ticked Absent OR not
 * ticked at all (status defaults to 'Absent', tagged `ticked: false` so
 * callers can tell the two apart).
 */

import { prisma } from '@/lib/prisma';
import { hrfsPrisma } from '@/lib/hrfs';
import { branchesMatch, normalizeLocation } from '@/lib/constants';
import { slotForDate } from '@/lib/working-hours';

type ScheduleRow = { id: string; branch: string; selections: unknown; originalSelections: unknown; notes: unknown };
export type ManpowerAttendanceEntry = {
  name: string;
  branch: string;
  status: 'Present' | 'Absent' | 'Late';
  locked: boolean;
  ticked: boolean;
  /** The canonical legal/IC name from HR Employee Management (BranchStaff.name),
   *  resolved and persisted at save time — see NAME_INFO_NOTES_KEY in
   *  app/manpower-schedule/update/page.tsx. Undefined if this name was never
   *  saved through that resolution (e.g. an older schedule from before this
   *  feature) — callers should fall back to the nickname (`name`) then. */
  fullName?: string;
  /** Their true HR home branch (BranchStaff.branch), only set when it differs
   *  from `branch` — i.e. they were borrowed to work this schedule's branch.
   *  Purely informational; never used for filtering (see `branch`). */
  homeBranch?: string;
};

const NAME_INFO_NOTES_KEY = '__nameInfo';
function parseNameInfoFromNotes(notes: unknown): Record<string, { branch: string; fullName: string }> {
  try {
    const raw = (notes as Record<string, unknown> | null | undefined)?.[NAME_INFO_NOTES_KEY];
    if (typeof raw !== 'string') return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

type HomeBranchCandidate = { branch: string; fullName: string; startToday?: string };

const GRACE_SECONDS = 15 * 60; // don't flag "Missing" until 15 min past their own scheduled start

function nowSecondsKL(): number {
  const t = new Date().toLocaleTimeString('en-GB', { hour12: false, timeZone: 'Asia/Kuala_Lumpur' });
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 3600 + (m || 0) * 60;
}
function timeStringToSeconds(t: string | undefined): number | undefined {
  if (!t) return undefined;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return undefined;
  return h * 3600 + m * 60;
}

// Live fallback for whenever a name isn't in the schedule's own saved
// nameInfo yet (never saved through the resolution flow, or saved before
// this person was added to the roster) — resolves straight from the current
// active BranchStaff roster instead of showing just the bare nickname. This
// is what makes fullName/homeBranch self-healing: correct immediately for
// any schedule, with no dependency on a BM having re-saved since. Mirrors
// resolveHomeBranch in app/manpower-schedule/update/page.tsx — same
// nickname-collision handling (prefer the candidate matching this
// schedule's own branch; only fall back to the first candidate for a
// genuine cross-branch case).
function resolveHomeBranchLive(name: string, contextBranch: string, map: Record<string, HomeBranchCandidate[]>): HomeBranchCandidate | undefined {
  const candidates = map[name];
  if (!candidates || candidates.length === 0) return undefined;
  const match = candidates.find((c) => c.branch === contextBranch);
  return match ?? candidates[0];
}

// Mirrors ROW_KEY_SEP/decodeRowKey in app/manpower-schedule/update/page.tsx.
// A tick key is normally just the plain nickname; when the Update Schedule
// page's Attendance table hit a genuine nickname collision (two different
// active staff sharing one nickname), it disambiguates the non-local one
// into `${nickname}${NUL}${branch}` so both get independent Present/Absent
// ticks. Decode it here so it displays as a clean nickname (with the right
// person's fullName/homeBranch) instead of the raw composite key.
const ROW_KEY_SEP = String.fromCharCode(0);
function decodeRowKey(key: string): { nickname: string; branch?: string } {
  const idx = key.indexOf(ROW_KEY_SEP);
  if (idx === -1) return { nickname: key };
  return { nickname: key.slice(0, idx), branch: key.slice(idx + 1) };
}

function expectedNamesForDay(schedule: ScheduleRow, dayPrefix: string): Set<string> {
  const names = new Set<string>();
  [schedule.selections, schedule.originalSelections].forEach((data) => {
    if (!data || typeof data !== 'object') return;
    Object.entries(data as Record<string, unknown>).forEach(([key, v]) => {
      if (!key.startsWith(dayPrefix)) return;
      if (typeof v === 'string' && v !== 'None') names.add(v);
    });
  });
  return names;
}

function entriesForSchedule(
  schedule: ScheduleRow,
  attendance: Record<string, string>,
  locked: Record<string, boolean>,
  weekday: string,
  workingHoursNames: Set<string> = new Set(),
  homeBranchMap: Record<string, HomeBranchCandidate[]> = {},
): ManpowerAttendanceEntry[] {
  const prefix = `${weekday}::`;
  const tickedByName = new Map<string, { status: 'Present' | 'Absent' | 'Late'; locked: boolean }>();
  Object.entries(attendance)
    .filter(([key]) => key.startsWith(prefix))
    .forEach(([key, status]) => {
      const name = key.slice(prefix.length);
      tickedByName.set(name, { status: status as 'Present' | 'Absent' | 'Late', locked: !!locked[key] });
    });

  const scheduleBranch = normalizeLocation(schedule.branch);
  const nameInfo = parseNameInfoFromNotes(schedule.notes);
  // `branch` is always the schedule's own branch — the branch they actually
  // attended/were ticked at (from Manpower Planning). This must stay
  // independent of nameInfo resolution: it's what getBranchAttendanceEntries
  // filters on, so a borrowed staff member's attendance always still shows
  // up under the branch that ticked them, even before/without nameInfo ever
  // being saved for this schedule. `homeBranch` is the separate, purely
  // informational signal — their true HR home branch, only set when it
  // differs from scheduleBranch (a "borrowed" case) — for display only.
  //
  // Saved nameInfo (frozen at save time) wins when present; otherwise fall
  // back to live-resolving against the current BranchStaff roster so a name
  // never shows as a bare nickname just because this particular schedule
  // hasn't been re-saved since the person was added. `rawKey` may be a
  // disambiguated collision key (see decodeRowKey) — nameInfo is checked
  // under the exact rawKey first (a colliding row's own frozen resolution),
  // then homeBranchMap is searched for that exact branch when a branchHint
  // is present, otherwise nickname-only resolution as before.
  const resolve = (rawKey: string) => {
    const { nickname, branch: branchHint } = decodeRowKey(rawKey);
    if (branchHint) return nameInfo[rawKey] ?? homeBranchMap[nickname]?.find((c) => c.branch === branchHint);
    return nameInfo[nickname] ?? resolveHomeBranchLive(nickname, scheduleBranch, homeBranchMap);
  };
  const fullNameFor = (rawKey: string) => resolve(rawKey)?.fullName;
  const homeBranchFor = (rawKey: string) => {
    const home = resolve(rawKey)?.branch;
    return home && home !== scheduleBranch ? home : undefined;
  };
  const displayNameFor = (rawKey: string) => decodeRowKey(rawKey).nickname;
  // Live only (never frozen nameInfo) — working hours are a day-to-day fact,
  // not something to freeze at save time. Uses the same nickname/branchHint
  // matching as `resolve` so a borrowed person's OWN working hours are found
  // regardless of which branch they're borrowed to — that's fine/expected,
  // not something to restrict on.
  const startSecondsFor = (rawKey: string): number | undefined => {
    const { nickname, branch: branchHint } = decodeRowKey(rawKey);
    const candidates = homeBranchMap[nickname];
    if (!candidates || candidates.length === 0) return undefined;
    const match = branchHint ? candidates.find((c) => c.branch === branchHint) : candidates.find((c) => c.branch === scheduleBranch);
    return timeStringToSeconds((match ?? candidates[0]).startToday);
  };

  const expectedNames = expectedNamesForDay(schedule, `${weekday}-`);
  workingHoursNames.forEach((name) => expectedNames.add(name));
  const nowSeconds = nowSecondsKL();
  const entries: ManpowerAttendanceEntry[] = Array.from(expectedNames)
    // Not ticked yet AND their own shift hasn't started (+ grace) → too
    // early to call them "Missing", so they're not expected *yet*. Already
    // ticked (any status) always shows regardless — that's the BM's own
    // explicit call, not a default. No working-hours data at all → fail
    // open (show as before) rather than guess.
    .filter((rawKey) => {
      if (tickedByName.has(rawKey)) return true;
      const startSec = startSecondsFor(rawKey);
      if (startSec === undefined) return true;
      return nowSeconds >= startSec + GRACE_SECONDS;
    })
    .map((rawKey) => {
    const ticked = tickedByName.get(rawKey);
    return {
      name: displayNameFor(rawKey),
      branch: scheduleBranch,
      status: ticked?.status ?? ('Absent' as const),
      locked: ticked?.locked ?? false,
      ticked: !!ticked,
      fullName: fullNameFor(rawKey),
      homeBranch: homeBranchFor(rawKey),
    };
  });
  tickedByName.forEach((v, rawKey) => {
    if (!expectedNames.has(rawKey)) {
      entries.push({ name: displayNameFor(rawKey), branch: scheduleBranch, status: v.status, locked: v.locked, ticked: true, fullName: fullNameFor(rawKey), homeBranch: homeBranchFor(rawKey) });
    }
  });
  return entries;
}

let attendanceTableEnsured: Promise<void> | null = null;
export function ensureAttendanceTable(): Promise<void> {
  if (!attendanceTableEnsured) {
    attendanceTableEnsured = hrfsPrisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public."ManpowerScheduleAttendance" (
        "scheduleId" text PRIMARY KEY,
        attendance jsonb NOT NULL DEFAULT '{}'::jsonb,
        "attendanceLocked" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `).then(() => undefined).catch((err) => {
      attendanceTableEnsured = null;
      throw err;
    });
  }
  return attendanceTableEnsured;
}

type WorkingHoursStaffRow = { nickname: string; name: string | null; branch: string | null; workingHours: unknown };

/** Active staff (any branch) with a nickname + configured working hours — used to
 *  add "expected today per working hours" names on top of the schedule grid.
 *  Also doubles as the source for the live homeBranchMap fallback (see
 *  resolveHomeBranchLive) — one query serves both, since both need the same
 *  active-staff-with-nickname rows. */
async function loadActiveStaffWorkingHours(): Promise<WorkingHoursStaffRow[]> {
  return hrfsPrisma.$queryRawUnsafe<WorkingHoursStaffRow[]>(
    `SELECT nickname, name, branch, "workingHours" FROM "BranchStaff"
      WHERE COALESCE(NULLIF(TRIM(status), ''), 'Active') ILIKE 'Active'
        AND nickname IS NOT NULL AND TRIM(nickname) <> ''`,
  );
}

/** nickname -> every {branch, fullName, startToday} candidate an active staff
 *  member with that nickname belongs to (usually just one — see
 *  resolveHomeBranchLive for the nickname-collision case, same handling as
 *  the client's homeBranchMap). startToday is that person's own scheduled
 *  start time for `date` (undefined if they have no working hours configured
 *  or it's a day off) — used to gate the Missing box (see startSecondsFor). */
function buildHomeBranchMap(staffRows: WorkingHoursStaffRow[], date: string): Record<string, HomeBranchCandidate[]> {
  const map: Record<string, HomeBranchCandidate[]> = {};
  staffRows.forEach((s) => {
    if (!s.nickname) return;
    const branch = normalizeLocation(s.branch);
    if (!map[s.nickname]) map[s.nickname] = [];
    if (!map[s.nickname].some((c) => c.branch === branch)) {
      map[s.nickname].push({ branch, fullName: s.name ?? s.nickname, startToday: slotForDate(s.workingHours, date)?.start });
    }
  });
  return map;
}

/** Every non-HQ/ST branch's attendance entries for that date — HQ/ST are scanner-covered and not included. */
export async function getAllBranchAttendanceEntries(date: string): Promise<ManpowerAttendanceEntry[]> {
  const candidates = await prisma.manpowerSchedule.findMany({
    where: { startDate: { lte: date }, endDate: { gte: date } },
    orderBy: { startDate: 'desc' },
    select: { id: true, branch: true, selections: true, originalSelections: true, notes: true },
  });

  const schedules = candidates.filter((s) => {
    const b = normalizeLocation(s.branch);
    return b !== 'HQ' && b !== 'Subang Taipan';
  });
  if (!schedules.length) return [];

  const weekday = new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'Asia/Kuala_Lumpur',
  });

  await ensureAttendanceTable();
  const ids = schedules.map((s) => s.id);
  const [rows, staffRows] = await Promise.all([
    hrfsPrisma.$queryRawUnsafe<{ scheduleId: string; attendance: unknown; attendanceLocked: unknown }[]>(
      `SELECT "scheduleId", attendance, "attendanceLocked" FROM public."ManpowerScheduleAttendance" WHERE "scheduleId" = ANY($1::text[])`,
      ids,
    ),
    loadActiveStaffWorkingHours(),
  ]);
  const rowById = new Map(rows.map((r) => [r.scheduleId, r]));
  const homeBranchMap = buildHomeBranchMap(staffRows, date);

  return schedules.flatMap((schedule) => {
    const row = rowById.get(schedule.id);
    const attendance = (row?.attendance ?? {}) as Record<string, string>;
    const locked = (row?.attendanceLocked ?? {}) as Record<string, boolean>;
    // Branch match is loose (branchesMatch), same reasoning as
    // getBranchAttendanceEntries below — BranchStaff.branch stores short
    // codes ("RBY") while ManpowerSchedule.branch stores the Manpower
    // Schedule module's own naming ("Rimbayu"), and neither is guaranteed to
    // equal the other exactly.
    const workingHoursNames = new Set(
      staffRows
        .filter((s) => branchesMatch(s.branch, schedule.branch))
        .filter((s) => {
          const slot = slotForDate(s.workingHours, date);
          return slot !== undefined && slot !== null; // has a working slot today
        })
        .map((s) => s.nickname),
    );
    return entriesForSchedule(schedule, attendance, locked, weekday, workingHoursNames, homeBranchMap);
  });
}

/** Single branch's attendance entries (loose branch match — short code vs. full name). */
export async function getBranchAttendanceEntries(date: string, branch: string): Promise<ManpowerAttendanceEntry[]> {
  const all = await getAllBranchAttendanceEntries(date);
  // Loose match, not strict equality on normalizeLocation() alone — that
  // function only maps short CODES to full names (e.g. "rby" -> "Bandar
  // Rimbayu"), not full-name variants missing a prefix (e.g. "Rimbayu" vs
  // "Bandar Rimbayu", which ManpowerSchedule.branch vs. the branch dropdown
  // disagree on). branchesMatch's substring-containment fallback catches that.
  return all.filter((e) => branchesMatch(e.branch, branch));
}
