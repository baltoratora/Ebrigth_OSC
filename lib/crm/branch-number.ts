/**
 * Extract the 2-digit branch_number prefix from a CRM branch name.
 *
 * The CRM stores branches as `"01 Ebright (Rimbayu)"`. The
 * ticketing module's `tkt_branch.branch_number` is just `"01"`. This helper
 * lets the topbar's branch switcher (which holds CRM branch info) drive
 * ticket-side filters.
 *
 * Returns `null` when the name doesn't start with two digits — which is the
 * case for the HR branch, the synthetic "All Branches" pipeline, etc.
 */
export function crmBranchToTktBranchNumber(name: string | null | undefined): string | null {
  if (!name) return null
  const m = name.match(/^(\d{2})/)
  return m ? m[1] : null
}
