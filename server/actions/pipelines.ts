'use server'

import { prisma } from '@/lib/crm/db'
import { logAudit } from '@/lib/crm/audit'
import { scopedPrisma } from '@/lib/crm/tenancy'
import { z } from 'zod'

const StageUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  shortCode: z.string().min(1).max(6).optional(),
  color: z.string().optional(),
  stuckHoursYellow: z.number().int().min(1).optional(),
  stuckHoursRed: z.number().int().min(1).optional(),
})

export async function reorderStages(
  tenantId: string,
  userId: string,
  pipelineId: string,
  orderedStageIds: string[],
) {
  const scope = scopedPrisma(tenantId)

  // Verify pipeline belongs to tenant
  const pipeline = await prisma.crm_pipeline.findFirst({
    where: scope.where({ id: pipelineId }),
    select: { id: true },
  })
  if (!pipeline) throw new Error('Pipeline not found')

  // Update order for each stage
  await prisma.$transaction(
    orderedStageIds.map((stageId, index) =>
      prisma.crm_stage.updateMany({
        where: { id: stageId, tenantId, pipelineId },
        data: { order: index, updatedAt: new Date() },
      }),
    ),
  )

  void logAudit({
    tenantId,
    userId,
    action: 'UPDATE',
    entity: 'crm_stage',
    meta: { action: 'reorder', pipelineId },
  })
}

export async function updateStage(
  tenantId: string,
  userId: string,
  stageId: string,
  data: z.infer<typeof StageUpdateSchema>,
) {
  const parsed = StageUpdateSchema.parse(data)
  const scope = scopedPrisma(tenantId)

  const stage = await prisma.crm_stage.findFirst({
    where: scope.where({ id: stageId }),
    select: { id: true },
  })
  if (!stage) throw new Error('Stage not found')

  const updated = await prisma.crm_stage.update({
    where: { id: stageId },
    data: { ...parsed, updatedAt: new Date() },
  })

  void logAudit({
    tenantId,
    userId,
    action: 'UPDATE',
    entity: 'crm_stage',
    entityId: stageId,
    meta: { fields: Object.keys(parsed) },
  })

  return updated
}

export async function deleteStage(
  tenantId: string,
  userId: string,
  stageId: string,
  reassignToStageId?: string,
) {
  const scope = scopedPrisma(tenantId)

  const stage = await prisma.crm_stage.findFirst({
    where: scope.where({ id: stageId }),
    select: { id: true, pipelineId: true },
  })
  if (!stage) throw new Error('Stage not found')

  // Reassign opportunities if needed
  if (reassignToStageId) {
    const targetStage = await prisma.crm_stage.findFirst({
      where: scope.where({ id: reassignToStageId }),
      select: { id: true },
    })
    if (!targetStage) throw new Error('Target stage not found')

    await prisma.crm_opportunity.updateMany({
      where: { stageId, tenantId, deletedAt: null },
      data: { stageId: reassignToStageId, updatedAt: new Date() },
    })
  }

  await prisma.crm_stage.delete({ where: { id: stageId } })

  void logAudit({
    tenantId,
    userId,
    action: 'DELETE',
    entity: 'crm_stage',
    entityId: stageId,
    meta: { reassignToStageId },
  })
}

export async function createStage(
  tenantId: string,
  userId: string,
  pipelineId: string,
  data: {
    name: string
    shortCode: string
    color?: string
    stuckHoursYellow?: number
    stuckHoursRed?: number
  },
) {
  const scope = scopedPrisma(tenantId)

  const pipeline = await prisma.crm_pipeline.findFirst({
    where: scope.where({ id: pipelineId }),
    select: { id: true },
  })
  if (!pipeline) throw new Error('Pipeline not found')

  // Get current max order
  const maxOrder = await prisma.crm_stage.aggregate({
    where: { pipelineId, tenantId },
    _max: { order: true },
  })
  const newOrder = (maxOrder._max.order ?? -1) + 1

  const stage = await prisma.crm_stage.create({
    data: {
      tenantId,
      pipelineId,
      name: data.name,
      shortCode: data.shortCode,
      color: data.color ?? '#6366f1',
      order: newOrder,
      stuckHoursYellow: data.stuckHoursYellow ?? 24,
      stuckHoursRed: data.stuckHoursRed ?? 48,
    },
  })

  void logAudit({
    tenantId,
    userId,
    action: 'CREATE',
    entity: 'crm_stage',
    entityId: stage.id,
    meta: { pipelineId, name: stage.name },
  })

  return stage
}

