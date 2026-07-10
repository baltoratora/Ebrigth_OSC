import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { getOpportunityById } from '@/server/queries/opportunities'
import { deleteOpportunity } from '@/server/actions/opportunities'
import { UpdateOpportunitySchema } from '@/lib/crm/validations/opportunity'
import { scopedPrisma } from '@/lib/crm/tenancy'
import { logAudit } from '@/lib/crm/audit'
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
    branchId: access.primaryBranchId,
    branchIds: access.branchIds,
    elevated: access.elevated,
    role: access.role,
  }
}

/**
 * Shared guard — load the opportunity's branchId and 403 if the caller isn't
 * allowed to touch it. Returns null on success (proceed) or a NextResponse to
 * return from the handler.
 */
async function assertBranchAccess(
  ctx: { tenantId: string; branchIds: string[]; elevated: boolean },
  opportunityId: string,
) {
  if (ctx.elevated) return null
  const opp = await prisma.crm_opportunity.findFirst({
    where: { id: opportunityId, tenantId: ctx.tenantId },
    select: { branchId: true },
  })
  if (!opp) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!ctx.branchIds.includes(opp.branchId)) {
    return NextResponse.json(
      { error: 'You do not have access to this branch.' },
      { status: 403 },
    )
  }
  return null
}

// ─── GET /api/crm/opportunities/[id] ─────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await resolveSession(req)
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const denied = await assertBranchAccess(ctx, id)
    if (denied) return denied
    const opportunity = await getOpportunityById(ctx.tenantId, id)
    if (!opportunity) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json(opportunity)
  } catch (err) {
    console.error('[GET /api/crm/opportunities/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── PATCH /api/crm/opportunities/[id] ───────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await resolveSession(req)
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Leads are read-only for AGENCY_ADMIN — only roles with opportunities:write
    // (super / regional / branch / staff) may edit.
    if (!hasPermission(ctx.role, 'opportunities:write')) {
      return NextResponse.json({ error: 'Your role cannot edit leads.' }, { status: 403 })
    }

    const { id } = await params
    const denied = await assertBranchAccess(ctx, id)
    if (denied) return denied
    const body = await req.json()
    const parsed = UpdateOpportunitySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
    }

    const scope = scopedPrisma(ctx.tenantId)
    const existing = await prisma.crm_opportunity.findFirst({
      where: scope.where({ id, deletedAt: null }),
      select: { id: true },
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const updated = await prisma.crm_opportunity.update({
      where: { id },
      data: {
        ...(parsed.data.value !== undefined ? { value: parsed.data.value } : {}),
        ...(parsed.data.assignedUserId !== undefined ? { assignedUserId: parsed.data.assignedUserId } : {}),
        updatedAt: new Date(),
      },
    })

    void logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'UPDATE',
      entity: 'crm_opportunity',
      entityId: id,
      meta: { fields: Object.keys(parsed.data) },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[PATCH /api/crm/opportunities/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── DELETE /api/crm/opportunities/[id] ──────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await resolveSession(req)
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Lead deletion is SUPER_ADMIN-only (branch/regional managers + agency
    // admins cannot delete leads).
    if (!hasPermission(ctx.role, 'opportunities:delete')) {
      return NextResponse.json({ error: 'Only a super admin can delete a lead.' }, { status: 403 })
    }

    const { id } = await params
    const denied = await assertBranchAccess(ctx, id)
    if (denied) return denied
    await deleteOpportunity(id, ctx.userId, ctx.tenantId)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/crm/opportunities/[id]]', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
