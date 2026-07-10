// Computes whether a coach is currently in their training window.
// Single source of truth — there is no stored "in training" boolean on the
// BranchStaff row, so the flag and the dates cannot drift.
//
// Uses string comparison on YYYY-MM-DD because that is the format the form
// already submits and lexical order matches calendar order for ISO dates.
//
// Timezone: Malaysia operations are single-zone (UTC+8). Server time is
// treated as local time. If the system is ever multi-region, swap
// `toISOString()` for a Malaysia-pinned formatter.

export function isInTraining(
  start?: string | null,
  end?: string | null,
  today: Date = new Date(),
): boolean {
  if (!start || !end) return false;
  const t = today.toISOString().slice(0, 10);
  return start <= t && t <= end;
}
