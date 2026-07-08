import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole, requireSession, canSeeAllBranches, assertSameBranch } from '@/lib/auth';
import { MANAGEMENT_ROLES, hasAnyRole } from '@/lib/roles';
import { canAccess, parseOverrides } from '@/lib/dashboard-access';

type ScheduleBody = {
  id: string;
  branch: string;
  startDate: string;
  endDate: string;
  selections: unknown;
  notes: unknown;
  originalSelections: unknown;
  originalNotes: unknown;
  status?: string;
  originalAuthor?: string;
  /** BM's Present/Absent/Late tick per staff name for the week, keyed by
   *  `${day}::${name}`. NOT stored on "ManpowerSchedule" — that model is a
   *  view backed by a foreign table (FDW into ebright_hrfs; see the ON
   *  CONFLICT comment below), so it can't take ALTER TABLE ADD COLUMN. Lives
   *  instead in its own real table, see ensureAttendanceTable. */
  attendance?: unknown;
  /** Per-name lock flag set once the BM clicks Save on that row — same table
   *  as `attendance`. */
  attendanceLocked?: unknown;
};

// Self-provisioning table for the Attendance table on the Update Schedule
// page. This is a genuine table in the app's own database (not the
// ManpowerSchedule view), so CREATE TABLE / INSERT ... ON CONFLICT work
// normally here — unlike ManpowerSchedule itself.
let attendanceTableEnsured: Promise<void> | null = null;
function ensureAttendanceTable(): Promise<void> {
  if (!attendanceTableEnsured) {
    attendanceTableEnsured = prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ManpowerScheduleAttendance" (
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

function parseSchedule(raw: unknown): { ok: true; data: ScheduleBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'Invalid JSON body' };
  const b = raw as Record<string, unknown>;
  if (typeof b.id !== 'string' || b.id.length === 0) return { ok: false, error: 'id is required' };
  if (typeof b.branch !== 'string' || b.branch.length === 0) return { ok: false, error: 'branch is required' };
  if (typeof b.startDate !== 'string' || b.startDate.length === 0) return { ok: false, error: 'startDate is required' };
  if (typeof b.endDate !== 'string' || b.endDate.length === 0) return { ok: false, error: 'endDate is required' };
  if (b.status !== undefined && typeof b.status !== 'string') return { ok: false, error: 'status must be a string' };
  if (b.originalAuthor !== undefined && typeof b.originalAuthor !== 'string') return { ok: false, error: 'originalAuthor must be a string' };
  return {
    ok: true,
    data: {
      id:                 b.id,
      branch:             b.branch,
      startDate:          b.startDate,
      endDate:            b.endDate,
      selections:         b.selections,
      notes:              b.notes,
      originalSelections: b.originalSelections,
      originalNotes:      b.originalNotes,
      status:             b.status         as string | undefined,
      originalAuthor:     b.originalAuthor as string | undefined,
      attendance:         b.attendance,
      attendanceLocked:   b.attendanceLocked,
    },
  };
}

// GET /api/schedules — return all schedules, newest first.
//   Management roles (admins, HOD, BM, HR) always get through. Anyone else
//   only gets through if an admin has explicitly granted them the Archive
//   Overview sub-page in Account Management (dashboardOverrides) — e.g. the
//   ACADEMY role, which isn't management but can be granted read-only
//   visibility into schedule history. Branch Managers see only their branch;
//   everyone else covered by canSeeAllBranches (admins/HOD/HR/ACADEMY) sees
//   all. Employees never hit this — they read their own report via
//   /api/manpower-cost which scopes server-side.
export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;

  const role = (session.user as { role?: unknown } | undefined)?.role;
  let allowed = hasAnyRole(role, MANAGEMENT_ROLES);
  if (!allowed && session.user?.email) {
    const user = await prisma.user.findUnique({
      where:  { email: session.user.email },
      select: { dashboardOverrides: true },
    });
    allowed = canAccess(role, 'hrms.manpower-planning.archive', parseOverrides(user?.dashboardOverrides));
  }
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const where: Record<string, unknown> = {};
    if (!canSeeAllBranches(session)) {
      const userBranch = (session.user as { branchName?: string }).branchName;
      where.branch = userBranch ?? '__none__';
    }
    const schedules = await prisma.manpowerSchedule.findMany({
      where,
      orderBy: { startDate: 'desc' },
    });

    // attendance lives in its own table (see ensureAttendanceTable) — fetch
    // it separately and merge in by id. Wrapped in its own try/catch: this is
    // a bonus field, so a hiccup here must not take down the whole schedules
    // list — that list also drives the Manpower Planning hub's tile visibility.
    let withAttendance = schedules.map((s) => ({ ...s, attendance: {} as unknown, attendanceLocked: {} as unknown }));
    try {
      await ensureAttendanceTable();
      const ids = schedules.map((s) => s.id);
      const attendanceRows = ids.length
        ? await prisma.$queryRawUnsafe<{ scheduleId: string; attendance: unknown; attendanceLocked: unknown }[]>(
            `SELECT "scheduleId", attendance, "attendanceLocked" FROM "ManpowerScheduleAttendance" WHERE "scheduleId" = ANY($1::text[])`,
            ids,
          )
        : [];
      const attendanceById = new Map(attendanceRows.map((r) => [r.scheduleId, r]));
      withAttendance = schedules.map((s) => {
        const row = attendanceById.get(s.id);
        return { ...s, attendance: row?.attendance ?? {}, attendanceLocked: row?.attendanceLocked ?? {} };
      });
    } catch (attendanceErr) {
      console.error('GET /api/schedules attendance merge error (non-fatal):', attendanceErr);
    }

    return NextResponse.json({ success: true, schedules: withAttendance });
  } catch (err) {
    console.error('GET /api/schedules error:', err);
    return NextResponse.json({ success: false, error: 'Failed to fetch schedules' }, { status: 500 });
  }
}

