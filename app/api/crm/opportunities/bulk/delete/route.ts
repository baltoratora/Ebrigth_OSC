import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { bulkDeleteOpportunities } from '@/server/actions/opportunities'
import { BulkDeleteSchema } from '@/lib/crm/validations/opportunity'
import { resolveBranchAccess } from '@/lib/crm/branch-access'
import { hasPermission } from '@/lib/crm/permissions'

async function resolveSession() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return null
  const access = await resolveBranchAccess(session.user.id)
  if (!access) return null
  return {
    tenantId: access.tenantId,
    userId: session.user.id,
    branchIds: access.branchIds,
    elevated: access.elevated,
    role: access.role,
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await resolveSession()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Lead deletion is SUPER_ADMIN-only.
    if (!hasPermission(ctx.role, 'opportunities:delete')) {
      return NextResponse.json({ error: 'Only a super admin can delete leads.' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = BulkDeleteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
    }

    // Non-admin must own every opportunity's branch — same gate as bulk move.
    if (!ctx.elevated) {
      const opps = await prisma.crm_opportunity.findMany({
        where: { id: { in: parsed.data.opportunityIds }, tenantId: ctx.tenantId },
        select: { branchId: true },
      })
      if (opps.length !== parsed.data.opportunityIds.length) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      if (opps.some((o) => !ctx.branchIds.includes(o.branchId))) {
        return NextResponse.json(
          { error: 'You do not have access to one or more of these branches.' },
          { status: 403 },
        )
      }
    }

    const result = await bulkDeleteOpportunities(
      parsed.data.opportunityIds,
      ctx.userId,
      ctx.tenantId,
    )
    return NextResponse.json(result)
  } catch (err) {
    console.error('[POST /api/crm/opportunities/bulk/delete]', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
