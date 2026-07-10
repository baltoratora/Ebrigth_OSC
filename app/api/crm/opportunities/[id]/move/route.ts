import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { moveOpportunity, bulkMoveOpportunities } from '@/server/actions/opportunities'
import { MoveOpportunitySchema, BulkMoveSchema } from '@/lib/crm/validations/opportunity'
import { resolveBranchAccess } from '@/lib/crm/branch-access'
import { hasPermission } from '@/lib/crm/permissions'

async function resolveSession(_req: NextRequest) {
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

/** Return 403 response if caller isn't elevated and opp isn't in their branches. */
async function assertOppsAccess(
  ctx: { tenantId: string; branchIds: string[]; elevated: boolean },
  opportunityIds: string[],
): Promise<NextResponse | null> {
  if (ctx.elevated || opportunityIds.length === 0) return null
  const opps = await prisma.crm_opportunity.findMany({
    where: { id: { in: opportunityIds }, tenantId: ctx.tenantId },
    select: { id: true, branchId: true },
  })
  if (opps.length !== opportunityIds.length) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const forbidden = opps.some((o) => !ctx.branchIds.includes(o.branchId))
  if (forbidden) {
    return NextResponse.json(
      { error: 'You do not have access to one or more of these branches.' },
      { status: 403 },
    )
  }
  return null
}

// ─── POST /api/crm/opportunities/[id]/move ────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await resolveSession(req)
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Moving a lead between stages is lead editing — read-only for AGENCY_ADMIN.
    if (!hasPermission(ctx.role, 'opportunities:write')) {
      return NextResponse.json({ error: 'Your role cannot move leads.' }, { status: 403 })
    }

    const { id } = await params
    const body = await req.json()

    // Support bulk move if opportunityIds array provided
    if (Array.isArray(body.opportunityIds)) {
      const parsed = BulkMoveSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
      }
      const denied = await assertOppsAccess(ctx, parsed.data.opportunityIds)
      if (denied) return denied
      const result = await bulkMoveOpportunities(
        parsed.data.opportunityIds,
        parsed.data.toStageId,
        ctx.userId,
        ctx.tenantId,
        parsed.data.note,
      )
      return NextResponse.json(result)
    }

    // Single move
    const parsed = MoveOpportunitySchema.safeParse({ opportunityId: id, ...body })
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
    }

    const denied = await assertOppsAccess(ctx, [parsed.data.opportunityId])
    if (denied) return denied

    const updated = await moveOpportunity(
      parsed.data.opportunityId,
      parsed.data.toStageId,
      parsed.data.note,
      ctx.userId,
      ctx.tenantId,
      {
        trialDate: parsed.data.trialDate,
        trialTimeSlot: parsed.data.trialTimeSlot,
        enrollmentMonths: parsed.data.enrollmentMonths,
        rescheduleDate: parsed.data.rescheduleDate,
      },
    )

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[POST /api/crm/opportunities/[id]/move]', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
