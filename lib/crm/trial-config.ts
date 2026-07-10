/** Max students per trial-class time slot (per branch, per date). */
export const TRIAL_CAPACITY = 18

/** Day-of-week index → enabled? Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6.
 *  Mon/Tue are excluded — classes don't run those days. */
export const TRIAL_ALLOWED_DAYS = new Set([3, 4, 5, 6, 0]) // Wed–Sun

/** Slots for Wed/Thu/Fri evenings. */
export const TRIAL_WEEKDAY_SLOTS = ['06:00 PM', '07:15 PM', '08:30 PM'] as const

/** Slots for Sat/Sun across the day. */
export const TRIAL_WEEKEND_SLOTS = [
  '09:15 AM', '10:30 AM', '12:00 PM', '01:15 PM',
  '02:45 PM', '04:00 PM', '05:30 PM',
] as const

/** All distinct slot labels in the canonical order the dashboard grid uses
 *  (weekend morning/noon first, then weekday evenings). Lets every "any slot"
 *  loop iterate once over a known label set. */
export const TRIAL_ALL_SLOTS = Array.from(
  new Set([...TRIAL_WEEKEND_SLOTS, ...TRIAL_WEEKDAY_SLOTS]),
)

/** Resolve the slot list for a given JS Date / ISO date. Empty array for
 *  disallowed days (Mon/Tue) and any malformed input. */
export function slotsForDate(isoDate: string | undefined | Date): string[] {
  if (!isoDate) return []
  const d = isoDate instanceof Date ? isoDate : new Date(`${isoDate}T00:00:00`)
  const day = d.getDay()
  if (day === 6 || day === 0) return [...TRIAL_WEEKEND_SLOTS]
  if (day === 3 || day === 4 || day === 5) return [...TRIAL_WEEKDAY_SLOTS]
  return []
}

/**
 * Format a Date's hour/minute to the same "HH:MM AM/PM" label used by the
 * stage-change modal and the dashboard grid, so an appointment row's startAt
 * can be bucketed against the slot list cleanly.
 *
 * "13:15" → "01:15 PM"; "09:15" → "09:15 AM"
 */
export function formatSlotLabel(d: Date): string {
  const h24 = d.getHours()
  const mm = String(d.getMinutes()).padStart(2, '0')
  const period = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${String(h12).padStart(2, '0')}:${mm} ${period}`
}

/** Day-of-week labels in display order (Wed→Sun). */
export const TRIAL_DAY_ORDER: ReadonlyArray<{ key: 'wed' | 'thu' | 'fri' | 'sat' | 'sun'; label: string; dayIndex: number }> = [
  { key: 'wed', label: 'Wednesday', dayIndex: 3 },
  { key: 'thu', label: 'Thursday',  dayIndex: 4 },
  { key: 'fri', label: 'Friday',    dayIndex: 5 },
  { key: 'sat', label: 'Saturday',  dayIndex: 6 },
  { key: 'sun', label: 'Sunday',    dayIndex: 0 },
]
