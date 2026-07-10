// Shared helpers for interpreting a BranchStaff member's weekly working-hours
// schedule and deciding whether a given attendance scan is Late / Left Early.
//
// The schedule is stored in BranchStaff.workingHours as JSON:
//   { Mon: { start: "09:00", end: "18:00" } | null, ..., Sun: ... }
// A `null` day means "not a working day". A missing/empty object means the
// employee has no schedule configured yet.
//
// Rules (confirmed with product):
//   • Late        → clock-in is more than 1 minute after the scheduled start.
//   • On Time     → clock-in within the 1-minute grace window.
//   • Left Early  → clock-out is before the scheduled end.
//   • Clocked Out → clock-out is at or after the scheduled end (any time past).
//   • null        → no scheduled hours for that day (a non-working day, or the
//                   employee has no schedule at all). The UI shows no badge.
//
// Leave (AL / MC / etc) is a separate dimension handled by the caller: if an
// employee is on leave for a date, the UI shows the leave-type badge instead of
// any of the statuses below.

export type DayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
export type DaySlot = { start: string; end: string } | null;
export type WeekSchedule = Partial<Record<DayKey, DaySlot>>;

// Index by Date.getUTCDay() / getDay(): 0 = Sun … 6 = Sat.
const JS_DAY_TO_KEY: DayKey[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Grace window before a clock-in counts as Late (1 minute).
const LATE_GRACE_SECONDS = 60;

export type CheckInStatus = "On Time" | "Late";
export type CheckOutStatus = "Clocked Out" | "Left Early";

/** "09:00" or "09:00:00" → seconds since midnight. */
function timeToSeconds(t: string): number {
  const [h, m, s] = t.split(":").map(Number);
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
}

/** "09:00" (24h) -> "9:00 AM" for display (emails, etc). Falls back to the
 *  raw value if unparseable. */
export function formatStartTime(hhmm: string | undefined): string | undefined {
  if (!hhmm) return undefined;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/** True when the schedule object has at least one configured working day. */
export function hasSchedule(wh: unknown): wh is WeekSchedule {
  if (!wh || typeof wh !== "object") return false;
  return Object.values(wh as Record<string, unknown>).some(
    (v) => v && typeof v === "object",
  );
}

/** One dated version of an employee's weekly schedule. `effectiveFrom` is the
 *  first calendar date (YYYY-MM-DD) this schedule applies to; it stays active
 *  until a later version's effectiveFrom takes over. */
export interface ScheduleVersion {
  effectiveFrom: string; // YYYY-MM-DD
  schedule: unknown;     // WeekSchedule JSON (or null-ish)
}

/**
 * Resolve which weekly schedule was in effect on a given date, from a list of
 * dated versions. Picks the version with the greatest effectiveFrom that is
 * still on or before `dateStr`.
 *   undefined → no version covers this date (date is before the earliest
 *               version) — the caller treats it as "no schedule", so no
 *               Late/Early badge is shown. This is what stops a schedule change
 *               from rewriting weeks that predate it.
 *
 * Versions may arrive in any order; we don't assume they're sorted.
 */
export function scheduleForDate(
  versions: ScheduleVersion[],
  dateStr: string,
): unknown {
  let best: ScheduleVersion | null = null;
  for (const v of versions) {
    if (v.effectiveFrom <= dateStr && (best === null || v.effectiveFrom > best.effectiveFrom)) {
      best = v;
    }
  }
  return best ? best.schedule : undefined;
}

/**
 * Resolve the scheduled slot for a specific calendar date.
 *   undefined → no schedule configured for this employee
 *   null      → that weekday is a day off
 *   {start,end} → the working window for that day
 */
export function slotForDate(
  wh: unknown,
  dateStr: string,
): DaySlot | undefined {
  if (!hasSchedule(wh)) return undefined;
  const [y, m, d] = dateStr.split("-").map(Number);
  const key = JS_DAY_TO_KEY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const slot = (wh as WeekSchedule)[key];
  return slot ?? null;
}

/**
 * Decide the check-in status given the day's slot and a "HH:MM[:SS]" time.
 * Returns null when there's no scheduled slot for the day (non-working day, or
 * no schedule at all) — the caller shows no badge in that case.
 */
export function checkInStatus(
  slot: DaySlot | undefined,
  clockIn: string | null,
): CheckInStatus | null {
  if (!slot || !clockIn) return null;
  return timeToSeconds(clockIn) > timeToSeconds(slot.start) + LATE_GRACE_SECONDS
    ? "Late"
    : "On Time";
}

/**
 * Decide the check-out status given the day's slot and a "HH:MM[:SS]" time.
 * Before the scheduled end → "Left Early"; at or after it → "Clocked Out".
 * Returns null when there's no clock-out or no scheduled slot for the day.
 */
export function checkOutStatus(
  slot: DaySlot | undefined,
  clockOut: string | null,
): CheckOutStatus | null {
  if (!clockOut || !slot) return null;
  return timeToSeconds(clockOut) < timeToSeconds(slot.end) ? "Left Early" : "Clocked Out";
}
