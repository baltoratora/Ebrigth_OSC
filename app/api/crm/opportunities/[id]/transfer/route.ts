import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { z } from 'zod'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { resolveBranchAccess } from '@/lib/crm/branch-access'
import { hasPermission } from '@/lib/crm/permissions'
import { createTransferNotifications } from '@/lib/crm/notifications'

const MAX_TRANSFERS_PER_LEAD = 3

const TransferSchema = z.object({
  toBranchId: z.string().uuid('Invalid branch ID'),
  reason:     z.string().trim().min(5, 'Reason must be at least 5 characters').max(500),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const access = await resolveBranchAccess(session.user.id)
    if (!access) {
      return NextResponse.json({ error: 'No CRM access' }, { status: 403 })
    }

    // Transferring a lead to another branch is lead editing — not for AGENCY_ADMIN.
    if (!hasPermission(access.role, 'opportunities:write')) {
      return NextResponse.json({ error: 'Your role cannot transfer leads.' }, { status: 403 })
    }

    const { id: opportunityId } = await params
    const parsed = TransferSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
    }
    const { toBranchId, reason } = parsed.data

    const opp = await prisma.crm_opportunity.findFirst({
      where: { id: opportunityId, tenantId: access.tenantId, deletedAt: null },
      select: {
        id:         true,
        branchId:   true,
        pipelineId: true,
        stageId:    true,
        contactId:  true,
        stage:      { select: { shortCode: true } },
        branch:     { select: { name: true } },
        contact:    { select: { firstName: true, lastName: true, parentFullName: true } },
      },
    })
    if (!opp) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    if (!access.elevated && !access.branchIds.includes(opp.branchId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (toBranchId === opp.branchId) {
      return NextResponse.json(
        { error: 'Target branch is the same as the current branch' },
        { status: 400 },
      )
    }

    const transferCount = await prisma.crm_lead_transfer.count({
      where: { opportunityId },
    })
    if (transferCount >= MAX_TRANSFERS_PER_LEAD) {
      return NextResponse.json(
        {
          error: 'TRANSFER_LIMIT_REACHED',
          message:
            'This lead has reached the maximum of 3 transfers between branches. ' +
            'Please contact the Optimisation Department for further assistance.',
        },
        { status: 409 },
      )
    }

    const toBranch = await prisma.crm_branch.findFirst({
      where: { id: toBranchId, tenantId: access.tenantId },
      select: { id: true, name: true },
    })
    if (!toBranch) {
      return NextResponse.json({ error: 'Target branch not found' }, { status: 404 })
    }

    const toPipeline = await prisma.crm_pipeline.findFirst({
      where: { tenantId: access.tenantId, branchId: toBranchId },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    })
    if (!toPipeline) {
      return NextResponse.json(
        { error: 'Target branch has no pipeline set up' },
        { status: 400 },
      )
    }

    const stages = await prisma.crm_stage.findMany({
      where: { tenantId: access.tenantId, pipelineId: toPipeline.id },
      select: { id: true, shortCode: true },
      orderBy: { order: 'asc' },
    })
    const stageMap = new Map(stages.map((s) => [s.shortCode, s.id]))
    const toStageId =
      stageMap.get(opp.stage.shortCode) ??
      stageMap.get('NL') ??
      stages[0]?.id
    if (!toStageId) {
      return NextResponse.json(
        { error: 'Target branch has no stages set up' },
        { status: 400 },
      )
    }

    const now = new Date()
    await prisma.$transaction(async (tx) => {
      await tx.crm_lead_transfer.create({
        data: {
          tenantId:            access.tenantId,
          opportunityId:       opp.id,
          fromBranchId:        opp.branchId,
          toBranchId,
          fromPipelineId:      opp.pipelineId,
          toPipelineId:        toPipeline.id,
          fromStageId:         opp.stageId,
          toStageId,
          transferredByUserId: session.user.id,
          reason,
          transferredAt:       now,
        },
      })
      await tx.crm_opportunity.update({
        where: { id: opp.id },
        data: {
          branchId:          toBranchId,
          pipelineId:        toPipeline.id,
          stageId:           toStageId,
          lastStageChangeAt: now,
        },
      })
      await tx.crm_contact.update({
        where: { id: opp.contactId },
        data: { branchId: toBranchId },
      })
      await tx.crm_stage_history.create({
        data: {
          tenantId:        access.tenantId,
          opportunityId:   opp.id,
          fromStageId:     opp.stageId,
          toStageId,
          changedByUserId: session.user.id,
          note:            `Branch transfer: ${reason}`,
          changedAt:       now,
        },
      })
    })

    // Fan-out notifications to both source and target branches. Best-effort —
    // the transfer is already committed by the time this runs, so failures
    // are logged but don't roll anything back.
    const leadName =
      `${opp.contact.firstName} ${opp.contact.lastName ?? ''}`.trim() ||
      opp.contact.parentFullName ||
      'A lead'
    try {
      await createTransferNotifications(prisma, {
        tenantId:            access.tenantId,
        fromBranchId:        opp.branchId,
        toBranchId,
        fromBranchName:      opp.branch?.name ?? 'Unknown',
        toBranchName:        toBranch.name,
        opportunityId:       opp.id,
        leadName,
        reason,
        transferredByUserId: session.user.id,
      })
    } catch (e) {
      console.warn('[transfer] notification fan-out failed:', (e as Error).message)
    }

    return NextResponse.json({
      ok: true,
      transfersUsed: transferCount + 1,
      transfersRemaining: MAX_TRANSFERS_PER_LEAD - transferCount - 1,
      toBranchName: toBranch.name,
    })
  } catch (err) {
    console.error('[POST /api/crm/opportunities/[id]/transfer]', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