// ─── Global (all-branches) stage management ────────────────────────────────────
// SUPER_ADMIN / AGENCY_ADMIN only. Adds or removes a stage with the SAME
// shortCode across EVERY pipeline in the tenant, so the kanban stays uniform
// across branches. Per-pipeline create/update/delete above remain for fine edits.

const GLOBAL_STAGE_ROLES = new Set(['SUPER_ADMIN', 'AGENCY_ADMIN'])

/** Throws unless the user holds an elevated role on at least one branch. */
async function assertGlobalStageRole(userId: string, tenantId: string) {
  const rows = await prisma.crm_user_branch.findMany({
    where: { userId, tenantId },
    select: { role: true },
  })
  if (!rows.some((r) => GLOBAL_STAGE_ROLES.has(r.role))) {
    throw new Error('Only super-admins and agency admins can manage stages across all branches')
  }
}

export async function createStageAllPipelines(
  tenantId: string,
  userId: string,
  data: { name: string; shortCode: string; color?: string; beforeShortCode?: string },
) {
  await assertGlobalStageRole(userId, tenantId)

  const name = data.name.trim()
  const shortCode = data.shortCode.trim().toUpperCase()
  if (!name || !shortCode) throw new Error('Name and short code are required')
  if (shortCode.length > 6) throw new Error('Short code must be 6 characters or fewer')

  const pipelines = await prisma.crm_pipeline.findMany({
    where: { tenantId },
    select: { id: true, stages: { select: { shortCode: true, order: true } } },
  })

  let created = 0
  let skipped = 0
  for (const p of pipelines) {
    if (p.stages.some((s) => s.shortCode === shortCode)) { skipped++; continue } // idempotent
    const ref = data.beforeShortCode
      ? p.stages.find((s) => s.shortCode === data.beforeShortCode)
      : undefined

    await prisma.$transaction(async (tx) => {
      let newOrder: number
      if (ref) {
        newOrder = ref.order
        // Open a slot: push the reference stage and everything after it down by 1.
        await tx.crm_stage.updateMany({
          where: { pipelineId: p.id, tenantId, order: { gte: ref.order } },
          data: { order: { increment: 1 } },
        })
      } else {
        newOrder = p.stages.reduce((m, s) => Math.max(m, s.order), -1) + 1
      }
      await tx.crm_stage.create({
        data: {
          tenantId,
          pipelineId: p.id,
          name,
          shortCode,
          color: data.color ?? '#6366f1',
          order: newOrder,
          stuckHoursYellow: 24,
          stuckHoursRed: 48,
        },
      })
    })
    created++
  }

  void logAudit({
    tenantId,
    userId,
    action: 'CREATE',
    entity: 'crm_stage',
    meta: { scope: 'all-branches', shortCode, name, created, skipped, beforeShortCode: data.beforeShortCode ?? null },
  })

  return { created, skipped, pipelines: pipelines.length }
}

export async function deleteStageAllPipelines(
  tenantId: string,
  userId: string,
  shortCode: string,
  reassignToShortCode?: string,
) {
  await assertGlobalStageRole(userId, tenantId)

  const code = shortCode.trim().toUpperCase()
  const reassign = reassignToShortCode?.trim().toUpperCase() || undefined
  if (!code) throw new Error('Short code is required')
  if (reassign && reassign === code) throw new Error('Reassign target must differ from the stage being deleted')

  const pipelines = await prisma.crm_pipeline.findMany({
    where: { tenantId },
    select: { id: true, stages: { select: { id: true, shortCode: true } } },
  })

  let deleted = 0
  let reassigned = 0
  let skipped = 0
  for (const p of pipelines) {
    const target = p.stages.find((s) => s.shortCode === code)
    if (!target) { skipped++; continue }
    const dest = reassign ? p.stages.find((s) => s.shortCode === reassign) : undefined

    await prisma.$transaction(async (tx) => {
      const oppWhere = { stageId: target.id, tenantId, deletedAt: null }
      const oppCount = await tx.crm_opportunity.count({ where: oppWhere })
      if (oppCount > 0) {
        if (!dest) {
          throw new Error(`A pipeline has ${oppCount} opportunities in "${code}" but no "${reassign ?? '—'}" stage to reassign them to`)
        }
        await tx.crm_opportunity.updateMany({ where: oppWhere, data: { stageId: dest.id, updatedAt: new Date() } })
        reassigned += oppCount
      }
      await tx.crm_stage.delete({ where: { id: target.id } })
    })
    deleted++
  }

  void logAudit({
    tenantId,
    userId,
    action: 'DELETE',
    entity: 'crm_stage',
    meta: { scope: 'all-branches', shortCode: code, reassignToShortCode: reassign ?? null, deleted, reassigned, skipped },
  })

  return { deleted, reassigned, skipped }
}
