import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hrfsPrisma } from "@/lib/hrfs";
import { requireSession, canSeeAllBranches } from "@/lib/auth";
import {
  getWorkingDaysForBranch,
  getTimeSlotsForDay,
  isOpeningClosingSlot,
  isAdminSlot,
  ALL_COLUMNS,
  TRAINING_DAY_HOURS,
  STAR_COACH_RATE,
  POOJA_EMPLOYEE_ID,
  AMIN_EMPLOYEE_ID,
  getWeekendDailyTarget,
} from "@/lib/manpowerUtils";
import { isEmployee, isBranchManager, isAcademy } from "@/lib/roles";
import { normalizeLocation } from "@/lib/constants";

const EXECUTIVE_RATE = 11;

// Elevated exec rate paid for branch-manager-on-duty hours. See
// MANAGER_ON_DUTY_OVERRIDES below.
const BM_EXEC_RATE = 13;

// Flat training rate. When a person is assigned to a TRAINING column on a given
// day, that whole day is a full training day: TRAINING_DAY_HOURS paid at this
// rate (10.5 × 8 = RM84/day), regardless of weekday/weekend. The slots they
// appear in are shown as coach hours and the remainder as exec hours, but the
// split is display-only — pay is always the flat day rate.
const TRAINING_RATE = 8;

// Stand-in manager overrides.
//
// Manager-on-duty slots live in the MANAGER column, which is OUTSIDE the regular
// coach/exec grid (COLUMNS) — so they normally contribute zero hours and zero
// pay to this report. The real branch managers are excluded from the report
// anyway. But when a non-BM covers as Manager on Duty, those slots are genuine
// paid hours that would otherwise vanish.
//
// `dates`   — when set, only applies on those specific dates (one-off leave cover).
//             When omitted, applies every time that person appears in the MANAGER
//             column for that branch (permanent replacement).
// `modRate` — the hourly rate for the MANAGER-column hours. Defaults to
//             BM_EXEC_RATE (13) when omitted. Residual exec time to reach the
//             daily target always stays at EXECUTIVE_RATE (11).
//
//   16–17 May 2026 — Rimbayu's BM on leave; Iqbal covered all 7 weekend slots.
//   BBB (Bandar Baru Bangi) — Sreedran & Aina permanently replace the BM on
//   Saturdays and Sundays at 12.38/hr MOD rate, 11/hr exec rate.
const MANAGER_ON_DUTY_OVERRIDES: { branch: string; managerValue: string; dates?: string[]; modRate?: number }[] = [
  { branch: "Rimbayu",          managerValue: "IQBAL",    dates: ["2026-05-16", "2026-05-17"] },
  { branch: "Bandar Baru Bangi", managerValue: "SREEDRAN", modRate: 12.38 },
  { branch: "Bandar Baru Bangi", managerValue: "AINA",     modRate: 12.38 },
];

interface DailyHour {
  day: string;
  date?: string;
  coachHrs: number;
  execHrs: number;
  managerExecHrs?: number;
  trainingHrs?: number;
  totalHrs: number;
  classCount: number;
  starCoachClasses?: number;
  starCoachHrs?: number;
}

interface StaffHourEntry {
  name: string;
  branch: string;
  weekLabel: string;
  startDate: string;
  endDate: string;
  coachHrs: number;
  execHrs: number;
  managerExecHrs: number;
  trainingHrs: number;
  totalHrs: number;
  classCount: number;
  starCoachClasses: number;
  starCoachHrs: number;
  dailyBreakdown: DailyHour[];
  modRate?: number;
}

/**
 * Build the extra daily entries for every non-BM name found in the MANAGER
 * column of this schedule. Each match becomes an exec-only day: `managerExecHrs`
 * of the exec time is paid at the override's modRate (or BM_EXEC_RATE when
 * unset), the rest (up to the daily target) at the normal EXECUTIVE_RATE.
 *
 * Actual BMs who appear in the MANAGER column are NOT excluded here — they are
 * filtered out downstream by shouldExcludeStaff(). This means any coach placed
 * in the MANAGER column will automatically have their hours tallied, without
 * needing a MANAGER_ON_DUTY_OVERRIDES entry. The overrides list is only needed
 * to attach a custom modRate or a date restriction to a specific person.
 */
