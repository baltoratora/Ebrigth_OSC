import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { isReadOnlyViewer } from '@/lib/crm/operation-accounts'

/**
 * Per-route write guard for the read-only viewer (CEO / marketing-advisor
 * monitor). Reads the Better-Auth session email directly — reliable regardless
 * of whether the account holds a crm_user_branch link or what role it is — and
 * returns a 403 response if it's a read-only viewer, else null.
 *
 * Use at the top of ANY mutating handler the viewer can reach:
 *   const denied = await denyReadOnlyViewer(); if (denied) return denied
 *
 * This is the route-layer guarantee; middleware.ts is the global backstop.
 */
export async function denyReadOnlyViewer(): Promise<NextResponse | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (isReadOnlyViewer(session?.user?.email)) {
    return NextResponse.json(
      { error: 'Read-only access — this account cannot modify the CRM.' },
      { status: 403 },
    )
  }
  return null
}

export interface CrmAdminCtx {
  tenantId: string
  userId: string
  /** Highest crm_user_branch role, or 'AGENCY_ADMIN' for the synthetic viewer. */
  role: string
  email: string | null
  /**
   * True for the read-only viewer (CEO monitor). GET handlers may treat this
   * like an elevated reader; every POST/PATCH/DELETE handler MUST reject it
   * (return 403). middleware.ts is the hard backstop if a handler forgets.
   */
  viewerOnly: boolean
}

/**
 * Shared session resolver for the bespoke CRM admin routes (team, api-keys,
 * audit-log, branches, pipelines, tags, custom-values, lead-sources,
 * integrations, automations, …) that previously did their own
 * `crm_user_branch.findFirst` + `if (!ub) return null`.
 *
 * Behaviour:
 *   • Normal users → their crm_user_branch role (viewerOnly: false). Identical
 *     to the old inline logic.
 *   • The read-only viewer (marketing advisor) — who has NO branch link — gets
 *     a synthetic elevated READER context (role 'AGENCY_ADMIN', viewerOnly: true)
 *     so the admin pages render. Writes are blocked by the per-handler
 *     viewerOnly check + middleware backstop.
 *   • Everyone else with no link → null (unauthorized), unchanged.
 */
export async function resolveCrmAdminSession(): Promise<CrmAdminCtx | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return null
  const email = session.user.email ?? null

  const ub = await prisma.crm_user_branch.findFirst({
    where: { userId: session.user.id },
    select: { tenantId: true, role: true },
  })
  if (ub) {
    // viewerOnly is EMAIL-based, not link-based: a read-only viewer who also
    // holds an (e.g. AGENCY_ADMIN) branch link is STILL write-blocked. Without
    // this, the link's role would sail past the per-route write guards.
    return { tenantId: ub.tenantId, userId: session.user.id, role: ub.role, email, viewerOnly: isReadOnlyViewer(email) }
  }

  // No branch link → only the read-only viewer gets a synthetic read context.
  if (isReadOnlyViewer(email)) {
    const t =
      (await prisma.crm_tenant.findFirst({ where: { slug: { in: ['ebright', 'ebright-demo'] } }, select: { id: true } })) ??
      (await prisma.crm_tenant.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } }))
    if (t) {
      return { tenantId: t.id, userId: session.user.id, role: 'AGENCY_ADMIN', email, viewerOnly: true }
    }
  }
  return null
}
