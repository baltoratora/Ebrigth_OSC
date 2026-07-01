import { NextRequest, NextResponse } from "next/server";
import { hrfsPrisma } from "@/lib/hrfs";
import { requireSession, canSeeAllBranches } from "@/lib/auth";
import { isEmployee } from "@/lib/roles";
import { remapStScan, stSourceFor } from "@/lib/scan-identity";
import { hasSchedule, scheduleForDate, slotForDate, type ScheduleVersion } from "@/lib/working-hours";

// GET /api/attendance-no-record?empNo=77020088&month=7&year=2026
//
// Returns the count of UNEXPLAINED "No Record" days for one employee in a month
// — a day they were scheduled to work but have no complete scan (matches the
// Attendance Report's "No Record"), EXCLUDING days they were on approved leave
// or filed an attendance justification. Future days (after today, KL) are not
// counted. Used to gate the part-time self-download on the Manpower Cost Report:
// a PT employee with >= 1 such day cannot download that month.
//
// Scoping mirrors /api/attendance-logs: employees may only query their own
// empNo; branch managers their branch; admin/HOD anyone.

interface RawScan { person_id: string; device_id: string | null; kl_date: string; }

function isWeekend(dateStr: string): boolean {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 1; // Sun/Mon = Ebright default rest days
}
function pad(n: number): string { return String(n).padStart(2, "0"); }

export async function GET(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  try {
    const { searchParams } = new URL(req.url);
    const empNo = searchParams.get("empNo");
    const month = Number(searchParams.get("month"));
    const year = Number(searchParams.get("year"));
    if (!empNo || !month || !year) {
      return NextResponse.json({ error: "empNo, month, year required" }, { status: 400 });
    }

    // ── Scope: employees can only query themselves ──────────────────────────
    const su = session.user as { role?: unknown; email?: string | null; branchName?: string };
    if (!canSeeAllBranches(session)) {
      if (isEmployee(su?.role)) {
        if (!su.email) return NextResponse.json({ count: 0, days: [] });
        const self = await hrfsPrisma.branchStaff.findFirst({
          where: { email: { equals: su.email, mode: "insensitive" } },
          select: { employeeId: true },
        });
        if (!self?.employeeId || self.employeeId !== empNo) {
          return NextResponse.json({ count: 0, days: [] });
        }
      } else if (su?.branchName) {
        const inBranch = await hrfsPrisma.branchStaff.findFirst({
          where: { employeeId: empNo, branch: su.branchName }, select: { id: true },
        });
        if (!inBranch) return NextResponse.json({ count: 0, days: [] });
      } else {
        return NextResponse.json({ count: 0, days: [] });
      }
    }

    // ── The employee + their schedule ───────────────────────────────────────
    const staff = await hrfsPrisma.branchStaff.findFirst({
      where: { employeeId: empNo },
      select: { id: true, name: true, workingHours: true },
    });
    if (!staff) return NextResponse.json({ count: 0, days: [] });

    const versions = await hrfsPrisma.$queryRaw<ScheduleVersion[]>`
      SELECT to_char("effectiveFrom", 'YYYY-MM-DD') AS "effectiveFrom", schedule
        FROM "BranchStaffSchedule" WHERE "branchStaffId" = ${staff.id}
       ORDER BY "effectiveFrom" ASC`;

    const firstOfMonth = `${year}-${pad(month)}-01`;

    // ── Scans (ST-remapped), condensed to per-day complete (in+out) flag ─────
    const idsToFetch = [empNo];
    const src = stSourceFor(empNo);
    if (src) idsToFetch.push(src);
    const scans = await hrfsPrisma.$queryRawUnsafe<RawScan[]>(
      `SELECT person_id, device_id, to_char(event_time, 'YYYY-MM-DD') AS kl_date
         FROM public.hikvision_attendance_all
        WHERE person_id = ANY($1)
          AND event_time >= $2::date AND event_time < ($2::date + interval '1 month')
          AND person_id IS NOT NULL AND person_id <> '' AND person_id <> '0'`,
      idsToFetch, firstOfMonth,
    );
    // Count scans per day for THIS employee (after remap). Matches the report's
    // "both scans = present": a day with >= 2 scans is complete.
    const scanCountByDate = new Map<string, number>();
    for (const r of scans) {
      if (remapStScan(r.device_id, r.person_id, null).personId !== empNo) continue;
      scanCountByDate.set(r.kl_date, (scanCountByDate.get(r.kl_date) ?? 0) + 1);
    }

    // ── Approved leave dates (match by name, like the HR dashboard) ──────────
    const leaveRows = await hrfsPrisma.$queryRawUnsafe<{ d: string }[]>(
      `SELECT DISTINCT to_char(lt."LeaveDate"::date, 'YYYY-MM-DD') AS d
         FROM "LeaveTransaction" lt
        WHERE lt."ApplyStatus" = 'A'
          AND UPPER(TRIM(lt."EmployeeName")) = UPPER(TRIM($1))
          AND lt."LeaveDate"::date >= $2::date
          AND lt."LeaveDate"::date <  ($2::date + interval '1 month')`,
      staff.name ?? "", firstOfMonth,
    );
    const leaveDates = new Set(leaveRows.map(r => r.d));

    // ── Filed justifications for this employee this month ────────────────────
    const justRows = await hrfsPrisma.$queryRawUnsafe<{ d: string }[]>(
      `SELECT DISTINCT to_char(just_date, 'YYYY-MM-DD') AS d
         FROM public.attendance_justification
        WHERE emp_no = $1 AND just_date >= $2::date
          AND just_date < ($2::date + interval '1 month')`,
      empNo, firstOfMonth,
    );
    const justifiedDates = new Set(justRows.map(r => r.d));

    // ── Walk the month; count unexplained No-Record days OLDER than the grace
    // window. A recent miss (within GRACE_DAYS) doesn't lock the download yet —
    // it gives the employee time to scan-correct or file a justification first
    // (they also get the missing-today reminder email). Only misses that are
    // past the grace window AND still unexplained lock the download.
    const todayKL = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
    const GRACE_DAYS = Number(process.env.NO_RECORD_GRACE_DAYS) || 3;
    const cutoff = new Date(todayKL + "T00:00:00");
    cutoff.setDate(cutoff.getDate() - GRACE_DAYS);
    const graceCutoff = cutoff.toISOString().slice(0, 10); // enforce only dates <= this
    const daysInMonth = new Date(year, month, 0).getDate();
    const days: string[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${year}-${pad(month)}-${pad(d)}`;
      if (date > graceCutoff) break; // within grace window (or future) → not enforced yet
      const activeSchedule = versions.length > 0 ? scheduleForDate(versions, date) : staff.workingHours;
      const slot = slotForDate(activeSchedule, date);
      const restDay = hasSchedule(activeSchedule) ? slot === null : isWeekend(date);
      if (restDay) continue;                              // not a working day
      if ((scanCountByDate.get(date) ?? 0) >= 2) continue; // complete scan = present
      if (leaveDates.has(date)) continue;                 // on leave → excused
      if (justifiedDates.has(date)) continue;             // justified → excused
      days.push(date);
    }

    return NextResponse.json({ empNo, month, year, graceDays: GRACE_DAYS, count: days.length, days });
  } catch (err) {
    console.error("GET /api/attendance-no-record error:", err);
    return NextResponse.json({ error: "Failed to compute no-record days" }, { status: 500 });
  }
}