function managerOnDutyEntries(
  selections: Record<string, string>,
  branch: string,
  startDate: string,
  toDate: (day: string, start: string) => string,
): { name: string; day: string; date: string; execHrs: number; managerExecHrs: number; modRate?: number }[] {
  // Build a lookup of optional constraints from MANAGER_ON_DUTY_OVERRIDES.
  const overrideMap = new Map<string, { dates?: string[]; modRate?: number }>();
  for (const o of MANAGER_ON_DUTY_OVERRIDES) {
    if (branchesMatch(branch, o.branch)) {
      overrideMap.set(norm(o.managerValue), { dates: o.dates, modRate: o.modRate });
    }
  }

  // Collect every name that appears in a MANAGER column key, grouped by day.
  const nameSlots: Record<string, Record<string, number>> = {};
  for (const [key, val] of Object.entries(selections)) {
    if (!key.endsWith("-MANAGER")) continue;
    const name = val?.trim();
    if (!name || name === "None") continue;
    const day = key.slice(0, key.indexOf("-")); // day names contain no "-"
    nameSlots[name] = nameSlots[name] || {};
    nameSlots[name][day] = (nameSlots[name][day] || 0) + 1;
  }

  const out: { name: string; day: string; date: string; execHrs: number; managerExecHrs: number; modRate?: number }[] = [];

  for (const [name, slotsPerDay] of Object.entries(nameSlots)) {
    const override = overrideMap.get(norm(name));
    for (const [day, slots] of Object.entries(slotsPerDay)) {
      const date = toDate(day, startDate);
      // When the override has specific dates, skip days not in that list.
      if (override?.dates && !override.dates.includes(date)) continue;
      const isWeekend = day === "Saturday" || day === "Sunday";
      const dailyTarget = isWeekend ? getWeekendDailyTarget(branch, date) : 5.0;
      const managerExecHrs = Math.min(slots * 1.25, dailyTarget);
      out.push({ name, day, date, execHrs: dailyTarget, managerExecHrs, modRate: override?.modRate });
    }
  }
  return out;
}

type StaffRecord = {
  id: number;
  employeeId: string | null;
  name: string | null;
  nickname: string | null;
  branch: string | null;
  position: string | null;
  role: string | null;
  employment_type: string | null;
  rate: string | null;
  email: string | null;
  start_date: string | null;
  endDate: string | null;
  contract: string | null;
  status: string | null;
  workingHours: unknown;
};

// Basic employment info a Branch Manager sees for each coach in their branch.
interface RosterEntry {
  id: number;
  name: string;
  nickname: string | null;
  position: string | null;
  employmentType: string | null;
  isPT: boolean;
  contract: string | null;
  startDate: string | null;
  endDate: string | null;
  rate: number | null;
}

const norm = (v: string | null | undefined) => (v ?? "").toLowerCase().trim();

/**
 * Compare two branch labels for equivalence. Schedules use full names
 * ("Rimbayu", "Setia Alam") while BranchStaff often uses short codes
 * ("RBY", "SA"). normalizeLocation maps codes → full names; we then accept
 * an exact match or a substring match either way ("Rimbayu" ⊂ "Bandar Rimbayu").
 */
function branchesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return true;
  const fa = norm(normalizeLocation(a));
  const fb = norm(normalizeLocation(b));
  if (fa === fb) return true;
  if (fa && fb && (fa.includes(fb) || fb.includes(fa))) return true;
  return false;
}

