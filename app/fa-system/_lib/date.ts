// Date helpers — backed by date-fns (Phase C swap).
// Output format preserved 1:1 with the previous raw-Date implementation:
//   - same month:        "5–6 April 2026"
//   - different months:  "30 April – 2 May 2026"
// Switching to dd/MM/yyyy + Asia/Kuala_Lumpur is the Malaysia-locale step,
// tracked in BACKEND_TODOS.md and intentionally not done here.

import { differenceInCalendarDays, format, parseISO } from "date-fns";

export function daysUntil(startDate: string): number {
  return differenceInCalendarDays(parseISO(startDate), new Date());
}

export function formatDateRange(startDate: string, endDate: string): string {
  const s = parseISO(startDate);
  const e = parseISO(endDate);
  const sameMonth = s.getMonth() === e.getMonth();
  return sameMonth
    ? `${format(s, "d")}–${format(e, "d")} ${format(s, "MMMM yyyy")}`
    : `${format(s, "d MMMM")} – ${format(e, "d MMMM yyyy")}`;
}
