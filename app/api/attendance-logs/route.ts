import { NextRequest, NextResponse } from 'next/server';
import { hrfsPrisma } from '@/lib/hrfs';
import { requireSession, canSeeAllBranches } from '@/lib/auth';
import { isEmployee } from '@/lib/roles';
import { remapStScan, stSourceFor } from '@/lib/scan-identity';

// GET /api/attendance-logs
//   ?empNo=44080014&month=4&year=2026                  → exact empNo lookup
//   ?staffName=MOHAMD FAIQ SOUDAGAR&month=4&year=2026  → name-based lookup
//
// SOURCE: public.hikvision_attendance_all (raw scan events, one row per scan)
// — the SAME table the daily Attendance dashboard (/api/attendance-today) reads,
// so the monthly Report and the daily Summary can never disagree. Rows are
// condensed per day: earliest scan = check-in, latest = check-out (null when a
// single scan). event_time is naive KL wall-time, read as-is (no tz convert).
//
// (Previously this read the separate `AttendanceLog` table, which drifted out
// of sync with hikvision and caused scans to appear on one page but not the
// other.)
//
// Scoping:
//   Admin / HOD            → may look up any empNo / staffName.
//   Branch Manager         → may look up only staff in their branch.
//   Part_Time / Full_Time  → may look up only themselves.
//   Anyone else            → empty (fail closed).

interface RawScan {
  person_id: string;
  name: string | null;
  device_id: string | null;
  kl_date: string;
  kl_time: string;
}

interface DayLog {
  date: string;
  empName: string;
  clockInTime: string;
  clockOutTime: string | null;
}

// Condense chronologically-ordered scan rows into one row per calendar day:
// first scan of the day = check-in, last = check-out (null when only one scan).
function condenseByDay(rows: RawScan[]): DayLog[] {
  const byDate = new Map<string, { name: string | null; times: string[] }>();
  for (const r of rows) {
    const g = byDate.get(r.kl_date) ?? { name: r.name, times: [] };
    if (!g.name && r.name) g.name = r.name;
    g.times.push(r.kl_time); // rows arrive in event_time order
    byDate.set(r.kl_date, g);
  }
  return Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, g]) => ({
      date,
      empName: g.name ?? '',
      clockInTime: g.times[0],
      clockOutTime: g.times.length > 1 ? g.times[g.times.length - 1] : null,
    }));
}

