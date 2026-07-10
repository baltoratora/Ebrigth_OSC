/**
 * CRM RBAC permission system.
 *
 * Roles map 1-to-1 with the `CrmUserRole` enum in schema.prisma.
 *
 * Usage:
 *   if (!hasPermission(userRole, 'contacts:delete')) return forbidden()
 *   requirePermission(userRole, 'settings:write')  // throws CrmPermissionError
 */

export type CrmRole =
  | 'SUPER_ADMIN'
  | 'AGENCY_ADMIN'
  | 'REGIONAL_MANAGER'
  | 'BRANCH_MANAGER'
  | 'BRANCH_STAFF'

export type CrmUserRole = CrmRole

export type CrmPermission =
  // Contacts
  | 'contacts:read'
  | 'contacts:write'
  | 'contacts:delete'
  | 'contacts:export'
  // Opportunities
  | 'opportunities:read'
  | 'opportunities:write'
  | 'opportunities:delete'
  // Automations
  | 'automations:read'
  | 'automations:write'
  | 'automations:delete'
  // Settings
  | 'settings:read'
  | 'settings:write'
  // Team management
  | 'team:read'
  | 'team:write'
  | 'team:delete'
  // Branch management
  | 'branches:read'
  | 'branches:write'
  | 'branches:delete'
  // Pipelines
  | 'pipelines:read'
  | 'pipelines:write'
  // Audit logs
  | 'audit:read'
  // Integrations
  | 'integrations:read'
  | 'integrations:write'
  // API keys
  | 'api_keys:read'
  | 'api_keys:write'
  // Messaging
  | 'messages:read'
  | 'messages:write'
  // Dashboard & reports
  | 'dashboard:read'
  | 'reports:read'
  // Tickets (ticketing module)
  | 'tickets:read'
  | 'tickets:write'
  | 'tickets:delete'
  | 'tickets:admin'    // approve / reject / assign
  // Ticket platforms management
  | 'tkt_platforms:read'
  | 'tkt_platforms:write'
  | 'tkt_platforms:delete'
  // Ticket branches management
  | 'tkt_branches:read'
  | 'tkt_branches:write'
  | 'tkt_branches:delete'
  // Ticket users management
  | 'tkt_users:read'
  | 'tkt_users:write'
  | 'tkt_users:delete'

// ─── All permissions for convenience ─────────────────────────────────────────

const ALL_PERMISSIONS: CrmPermission[] = [
  'contacts:read',
  'contacts:write',
  'contacts:delete',
  'contacts:export',
  'opportunities:read',
  'opportunities:write',
  'opportunities:delete',
  'automations:read',
  'automations:write',
  'automations:delete',
  'settings:read',
  'settings:write',
  'team:read',
  'team:write',
  'team:delete',
  'branches:read',
  'branches:write',
  'branches:delete',
  'pipelines:read',
  'pipelines:write',
  'audit:read',
  'integrations:read',
  'integrations:write',
  'api_keys:read',
  'api_keys:write',
  'messages:read',
  'messages:write',
  'dashboard:read',
  'reports:read',
  'tickets:read',
  'tickets:write',
  'tickets:delete',
  'tickets:admin',
  'tkt_platforms:read',
  'tkt_platforms:write',
  'tkt_platforms:delete',
  'tkt_branches:read',
  'tkt_branches:write',
  'tkt_branches:delete',
  'tkt_users:read',
  'tkt_users:write',
  'tkt_users:delete',
]

// ─── Role → permission matrix ─────────────────────────────────────────────────

// Lead-editing permissions. SUPER_ADMIN keeps all of these; AGENCY_ADMIN keeps
// none (leads are read-only for them); the delete pair is SUPER_ADMIN-only for
// everyone (branch/regional managers can create + edit but never delete a lead).
const LEAD_WRITE_PERMS: CrmPermission[] = ['contacts:write', 'opportunities:write']
const LEAD_DELETE_PERMS: CrmPermission[] = ['contacts:delete', 'opportunities:delete']

