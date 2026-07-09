/**
 * lib/manpower-attendance.ts
 *
 * Shared "who's Present/Absent/Late per branch, per day" logic for the
 * Manpower Schedule Attendance feature. Single source of truth for two
 * consumers:
 *   - app/api/schedules/attendance/route.ts (Attendance Summary page)
 *   - lib/branch-missing-reminder.ts (the non-HQ missing-reminder email sweep)
 *
 * "Missing" for a non-scanner branch = ticked Absent OR not ticked at all yet
 * (status defaults to 'Absent', tagged `ticked: false` so callers can tell
 * the two apart) — anyone expected that weekday (Planning ∪ Actual on the
 * ManpowerSchedule row) who isn't marked Present/Late.
 */

import { prisma } from '@/lib/prisma';
import { hrfsPrisma } from '@/lib/hrfs';
import { normalizeLocation } from '@/lib/constants';

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
  const rows = await hrfsPrisma.$queryRawUnsafe<{ scheduleId: string; attendance: unknown; attendanceLocked: unknown }[]>(
    `SELECT "scheduleId", attendance, "attendanceLocked" FROM public."ManpowerScheduleAttendance" WHERE "scheduleId" = ANY($1::text[])`,
    ids,
  );
  const rowById = new Map(rows.map((r) => [r.scheduleId, r]));

  return schedules.flatMap((schedule) => {
    const row = rowById.get(schedule.id);
    const attendance = (row?.attendance ?? {}) as Record<string, string>;
    const locked = (row?.attendanceLocked ?? {}) as Record<string, boolean>;
    return entriesForSchedule(schedule, attendance, locked, weekday);
  });
}

/** Single branch's attendance entries (loose branch match — short code vs. full name). */
export async function getBranchAttendanceEntries(date: string, branch: string): Promise<ManpowerAttendanceEntry[]> {
  const all = await getAllBranchAttendanceEntries(date);
  const wanted = normalizeLocation(branch);
  return all.filter((e) => e.branch === wanted);
}
