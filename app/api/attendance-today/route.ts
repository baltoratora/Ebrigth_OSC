import { NextRequest, NextResponse } from 'next/server';
import { hrfsPrisma } from '@/lib/hrfs';
import { requireSession, canSeeAllBranches } from '@/lib/auth';
import { isEmployee } from '@/lib/roles';
import { remapStScan, stSourceFor } from '@/lib/scan-identity';

// GET /api/attendance-today?date=YYYY-MM-DD
//
// Reads raw scan events from public.hikvision_attendance_all (one row per
// scan) and condenses them per employee per day:
//   • check-in  = earliest event of the day
//   • check-out = latest event of the day (null when only one scan → "in")
//
// event_time is stored as a naive timestamp already in Kuala Lumpur wall-time
// (verified against AttendanceLog: identical HH:MM:SS), so it's read as-is — no
// timezone conversion. device_name/device_id is mapped to a branch label so the
// dashboard's branch tabs keep working.
//
// If `date` is missing or invalid, defaults to today (Kuala Lumpur timezone).
//
// Scoping (defence-in-depth, layered on top of the middleware page guard):
//   Admin / HOD / HR       → every branch.
//   Branch Manager         → only staff registered to their branch.
//   Part_Time / Full_Time  → only their own attendance row.
//   Anyone else            → empty (fail closed).

export const dynamic = 'force-dynamic';

interface AttendanceTodayRow {
  date: string;
  empNo: string;
  empName: string;
  clockInTime: string;
  clockOutTime: string | null;
  scannerLocation: string | null;
}

interface RawScanRow {
  person_id: string;
  name: string | null;
  device_name: string | null;
  device_id: string | null;
  kl_date: string;
  kl_time: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayKL(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
}

// Map a Hikvision device to the branch label the dashboard filters on.
// Subang Taipan is the only non-HQ scanner today; everything else is HQ.
function deviceToLocation(deviceName: string | null, deviceId: string | null): string {
  const dn = (deviceName ?? '').toLowerCase();
  if (deviceId === 'FV9958286' || dn.includes('subang') || dn.includes('taipan') || /\bst\b/.test(dn)) {
    return 'Subang Taipan';
  }
  return 'HQ';
}

export async function GET(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  try {
    const requested = req.nextUrl.searchParams.get('date');
    const date = requested && DATE_RE.test(requested) ? requested : todayKL();
    const sessionUser = session.user as { role?: unknown; email?: string | null; branchName?: string };

    // empNoFilter:
    //   null → no filter (admin / HOD / HR — full visibility)
    //   []   → fail closed (no rows returned)
    //   [...]→ only these empNos
    let empNoFilter: string[] | null = null;

    if (!canSeeAllBranches(session)) {
      if (isEmployee(sessionUser?.role)) {
        if (!sessionUser.email) return NextResponse.json([]);
        const self = await hrfsPrisma.branchStaff.findFirst({
          where:  { email: { equals: sessionUser.email, mode: 'insensitive' } },
          select: { employeeId: true },
        });
        empNoFilter = self?.employeeId ? [self.employeeId] : [];
      } else if (sessionUser?.branchName) {
        const staff = await hrfsPrisma.branchStaff.findMany({
          where:  { branch: sessionUser.branchName },
          select: { employeeId: true },
        });
        empNoFilter = staff.map(s => s.employeeId).filter((e): e is string => !!e);
      } else {
        empNoFilter = [];
      }
    }

    // Empty filter → short-circuit (Postgres rejects `IN ()` anyway).
    if (empNoFilter !== null && empNoFilter.length === 0) {
      return NextResponse.json([]);
    }

    // Scanner-ST collision remap (see @/lib/scan-identity): a caller allowed to
    // see a remapped person (e.g. Poojha 77020106) must also be served the ST
    // source id (44080099) that physically carries their scans. We widen the SQL
    // filter to pull those rows, then re-attribute + re-filter on `allowedSet`
    // below so only the rows the caller may actually see survive.
    let allowedSet: Set<string> | null = null;
    if (empNoFilter !== null) {
      allowedSet = new Set(empNoFilter);
      const extra = empNoFilter.map(stSourceFor).filter((x): x is string => !!x);
      if (extra.length) empNoFilter = [...new Set([...empNoFilter, ...extra])];
    }

    // Pull the day's raw scans (KL-bucketed), already converted to KL wall time.
    const params: unknown[] = [date];
    let filterClause = '';
    if (empNoFilter !== null) {
      const placeholders = empNoFilter.map((_, i) => `$${i + 2}`).join(', ');
      filterClause = ` AND person_id IN (${placeholders})`;
      params.push(...empNoFilter);
    }

    // Query via hrfsPrisma — hikvision_attendance_all lives in ebright_hrfs,
    // which is what HRFS_DATABASE_URL points at. (DATABASE_URL may resolve to
    // a different DB that doesn't have this table, which is what made the
    // dashboard show "Scanner Offline".)
    const rawRows = await hrfsPrisma.$queryRawUnsafe<RawScanRow[]>(
      `SELECT person_id,
              name,
              device_name,
              device_id,
              to_char(event_time, 'YYYY-MM-DD') AS kl_date,
              to_char(event_time, 'HH24:MI:SS') AS kl_time
         FROM public.hikvision_attendance_all
        WHERE event_time::date = $1::date
          AND person_id IS NOT NULL
          AND person_id <> ''
          AND person_id <> '0'
          ${filterClause}
        ORDER BY event_time ASC`,
      ...params,
    );

    // Condense: group by (person, mapped location); first scan = in, last = out.
    const groups = new Map<string, { empNo: string; name: string | null; location: string; times: string[] }>();
    for (const r of rawRows) {
      const location = deviceToLocation(r.device_name, r.device_id);
      // Re-attribute ST-device scans whose person_id collides with an HQ staff id.
      const { personId, name } = remapStScan(r.device_id, r.person_id, r.name);
      // Drop the HQ source-id rows pulled in only to widen branch-manager scoping.
      if (allowedSet && !allowedSet.has(personId)) continue;
      const key = `${personId}|${location}`;
      let g = groups.get(key);
      if (!g) {
        g = { empNo: personId, name, location, times: [] };
        groups.set(key, g);
      }
      g.times.push(r.kl_time); // rows arrive chronologically (ORDER BY event_time)
    }

    const result: AttendanceTodayRow[] = Array.from(groups.values()).map(g => ({
      date,
      empNo: g.empNo,
      empName: g.name && g.name !== g.empNo ? g.name : '',
      clockInTime: g.times[0],
      clockOutTime: g.times.length > 1 ? g.times[g.times.length - 1] : null,
      scannerLocation: g.location,
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error('/api/attendance-today error:', err);
    return NextResponse.json({ error: 'Failed to fetch attendance' }, { status: 500 });
  }
}
