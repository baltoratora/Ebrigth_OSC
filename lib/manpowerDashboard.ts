import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  format,
} from 'date-fns';
import {
  isOpeningClosingSlot,
  getTimeSlotsForDay,
  getWorkingDaysForBranch,
  MAX_COACH_COLUMNS,
} from '@/lib/manpowerUtils';

export type WeekRange = {
  startDate: string;
  endDate: string;
};

export type WeekRanges = {
  lastWeek: WeekRange;
  thisWeek: WeekRange;
  nextWeek: WeekRange;
};

function toRange(date: Date): WeekRange {
  const start = startOfWeek(date, { weekStartsOn: 1 });
  const end = endOfWeek(date, { weekStartsOn: 1 });
  return {
    startDate: format(start, 'yyyy-MM-dd'),
    endDate: format(end, 'yyyy-MM-dd'),
  };
}

export function getWeekRanges(today: Date): WeekRanges {
  return {
    lastWeek: toRange(addWeeks(today, -1)),
    thisWeek: toRange(today),
    nextWeek: toRange(addWeeks(today, 1)),
  };
}

export type SelectionsMap = Record<string, string>;

// Covers the largest coach grid any branch/day uses (Online Friday has 8);
// branches with fewer coach columns simply have no keys for the higher ids.
const COACH_COLUMN_IDS = Array.from({ length: MAX_COACH_COLUMNS }, (_, i) => `coach${i + 1}`);

function isFilled(value: string | undefined): boolean {
  if (!value) return false;
  if (value === 'None') return false;
  return true;
}

export function countClassesForSlot(
  selections: SelectionsMap,
  day: string,
  slot: string,
  branch: string,
): number {
  if (isOpeningClosingSlot(slot, branch)) return 0;
  let count = 0;
  for (const col of COACH_COLUMN_IDS) {
    if (isFilled(selections[`${day}-${slot}-${col}`])) count++;
  }
  return count;
}

export function countClassesForDay(
  selections: SelectionsMap,
  day: string,
  branch: string,
): number {
  if (!getWorkingDaysForBranch(branch).includes(day)) return 0;
  const slots = getTimeSlotsForDay(day, branch);
  let total = 0;
  for (const slot of slots) {
    total += countClassesForSlot(selections, day, slot, branch);
  }
  return total;
}

export function countClassesForWeek(
  selections: SelectionsMap,
  branch: string,
): number {
  const days = getWorkingDaysForBranch(branch);
  let total = 0;
  for (const day of days) {
    total += countClassesForDay(selections, day, branch);
  }
  return total;
}

export type SchedulePlanned = { selections: SelectionsMap } | null | undefined;

export function isWeekPlanned(schedule: SchedulePlanned): boolean {
  if (!schedule) return false;
  const { selections } = schedule;
  if (!selections || typeof selections !== 'object') return false;
  for (const key of Object.keys(selections)) {
    if (!/-coach[1-8]$/.test(key)) continue;
    if (isFilled(selections[key])) return true;
  }
  return false;
}
