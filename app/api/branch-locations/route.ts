import { NextRequest, NextResponse } from 'next/server';
import { hrfsPrisma } from '@/lib/hrfs';
import { requireSession, canSeeAllBranches } from '@/lib/auth';
import { isEmployee } from '@/lib/roles';
import { BRANCH_LIST, normalizeLocation } from '@/lib/constants';

// Staff intentionally hidden from the attendance dashboard (Missing box, active
// counts, reports). They work flexible / remote with no fixed on-site hours, so
// the scanner-based attendance tracking doesn't apply to them. Matched by the
// stable BranchStaff.employeeId.
const ATTENDANCE_HIDDEN_EMPLOYEE_IDS = [
  '33030010', // CHOW CHIN HUI
  '33010041', // ROHAN KUMAR A/L MANOHAR LAL
];

// Scoping:
//   Admin / HOD            → any location.
//   Branch Manager         → only their own branch's location.
//   Part_Time / Full_Time  → only their own row.
//   Anyone else            → empty (fail closed).

export async function GET(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  try {
    const location = req.nextUrl.searchParams.get('location');
    const sessionUser = session.user as { role?: unknown; email?: string | null; branchName?: string };

    if (!location) {
      return NextResponse.json({ locations: BRANCH_LIST });
    }

    if (!canSeeAllBranches(session)) {
      if (isEmployee(sessionUser?.role)) {
        if (!sessionUser.email) return NextResponse.json({ staff: [] });
        const self = await hrfsPrisma.branchStaff.findFirst({
          where: {
            email:  { equals: sessionUser.email, mode: 'insensitive' },
            status: 'Active',
          },
          select: {
            id:           true,
            name:         true,
            nickname:     true,
            employeeId:   true,
            branch:       true,
            department:   true,
            role:         true,
            email:        true,
            status:       true,
            location:     true,
            workingHours: true,
          },
        });
        // "self" bypasses the location match entirely — used by self-service
        // pages (e.g. Attendance Report for FT/PT) that just want "my own
        // record", regardless of which branch that happens to be.
        if (location !== "self" && (!self || normalizeLocation(self.location) !== location)) {
          return NextResponse.json({ staff: [] });
        }
        return NextResponse.json({ staff: self ? [self] : [] });
      }
      // BM and other non-admins: must match own branch.
      // We treat `branchName` and the `location` query as both running through
      // normalizeLocation so short codes (KLG) and full names (Klang) resolve
      // to the same canonical key. 'Unknown' fails closed.
      const userBranchKey = normalizeLocation(sessionUser?.branchName ?? null);
      if (userBranchKey === 'Unknown' || userBranchKey !== location) {
        return NextResponse.json({ staff: [] });
      }
    }

    const all = await hrfsPrisma.branchStaff.findMany({
      select: {
        id:           true,
        name:         true,
        nickname:     true,
        employeeId:   true,
        branch:       true,
        department:   true,
        role:         true,
        email:        true,
        status:       true,
        location:     true,
        start_date:   true,
        endDate:      true,
        workingHours: true,
      },
      where:   {
        status: 'Active',
        NOT: { employeeId: { in: ATTENDANCE_HIDDEN_EMPLOYEE_IDS } },
      },
      orderBy: { name: 'asc' },
    });

    // ALL / all → return every active staff member (used for name/dept lookups
    // in the attendance dashboard — resolves names for staff registered to any branch)
    if (location === 'ALL' || location === 'all') {
      return NextResponse.json({ staff: all });
    }

    // Filter by `branch` (the BRANCH/DEPT field set in the staff form, e.g. "ST", "HQ").
    // Fall back to `location` when `branch` is empty — some older records only have location set.
    const filtered = all.filter(s => normalizeLocation(s.branch || s.location) === location);
    return NextResponse.json({ staff: filtered });
  } catch (err) {
    console.error('/api/branch-locations error:', err);
    return NextResponse.json({ error: 'Failed to fetch locations' }, { status: 500 });
  }
}
