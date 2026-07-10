import { NextResponse } from 'next/server';
import { requireSession, canSeeAllBranches } from '@/lib/auth';
import { branchesMatch } from '@/lib/constants';
import { getAllBranchAttendanceEntries, getBranchAttendanceEntries } from '@/lib/manpower-attendance';

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
    const entries = wantsAll
      ? await getAllBranchAttendanceEntries(date)
      : await getBranchAttendanceEntries(date, branch);
    return NextResponse.json({ entries });
  } catch (err) {
    console.error('GET /api/schedules/attendance error:', err);
    return NextResponse.json({ error: 'Failed to fetch attendance' }, { status: 500 });
  }
}
