/**
 * Auth helper for the Ebright ticketing module.
 *
 * Separate from the CRM auth helper — ticket sessions carry additional
 * context (tkt role, platform/branch assignments) loaded from tkt_user_profile.
 *
 * Usage:
 *   // In an API route handler (explicit headers):
 *   const ctx = await requireTktAuth(request.headers, { roles: ['super_admin', 'platform_admin'] })
 *
 *   // In a layout/page (non-throwing):
 *   const ctx = await getTktSession(request.headers)
 *   if (!ctx) redirect('/crm/login')
 */

import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import type { TktRole } from '@/lib/crm/permissions'
import { isPreviewMode } from '@/lib/crm/preview-mode'
import { crmBranchToTktBranchNumber } from '@/lib/crm/branch-number'
import { scopedDepartmentForEmail } from '@/lib/crm/departments'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface TktAuthContext {
  userId: string
  email: string
  name: string | null
  tenantId: string
  role: TktRole
  /** IDs of tkt_platform rows this user administers (platform_admin only). */
  platformIds: string[]
  /** IDs of tkt_branch rows this user belongs to (regular users). */
  branchIds: string[]
  /**
   * For a scoped DEPARTMENT account: the ticket sub_type it triages
   * (e.g. 'finance'). When set, ticket visibility + status changes are
   * restricted to tickets with this sub_type, NOT by platform. Null otherwise.
   */
  departmentSubType: string | null
}

// ─── Error class ──────────────────────────────────────────────────────────────

export class TktAuthError extends Error {
  public readonly statusCode: number