function calculateHoursFromSelections(
  selections: Record<string, string>,
  branch: string,
  startDate: string
): Record<string, { coachHrs: number; execHrs: number; trainingHrs: number; totalHrs: number; classCount: number; starCoachClasses: number; starCoachHrs: number; dailyBreakdown: DailyHour[] }> {
  const allNames = new Set<string>();
  Object.values(selections).forEach((val) => {
    if (val && val !== "" && val !== "None") allNames.add(val);
  });

  const staffStats: Record<string, { coachHrs: number; execHrs: number; trainingHrs: number; totalHrs: number; classCount: number; starCoachClasses: number; starCoachHrs: number; dailyBreakdown: DailyHour[] }> = {};
  allNames.forEach((name) => {
    staffStats[name] = { coachHrs: 0, execHrs: 0, trainingHrs: 0, totalHrs: 0, classCount: 0, starCoachClasses: 0, starCoachHrs: 0, dailyBreakdown: [] };
  });

  const DOW: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const weekStart = new Date(sy, sm - 1, sd);
  const startDow = weekStart.getDay();
  function dayDate(dayName: string): string {
    let diff = (DOW[dayName] ?? 0) - startDow;
    if (diff < 0) diff += 7;
    const d = new Date(sy, sm - 1, sd + diff);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  getWorkingDaysForBranch(branch).forEach((day) => {
    const isWeekend = day === "Saturday" || day === "Sunday";
    const actualDate = dayDate(day);
    const dailyTarget = isWeekend ? getWeekendDailyTarget(branch, actualDate) : 5.0;

    allNames.forEach((emp) => {
      let coachingHoursForDay = 0;
      let starCoachClassesForDay = 0;
      let starCoachHoursForDay = 0;
      let trainingSlotHoursForDay = 0;
      let classesForDay = 0;
      let workedThatDay = false;
      let inTrainingThatDay = false;

      getTimeSlotsForDay(day, branch, actualDate).forEach((slot) => {
        if (isOpeningClosingSlot(slot, branch)) return;
        ALL_COLUMNS.forEach((col) => {
          if (selections[`${day}-${slot}-${col.id}`] !== emp) return;
          workedThatDay = true;
          const isAdmin = isAdminSlot(slot, branch);
          const slotDuration = isAdmin ? 0.25 : 1.25;
          if (col.type === "training") {
            inTrainingThatDay = true;
            trainingSlotHoursForDay += slotDuration;
            return;
          }
          if (col.type === "star_coach") {
            // Star Coach: counted as coaching hours/classes for display, but paid
            // at STAR_COACH_RATE per class (not per hour at the coach's rate).
            // starCoachHrs is tracked separately so regular coachPay can exclude it.
            coachingHoursForDay += slotDuration;
            starCoachHoursForDay += slotDuration;
            if (!isAdmin) {
              classesForDay += 1;
              starCoachClassesForDay += 1;
            }
            return;
          }
          if (col.type === "coach") {
            coachingHoursForDay += slotDuration;
            if (!isAdmin) classesForDay += 1;
          }
        });
      });

      if (!workedThatDay) return;

      if (inTrainingThatDay) {
        const dayCoachHrs = coachingHoursForDay + trainingSlotHoursForDay;
        const dayExecHrs = Math.max(0, TRAINING_DAY_HOURS - dayCoachHrs);
        staffStats[emp].trainingHrs += TRAINING_DAY_HOURS;
        staffStats[emp].totalHrs = staffStats[emp].coachHrs + staffStats[emp].execHrs + staffStats[emp].trainingHrs;
        staffStats[emp].dailyBreakdown.push({
          day,
          coachHrs: dayCoachHrs,
          execHrs: dayExecHrs,
          trainingHrs: TRAINING_DAY_HOURS,
          totalHrs: TRAINING_DAY_HOURS,
          classCount: 0,
        });
        return;
      }

      // coachingHoursForDay already includes star_coach; exec fills the remainder.
      const execHrs = Math.max(0, dailyTarget - coachingHoursForDay);
      staffStats[emp].coachHrs += coachingHoursForDay;
      staffStats[emp].execHrs += execHrs;
      staffStats[emp].starCoachClasses += starCoachClassesForDay;
      staffStats[emp].starCoachHrs += starCoachHoursForDay;
      staffStats[emp].totalHrs = staffStats[emp].coachHrs + staffStats[emp].execHrs + staffStats[emp].trainingHrs;
      staffStats[emp].classCount += classesForDay;
      staffStats[emp].dailyBreakdown.push({
        day,
        coachHrs: coachingHoursForDay,
        execHrs,
        trainingHrs: 0,
        totalHrs: coachingHoursForDay + execHrs,
        classCount: classesForDay,
        starCoachClasses: starCoachClassesForDay,
        starCoachHrs: starCoachHoursForDay,
      });
    });
  });

  return staffStats;
}

/**
 * Resolve a slot value (a name string written into ManpowerSchedule.selections)
 * to a single BranchStaff record. Tries exact name/nickname match first, then
 * substring matching to handle short-form names (e.g. slot says "Diena", staff
 * record is "NUR IRDIENA BATRISYIA BINTI ASMAWI" with nickname "IRDIENA").
 *
 * When more than one candidate matches a key (e.g. two staff share nickname
 * "IQBAL"), prefer the one whose home branch matches the schedule's branch.
 */
function buildStaffResolver(allStaff: StaffRecord[]) {
  // Allow multiple candidates per name/nickname key — many staff share short
  // nicknames like "IQBAL" or "LUQMANUL", so we can't first-write-wins.
  const byKey: Record<string, StaffRecord[]> = {};
  const push = (key: string, s: StaffRecord) => {
    const list = (byKey[key] ||= []);
    if (!list.includes(s)) list.push(s);
  };
  for (const s of allStaff) {
    if (s.name) push(norm(s.name), s);
    if (s.nickname) push(norm(s.nickname), s);
  }

  return (rawName: string, scheduleBranch: string): StaffRecord | null => {
    const key = norm(rawName);
    if (!key) return null;

    const exact = byKey[key];
    if (exact && exact.length > 0) {
      if (exact.length === 1) return exact[0];
      const branchMatch = exact.find((s) => branchesMatch(s.branch, scheduleBranch));
      if (branchMatch) return branchMatch;
      // Otherwise fall through and let substring matching try harder.
    }

    const candidates = allStaff.filter((s) => {
      const n = norm(s.name);
      const nk = norm(s.nickname);
      if (n && (n === key || n.includes(key) || key.includes(n))) return true;
      if (nk && (nk === key || nk.includes(key) || key.includes(nk))) return true;
      return false;
    });

    if (candidates.length === 0) return exact?.[0] ?? null;
    if (candidates.length === 1) return candidates[0];

    const branchMatch = candidates.find((s) => branchesMatch(s.branch, scheduleBranch));
    return branchMatch ?? candidates[0];
  };
}

/**
 * For an authenticated PT/FT user, resolve which BranchStaff record represents
 * them. Tries email first (the only reliable join), then falls back to matching
 * User.name / User.branchName against BranchStaff.name and BranchStaff.nickname
 * (including substring matching).
 */
function resolveLoggedInStaff(
  allStaff: StaffRecord[],
  sessionEmail: string | null | undefined,
  sessionName: string | null | undefined,
  sessionBranchName: string | null | undefined
): StaffRecord | null {
  const email = norm(sessionEmail);
  if (email) {
    const byEmail = allStaff.find((s) => norm(s.email) === email);
    if (byEmail) return byEmail;
  }

  const candidates = [norm(sessionName), norm(sessionBranchName)].filter(Boolean);
  for (const c of candidates) {
    const exact = allStaff.find((s) => norm(s.name) === c || norm(s.nickname) === c);
    if (exact) return exact;
  }
  for (const c of candidates) {
    const sub = allStaff.find((s) => {
      const n = norm(s.name);
      const nk = norm(s.nickname);
      if (n && (n.includes(c) || c.includes(n))) return true;
      if (nk && (nk.includes(c) || c.includes(nk))) return true;
      return false;
    });
    if (sub) return sub;
  }
  return null;
}

function isPartTimeStaff(staff: StaffRecord): boolean {
  const fields = [staff.position, staff.role, staff.employment_type]
    .map((f) => (f ?? "").toUpperCase());
  return fields.some(
    (f) =>
      f.startsWith("PT") ||
      f.includes("PT -") ||
      f.includes("PART-TIME") ||
      f.includes("PART TIME"),
  );
}

/**
 * True when this staff member's hours on `day` should be treated as
 * online-coach hours, paid on coaching hours only (no exec hours / no exec
 * pay). `branch` must be the coach's HOME branch (the aggregated bucket's
 * branch), not the schedule's: when an online coach covers a class for
 * another branch they still hold it online, so their replacement days are
 * also coach-hours-only. Day-aware special cases: Amin (FT) always keeps the
 * standard coach+exec calculation; Pooja keeps it on Saturdays only, when she
 * works from the office — any other day she's a regular online coach.
 */
function isOnlineCoachOnly(staff: StaffRecord | null, branch: string, day: string): boolean {
  if (norm(normalizeLocation(branch)) !== "online") return false;
  const empId = (staff?.employeeId ?? "").trim();
  if (empId === AMIN_EMPLOYEE_ID) return false;
  if (empId === POOJA_EMPLOYEE_ID) return day !== "Saturday";
  return true;
}

function shouldExcludeStaff(staff: StaffRecord): boolean {
  const pos = (staff.position || staff.role || "").toUpperCase();
  const name = (staff.name || "").toUpperCase();
  if (pos.includes("BRANCH MANAGER")) return true;
  if (pos.includes("INTERN")) return true;
  if (name.includes("(TRAINING)")) return true;
  return false;
}

/**
 * GET /api/manpower-cost?month=2026-04
 *
 * Returns staff hours + cost data by parsing ManpowerSchedule selections and
 * resolving each slot value to a BranchStaff record (the single source of
 * truth for employee identity, branch, role, and rate).
 */
export async function GET(request: Request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");

    const sessionUser = auth.session.user as any;
    const userRole = sessionUser?.role || "";
    const isEmployeeView = isEmployee(userRole);

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: "month parameter required (format: YYYY-MM)" },
        { status: 400 }
      );
    }

    const [year, mon] = month.split("-");
    const monthStart = `${year}-${mon}-01`;
    const nextMonth = Number(mon) === 12
      ? `${Number(year) + 1}-01-01`
      : `${year}-${String(Number(mon) + 1).padStart(2, "0")}-01`;

    // Include any schedule whose week OVERLAPS the requested month — not just
    // ones whose startDate falls inside it. Weeks routinely span a month
    // boundary (e.g. Apr 30 – May 6), and the previous "startDate in month"
    // filter dropped those entirely for the second month, causing May 2 / 3
    // to be missing for everyone who only worked on the cross-boundary week.
    // The per-day filter below trims the days back to the requested month.
    const schedules = await prisma.manpowerSchedule.findMany({
      where: {
        AND: [
          { startDate: { lt: nextMonth } },
          { endDate: { gte: monthStart } },
        ],
        status: "Finalized",
      },
      orderBy: { startDate: "asc" },
    });

    // Source of truth: BranchStaff table only.
    const allStaff: StaffRecord[] = await hrfsPrisma.branchStaff.findMany({
      select: {
        id: true,
        employeeId: true,
        name: true,
        nickname: true,
        branch: true,
        position: true,
        role: true,
        employment_type: true,
        rate: true,
        email: true,
        start_date: true,
        endDate: true,
        contract: true,
        status: true,
        workingHours: true,
      },
    });

    const resolveStaff = buildStaffResolver(allStaff);

    // Resolve the logged-in employee (if any) to a single BranchStaff id, so we
    // can filter the final results to that one person. Fail closed: if we can't
    // resolve, return nothing for an employee user.
    let loggedInStaffId: number | null = null;
    if (isEmployeeView) {
      const me = resolveLoggedInStaff(
        allStaff,
        sessionUser?.email,
        sessionUser?.name,
        sessionUser?.branchName,
      );
      loggedInStaffId = me?.id ?? null;
    }
    const employeeWorkingHours = isEmployeeView && loggedInStaffId !== null
      ? (allStaff.find(s => s.id === loggedInStaffId)?.workingHours ?? null)
      : null;

    const dayNameToDate = (dayName: string, startDate: string): string => {
      const dayMap: Record<string, number> = {
        Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
        Thursday: 4, Friday: 5, Saturday: 6,
      };
      const [sy, sm, sd] = startDate.split("-").map(Number);
      const start = new Date(sy, sm - 1, sd);
      const startDow = start.getDay();
      const targetDow = dayMap[dayName] ?? 0;
      let diff = targetDow - startDow;
      if (diff < 0) diff += 7;
      const result = new Date(sy, sm - 1, sd + diff);
      const yyyy = result.getFullYear();
      const mm = String(result.getMonth() + 1).padStart(2, "0");
      const dd = String(result.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };

    const allEntries: StaffHourEntry[] = [];

    schedules.forEach((schedule: any) => {
      const selections = (schedule.selections || schedule.originalSelections || {}) as Record<string, string>;
      if (!selections || Object.keys(selections).length === 0) return;

      const stats = calculateHoursFromSelections(selections, schedule.branch, schedule.startDate);

      Object.entries(stats).forEach(([name, hours]) => {
        if (hours.totalHrs === 0) return;
        const dailyWithDates = hours.dailyBreakdown
          .map((d) => ({ ...d, date: dayNameToDate(d.day, schedule.startDate) }))
          .filter((d) => d.date >= monthStart && d.date < nextMonth);

        if (dailyWithDates.length === 0) return;

        // Training-day coach/exec hours are a display-only split of the flat
        // training day — keep them out of the coach/exec buckets so they are
        // never paid at the coach or exec rate on top of the training rate.
        const nonTrainingDays = dailyWithDates.filter((d) => !(d.trainingHrs && d.trainingHrs > 0));
        const filteredCoachHrs = nonTrainingDays.reduce((s, d) => s + d.coachHrs, 0);
        const filteredExecHrs = nonTrainingDays.reduce((s, d) => s + d.execHrs, 0);
        const filteredTrainingHrs = dailyWithDates.reduce((s, d) => s + (d.trainingHrs || 0), 0);
        const filteredClassCount = dailyWithDates.reduce((s, d) => s + (d.classCount || 0), 0);

        const filteredStarCoachClasses = nonTrainingDays.reduce((s, d) => s + (d.starCoachClasses || 0), 0);
        const filteredStarCoachHrs = nonTrainingDays.reduce((s, d) => s + (d.starCoachHrs || 0), 0);

        allEntries.push({
          name,
          branch: schedule.branch,
          weekLabel: `${schedule.startDate} - ${schedule.endDate}`,
          startDate: schedule.startDate,
          endDate: schedule.endDate,
          coachHrs: filteredCoachHrs,
          execHrs: filteredExecHrs,
          managerExecHrs: 0,
          trainingHrs: filteredTrainingHrs,
          totalHrs: filteredCoachHrs + filteredExecHrs + filteredTrainingHrs,
          classCount: filteredClassCount,
          starCoachClasses: filteredStarCoachClasses,
          starCoachHrs: filteredStarCoachHrs,
          dailyBreakdown: dailyWithDates,
        });
      });

      // Stand-in manager-on-duty days (see MANAGER_ON_DUTY_OVERRIDES). These
      // come from the MANAGER column, which the regular grid above ignores.
      managerOnDutyEntries(selections, schedule.branch, schedule.startDate, dayNameToDate)
        .filter((e) => e.date >= monthStart && e.date < nextMonth)
        .forEach((e) => {
          allEntries.push({
            name: e.name,
            branch: schedule.branch,
            weekLabel: `${schedule.startDate} - ${schedule.endDate}`,
            startDate: schedule.startDate,
            endDate: schedule.endDate,
            coachHrs: 0,
            execHrs: e.execHrs,
            managerExecHrs: e.managerExecHrs,
            trainingHrs: 0,
            totalHrs: e.execHrs,
            classCount: 0,
            starCoachClasses: 0,
            starCoachHrs: 0,
            modRate: e.modRate,
            dailyBreakdown: [{
              day: e.day,
              date: e.date,
              coachHrs: 0,
              execHrs: e.execHrs,
              managerExecHrs: e.managerExecHrs,
              totalHrs: e.execHrs,
              classCount: 0,
            }],
          });
        });
    });

    // Aggregate by BranchStaff.id so name variants ("Diena" / "IRDIENA" /
    // "NUR IRDIENA BATRISYIA BINTI ASMAWI") collapse into one row.
    interface DailyEntry { date: string; day: string; coachHrs: number; execHrs: number; managerExecHrs: number; trainingHrs: number; totalHrs: number; classCount: number; starCoachClasses: number; starCoachHrs: number; scheduleBranch?: string }

    const aggregated: Record<string, {
      key: string;
      staffId: number | null;
      name: string;
      branch: string;
      rate: number | null;
      modRate: number | null;
      employmentType: string | null;
      position: string | null;
      coachHrs: number;
      execHrs: number;
      managerExecHrs: number;
      trainingHrs: number;
      totalHrs: number;
      classCount: number;
      starCoachClasses: number;
      starCoachHrs: number;
      coachPay: number;
      execPay: number;
      trainingPay: number;
      starCoachPay: number;
      totalPay: number;
      days: DailyEntry[];
    }> = {};

    allEntries.forEach((entry) => {
      const staff = resolveStaff(entry.name, entry.branch);

      // Aggregation key: BranchStaff.id when resolved, otherwise raw name+branch.
      // Unresolved entries (slot value with no matching staff record) get their
      // own bucket so they remain visible rather than silently merging.
      const key = staff ? `staff:${staff.id}` : `raw:${norm(entry.name)}:::${norm(entry.branch)}`;

      // When matched, always show the BranchStaff full name and the friendly
      // branch label. BranchStaff.branch may be a short code ("RBY") — route
      // it through normalizeLocation so the UI displays "Bandar Rimbayu".
      const displayName = staff?.name || entry.name;
      const rawBranch = staff?.branch || entry.branch;
      const homeBranch = normalizeLocation(rawBranch) || rawBranch;
      const rate = staff?.rate ? parseFloat(staff.rate) || null : null;
      const position = staff?.position || staff?.role || null;
      const employmentType = staff?.employment_type || position;

      if (!aggregated[key]) {
        aggregated[key] = {
          key,
          staffId: staff?.id ?? null,
          name: displayName,
          branch: homeBranch,
          rate,
          modRate: entry.modRate ?? null,
          employmentType,
          position,
          coachHrs: 0,
          execHrs: 0,
          managerExecHrs: 0,
          trainingHrs: 0,
          totalHrs: 0,
          classCount: 0,
          starCoachClasses: 0,
          starCoachHrs: 0,
          coachPay: 0,
          execPay: 0,
          trainingPay: 0,
          starCoachPay: 0,
          totalPay: 0,
          days: [],
        };
      }

      const bucket = aggregated[key];
      // Carry modRate from any MOD override entry into the bucket (first one wins).
      if (entry.modRate !== undefined && bucket.modRate === null) bucket.modRate = entry.modRate;
      bucket.coachHrs += entry.coachHrs;
      bucket.execHrs += entry.execHrs;
      bucket.managerExecHrs += entry.managerExecHrs;
      bucket.trainingHrs += entry.trainingHrs;
      bucket.totalHrs += entry.totalHrs;
      bucket.classCount += entry.classCount;
      bucket.starCoachClasses += entry.starCoachClasses;
      bucket.starCoachHrs += entry.starCoachHrs;

      // Mark a day as a "replacement" only when the schedule branch is
      // genuinely different from the staff's home branch. Compare via
      // branchesMatch so "RBY" vs "Rimbayu" doesn't get tagged as a swap.
      const scheduleBranch = entry.branch;
      const isReplacement = !branchesMatch(scheduleBranch, bucket.branch);
      entry.dailyBreakdown.forEach((d: any) => {
        bucket.days.push({
          date: d.date,
          day: d.day,
          coachHrs: d.coachHrs,
          execHrs: d.execHrs,
          managerExecHrs: d.managerExecHrs || 0,
          trainingHrs: d.trainingHrs || 0,
          totalHrs: d.totalHrs,
          classCount: d.classCount || 0,
          starCoachClasses: d.starCoachClasses || 0,
          starCoachHrs: d.starCoachHrs || 0,
          scheduleBranch: isReplacement ? scheduleBranch : undefined,
        });
      });
    });

    Object.values(aggregated).forEach((emp) => {
      emp.days.sort((a, b) => a.date.localeCompare(b.date));

      // Merge multiple entries for the same date. This happens when two
      // slot-name variants for the same BranchStaff (e.g. "RITHU" / "ISHINI")
      // both appear on the same schedule day. Each name is processed separately
      // in calculateHoursFromSelections, producing two daily entries that both
      // end up in this bucket. Sum coach hours and classes; re-derive exec as
      // dailyTarget − coachHrs to prevent exec from being double-counted.
      const merged: DailyEntry[] = [];
      for (const d of emp.days) {
        const prev = merged[merged.length - 1];
        if (prev && prev.date === d.date) {
          prev.coachHrs += d.coachHrs;
          prev.classCount = (prev.classCount || 0) + (d.classCount || 0);
          prev.starCoachClasses = (prev.starCoachClasses || 0) + (d.starCoachClasses || 0);
          prev.starCoachHrs = (prev.starCoachHrs || 0) + (d.starCoachHrs || 0);
          prev.trainingHrs = (prev.trainingHrs || 0) + (d.trainingHrs || 0);
          prev.managerExecHrs = (prev.managerExecHrs || 0) + (d.managerExecHrs || 0);
          const isWeekend = prev.day === "Saturday" || prev.day === "Sunday";
          const dailyTarget = (prev.trainingHrs || 0) > 0 ? TRAINING_DAY_HOURS : isWeekend ? getWeekendDailyTarget(emp.branch, prev.date) : 5.0;
          prev.execHrs = Math.max(0, dailyTarget - prev.coachHrs);
          prev.totalHrs = prev.coachHrs + prev.execHrs + (prev.trainingHrs || 0);
        } else {
          merged.push({ ...d });
        }
      }
      emp.days = merged;
    });

    const results = Object.values(aggregated)
      .filter((emp) => {
        // Apply exclusion based on the resolved staff record when available.
        if (emp.staffId !== null) {
          const staff = allStaff.find((s) => s.id === emp.staffId);
          if (staff && shouldExcludeStaff(staff)) return false;
        }
        const pos = (emp.position || "").toUpperCase();
        const name = (emp.name || "").toUpperCase();
        if (pos.includes("BRANCH MANAGER")) return false;
        if (pos.includes("INTERN")) return false;
        if (name.includes("(TRAINING)")) return false;
        return true;
      })
      .map((emp) => {
        const staff = emp.staffId !== null ? allStaff.find((s) => s.id === emp.staffId) : null;
        const isPT = staff
          ? isPartTimeStaff(staff)
          : (() => {
              const roleStr = (emp.employmentType || emp.position || "").toUpperCase();
              return roleStr.startsWith("PT") || roleStr.includes("PT -") ||
                     roleStr.includes("PART-TIME") || roleStr.includes("PART TIME");
            })();

        // Online coaches have no exec hours on their online days — drop that
        // exec time so those days are paid on coaching hours only. Checked per
        // day because Pooja is physical-style on Saturdays only. Training days
        // pass through untouched: their coach/exec values are a display split
        // of the flat 10.5h training day, not real exec time. Training hours
        // are independent of this and always kept.
        const days = emp.days.map((d) => {
          if ((d.trainingHrs || 0) > 0) return d;
          if (!isOnlineCoachOnly(staff ?? null, emp.branch, d.day)) return d;
          return { ...d, execHrs: 0, managerExecHrs: 0, totalHrs: d.coachHrs };
        });
        // Re-derive the exec totals from the (possibly day-zeroed) days,
        // skipping training days whose exec value is display-only.
        const execHrs = days.reduce((s, d) => s + ((d.trainingHrs || 0) > 0 ? 0 : d.execHrs), 0);
        const managerExecHrs = days.reduce((s, d) => s + ((d.trainingHrs || 0) > 0 ? 0 : (d.managerExecHrs || 0)), 0);
        const trainingHrs = emp.trainingHrs;
        const totalHrs = emp.coachHrs + execHrs + trainingHrs;

        const hasRate = emp.rate !== null && emp.rate > 0;
        // emp.coachHrs includes star_coach hours; subtract them before applying the
        // per-hour rate so star coach slots aren't also paid at rate/hr.
        const starCoachHrs = emp.starCoachHrs || 0;
        const regularCoachHrs = emp.coachHrs - starCoachHrs;
        const coachPay = isPT && hasRate ? regularCoachHrs * (emp.rate || 0) : 0;
        // Star Coach column: flat RM50/class regardless of stored rate.
        const starCoachPay = isPT ? (emp.starCoachClasses || 0) * STAR_COACH_RATE : 0;
        // Manager-on-duty hours: use the override modRate when set (e.g. stand-in managers
        // with a custom agreed rate), otherwise fall back to the standard BM_EXEC_RATE.
        // Stand-in managers may not have a DB coach rate — treat hasRate as true when
        // they have a modRate so their exec pay is still calculated.
        const effectiveModRate = emp.modRate ?? BM_EXEC_RATE;
        const hasRateForExec = hasRate || (emp.modRate !== null && managerExecHrs > 0);
        const effectiveIsPTForExec = isPT || (emp.modRate !== null && managerExecHrs > 0);
        const regularExecHrs = Math.max(0, execHrs - managerExecHrs);
        const execPay = effectiveIsPTForExec && hasRateForExec
          ? regularExecHrs * EXECUTIVE_RATE + managerExecHrs * effectiveModRate
          : 0;
        // Training is paid at the flat TRAINING_RATE for everyone who logged
        // training hours — independent of PT/FT status or coach rate.
        const trainingPay = trainingHrs * TRAINING_RATE;
        const isTraining = trainingHrs > 0;

        return {
          ...emp,
          execHrs,
          managerExecHrs,
          trainingHrs,
          totalHrs,
          days,
          isPT,
          isTraining,
          staffRole: staff?.role ?? null,
          coachPay,
          starCoachPay,
          execPay,
          trainingPay,
          totalPay: coachPay + starCoachPay + execPay + trainingPay,
        };
      });

    // Basic-info roster for Branch Managers — every active coach in their branch,
    // independent of whether they logged scheduled hours this month.
    let branchRoster: RosterEntry[] = [];

    // Role-based scoping. Fail closed: anything we can't resolve becomes [].
    //   FT / PT (isEmployeeView)   → own row only via loggedInStaffId.
    //   Branch Manager              → own branch only.
    //   Admin / HOD / HR / Academy → see everything (no filter).
    //   Executive / Intern / other → no pay data (fail closed).
    if (isEmployeeView) {
      // Employee self-view: filter to just the logged-in person's row by
      // BranchStaff.id. Fail closed if we couldn't resolve them.
      const filtered = loggedInStaffId === null
        ? []
        : results.filter((r) => r.staffId === loggedInStaffId);
      results.length = 0;
      results.push(...filtered);
    } else if (isBranchManager(userRole)) {
      const userBranch = sessionUser?.branchName as string | null | undefined;
      // Use branchesMatch (not exact ===): r.branch is the normalized full name
      // ("Bandar Rimbayu") while the BM's session branchName may be a short/variant
      // form ("Rimbayu") or carry a typo ("Bandar Tun Huseein Onn").
      const filtered = userBranch
        ? results.filter((r) => branchesMatch(r.branch, userBranch))
        : [];
      results.length = 0;
      results.push(...filtered);

      // Build the basic-info roster: all active coaches in the BM's branch,
      // sourced directly from BranchStaff so coaches with no scheduled hours
      // this month still appear. Excludes BMs / interns / training rows.
      if (userBranch) {
        branchRoster = allStaff
          .filter((s) => branchesMatch(s.branch, userBranch))
          .filter((s) => !shouldExcludeStaff(s))
          .filter((s) => norm(s.status) === "active")
          .map((s) => ({
            id: s.id,
            name: s.name || s.nickname || "",
            nickname: s.nickname,
            position: s.position || s.role,
            employmentType: s.employment_type,
            isPT: isPartTimeStaff(s),
            contract: s.contract,
            startDate: s.start_date,
            endDate: s.endDate,
            rate: s.rate ? parseFloat(s.rate) || null : null,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
      }
    } else if (canSeeAllBranches(auth.session) || isAcademy(userRole)) {
      // No filter — caller sees all branches.
    } else {
      // Executive / Intern / unknown role → no pay-data access.
      results.length = 0;
    }

    results.sort((a, b) => {
      if (a.isPT !== b.isPT) return a.isPT ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const ptResults = results.filter((r) => r.isPT);
    const ftResults = results.filter((r) => !r.isPT);

    const totalTrainingPay = results.reduce((s, r) => s + r.trainingPay, 0);
    const totals = {
      totalStaff: results.length,
      ptCount: ptResults.length,
      ftCount: ftResults.length,
      totalCoachHrs: results.reduce((s, r) => s + r.coachHrs, 0),
      totalExecHrs: results.reduce((s, r) => s + r.execHrs, 0),
      totalTrainingHrs: results.reduce((s, r) => s + r.trainingHrs, 0),
      totalHrs: results.reduce((s, r) => s + r.totalHrs, 0),
      totalClasses: results.reduce((s, r) => s + r.classCount, 0),
      totalCoachPay: ptResults.reduce((s, r) => s + r.coachPay, 0),
      totalStarCoachClasses: results.reduce((s, r) => s + r.starCoachClasses, 0),
      totalStarCoachPay: ptResults.reduce((s, r) => s + r.starCoachPay, 0),
      totalExecPay: ptResults.reduce((s, r) => s + r.execPay, 0),
      totalTrainingPay,
      totalPay: ptResults.reduce((s, r) => s + r.totalPay, 0) + ftResults.reduce((s, r) => s + r.trainingPay, 0),
      executiveRate: EXECUTIVE_RATE,
      bmExecRate: BM_EXEC_RATE,
      trainingRate: TRAINING_RATE,
      starCoachRate: STAR_COACH_RATE,
    };

    const weeksSet = new Set<string>();
    schedules.forEach((s: any) => {
      weeksSet.add(`${s.startDate}:::${s.endDate}`);
    });
    const availableWeeks = Array.from(weeksSet)
      .map((w) => { const [start, end] = w.split(":::"); return { start, end }; })
      .sort((a, b) => a.start.localeCompare(b.start));

    return NextResponse.json({
      success: true,
      month,
      totals,
      staff: results,
      isEmployeeView,
      isBranchManagerView: isBranchManager(userRole),
      branchRoster,
      availableWeeks,
      employeeWorkingHours,
    });
  } catch (error) {
    console.error("Manpower cost calculation error:", error);
    return NextResponse.json(
      { error: "Failed to calculate manpower cost" },
      { status: 500 }
    );
  }
}