// POST /api/schedules — create or update a schedule
export async function POST(req: Request) {
  const { session, error } = await requireRole(MANAGEMENT_ROLES);
  if (error) return error;

  try {
    const parsed = parseSchedule(await req.json());
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }
    const body = parsed.data;

    // BM cannot create/update schedules for other branches.
    const branchGuard = assertSameBranch(session, body.branch);
    if (branchGuard) return branchGuard;

    // Manual upsert (findUnique + update/create) instead of prisma.upsert,
    // because Prisma's upsert generates `INSERT ... ON CONFLICT DO UPDATE` SQL
    // and Postgres rejects that against a FDW-backed view (error 42P10:
    // "no unique or exclusion constraint matching the ON CONFLICT
    // specification"). Splitting into two queries avoids ON CONFLICT
    // entirely so the view can pass writes through to ebright_hrfs.
    const existing = await prisma.manpowerSchedule.findUnique({
      where: { id: body.id },
      select: { id: true },
    });

    const schedule = existing
      ? await prisma.manpowerSchedule.update({
          where: { id: body.id },
          data: {
            selections: body.selections as any,
            notes:      body.notes as any,
            status:     'Finalized',
          },
        })
      : await prisma.manpowerSchedule.create({
          data: {
            id:                 body.id,
            branch:             body.branch,
            startDate:          body.startDate,
            endDate:            body.endDate,
            selections:         body.selections as any,
            notes:              body.notes as any,
            originalSelections: body.originalSelections as any,
            originalNotes:      body.originalNotes as any,
            status:             body.status ?? 'Finalized',
            // originalAuthor comes from the verified session, not the request body
            originalAuthor:     session.user?.name ?? session.user?.email ?? 'Unknown',
          },
        });

    // attendance lives in its own real table (ManpowerScheduleAttendance),
    // NOT on the ManpowerSchedule view — that view is FDW-backed and can't
    // take ALTER TABLE / ON CONFLICT. This table is a normal table in the
    // app's own DB, so a plain upsert works fine.
    if (body.attendance !== undefined || body.attendanceLocked !== undefined) {
      await ensureAttendanceTable();
      // Only overwrite the field(s) actually sent — fall back to the
      // existing row's value (via COALESCE against the excluded row) for
      // whichever one wasn't provided, so a partial update can't wipe it out.
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ManpowerScheduleAttendance" ("scheduleId", attendance, "attendanceLocked", "updatedAt")
         VALUES ($1, $2::jsonb, $3::jsonb, now())
         ON CONFLICT ("scheduleId") DO UPDATE SET
           attendance = CASE WHEN $4 THEN $2::jsonb ELSE "ManpowerScheduleAttendance".attendance END,
           "attendanceLocked" = CASE WHEN $5 THEN $3::jsonb ELSE "ManpowerScheduleAttendance"."attendanceLocked" END,
           "updatedAt" = now()`,
        body.id,
        JSON.stringify(body.attendance ?? {}),
        JSON.stringify(body.attendanceLocked ?? {}),
        body.attendance !== undefined,
        body.attendanceLocked !== undefined,
      );
    }

    return NextResponse.json({
      success: true,
      schedule: { ...schedule, attendance: body.attendance ?? {}, attendanceLocked: body.attendanceLocked ?? {} },
    });
  } catch (err) {
    console.error('POST /api/schedules error:', err);
    return NextResponse.json({ success: false, error: 'Failed to save schedule' }, { status: 500 });
  }
}
