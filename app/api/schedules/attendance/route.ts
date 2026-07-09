import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hrfsPrisma } from '@/lib/hrfs';
import { requireSession, canSeeAllBranches } from '@/lib/auth';
import { branchesMatch, normalizeLocation } from '@/lib/constants';

type ScheduleRow = { id: string; branch: string; selections: unknown; originalSelections: unknown };
type Entry = { name: string; branch: string; status: 'Present' | 'Absent' | 'Late'; locked: boolean; ticked: boolean };

// Everyone actually scheduled that weekday (Planning ∪ Actual), same union
// the Manpower Schedule Update page's own Attendance table uses.
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

// Ticks a single schedule's stored attendance JSON into entries — anyone
// expected that day but not ticked yet is treated as missing, same as an
// explicit Absent, but tagged `ticked: false` so the UI can tell the two apart.
function entriesForSchedule(
  schedule: ScheduleRow,
  attendance: Record<string, string>,
  locked: Record<string, boolean>,
  weekday: string,
): Entry[] {
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
  const entries: Entry[] = Array.from(expectedNames).map((name) => {
    const ticked = tickedByName.get(name);
    return {
      name,
      branch,
      status: ticked?.status ?? ('Absent' as const),
      locked: ticked?.locked ?? false,
      ticked: !!ticked,
    };
  });
  // Include anyone ticked but no longer in the expected list (e.g. schedule
  // edited after being ticked) so a recorded tick is never silently dropped.
  tickedByName.forEach((v, name) => {
    if (!expectedNames.has(name)) entries.push({ name, branch, status: v.status, locked: v.locked, ticked: true });
  });
  return entries;
}

async function ensureAttendanceTable() {
  await hrfsPrisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public."ManpowerScheduleAttendance" (
      "scheduleId" text PRIMARY KEY,
      attendance jsonb NOT NULL DEFAULT '{}'::jsonb,
      "attendanceLocked" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    )
  `);
}

// GET /api/schedules/attendance?branch=X&date=YYYY-MM-DD
//   Returns the BM's Present/Absent/Late ticks (from the Manpower Schedule
//   Update page's Attendance table) for that branch's weekday on that date.
//   Used by the Attendance Summary dashboard for branches with no scanner —
//   the manual tick is the only attendance signal those branches have.
//   branch=ALL returns every non-scanner branch's ticks at once, each entry
//   tagged with its branch — used by the Summary page's "All" view (HQ/ST
//   still come from the live scanner, so they're excluded here).
export async function GET(req: Request) {
  const { session, error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const branch = searchParams.get('branch');
  const date = searchParams.get('date');
  if (!branch || !date) {
    return NextResponse.json({ error: 'branch and date are required' }, { status: 400 });
  }

  const wantsAll = branch === 'ALL';
  // Only management (canSeeAllBranches) may request the cross-branch view —
  // a BM has no business seeing every other branch's attendance.
  if (wantsAll && !canSeeAllBranches(session)) {
    return NextResponse.json({ entries: [] });
  }
  if (!wantsAll && !canSeeAllBranches(session)) {
    const userBranch = (session.user as { branchName?: string }).branchName;
    if (!branchesMatch(branch, userBranch)) {
      return NextResponse.json({ entries: [] });
    }
  }

  try {
    // Match branch loosely, not with an exact string compare — the
    // Attendance Summary dropdown uses canonical full names (e.g. "Bandar
    // Rimbayu") while ManpowerSchedule.branch stores the short form used by
    // the Manpower Schedule module (e.g. "Rimbayu"). An exact match here
    // silently returned nothing for every branch with this kind of drift.
    const candidates = await prisma.manpowerSchedule.findMany({
      where: {
        startDate: { lte: date },
        endDate: { gte: date },
      },
      orderBy: { startDate: 'desc' },
      select: { id: true, branch: true, selections: true, originalSelections: true },
    });

    const weekday = new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
      weekday: 'long',
      timeZone: 'Asia/Kuala_Lumpur',
    });

    await ensureAttendanceTable();

    if (wantsAll) {
      // Exclude HQ/Subang Taipan — those are scanner-covered and shown by a
      // separate part of the Summary page, not this manual-tick endpoint.
      const schedules = candidates.filter((s) => {
        const b = normalizeLocation(s.branch);
        return b !== 'HQ' && b !== 'Subang Taipan';
      });
      if (!schedules.length) return NextResponse.json({ entries: [] });

      const ids = schedules.map((s) => s.id);
      const rows = await hrfsPrisma.$queryRawUnsafe<{ scheduleId: string; attendance: unknown; attendanceLocked: unknown }[]>(
        `SELECT "scheduleId", attendance, "attendanceLocked" FROM public."ManpowerScheduleAttendance" WHERE "scheduleId" = ANY($1::text[])`,
        ids,
      );
      const rowById = new Map(rows.map((r) => [r.scheduleId, r]));

      const entries = schedules.flatMap((schedule) => {
        const row = rowById.get(schedule.id);
        const attendance = (row?.attendance ?? {}) as Record<string, string>;
        const locked = (row?.attendanceLocked ?? {}) as Record<string, boolean>;
        return entriesForSchedule(schedule, attendance, locked, weekday);
      });

      return NextResponse.json({ entries });
    }

    const schedule = candidates.find((s) => branchesMatch(s.branch, branch));
    if (!schedule) return NextResponse.json({ entries: [] });

    const rows = await hrfsPrisma.$queryRawUnsafe<{ attendance: unknown; attendanceLocked: unknown }[]>(
      `SELECT attendance, "attendanceLocked" FROM public."ManpowerScheduleAttendance" WHERE "scheduleId" = $1`,
      schedule.id,
    );
    const attendance = (rows[0]?.attendance ?? {}) as Record<string, string>;
    const locked = (rows[0]?.attendanceLocked ?? {}) as Record<string, boolean>;

    const entries = entriesForSchedule(schedule, attendance, locked, weekday);
    return NextResponse.json({ entries });
  } catch (err) {
    console.error('GET /api/schedules/attendance error:', err);
    return NextResponse.json({ error: 'Failed to fetch attendance' }, { status: 500 });
  }
}