export async function GET(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  try {
    const { searchParams } = new URL(req.url);
    const empNo     = searchParams.get('empNo');
    const staffName = searchParams.get('staffName');
    const month     = searchParams.get('month');
    const year      = searchParams.get('year') ?? new Date().getFullYear().toString();

    if (!month) {
      return NextResponse.json({ error: 'month is required' }, { status: 400 });
    }

    // First day of the requested month — used for an index-friendly range scan.
    const firstOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
    const sessionUser = session.user as { role?: unknown; email?: string | null; branchName?: string };

    // Resolve the allowed empNo / name set for non-admin callers.
    //   null  → unrestricted (admin/HOD)
    //   []    → fail closed
    let allowedEmpNos: string[] | null = null;
    let allowedNames: Set<string> | null = null;

    if (!canSeeAllBranches(session)) {
      if (isEmployee(sessionUser?.role)) {
        if (!sessionUser.email) return NextResponse.json([]);
        const self = await hrfsPrisma.branchStaff.findFirst({
          where: { email: { equals: sessionUser.email, mode: 'insensitive' } },
          select: { employeeId: true, name: true },
        });
        allowedEmpNos = self?.employeeId ? [self.employeeId] : [];
        allowedNames  = new Set(self?.name ? [self.name.toUpperCase()] : []);
      } else if (sessionUser?.branchName) {
        const staff = await hrfsPrisma.branchStaff.findMany({
          where: { branch: sessionUser.branchName },
          select: { employeeId: true, name: true },
        });
        allowedEmpNos = staff.map(s => s.employeeId).filter((e): e is string => !!e);
        allowedNames  = new Set(
          staff.map(s => s.name).filter((n): n is string => !!n).map(n => n.toUpperCase())
        );
      } else {
        return NextResponse.json([]);
      }
    }

    // ── Exact empNo lookup ─────────────────────────────────────────────────────
    if (empNo) {
      if (allowedEmpNos !== null && !allowedEmpNos.includes(empNo)) {
        return NextResponse.json([]);
      }
      // Scanner-ST collision remap (see @/lib/scan-identity): this person's ST
      // scans may physically sit under a different (HQ) person_id. Pull that
      // source id too, re-attribute every row, then keep only the rows that
      // resolve to the requested empNo (their HQ colleague's own rows fall away).
      const idsToFetch = [empNo];
      const src = stSourceFor(empNo);
      if (src) idsToFetch.push(src);
      const rows = await hrfsPrisma.$queryRawUnsafe<RawScan[]>(
        `SELECT person_id, name, device_id,
                to_char(event_time, 'YYYY-MM-DD') AS kl_date,
                to_char(event_time, 'HH24:MI:SS') AS kl_time
           FROM public.hikvision_attendance_all
          WHERE person_id = ANY($1)
            AND event_time >= $2::date
            AND event_time <  ($2::date + interval '1 month')
            AND person_id IS NOT NULL AND person_id <> '' AND person_id <> '0'
          ORDER BY event_time ASC`,
        idsToFetch, firstOfMonth,
      );
      const remapped = rows
        .map(r => { const id = remapStScan(r.device_id, r.person_id, r.name);
                    return { ...r, person_id: id.personId, name: id.name }; })
        .filter(r => r.person_id === empNo);
      return NextResponse.json(condenseByDay(remapped));
    }

    // ── Name-based lookup (fallback when a staff record has no employeeId) ───────
    if (staffName) {
      if (allowedNames !== null && !allowedNames.has(staffName.toUpperCase())) {
        return NextResponse.json([]);
      }
      const SKIP = new Set(['BIN', 'BINTI', 'A/L', 'A/P', 'BTE', 'AP', 'NIK', 'NUR', 'NURUL', 'MUHAMMAD', 'MOHD', 'ABD']);
      const tokens = staffName
        .toUpperCase()
        .split(/\s+/)
        .filter(t => t.length > 2 && !SKIP.has(t));
      if (tokens.length === 0) return NextResponse.json([]);

      const params: unknown[] = [firstOfMonth];
      const nameClauses = tokens.map(t => { params.push(`%${t}%`); return `name ILIKE $${params.length}`; }).join(' OR ');
      let scopeClause = '';
      if (allowedEmpNos !== null) {
        const ph = allowedEmpNos.map(e => { params.push(e); return `$${params.length}`; }).join(', ');
        scopeClause = ph ? ` AND person_id IN (${ph})` : ' AND false';
      }
      const rows = await hrfsPrisma.$queryRawUnsafe<RawScan[]>(
        `SELECT person_id, name, device_id,
                to_char(event_time, 'YYYY-MM-DD') AS kl_date,
                to_char(event_time, 'HH24:MI:SS') AS kl_time
           FROM public.hikvision_attendance_all
          WHERE event_time >= $1::date
            AND event_time <  ($1::date + interval '1 month')
            AND (${nameClauses})${scopeClause}
            AND person_id IS NOT NULL AND person_id <> '' AND person_id <> '0'
          ORDER BY event_time ASC`,
        ...params,
      );
      // Re-attribute ST-device scans for display consistency (see @/lib/scan-identity).
      const remapped = rows.map(r => {
        const id = remapStScan(r.device_id, r.person_id, r.name);
        return { ...r, person_id: id.personId, name: id.name };
      });
      return NextResponse.json(condenseByDay(remapped));
    }

    return NextResponse.json({ error: 'empNo or staffName is required' }, { status: 400 });
  } catch (error) {
    console.error('GET /api/attendance-logs error:', error);
    return NextResponse.json({ error: 'Failed to fetch attendance logs' }, { status: 500 });
  }
}
