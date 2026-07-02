export const SHARED_EMPLOYEES: string[] = [];

export const ALL_BRANCHES = [
  "Subang Taipan", "Setia Alam", "Shah Alam", "Putrajaya", "Ampang", 
  "Cyberjaya", "Klang", "Bandar Baru Bangi", "Taman Sri Gombak", 
  "Online", "Kajang TTDI Groove", "Kota Warisan", "Bandar Tun Hussein Onn", 
  "Danau Kota", "Denai Alam", "Sri Petaling", "Eco Grandeur", 
  "Kota Damansara", "Bandar Seri Putra", "Rimbayu",
  "Tropicana Sungai Buloh", "Puncak Jalil", "Puchong Utama"
].sort();

export const DAYS = ["Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const WEEKDAY_DAYS = ["Wednesday", "Thursday", "Friday"] as const;

// Online-branch pay rule.
//
// Coaches whose HOME branch is Online are "online coaches": they are paid
// purely on the hours they actually coach (class slots × rate) — no exec
// hours, no exec rate. The standard branches instead top each working day up
// to a daily target with "exec" hours (dailyTarget − coachHrs).
//
// The rule follows the person, not the schedule: when an online coach covers
// a class for another branch they still hold it online, so their replacement
// days are also coach-hours-only.
//
// Two people get special treatment:
//   77000093 — Pooja (PT): comes to the office on SATURDAYS, so Saturday is
//              calculated like a physical coach (coach + exec, both paid).
//              Any other day she coaches online — coach hours only, like the
//              rest of the online team.
//   66020086 — Amin (FT): counts both coach and exec hours every day, but as
//              FT he draws a salary, so no hourly pay either way.
export const POOJA_EMPLOYEE_ID = "77000093";
export const AMIN_EMPLOYEE_ID = "66020086";

/**
 * True when this staff member's hours on `day` are coach-hours-only (no exec
 * hours) — i.e. their HOME branch is Online and the special cases above don't
 * apply. Pass the coach's home branch (full name "Online"), not the
 * schedule's branch, so replacement days at other branches stay coach-only.
 */
export function isOnlineCoachOnly(
  branch: string | null | undefined,
  employeeId: string | null | undefined,
  day: string,
): boolean {
  if ((branch ?? "").trim().toLowerCase() !== "online") return false;
  const id = (employeeId ?? "").trim();
  if (id === AMIN_EMPLOYEE_ID) return false;
  if (id === POOJA_EMPLOYEE_ID) return day !== "Saturday";
  return true;
}

export const BRANCH_WORKING_DAYS: Record<string, string[]> = {
  "Ampang": ["Thursday", "Friday", "Saturday", "Sunday"],
  "Bandar Seri Putra": ["Thursday", "Friday", "Saturday", "Sunday"],
  "Klang": ["Thursday", "Friday", "Saturday", "Sunday"],
  "Rimbayu": ["Friday", "Saturday", "Sunday"],
  "Kota Warisan": ["Friday", "Saturday", "Sunday"],
  "Tropicana Sungai Buloh": ["Saturday", "Sunday"],
  "Setia Alam": ["Thursday", "Friday", "Saturday", "Sunday"],
};

export function getWorkingDaysForBranch(branchName: string): string[] {
  return BRANCH_WORKING_DAYS[branchName] ?? [...DAYS];
}

// --- COLOR LOGIC ---
const COLOR_PALETTE = [
  "bg-red-600 text-white",
  "bg-orange-500 text-white",
  "bg-amber-500 text-black",
  "bg-green-600 text-white",
  "bg-emerald-500 text-white",
  "bg-teal-600 text-white",
  "bg-cyan-600 text-white",
  "bg-sky-600 text-white",
  "bg-blue-600 text-white",
  "bg-indigo-600 text-white",
  "bg-violet-600 text-white",
  "bg-purple-600 text-white",
  "bg-fuchsia-600 text-white",
  "bg-pink-600 text-white",
  "bg-rose-600 text-white",
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    // A slightly stronger hash to spread colors better
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

export function getEmployeeColor(name: string): string {
  if (!name || name === "None" || name === "-- Select --") return "bg-white text-slate-400 border border-slate-200";
  const colorIndex = hashName(name) % COLOR_PALETTE.length;
  return COLOR_PALETTE[colorIndex];
}

export const STAFF_COLORS = [
  "bg-red-500 text-white", "bg-orange-500 text-white", "bg-amber-500 text-black",
  "bg-lime-600 text-white", "bg-green-600 text-white", "bg-emerald-500 text-white",
  "bg-teal-600 text-white", "bg-cyan-600 text-white", "bg-sky-500 text-white",
  "bg-blue-600 text-white", "bg-indigo-600 text-white", "bg-violet-600 text-white",
  "bg-purple-600 text-white", "bg-fuchsia-600 text-white", "bg-pink-600 text-white",
  "bg-rose-600 text-white", "bg-red-700 text-white", "bg-orange-700 text-white",
  "bg-yellow-600 text-white", "bg-green-700 text-white", "bg-teal-700 text-white",
  "bg-blue-700 text-white", "bg-indigo-700 text-white", "bg-violet-700 text-white",
  "bg-pink-700 text-white", "bg-rose-700 text-white", "bg-cyan-700 text-white",
  "bg-sky-700 text-white", "bg-emerald-700 text-white", "bg-purple-700 text-white",
];

export function getStaffColorByIndex(name: string, staffList: string[]): string {
  if (!name || name === "None") return "bg-white border border-slate-200 text-slate-400";
  const idx = staffList.indexOf(name);
  if (idx >= 0) return STAFF_COLORS[idx % STAFF_COLORS.length];
  return getEmployeeColor(name);
}

// --- TABLE CONFIGURATION ---
export type ColumnDef = { id: string; label: string; type: "coach" | "exec" | "training" | "star_coach" };

// Flat per-class rate for the Star Coach column (TSB branch only). Regular
// coach columns pay per hour at the coach's individual rate; this column pays
// a fixed amount regardless of the assigned coach's stored rate field.
export const STAR_COACH_RATE = 50;

// A training assignment on any slot makes the person's whole day a flat
// training day of this many hours, regardless of weekday/weekend. The hours
// display as slot time (coach) plus the remainder (exec); the manpower cost
// report pays the full day at the flat training rate.
export const TRAINING_DAY_HOURS = 10.5;

// Branch-specific Saturday daily target (in hours). Defaults to 10.5h.
// Subang Taipan runs until 8:15 PM (vs the standard 6:45 PM) → +1.5h,
// but only from TAIPAN_EXTENDED_SATURDAY_START onwards.
const BRANCH_WEEKEND_DAILY_TARGET: Record<string, number> = {
  "Subang Taipan": 12.0,
};
export function getWeekendDailyTarget(branch: string, date?: string): number {
  if (branch === "Subang Taipan") {
    if (!date || date >= TAIPAN_EXTENDED_SATURDAY_START) return 12.0;
    return 10.5;
  }
  return BRANCH_WEEKEND_DAILY_TARGET[branch] ?? 10.5;
}

// The training column sits after the exec columns and before Notes/Remarks.
// It records who is shadowing/being trained in a slot (max one trainee per
// branch, hence a single column). A trainee's day is a flat
// TRAINING_DAY_HOURS day — see above and app/api/manpower-cost/route.ts.
function makeColumns(coachCount: number, execCount: number, trainingCount = 1, starCoachCount = 0): ColumnDef[] {
  return [
    ...Array.from({ length: coachCount }, (_, i) => ({ id: `coach${i + 1}`, label: `Coach ${i + 1}`, type: "coach" as const })),
    ...Array.from({ length: execCount }, (_, i) => ({ id: `exec${i + 1}`, label: `Exec ${i + 1}`, type: "exec" as const })),
    ...Array.from({ length: starCoachCount }, (_, i) => ({
      id: `star_coach${i + 1}`,
      label: starCoachCount === 1 ? "Star Coach" : `Star Coach ${i + 1}`,
      type: "star_coach" as const,
    })),
    ...Array.from({ length: trainingCount }, (_, i) => ({
      id: `training${i + 1}`,
      label: trainingCount === 1 ? "Training" : `Training ${i + 1}`,
      type: "training" as const,
    })),
  ];
}

// TSB-specific columns: standard 5 coach + 5 exec + 1 star coach + 1 training.
const TSB_COLUMNS = makeColumns(5, 5, 1, 1);

// The standard grid every branch renders: 5 coach + 5 exec + 1 training.
export const COLUMNS = makeColumns(5, 5);

// Online needs more class capacity on some days (and fewer exec slots), so its
// grid is sized per day; every other branch keeps the standard COLUMNS.
export const MAX_COACH_COLUMNS = 8;
const ONLINE_COACH_COLUMNS_BY_DAY: Record<string, number> = {
  Thursday: 6,
  Friday: 8,
  Sunday: 5,
};
const ONLINE_EXEC_COLUMN_COUNT = 3;

export function getColumnsForDay(day: string, branchName: string): ColumnDef[] {
  if (branchName === "Tropicana Sungai Buloh") return TSB_COLUMNS;
  if (branchName !== "Online") return COLUMNS;
  return makeColumns(ONLINE_COACH_COLUMNS_BY_DAY[day] ?? 5, ONLINE_EXEC_COLUMN_COUNT);
}

// Superset of every column id any branch/day can produce — including ids the
// grids no longer render (training2 from the old two-column training setup).
// Hour/class CALCULATIONS iterate this (absent keys are simply skipped) so
// totals stay correct across branches with different grids — and so data
// saved under a column that later got removed from a grid still counts
// rather than silently vanishing. RENDERING uses getColumnsForDay instead.
export const ALL_COLUMNS = makeColumns(MAX_COACH_COLUMNS, 5, 2, 1);

const DEFAULT_WEEKDAY_TIME_SLOTS = ["06.00PM - 07.15PM", "07:15PM - 08:30PM", "08.30PM - 09:45PM"] as const;
const DEFAULT_WEEKEND_TIME_SLOTS = ["09:15 AM – 10:30 AM", "10:30 AM – 11:45 AM", "12:00 PM – 1:15 PM", "1:15 PM – 2:30 PM", "2:45 PM – 4:00 PM", "4:00 PM – 5:15 PM", "5:30 PM – 6:45 PM"] as const;
const TAIPAN_WEEKDAY_TIME_SLOTS = ["4:15 PM", "04.30PM - 05.45PM", "06.00PM - 07.15PM", "07:15PM - 08:30PM", "08.30PM - 09:45PM", "10:00 PM"] as const;
const AMPANG_WEEKDAY_TIME_SLOTS = ["5:00 PM - 6:00 PM", "06.00PM - 07.15PM", "07:15PM - 08:30PM", "08.30PM - 09:45PM", "9:45 PM - 10:00 PM"] as const;
const AMPANG_WEEKEND_TIME_SLOTS = ["8:45 AM - 9:15 AM", "09:15 AM – 10:30 AM", "10:30 AM – 11:45 AM", "12:00 PM – 1:15 PM", "1:15 PM – 2:30 PM", "2:45 PM – 4:00 PM", "4:00 PM – 5:15 PM", "5:30 PM – 6:45 PM", "6:45 PM - 7:15 PM"] as const;
const TAIPAN_WEEKEND_TIME_SLOTS = [...DEFAULT_WEEKEND_TIME_SLOTS, "6:45 PM – 8:00 PM", "8:00 PM – 8:15 PM"] as const;

export const BRANCH_SLOTS_CONFIG: Record<string, { weekday: readonly string[], weekend: readonly string[] }> = {
  "Subang Taipan": { weekday: TAIPAN_WEEKDAY_TIME_SLOTS, weekend: TAIPAN_WEEKEND_TIME_SLOTS },
  "Ampang": { weekday: AMPANG_WEEKDAY_TIME_SLOTS, weekend: AMPANG_WEEKEND_TIME_SLOTS },
  "Bandar Seri Putra": { weekday: AMPANG_WEEKDAY_TIME_SLOTS, weekend: AMPANG_WEEKEND_TIME_SLOTS },
  "Klang": { weekday: AMPANG_WEEKDAY_TIME_SLOTS, weekend: AMPANG_WEEKEND_TIME_SLOTS },
  "Setia Alam": { weekday: AMPANG_WEEKDAY_TIME_SLOTS, weekend: AMPANG_WEEKEND_TIME_SLOTS },
  "Kota Warisan": { weekday: AMPANG_WEEKDAY_TIME_SLOTS, weekend: AMPANG_WEEKEND_TIME_SLOTS },
  "default": { weekday: DEFAULT_WEEKDAY_TIME_SLOTS, weekend: DEFAULT_WEEKEND_TIME_SLOTS }
};

const OPENING_CLOSING_SLOTS: Record<string, string[]> = {
  "Ampang": ["5:00 PM - 6:00 PM", "9:45 PM - 10:00 PM", "8:45 AM - 9:15 AM", "6:45 PM - 7:15 PM"],
  "Bandar Seri Putra": ["5:00 PM - 6:00 PM", "9:45 PM - 10:00 PM", "8:45 AM - 9:15 AM", "6:45 PM - 7:15 PM"],
  "Klang": ["5:00 PM - 6:00 PM", "9:45 PM - 10:00 PM", "8:45 AM - 9:15 AM", "6:45 PM - 7:15 PM"],
  "Setia Alam": ["5:00 PM - 6:00 PM", "9:45 PM - 10:00 PM", "8:45 AM - 9:15 AM", "6:45 PM - 7:15 PM"],
  "Kota Warisan": ["5:00 PM - 6:00 PM", "9:45 PM - 10:00 PM", "8:45 AM - 9:15 AM", "6:45 PM - 7:15 PM"],
  "Subang Taipan": ["8:00 PM – 8:15 PM"],
};

export function isOpeningClosingSlot(slot: string, branchName: string): boolean {
  return (OPENING_CLOSING_SLOTS[branchName] ?? []).includes(slot);
}

// The extended Saturday slots (6:45 PM – 8:00 PM + 8:00 PM – 8:15 PM closing)
// are only active for Subang Taipan from this date onwards.
const TAIPAN_EXTENDED_SATURDAY_START = "2026-06-22";

export function getTimeSlotsForDay(day: string, branchName: string, date?: string): readonly string[] {
  const config = BRANCH_SLOTS_CONFIG[branchName] || BRANCH_SLOTS_CONFIG["default"];
  const slots = WEEKDAY_DAYS.includes(day as any) ? config.weekday : config.weekend;
  // For ST, revert to the standard weekend slots for any date before the cutoff.
  if (branchName === "Subang Taipan" && !WEEKDAY_DAYS.includes(day as any) && date && date < TAIPAN_EXTENDED_SATURDAY_START) {
    return DEFAULT_WEEKEND_TIME_SLOTS;
  }
  return slots;
}

export function isAdminSlot(slot: string, branchName: string) {
  if (branchName === "Subang Taipan") return ["4:15 PM", "10:00 PM", "8:00 PM – 8:15 PM"].includes(slot);
  return ["5:00 PM", "10:00 PM", "08:45 AM – 09:15 AM", "11:45 AM – 12:00 PM", "2:30 PM – 2:45 PM", "5:15 PM – 5:30 PM", "6:45 PM – 7:15 PM"].includes(slot);
}

const MANAGER_ON_DUTY_SLOTS: Record<string, { weekday: string[], weekend: string[] }> = {
  "Ampang": {
    weekday: ["06.00PM - 07.15PM", "07:15PM - 08:30PM", "08.30PM - 09:45PM"],
    weekend: ["09:15 AM – 10:30 AM", "10:30 AM – 11:45 AM", "12:00 PM – 1:15 PM", "1:15 PM – 2:30 PM", "2:45 PM – 4:00 PM", "4:00 PM – 5:15 PM", "5:30 PM – 6:45 PM"],
  },
  "Bandar Seri Putra": {
    weekday: ["06.00PM - 07.15PM", "07:15PM - 08:30PM", "08.30PM - 09:45PM"],
    weekend: ["09:15 AM – 10:30 AM", "10:30 AM – 11:45 AM", "12:00 PM – 1:15 PM", "1:15 PM – 2:30 PM", "2:45 PM – 4:00 PM", "4:00 PM – 5:15 PM", "5:30 PM – 6:45 PM"],
  },
  "Klang": {
    weekday: ["06.00PM - 07.15PM", "07:15PM - 08:30PM", "08.30PM - 09:45PM"],
    weekend: ["09:15 AM – 10:30 AM", "10:30 AM – 11:45 AM", "12:00 PM – 1:15 PM", "1:15 PM – 2:30 PM", "2:45 PM – 4:00 PM", "4:00 PM – 5:15 PM", "5:30 PM – 6:45 PM"],
  },
  "Setia Alam": {
    weekday: ["06.00PM - 07.15PM", "07:15PM - 08:30PM", "08.30PM - 09:45PM"],
    weekend: ["09:15 AM – 10:30 AM", "10:30 AM – 11:45 AM", "12:00 PM – 1:15 PM", "1:15 PM – 2:30 PM", "2:45 PM – 4:00 PM", "4:00 PM – 5:15 PM", "5:30 PM – 6:45 PM"],
  },
  "Subang Taipan": {
    weekday: ["06.00PM - 07.15PM", "07:15PM - 08:30PM", "08.30PM - 09:45PM"],
    weekend: ["09:15 AM – 10:30 AM", "10:30 AM – 11:45 AM", "12:00 PM – 1:15 PM", "1:15 PM – 2:30 PM", "2:45 PM – 4:00 PM", "4:00 PM – 5:15 PM", "5:30 PM – 6:45 PM", "6:45 PM – 8:00 PM"],
  },
  "default": {
    weekday: ["06.00PM - 07.15PM", "07:15PM - 08:30PM", "08.30PM - 09:45PM"],
    weekend: ["09:15 AM – 10:30 AM", "10:30 AM – 11:45 AM", "12:00 PM – 1:15 PM", "1:15 PM – 2:30 PM", "2:45 PM – 4:00 PM", "4:00 PM – 5:15 PM", "5:30 PM – 6:45 PM"],
  },
};

// Extra (replacement) managers to show in the MOD dropdown for specific branch + day combinations.
// These names are merged into the own-branch manager list so they appear as selectable options.
const BRANCH_MANAGER_EXTRAS: Partial<Record<string, Partial<Record<string, string[]>>>> = {
  "Bandar Baru Bangi": {
    Saturday: ["SREEDRAN", "AINA"],
    Sunday: ["SREEDRAN", "AINA"],
  },
};

export function getManagerExtrasForDay(branchName: string, day: string): string[] {
  return BRANCH_MANAGER_EXTRAS[branchName]?.[day] ?? [];
}

export function isManagerOnDutySlot(slot: string, branchName: string, day: string): boolean {
  const isWeekend = !WEEKDAY_DAYS.includes(day as any);
  const config = MANAGER_ON_DUTY_SLOTS[branchName] || MANAGER_ON_DUTY_SLOTS["default"];
  const allowedSlots = isWeekend ? config.weekend : config.weekday;
  return allowedSlots.includes(slot);
}

export const SELECT_ARROW_WHITE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='white' d='M6 8L1 3h10z'/%3E%3C/svg%3E";
export const SELECT_ARROW_DARK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%235f6368' d='M6 8L1 3h10z'/%3E%3C/svg%3E";