const ROLE_PERMISSIONS: Record<CrmRole, ReadonlyArray<CrmPermission>> = {
  // Full platform access — the only role that can DELETE leads.
  SUPER_ADMIN: ALL_PERMISSIONS,

  // Full access to every feature across all branches EXCEPT editing leads:
  // contacts + opportunities are read-only (no create/edit/delete). Everything
  // else — team, branches, settings, audit, integrations, automations,
  // pipelines, tickets, impersonation — stays fully available.
  AGENCY_ADMIN: ALL_PERMISSIONS.filter(
    (p) => !LEAD_WRITE_PERMS.includes(p) && !LEAD_DELETE_PERMS.includes(p),
  ),

  // Manages every branch in their region — same capabilities as a branch
  // manager, just across a wider branch scope (resolved via crm_user_branch
  // links). The extra "Region" dashboard is gated in the sidebar, not here.
  REGIONAL_MANAGER: [
    'contacts:read',
    'contacts:write',
    'contacts:export',
    'opportunities:read',
    'opportunities:write',
    // No contacts:delete / opportunities:delete — lead deletion is SUPER_ADMIN only.
    'automations:read',
    'messages:read',
    'messages:write',
    'dashboard:read',
    'reports:read',
  ],

  // Manages their branch(es) — can run automations, read settings, see team
  BRANCH_MANAGER: [
    'contacts:read',
    'contacts:write',
    'contacts:export',
    'opportunities:read',
    'opportunities:write',
    // No contacts:delete / opportunities:delete — lead deletion is SUPER_ADMIN only.
    'automations:read',
    'automations:write',
    'automations:delete',
    'settings:read',
    'team:read',
    'branches:read',
    'pipelines:read',
    'pipelines:write',
    'messages:read',
    'messages:write',
    'dashboard:read',
    'reports:read',
  ],

  // Front-line staff — contact & opportunity management + messaging only
  BRANCH_STAFF: [
    'contacts:read',
    'contacts:write',
    'opportunities:read',
    'opportunities:write',
    'messages:read',
    'messages:write',
    'dashboard:read',
    // Ticket module: all staff can submit and view their own tickets
    'tickets:read',
    'tickets:write',
  ],
}

// ─── Ticket module role system ────────────────────────────────────────────────
// Separate from CRM roles — stored in tkt_user_profile.role.
//
// 'regional_manager' is NOT a ticket role per se — it's a sidebar-visibility
// hint set by the CRM layout when a user has a crm_user_branch row with role
// REGIONAL_MANAGER (and no SUPER/AGENCY admin link). It gates the "Region"
// nav item without granting ticket-side privileges.

export type TktRole = 'super_admin' | 'platform_admin' | 'user' | 'regional_manager'

export function hasTktPermission(role: TktRole, action: 'read' | 'write' | 'admin' | 'super'): boolean {
  if (role === 'super_admin') return true
  if (role === 'platform_admin') return action !== 'super'
  // 'user' and 'regional_manager': own tickets only (read + write own).
  // Regional managers get no extra ticket privileges from this flag.
  return action === 'read' || action === 'write'
}

// ─── Lookup sets (O(1) checks) ────────────────────────────────────────────────

const PERMISSION_SETS: Record<CrmRole, ReadonlySet<CrmPermission>> = {
  SUPER_ADMIN: new Set(ROLE_PERMISSIONS.SUPER_ADMIN),
  AGENCY_ADMIN: new Set(ROLE_PERMISSIONS.AGENCY_ADMIN),
  REGIONAL_MANAGER: new Set(ROLE_PERMISSIONS.REGIONAL_MANAGER),
  BRANCH_MANAGER: new Set(ROLE_PERMISSIONS.BRANCH_MANAGER),
  BRANCH_STAFF: new Set(ROLE_PERMISSIONS.BRANCH_STAFF),
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns `true` if `role` is granted `permission`.
 */
export function hasPermission(role: CrmRole, permission: CrmPermission): boolean {
  return PERMISSION_SETS[role].has(permission)
}

/**
 * Error thrown by `requirePermission` when access is denied.
 */
export class CrmPermissionError extends Error {
  public readonly role: CrmRole
  public readonly permission: CrmPermission
  public readonly statusCode = 403

  constructor(role: CrmRole, permission: CrmPermission) {
    super(`[CRM] Role '${role}' does not have permission '${permission}'`)
    this.name = 'CrmPermissionError'
    this.role = role
    this.permission = permission
  }
}

/**
 * Assert that `role` has `permission`. Throws `CrmPermissionError` if denied.
 * Use this inside server actions / API handlers after resolving the user's role.
 *
 * @throws {CrmPermissionError}
 */
export function requirePermission(role: CrmRole, permission: CrmPermission): void {
  if (!hasPermission(role, permission)) {
    throw new CrmPermissionError(role, permission)
  }
}

/**
 * Return the full list of permissions granted to `role`.
 */
export function getPermissionsForRole(role: CrmRole): ReadonlyArray<CrmPermission> {
  return ROLE_PERMISSIONS[role]
}

/**
 * Return all defined CRM roles.
 */
export function getAllRoles(): CrmRole[] {
  return ['SUPER_ADMIN', 'AGENCY_ADMIN', 'REGIONAL_MANAGER', 'BRANCH_MANAGER', 'BRANCH_STAFF']
}
