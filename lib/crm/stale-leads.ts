/**
 * Stale-lead auto-progression.
 *
 * Scans every tenant's open opportunities and moves leads that have been
 * sitting in the same stage for ≥ 7 days along the unresponsive funnel:
 *
 *   FU3   → UR_W1   (7 days inactive)
 *   UR_W1 → UR_W2   (7 days inactive)
 *   UR_W2 → UR_W3   (7 days inactive)
 *   UR_W3 → CL      (7 days inactive — adds "Unresponsive (Auto-Generated)" remark)
 *
 * `lastStageChangeAt` is the trigger: it gets bumped to NOW on every move
 * (manual or automatic), so a lead only advances one stage per scan run and
 * a fresh 7-day window starts each time.
 *
 * Each move writes a crm_stage_history row whose `note` shows up under
 * "Stage remarks" on the lead detail page, so the operations team can see
 * exactly why a lead jumped without anyone touching it.
 *
 * Safe to call repeatedly — idempotent (the cutoff filter guarantees no
 * lead is moved twice in the same 7-day window).
 */

import { prisma } from '@/lib/crm/db'

export interface StaleLeadMoveStep {
  from: string
  to: string
  /** What lands in crm_stage_history.note (shows up under "Stage remarks"). */
  note: string
}

export const STALE_LEAD_TRANSITIONS: StaleLeadMoveStep[] = [
  { from: 'FU3',   to: 'UR_W1', note: 'Auto-moved from FU3 after 7 days of inactivity' },
  { from: 'UR_W1', to: 'UR_W2', note: 'Auto-moved from UR_W1 after 7 days of inactivity' },
  { from: 'UR_W2', to: 'UR_W3', note: 'Auto-moved from UR_W2 after 7 days of inactivity' },
  { from: 'UR_W3', to: 'CL',    note: 'Unresponsive (Auto-Generated)' },
]

export const STALE_LEAD_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000

export interface MoveStaleLeadsResult {
  steps: Array<{ from: string; to: string; moved: number; skippedNoTarget: number }>
  totalMoved: number
}

/**
 * Move all stale leads across all tenants. Returns per-transition counts.
 *
 * Implementation note: we process transitions in REVERSE order (UR_W3 → CL
 * first, then UR_W2 → UR_W3, etc). Otherwise a lead that's been "stuck" for
 * 4+ weeks could cascade all the way from FU3 to CL in a single scan, which
 * the user's intent ("a week pass, moved to URW2 and then URW3") rules out.
 * Reverse-order processing guarantees each lead advances at most one stage
 * per scan run.
 */
export async function moveStaleLeads(): Promise<MoveStaleLeadsResult> {
  const cutoff = new Date(Date.now() - STALE_LEAD_THRESHOLD_MS)
  const steps: MoveStaleLeadsResult['steps'] = []
  let totalMoved = 0

  for (const transition of [...STALE_LEAD_TRANSITIONS].reverse()) {
    const result = await moveOneTransition(transition, cutoff)
    steps.unshift({ from: transition.from, to: transition.to, ...result })
    totalMoved += result.moved
  }

  return { steps, totalMoved }
}

async function moveOneTransition(
  transition: StaleLeadMoveStep,
  cutoff: Date,
): Promise<{ moved: number; skippedNoTarget: number }> {
  // Pull all stage rows whose shortCode matches the "from" code across every
  // pipeline. Each branch has its own pipeline, so the same shortCode appears
  // many times. We need them all so we can match opportunities by stageId.
  const fromStages = await prisma.crm_stage.findMany({
    where: { shortCode: transition.from },
    select: { id: true, tenantId: true, pipelineId: true },
  })

  if (fromStages.length === 0) return { moved: 0, skippedNoTarget: 0 }

  // Map from pipelineId → target stage in that same pipeline. If a pipeline
  // doesn't yet have the target stage (e.g. UR_W3 not migrated in for a
  // legacy branch), the lookup returns undefined and that pipeline's stale
  // leads are simply left in place until the migration is run.
  const toStages = await prisma.crm_stage.findMany({
    where: {
      shortCode: transition.to,
      pipelineId: { in: fromStages.map((s) => s.pipelineId) },
    },
    select: { id: true, tenantId: true, pipelineId: true },
  })
  const toByPipeline = new Map(toStages.map((s) => [s.pipelineId, s]))

  // Find all stale opportunities in any of the "from" stages.
  const stale = await prisma.crm_opportunity.findMany({
    where: {
      stageId: { in: fromStages.map((s) => s.id) },
      lastStageChangeAt: { lt: cutoff },
      deletedAt: null,
    },
    select: {
      id: true,
      tenantId: true,
      stageId: true,
      contactId: true,
      branchId: true,
    },
  })

  // Build a quick lookup so we know which pipeline each opportunity belongs to.
  const fromStageById = new Map(fromStages.map((s) => [s.id, s]))

  let moved = 0
  let skippedNoTarget = 0

  for (const opp of stale) {
    const fromStage = fromStageById.get(opp.stageId)
    if (!fromStage) continue
    const target = toByPipeline.get(fromStage.pipelineId)
    if (!target) {
      skippedNoTarget++
      continue
    }
    if (target.tenantId !== opp.tenantId) continue // sanity guard

    try {
      await prisma.$transaction(async (tx) => {
        await tx.crm_opportunity.update({
          where: { id: opp.id },
          data: {
            stageId: target.id,
            lastStageChangeAt: new Date(),
            updatedAt: new Date(),
          },
        })
        await tx.crm_stage_history.create({
          data: {
            tenantId: opp.tenantId,
            opportunityId: opp.id,
            fromStageId: opp.stageId,
            toStageId: target.id,
            // changedByUserId left null — surfaces as "Auto" in the UI.
            note: transition.note,
            changedAt: new Date(),
          },
        })
      })
      moved++
    } catch (err) {
      console.error(
        `[stale-leads] Failed to move opp ${opp.id} (${transition.from}→${transition.to}):`,
        (err as Error).message,
      )
    }
  }

  if (moved > 0 || skippedNoTarget > 0) {
    console.log(
      `[stale-leads] ${transition.from} → ${transition.to}: moved=${moved} skippedNoTarget=${skippedNoTarget}`,
    )
  }

  return { moved, skippedNoTarget }
}
