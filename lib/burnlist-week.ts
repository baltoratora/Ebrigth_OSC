// Shared helpers for the burnlist week cycle.
//
// "Week" = a single Wednesday. weekKey is the ISO date of that Wednesday
// (YYYY-MM-DD). Wednesday = day index 3 in JS (Sun=0..Sat=6).

const WED_INDEX = 3;

/** Return the YYYY-MM-DD of the most recent past-or-today Wednesday in local time. */
export function currentWeekWednesday(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysBack = (d.getDay() - WED_INDEX + 7) % 7;
  d.setDate(d.getDate() - daysBack);
  return formatYmd(d);
}

/** Validate the YYYY-MM-DD shape and that it represents a real calendar date. */
export function isValidWeekKey(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return false;
  return formatYmd(d) === s;
}

function formatYmd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
