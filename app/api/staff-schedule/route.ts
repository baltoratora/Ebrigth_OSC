import { NextRequest, NextResponse } from "next/server";
import { hrfsPrisma } from "@/lib/hrfs";
import { requireSession } from "@/lib/auth";
import { scheduleForDate, type ScheduleVersion } from "@/lib/working-hours";

// Two modes:
//
//  ?branchStaffId=N  → the dated working-hours history for one employee, oldest
//                      first: { versions: [{ effectiveFrom, schedule }, ...] }.
//                      Used by the Attendance Report (one employee, whole month).
//
//  ?date=YYYY-MM-DD  → for EVERY employee that has any schedule history, the
//                      schedule active on that date:
//                        { schedules: { [branchStaffId]: WeekSchedule | null } }
//                      `null` means the employee has history but no version
//                      covers that date (it predates their earliest) → caller
//                      shows no Late/Early. A branchStaffId ABSENT from the map
//                      has no history at all → caller falls back to the single
//                      current workingHours (unchanged behaviour). Used by the
//                      daily Attendance dashboard (many employees, one date).
//
// `effectiveFrom` is rendered with to_char so the DATE column never shifts a day
// through timezone conversion.
export async function GET(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;
  void session;

  const idParam = req.nextUrl.searchParams.get("branchStaffId");
  const date = req.nextUrl.searchParams.get("date");

  try {
    if (idParam) {
      const id = Number(idParam);
      if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ versions: [] });
      const rows = await hrfsPrisma.$queryRaw<ScheduleVersion[]>`
        SELECT to_char("effectiveFrom", 'YYYY-MM-DD') AS "effectiveFrom", schedule
          FROM "BranchStaffSchedule"
         WHERE "branchStaffId" = ${id}
         ORDER BY "effectiveFrom" ASC
      `;
      return NextResponse.json({ versions: rows });
    }

    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const rows = await hrfsPrisma.$queryRaw<
        { branchStaffId: number; effectiveFrom: string; schedule: unknown }[]
      >`
        SELECT "branchStaffId", to_char("effectiveFrom", 'YYYY-MM-DD') AS "effectiveFrom", schedule
          FROM "BranchStaffSchedule"
         ORDER BY "branchStaffId", "effectiveFrom"
      `;
      const byStaff = new Map<number, ScheduleVersion[]>();
      for (const r of rows) {
        const arr = byStaff.get(r.branchStaffId) ?? [];
        arr.push({ effectiveFrom: r.effectiveFrom, schedule: r.schedule });
        byStaff.set(r.branchStaffId, arr);
      }
      const schedules: Record<string, unknown> = {};
      for (const [id, versions] of byStaff) {
        // undefined (date before earliest version) → null marker = "no badge".
        schedules[String(id)] = scheduleForDate(versions, date) ?? null;
      }
      return NextResponse.json({ schedules });
    }

    return NextResponse.json({ versions: [], schedules: {} });
  } catch (err) {
    console.error("/api/staff-schedule error:", err);
    return NextResponse.json({ versions: [], schedules: {} });
  }
}
