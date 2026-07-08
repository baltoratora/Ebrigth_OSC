import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession, canSeeAllBranches } from '@/lib/auth';

// GET /api/schedules/attendance?branch=X&date=YYYY-MM-DD
//   Returns the BM's Present/Absent/Late ticks (from the Manpower Schedule
//   Update page's Attendance table) for that branch's weekday on that date.
//   Used by the Attendance Summary dashboard for branches with no scanner —
//   the manual tick is the only attendance signal those branches have.
export async function GET(req: Request) {
  const { session, error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const branch = searchParams.get('branch');
  const date = searchParams.get('date');
  if (!branch || !date) {
    return NextResponse.json({ error: 'branch and date are required' }, { status: 400 });
  }

  if (!canSeeAllBranches(session)) {
    const userBranch = (session.user as { branchName?: string }).branchName;
    if (branch !== userBranch) {
      return NextResponse.json({ entries: [] });
    }
  }

  try {
    const schedule = await prisma.manpowerSchedule.findFirst({
      where: {
        branch,
        startDate: { lte: date },
        endDate: { gte: date },
      },
      orderBy: { startDate: 'desc' },
      select: { id: true },
    });
    if (!schedule) return NextResponse.json({ entries: [] });

    // attendance lives in its own table, NOT on the ManpowerSchedule view
    // (that view is FDW-backed into ebright_hrfs and can't take ALTER TABLE)
    // — see ensureAttendanceTable in app/api/schedules/route.ts. Self-provision
    // it here too since this route can be hit before that one ever runs.
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ManpowerScheduleAttendance" (
        "scheduleId" text PRIMARY KEY,
        attendance jsonb NOT NULL DEFAULT '{}'::jsonb,
        "attendanceLocked" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);

    const rows = await prisma.$queryRawUnsafe<{ attendance: unknown; attendanceLocked: unknown }[]>(
      `SELECT attendance, "attendanceLocked" FROM "ManpowerScheduleAttendance" WHERE "scheduleId" = $1`,
      schedule.id,
    );
    const attendance = (rows[0]?.attendance ?? {}) as Record<string, string>;
    const locked = (rows[0]?.attendanceLocked ?? {}) as Record<string, boolean>;

    const weekday = new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
      weekday: 'long',
      timeZone: 'Asia/Kuala_Lumpur',
    });
    const prefix = `${weekday}::`;
    const entries = Object.entries(attendance)
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, status]) => ({
        name: key.slice(prefix.length),
        status: status as 'Present' | 'Absent' | 'Late',
        locked: !!locked[key],
      }));

    return NextResponse.json({ entries });
  } catch (err) {
    console.error('GET /api/schedules/attendance error:', err);
    return NextResponse.json({ error: 'Failed to fetch attendance' }, { status: 500 });
  }
}
