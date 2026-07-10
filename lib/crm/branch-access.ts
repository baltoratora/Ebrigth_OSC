import { prisma } from '@/lib/crm/db'
import { isAgencyViewAccount } from '@/lib/crm/operation-accounts'

/**
 * Returns the list of branch IDs a user can view, plus whether they're an
 * "elevated" role that bypasses branch scoping entirely.
 *
 * - SUPER_ADMIN / AGENCY_ADMIN → elevated: true, `branchIds` still returned
 *   (empty if they have no explicit links) — callers should skip the filter.
 * - BRANCH_MANAGER / BRANCH_STAFF → elevated: false, `branchIds` is the
 *   complete set of branches their user is linked to (a user may have
 *   multiple rows for multi-branch grants).
 *
 * Returns `null` if the user isn't provisioned in any branch (unauthorized).
 */
/** Privilege ranking — highest wins when a user holds multiple branch roles. */
const ROLE_RANK: Record<string, number> = {
  SUPER_ADMIN: 5,
  AGENCY_ADMIN: 4,
  REGIONAL_MANAGER: 3,
  BRANCH_MANAGER: 2,
  BRANCH_STAFF: 1,
}

export async function resolveBranchAccess(userId: string): Promise<{
  tenantId: string
  primaryBranchId: string
  branchIds: string[]
  elevated: boolean
  /** Highest-privilege CRM role the user holds — use with hasPermission(). */
  role: 'SUPER_ADMIN' | 'AGENCY_ADMIN' | 'REGIONAL_MANAGER' | 'BRANCH_MANAGER' | 'BRANCH_STAFF'
  /**
   * True only for SUPER_ADMIN role. AGENCY_ADMIN is also elevated but does
   * NOT set this flag. Used by widgets that need to gate destructive /
   * write-style affordances behind a non-superadmin check (super admins
   * get a read-only view).
   */
  isSuperAdmin: boolean
  /**
   * True for the read-only viewer (CEO monitor): elevated + all-branches, but
   * MUST NOT write. Routes that gate writes on `elevated` (instead of
   * hasPermission) must additionally reject this flag. middleware.ts is the
   * hard backstop.
   */
  viewerOnly: boolean
} | null> {
  const [links, authUser] = await Promise.all([
    prisma.crm_user_branch.findMany({
      where: { userId },
      select: { tenantId: true, branchId: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.crm_auth_user.findUnique({ where: { id: userId }, select: { email: true } }),
  ])

  // Agency-view override (marketing-advisor monitor etc.): elevated,
  // all-branches, READ-ONLY (AGENCY_ADMIN, never super). Applies even if they
  // hold a different/no CRM role. Falls back to the default tenant if they have
  // no branch link yet.
  if (isAgencyViewAccount(authUser?.email)) {
    let tenantId = links[0]?.tenantId
    if (!tenantId) {
      const t =
        (await prisma.crm_tenant.findFirst({ where: { slug: { in: ['ebright', 'ebright-demo'] } }, select: { id: true } })) ??
        (await prisma.crm_tenant.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } }))
      if (!t) return null
      tenantId = t.id
    }
    return {
      tenantId,
      primaryBranchId: links[0]?.branchId ?? '',
      branchIds: Array.from(new Set(links.map((l) => l.branchId))),
      elevated: true,
      isSuperAdmin: false,
      role: 'AGENCY_ADMIN',
      viewerOnly: true,
    }
  }

  if (links.length === 0) return null

  const tenantId = links[0].tenantId
  const primaryBranchId = links[0].branchId
  const isSuperAdmin = links.some((l) => l.role === 'SUPER_ADMIN')
  const elevated = isSuperAdmin || links.some((l) => l.role === 'AGENCY_ADMIN')
  const branchIds = Array.from(new Set(links.map((l) => l.branchId)))
  // Highest-privilege role this user holds across all their branch links.
  const role = links
    .map((l) => l.role)
    .sort((a, b) => (ROLE_RANK[b] ?? 0) - (ROLE_RANK[a] ?? 0))[0] as
    'SUPER_ADMIN' | 'AGENCY_ADMIN' | 'REGIONAL_MANAGER' | 'BRANCH_MANAGER' | 'BRANCH_STAFF'

  return { tenantId, primaryBranchId, branchIds, elevated, isSuperAdmin, role, viewerOnly: false }
}