  constructor(message: string, statusCode = 401) {
    super(message)
    this.name = 'TktAuthError'
    this.statusCode = statusCode
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Resolve the tenant ID for a session user.
 *
 * Strategy:
 *  1. crm_user_branch (most users will have at least one branch link)
 *  2. tkt_user_profile.tenant_id (fallback — profile might already exist)
 *  3. crm_tenant where slug = 'ebright-demo' (last-resort for seeded tenants)
 */
async function resolveTenantId(userId: string): Promise<string | null> {
  // 1. From CRM branch assignment
  const branchLink = await prisma.crm_user_branch.findFirst({
    where: { userId },
    select: { tenantId: true },
  })
  if (branchLink) return branchLink.tenantId

  // 2. From existing tkt_user_profile
  const existing = await prisma.tkt_user_profile.findUnique({
    where: { user_id: userId },
    select: { tenant_id: true },
  })
  if (existing) return existing.tenant_id

  // 3. Default tenant (demo / single-tenant deployment)
  const defaultTenant = await prisma.crm_tenant.findUnique({
    where: { slug: 'ebright-demo' },
    select: { id: true },
  })
  return defaultTenant?.id ?? null
}

/**
 * Load or auto-create a tkt_user_profile for the given user.
 *
 * New users get role 'user'. Admins are explicitly promoted via seed/UI.
 */
async function loadOrCreateProfile(
  userId: string,
  tenantId: string,
): Promise<{
  role: TktRole
  platformIds: string[]
  branchIds: string[]
}> {
  let profile = await prisma.tkt_user_profile.findUnique({
    where: { user_id: userId },
    include: {
      platforms: { select: { platform_id: true } },
      branches:  { select: { branch_id: true } },
    },
  })

  if (!profile) {
    profile = await prisma.tkt_user_profile.create({
      data: {
        user_id:   userId,
        tenant_id: tenantId,
        role:      'user',
      },
      include: {
        platforms: { select: { platform_id: true } },
        branches:  { select: { branch_id: true } },
      },
    })
  }

  let branchIds = profile.branches.map((b) => b.branch_id)

  // Bridge: non-admin users with no explicit tkt_user_branch rows fall back
  // to their CRM branch assignments. The CRM and ticket modules use parallel
  // branch tables (crm_branch / tkt_branch); we map by the "NN" name prefix
  // → tkt_branch.branch_number. Without this fallback, a user who only joined
  // via the CRM module (the common path now) would see an empty ticket
  // branch dropdown and either couldn't submit, or — under the previous
  // unscoped behaviour — would auto-default to the wrong branch (Online).
  if (branchIds.length === 0 && (profile.role === 'user' || !profile.role)) {
    // Only the user's OWN / home branch (their oldest crm_user_branch link)
    // confers ticket access. A cross-branch LEAD grant from an agency admin
    // must NOT leak into the ticket system — extra ticket branches are
    // provisioned explicitly via the superadmin ticket Users page.
    const homeLink = await prisma.crm_user_branch.findFirst({
      where: { userId, tenantId },
      orderBy: { createdAt: 'asc' },
      select: { branch: { select: { name: true } } },
    })
    const homeNumber = crmBranchToTktBranchNumber(homeLink?.branch?.name)
    if (homeNumber) {
      const tktBranches = await prisma.tkt_branch.findMany({
        where: { tenant_id: tenantId, branch_number: homeNumber },
        select: { id: true },
      })
      branchIds = tktBranches.map((b) => b.id)
    }
  }

  return {
    role:        profile.role as TktRole,
    platformIds: profile.platforms.map((p) => p.platform_id),
    branchIds,
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve a TktAuthContext from the incoming request headers.
 *
 * @param headers  The `Request.headers` (or `NextRequest.headers`) object.
 * @param opts.roles  If provided, the user's role must be one of these values.
 *
 * @throws {TktAuthError} 401 — no active session.
 * @throws {TktAuthError} 403 — session exists but role not in `opts.roles`.
 * @throws {TktAuthError} 500 — tenant could not be resolved (misconfigured env).
 */
export async function requireTktAuth(
  headers: Headers,
  opts?: { roles?: TktRole[] },
): Promise<TktAuthContext> {
  // 1. Try the real session first — covers SSO bridge from NextAuth too.
  const session = await auth.api.getSession({ headers })

  // 1a. DEV-ONLY preview fallback — only when there's no real session at all.
  // isPreviewMode() refuses to return true in production even if CRM_PREVIEW_MODE=true,
  // so this branch can never grant fake super_admin scope on a prod build.
  if (!session?.user?.id) {
    if (!isPreviewMode()) {
      throw new TktAuthError('Unauthenticated', 401)
    }
    // Find ANY tenant — try common slugs first, then first available.
    const previewTenant =
      (await prisma.crm_tenant.findFirst({
        where: { slug: { in: ['ebright', 'ebright-demo'] } },
        select: { id: true },
      })) ??
      (await prisma.crm_tenant.findFirst({
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      }))
    if (!previewTenant) {
      throw new TktAuthError('Preview mode requires at least one seeded tenant', 500)
    }
    const platforms = await prisma.tkt_platform.findMany({
      where: { tenant_id: previewTenant.id },
      select: { id: true },
    })
    return {
      userId:      'preview-user',
      email:       'preview@ebright.my',
      name:        'Preview User',
      tenantId:    previewTenant.id,
      role:        'super_admin',
      platformIds: platforms.map((p) => p.id),
      branchIds:   [],
      departmentSubType: null,
    }
  }

  const { user } = session

  // 2. Resolve tenant
  const tenantId = await resolveTenantId(user.id)
  if (!tenantId) {
    throw new TktAuthError('Tenant could not be resolved for this user', 500)
  }

  // 3. Load or create tkt_user_profile
  const { role, platformIds, branchIds } = await loadOrCreateProfile(user.id, tenantId)

  // Scoped department account: triages a ticket sub_type. Force platform_admin
  // so it passes the kanban + status-change role gates; visibility is then
  // narrowed to its sub_type (see ticket routes), not by platform.
  const departmentSubType = scopedDepartmentForEmail(user.email)?.subType ?? null
  const effectiveRole: TktRole = departmentSubType ? 'platform_admin' : role

  // 4. Role gate
  if (opts?.roles && !opts.roles.includes(effectiveRole)) {
    throw new TktAuthError('Forbidden', 403)
  }

  return {
    userId:      user.id,
    email:       user.email,
    name:        user.name ?? null,
    tenantId,
    role:        effectiveRole,
    platformIds,
    branchIds,
    departmentSubType,
  }
}

/**
 * Like `requireTktAuth` but returns `null` instead of throwing when the user
 * is not authenticated. Useful in layouts/pages where you want to redirect
 * rather than return a 401 JSON response.
 *
 * Role filtering is NOT applied here — call `requireTktAuth` with `roles`
 * when you need to gate on role.
 */
export async function getTktSession(headers: Headers): Promise<TktAuthContext | null> {
  try {
    const session = await auth.api.getSession({ headers })
    if (!session?.user?.id) return null

    const { user } = session

    const tenantId = await resolveTenantId(user.id)
    if (!tenantId) return null

    const { role, platformIds, branchIds } = await loadOrCreateProfile(user.id, tenantId)

    const departmentSubType = scopedDepartmentForEmail(user.email)?.subType ?? null
    const effectiveRole: TktRole = departmentSubType ? 'platform_admin' : role

    return {
      userId:      user.id,
      email:       user.email,
      name:        user.name ?? null,
      tenantId,
      role:        effectiveRole,
      platformIds,
      branchIds,
      departmentSubType,
    }
  } catch {
    // Any unexpected error (DB down, etc.) — treat as unauthenticated
    return null
  }
}
