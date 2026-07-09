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

type ScheduleRow = { id: string; branch: string; selections: unknown; originalSelections: unknown };
export type ManpowerAttendanceEntry = {
  name: string;
  branch: string;
  status: 'Present' | 'Absent' | 'Late';
  locked: boolean;
  ticked: boolean;
};

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
): ManpowerAttendanceEntry[] {
  const prefix = `${weekday}::`;
  const tickedByName = new Map<string, { status: 'Present' | 'Absent' | 'Late'; locked: boolean }>();
  Object.entries(attendance)
    .filter(([key]) => key.startsWith(prefix))
    .forEach(([key, status]) => {
      const name = key.slice(prefix.length);
      tickedByName.set(name, { status: status as 'Present' | 'Absent' | 'Late', locked: !!locked[key] });
    });

  const branch = normalizeLocation(schedule.branch);
  const expectedNames = expectedNamesForDay(schedule, `${weekday}-`);
  workingHoursNames.forEach((name) => expectedNames.add(name));
  const entries: ManpowerAttendanceEntry[] = Array.from(expectedNames).map((name) => {
    const ticked = tickedByName.get(name);
    return {
      name,
      branch,
      status: ticked?.status ?? ('Absent' as const),
      locked: ticked?.locked ?? false,
      ticked: !!ticked,
    };
  });
  tickedByName.forEach((v, name) => {
    if (!expectedNames.has(name)) entries.push({ name, branch, status: v.status, locked: v.locked, ticked: true });
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

type WorkingHoursStaffRow = { nickname: string; branch: string | null; workingHours: unknown };

/** Active staff (any branch) with a nickname + configured working hours — used to
 *  add "expected today per working hours" names on top of the schedule grid. */
async function loadActiveStaffWorkingHours(): Promise<WorkingHoursStaffRow[]> {
  return hrfsPrisma.$queryRawUnsafe<WorkingHoursStaffRow[]>(
    `SELECT nickname, branch, "workingHours" FROM "BranchStaff"
      WHERE COALESCE(NULLIF(TRIM(status), ''), 'Active') ILIKE 'Active'
        AND nickname IS NOT NULL AND TRIM(nickname) <> ''`,
  );
}

/** Every non-HQ/ST branch's attendance entries for that date — HQ/ST are scanner-covered and not included. */
export async function getAllBranchAttendanceEntries(date: string): Promise<ManpowerAttendanceEntry[]> {
  const candidates = await prisma.manpowerSchedule.findMany({
    where: { startDate: { lte: date }, endDate: { gte: date } },
    orderBy: { startDate: 'desc' },
    select: { id: true, branch: true, selections: true, originalSelections: true },
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
    return entriesForSchedule(schedule, attendance, locked, weekday, workingHoursNames);
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
