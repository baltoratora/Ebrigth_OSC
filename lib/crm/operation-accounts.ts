/**
 * Operation / marketing-oversight accounts.
 *
 * These are elevated accounts (they can view across branches) but with a
 * deliberately trimmed experience:
 *   - sidebar limited to lead oversight (see components/crm/sidebar.tsx)
 *   - topbar shows "Operation View" only — NO Agency View toggle, NO super-admin
 *     tooling
 *   - branch lists / filters exclude the internal "OD" and "Marketing" branches
 *
 * Gated by email so we don't have to mint a dedicated role. Add addresses here
 * to grant the same treatment.
 */
export const OPERATION_EMAILS = new Set<string>([
  'operation@ebright.my',
  'nuraihanhanisah2002@gmail.com',
])

export function isOperationAccount(email: string | null | undefined): boolean {
  return !!email && OPERATION_EMAILS.has(email.trim().toLowerCase())
}

/**
 * "Agency view" accounts — elevated, all-branches, but READ-ONLY (treated as
 * AGENCY_ADMIN regardless of their DB role) and shown ONLY the Agency View in
 * the top-left switcher (never Super Admin View). For a marketing advisor /
 * observer who needs to monitor the whole CNS lead system without any
 * super-admin write powers. Applies to the LEAD system only; their ticket
 * role/scope is unaffected.
 */
export const AGENCY_VIEW_EMAILS = new Set<string>([
  // Marketing advisor — strictly view-only across the whole lead CRM.
  'mokhirsunrise@gmail.com',
])

export function isAgencyViewAccount(email: string | null | undefined): boolean {
  return !!email && AGENCY_VIEW_EMAILS.has(email.trim().toLowerCase())
}

/**
 * "Read-only viewer" accounts (the marketing-advisor monitor) — see the WHOLE
 * lead CRM exactly like a super admin, but cannot create / move / delete / edit
 * anything. This is the agency-view set (currently mokhirsunrise@gmail.com).
 * Enforced at three layers:
 *   1. Read access is widened so every admin page renders (resolveCrmAdminSession).
 *   2. Per-route write handlers reject `viewerOnly` contexts.
 *   3. middleware.ts hard-blocks every mutating request as a backstop.
 * Scope is the LEAD CRM only — the ticket system is unaffected.
 */
export function isReadOnlyViewer(email: string | null | undefined): boolean {
  return isAgencyViewAccount(email)
}

/**
 * Branch names hidden from operation accounts everywhere a branch list is shown
 * (topbar switcher, Day Distribution, etc.) — the internal OD + Marketing
 * branches, which aren't part of lead operations.
 */
export const OPERATION_HIDDEN_BRANCHES = new Set<string>([
  '00 Ebright (OD)',
  'Ebright Marketing',
])

/** True when a branch name should be hidden from operation accounts. */
export function isHiddenForOperation(branchName: string | null | undefined): boolean {
  return !!branchName && OPERATION_HIDDEN_BRANCHES.has(branchName.trim())
}
