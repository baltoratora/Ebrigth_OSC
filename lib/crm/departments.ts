/**
 * Ebright internal departments that receive **directed tickets**.
 *
 * Routing model (matches the existing New-Ticket form): a branch submits under
 * the **"Others"** platform and picks a department; the chosen department is
 * stored as the ticket's `sub_type` (e.g. `finance`, `marketing`). So a
 * department is identified by a ticket **sub_type**, NOT a separate platform.
 *
 * A scoped department account (platform_admin role, no platform link) is then
 * restricted — in the kanban, the ticket list, and status changes — to tickets
 * whose `sub_type` matches its department. Aone / Lead / Process Street /
 * ClickUp tickets stay Super-Admin-only.
 *
 * `subType` values mirror DEPARTMENT_CARDS in components/crm/tickets/TicketForm.tsx.
 */

export interface DepartmentDef {
  /** tkt_ticket.sub_type value for tickets directed to this department. */
  subType: string
  /** Display name. */
  name: string
  /** The account that triages this department's tickets. */
  email: string
  /** Marketing / Operation / Optimisation keep the CRM Lead module; others are tickets-only. */
  hasLeadSystem: boolean
  /**
   * true  → provisioned as a sub_type-scoped triage admin (sees only its dept).
   * false → stays a global Super Admin (od@ is the owner) and views departments
   *         via the topbar switcher rather than being scoped down.
   */
  scopedAccount: boolean
}

export const DEPARTMENTS: readonly DepartmentDef[] = [
  { subType: 'marketing',      name: 'Marketing',      email: 'marketing@ebright.my', hasLeadSystem: true,  scopedAccount: true },
  { subType: 'operation',      name: 'Operation',      email: 'operation@ebright.my', hasLeadSystem: true,  scopedAccount: true },
  { subType: 'optimisation',   name: 'Optimisation',   email: 'od@ebright.my',        hasLeadSystem: true,  scopedAccount: false },
  { subType: 'human_resource', name: 'Human Resource', email: 'hr@gmail.com',         hasLeadSystem: false, scopedAccount: true },
  { subType: 'finance',        name: 'Finance',        email: 'finance@ebright.my',   hasLeadSystem: false, scopedAccount: true },
  { subType: 'academy',        name: 'Academy',        email: 'academy@gmail.com',    hasLeadSystem: false, scopedAccount: true },
  { subType: 'ceo',            name: 'CEO',            email: 'kevinkhoo@ebright.my', hasLeadSystem: false, scopedAccount: true },
] as const

const byEmail = (email: string | null | undefined) =>
  email ? DEPARTMENTS.find((d) => d.email.toLowerCase() === email.toLowerCase()) ?? null : null

/** Any of the 7 departments matching this email (incl. the owner od@). */
export function departmentForEmail(email: string | null | undefined): DepartmentDef | null {
  return byEmail(email)
}

/** Only the sub_type-SCOPED department accounts (excludes the owner od@). */
export function scopedDepartmentForEmail(email: string | null | undefined): DepartmentDef | null {
  const d = byEmail(email)
  return d && d.scopedAccount ? d : null
}

/** The sub_type a scoped account triages, or null. Drives ticket scoping. */
export function departmentSubTypeForEmail(email: string | null | undefined): string | null {
  return scopedDepartmentForEmail(email)?.subType ?? null
}

/** Department subType → display name (for labelling the triage board). */
export function departmentNameForSubType(subType: string | null | undefined): string | null {
  if (!subType) return null
  return DEPARTMENTS.find((d) => d.subType === subType)?.name ?? null
}
