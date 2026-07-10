/**
 * Display floor for opportunity-based views.
 *
 * Every part of the CRM that lists or aggregates leads (kanban, dashboard,
 * leads-metrics, etc.) treats anything created before this date as historical
 * noise that's still in the database for analytics + audit purposes but
 * shouldn't appear in day-to-day views.
 *
 * To change the cutoff: edit this one constant and redeploy.
 * To disable the filter: set to `new Date(0)`.
 */
export const DISPLAY_MIN_CREATED_AT = new Date('2026-05-01T00:00:00+08:00')

/**
 * Clamp a date so it never falls before DISPLAY_MIN_CREATED_AT.
 * Use this when applying a user-selected date range to a query — guarantees
 * the lower bound respects the floor regardless of what preset was picked.
 */
export function clampToDisplayMin(d: Date): Date {
  return d < DISPLAY_MIN_CREATED_AT ? DISPLAY_MIN_CREATED_AT : d
}
