export const SHARED_EMPLOYEES: string[] = [];

export const ALL_BRANCHES = [
  "Subang Taipan", "Setia Alam", "Shah Alam", "Putrajaya", "Ampang", 
  "Cyberjaya", "Klang", "Bandar Baru Bangi", "Taman Sri Gombak", 
  "Online", "Kajang TTDI Groove", "Kota Warisan", "Bandar Tun Hussein Onn", 
  "Danau Kota", "Denai Alam", "Sri Petaling", "Eco Grandeur", 
  "Kota Damansara", "Bandar Seri Putra", "Rimbayu"
].sort();

export const DAYS = ["Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const WEEKDAY_DAYS = ["Wednesday", "Thursday", "Friday"] as const;

export const BRANCH_WORKING_DAYS: Record<string, string[]> = {
  "Ampang": ["Thursday", "Friday", "Saturday", "Sunday"],
  "Bandar Seri Putra": ["Thursday", "Friday", "Saturday", "Sunday"],
  "Klang": ["Thursday", "Friday", "Saturday", "Sunday"],
};

export function getWorkingDaysForBranch(branchName: string): string[] {
  return BRANCH_WORKING_DAYS[branchName] ?? [...DAYS];
}

export const EMPLOYEE_COLORS: Record<string, string> = {};

const COLOR_PALETTE = [
  "bg-red-500 text-white",
  "bg-orange-500 text-white",
  "bg-amber-500 text-white",
  "bg-yellow-500 text-black",
  "bg-lime-500 text-white",
  "bg-green-500 text-white",
  "bg-emerald-500 text-white",
  "bg-teal-500 text-white",
  "bg-cyan-500 text-white",
  "bg-sky-500 text-white",
  "bg-blue-500 text-white",
  "bg-indigo-500 text-white",
  "bg-violet-500 text-white",
  "bg-purple-500 text-white",
  "bg-fuchsia-500 text-white",
  "bg-pink-500 text-white",
  "bg-rose-500 text-white",
  "bg-red-700 text-white",
  "bg-blue-700 text-white",
  "bg-green-700 text-white",
  "bg-purple-700 text-white",
  "bg-teal-700 text-white",
  "bg-pink-700 text-white",
  "bg-indigo-700 text-white",
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function getEmployeeColor(name: string): string {
  if (!name) return "bg-slate-400 text-white";
  return COLOR_PALETTE[hashName(name) % COLOR_PALETTE.length];
}

export const COLUMNS = [
  { id: "coach1", label: "Coach 1", type: "coach" as const },
  { id: "coach2", label: "Coach 2", type: "coach" as const },
  { id: "coach3", label: "Coach 3", type: "coach" as const },
  { id: "coach4", label: "Coach 4", type: "coach" as const },
  { id: "coach5", label: "Coach 5", type: "coach" as const },
  { id: "exec1", label: "Exec 1", type: "exec" as const },
  { id: "exec2", label: "Exec 2", type: "exec" as const },
  { id: "exec3", label: "Exec 3", type: "exec" as const },
  { id: "exec4", label: "Exec 4", type: "exec" as const },
  { id: "exec5", label: "Exec 5", type: "exec" as const },
] as const;

const DEFAULT_WEEKDAY_TIME_SLOTS = ["06.00PM - 07.15PM", "07:15PM - 08:30PM", "08.30PM - 09:45PM"] as const;
const DEFAULT_WEEKEND_TIME_SLOTS = ["09:15 AM – 10:30 AM", "10:30 AM – 11:45 AM", "12:00 PM – 1:15 PM", "1:15 PM – 2:30 PM", "2:45 PM – 4:00 PM", "4:00 PM – 5:15 PM", "5:30 PM – 6:45 PM"] as const;
const TAIPAN_WEEKDAY_TIME_SLOTS = ["4:15 PM", "04.30PM - 05.45PM", "06.00PM - 07.15PM", "07:15PM - 08:30PM", "08.30PM - 09:45PM", "10:00 PM"] as const;
const AMPANG_WEEKDAY_TIME_SLOTS = ["5:00 PM - 6:00 PM", "06.00PM - 07.15PM", "07:15PM - 08:30PM", "08.30PM - 09:45PM", "9:45 PM - 10:00 PM"] as const;
const AMPANG_WEEKEND_TIME_SLOTS = ["8:45 AM - 9:15 AM", "09:15 AM – 10:30 AM", "10:30 AM – 11:45 AM", "12:00 PM – 1:15 PM", "1:15 PM – 2:30 PM", "2:45 PM – 4:00 PM", "4:00 PM – 5:15 PM", "5:30 PM – 6:45 PM", "6:45 PM - 7:15 PM"] as const;

export const BRANCH_SLOTS_CONFIG: Record<string, { weekday: readonly string[], weekend: readonly string[] }> = {
  "Subang Taipan": { weekday: TAIPAN_WEEKDAY_TIME_SLOTS, weekend: DEFAULT_WEEKEND_TIME_SLOTS },
  "Ampang": { weekday: AMPANG_WEEKDAY_TIME_SLOTS, weekend: AMPANG_WEEKEND_TIME_SLOTS },
  "Bandar Seri Putra": { weekday: AMPANG_WEEKDAY_TIME_SLOTS, weekend: AMPANG_WEEKEND_TIME_SLOTS },
  "Klang": { weekday: AMPANG_WEEKDAY_TIME_SLOTS, weekend: AMPANG_WEEKEND_TIME_SLOTS },
  "default": { weekday: DEFAULT_WEEKDAY_TIME_SLOTS, weekend: DEFAULT_WEEKEND_TIME_SLOTS }
};

// Slots that are fixed "all-staff" opening/closing slots — excluded from hours summary
const OPENING_CLOSING_SLOTS: Record<string, string[]> = {
  "Ampang": ["5:00 PM - 6:00 PM", "9:45 PM - 10:00 PM", "8:45 AM - 9:15 AM", "6:45 PM - 7:15 PM"],
  "Bandar Seri Putra": ["5:00 PM - 6:00 PM", "9:45 PM - 10:00 PM", "8:45 AM - 9:15 AM", "6:45 PM - 7:15 PM"],
  "Klang": ["5:00 PM - 6:00 PM", "9:45 PM - 10:00 PM", "8:45 AM - 9:15 AM", "6:45 PM - 7:15 PM"],
};

export function isOpeningClosingSlot(slot: string, branchName: string): boolean {
  return (OPENING_CLOSING_SLOTS[branchName] ?? []).includes(slot);
}

export function getTimeSlotsForDay(day: string, branchName: string): readonly string[] {
  const config = BRANCH_SLOTS_CONFIG[branchName] || BRANCH_SLOTS_CONFIG["default"];
  return WEEKDAY_DAYS.includes(day as any) ? config.weekday : config.weekend;
}

export function isAdminSlot(slot: string, branchName: string) {
  if (branchName === "Subang Taipan") return ["4:15 PM", "10:00 PM"].includes(slot);
  return ["5:00 PM", "10:00 PM", "08:45 AM – 09:15 AM", "11:45 AM – 12:00 PM", "2:30 PM – 2:45 PM", "5:15 PM – 5:30 PM", "6:45 PM – 7:15 PM"].includes(slot);
}

// --- MANAGER ON DUTY SLOT LOGIC ---
// Defines which slots the Manager on Duty dropdown should appear for, per branch.
// Manager only works up to 08:30PM on weekdays, and up to a certain slot on weekends.
const MANAGER_ON_DUTY_SLOTS: Record<string, { weekday: string[], weekend: string[] }> = {
  // Ampang / Bandar Seri Putra / Klang layout: 3 active weekday slots, manager covers first 2
  "Ampang": {
    weekday: ["06.00PM - 07.15PM", "07:15PM - 08:30PM"],
    weekend: ["09:15 AM – 10:30 AM", "10:30 AM – 11:45 AM", "12:00 PM – 1:15 PM", "1:15 PM – 2:30 PM", "2:45 PM – 4:00 PM", "4:00 PM – 5:15 PM", "5:30 PM – 6:45 PM"],
  },
  "Bandar Seri Putra": {
    weekday: ["06.00PM - 07.15PM", "07:15PM - 08:30PM"],
    weekend: ["09:15 AM – 10:30 AM", "10:30 AM – 11:45 AM", "12:00 PM – 1:15 PM", "1:15 PM – 2:30 PM", "2:45 PM – 4:00 PM", "4:00 PM – 5:15 PM", "5:30 PM – 6:45 PM"],
  },
  "Klang": {
    weekday: ["06.00PM - 07.15PM", "07:15PM - 08:30PM"],
    weekend: ["09:15 AM – 10:30 AM", "10:30 AM – 11:45 AM", "12:00 PM – 1:15 PM", "1:15 PM – 2:30 PM", "2:45 PM – 4:00 PM", "4:00 PM – 5:15 PM", "5:30 PM – 6:45 PM"],
  },
  // Subang Taipan: manager covers first 2 active slots (excluding admin slots)
  "Subang Taipan": {
    weekday: ["06.00PM - 07.15PM", "07:15PM - 08:30PM"],
    weekend: ["09:15 AM – 10:30 AM", "10:30 AM – 11:45 AM", "12:00 PM – 1:15 PM", "1:15 PM – 2:30 PM", "2:45 PM – 4:00 PM", "4:00 PM – 5:15 PM", "5:30 PM – 6:45 PM"],
  },
  // Default (all other branches): weekday has 3 slots, manager covers first 2
  "default": {
    weekday: ["06.00PM - 07.15PM", "07:15PM - 08:30PM"],
    weekend: ["09:15 AM – 10:30 AM", "10:30 AM – 11:45 AM", "12:00 PM – 1:15 PM", "1:15 PM – 2:30 PM", "2:45 PM – 4:00 PM", "4:00 PM – 5:15 PM", "5:30 PM – 6:45 PM"],
  },
};

/**
 * Returns true if the Manager on Duty should show a dropdown for this slot.
 * Manager only works up to 08:30PM on weekdays (first 2 slots),
 * and covers all active slots on weekends.
 */
export function isManagerOnDutySlot(slot: string, branchName: string, day: string): boolean {
  const isWeekend = !WEEKDAY_DAYS.includes(day as any);
  const config = MANAGER_ON_DUTY_SLOTS[branchName] || MANAGER_ON_DUTY_SLOTS["default"];
  const allowedSlots = isWeekend ? config.weekend : config.weekday;
  return allowedSlots.includes(slot);
}

export const SELECT_ARROW_WHITE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='white' d='M6 8L1 3h10z'/%3E%3C/svg%3E";
export const SELECT_ARROW_DARK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%235f6368' d='M6 8L1 3h10z'/%3E%3C/svg%3E";