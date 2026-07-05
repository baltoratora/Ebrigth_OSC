'use server'

import { prisma } from '@/lib/crm/db'
import { logAudit } from '@/lib/crm/audit'
import { scopedPrisma } from '@/lib/crm/tenancy'
import { enqueueAutomation } from '@/lib/crm/queue'
import { TRIAL_CAPACITY } from '@/lib/crm/trial-config'
import type { CreateOpportunityInput } from '@/lib/crm/validations/opportunity'

/** Parse "10:00 AM" / "10am" / "14:00" → "HH:MM" (24h). */
function toHHMM(input: string): string {
  const trimmed = input.trim().toUpperCase()
  // 24h already
  const m24 = trimmed.match(/^(\d{1,2}):(\d{2})$/)
  if (m24) return `${m24[1].padStart(2, '0')}:${m24[2]}`
  // 12h with AM/PM
  const m12 = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/)
  if (m12) {
    let h = parseInt(m12[1], 10)
    const min = m12[2] ?? '00'
    if (m12[3] === 'PM' && h !== 12) h += 12
    if (m12[3] === 'AM' && h === 12) h = 0
    return `${String(h).padStart(2, '0')}:${min}`
  }
  return '10:00' // sane default
}

// ─── Create Opportunity ───────────────────────────────────────────────────────

export async function createOpportunity(
  branchId: string,
  data: CreateOpportunityInput & { tenantId: string; userId?: string },
) {
  const scope = scopedPrisma(data.tenantId)

  // Verify contact belongs to tenant
  const contact = await prisma.crm_contact.findFirst({
    where: scope.where({ id: data.contactId, deletedAt: null }),
    select: { id: true, branchId: true },
  })

  if (!contact) {
    throw new Error('Contact not found or access denied')
  }

  // Verify stage belongs to pipeline and tenant
  const stage = await prisma.crm_stage.findFirst({
    where: scope.where({ id: data.stageId, pipelineId: data.pipelineId }),
    select: { id: true },
  })

  if (!stage) {
    throw new Error('Stage not found or access denied')
  }

  const opportunity = await prisma.crm_opportunity.create({
    data: {
      tenantId: data.tenantId,
      branchId,
      contactId: data.contactId,
      pipelineId: data.pipelineId,
      stageId: data.stageId,
      value: data.value ?? 0,
      assignedUserId: data.assignedUserId ?? null,
      lastStageChangeAt: new Date(),
    },
  })

  // Create initial stage history
  await prisma.crm_stage_history.create({
    data: {
      tenantId: data.tenantId,
      opportunityId: opportunity.id,
      fromStageId: null,
      toStageId: data.stageId,
      changedByUserId: data.userId ?? null,
      note: 'Opportunity created',
      changedAt: new Date(),
    },
  })

  // Fire NEW_LEAD automation
  void enqueueAutomation({
    automationId: `trigger:NEW_LEAD:${data.tenantId}`,
    contactId: data.contactId,
    tenantId: data.tenantId,
    triggeredBy: data.userId ?? 'system',
    triggerPayload: { opportunityId: opportunity.id, stageId: data.stageId },
  }).catch((err) =>
    console.error('[createOpportunity] enqueueAutomation failed:', err),
  )

  void logAudit({
    tenantId: data.tenantId,
    userId: data.userId,
    action: 'CREATE',
    entity: 'crm_opportunity',
    entityId: opportunity.id,
    meta: { contactId: data.contactId, stageId: data.stageId },
  })

  return opportunity
}

// ─── Move Opportunity ─────────────────────────────────────────────────────────

export interface MoveOpportunityExtras {
  trialDate?: string
  trialTimeSlot?: string
  enrollmentMonths?: 3 | 6 | 9 | 12 | 18 | 24
  rescheduleDate?: string
}

export async function moveOpportunity(
  opportunityId: string,
  toStageId: string,
  note: string | undefined,
  userId: string,
  tenantId: string,
  extras: MoveOpportunityExtras = {},
) {
  const scope = scopedPrisma(tenantId)

  const opportunity = await prisma.crm_opportunity.findFirst({
    where: scope.where({ id: opportunityId, deletedAt: null }),
    select: { id: true, stageId: true, contactId: true, branchId: true },
  })

  if (!opportunity) {
    throw new Error('Opportunity not found or access denied')
  }

  const fromStageId = opportunity.stageId

  // Look up destination stage name so we can branch on semantics
  const toStage = await prisma.crm_stage.findFirst({
    where: { id: toStageId, tenantId },
    select: { name: true, shortCode: true },
  })
  const toStageName = toStage?.name?.toLowerCase() ?? ''
  const toCode = (toStage?.shortCode ?? '').toUpperCase()

  const isConfirmedTrial = toStageName === 'confirmed for trial'
  const isEnrolled = toStageName === 'enrolled'
  const isReschedule = toStageName === 'reschedule'

  // A lead's Trial Class record is RETAINED while the lead is anywhere the trial
  // still "counts": CT (booked), SU (showed), SNE / CNS (showed-no-enrol /
  // confirmed-no-show), ENR (enrolled) and RSD (rescheduling). The Leads-Dashboard
  // CT headline counts these records by trial date, so they must survive the move.
  // Any OTHER destination (FU*, CL, DND, NL, UR_W*, …) means the lead backed out
  // before the trial — we delete the record and the CT count drops. Keyed on the
  // DESTINATION so multi-hop paths (e.g. CT → SU → CL) free correctly. The
  // schedule grid + slot-capacity scope themselves by CURRENT stage, so a
  // retained-but-not-CT record never occupies a live trial slot.
  const TRIAL_RETAIN_CODES = new Set(['CT', 'SU', 'SNE', 'CNS', 'ENR', 'RSD'])
  const dropTrialRecord = !isConfirmedTrial && !TRIAL_RETAIN_CODES.has(toCode)

  // Live "Confirmed for Trial" stage IDs — used to scope the slot-capacity count
  // below so retained records for leads who've moved on don't block new bookings.
  const ctSeatStageIds = (
    await prisma.crm_stage.findMany({
      where: {
        tenantId,
        OR: [{ shortCode: 'CT' }, { name: { equals: 'Confirmed for Trial', mode: 'insensitive' } }],
      },
      select: { id: true },
    })
  ).map((s) => s.id)

  // Enforce required stage-specific fields
  if (isConfirmedTrial && (!extras.trialDate || !extras.trialTimeSlot)) {
    throw new Error('Trial date and time slot are required to move to "Confirmed for Trial"')
  }
  if (isEnrolled && !extras.enrollmentMonths) {
    throw new Error('Package length is required to move to "Enrolled"')
  }
  if (isReschedule && !extras.rescheduleDate) {
    throw new Error('Follow-up date is required to move to "Reschedule"')
  }

  // Build a combined note so the stage_history preserves context
  const autoNote = isConfirmedTrial
    ? `Trial: ${extras.trialDate} @ ${extras.trialTimeSlot}`
    : isEnrolled
      ? `Enrolled — ${extras.enrollmentMonths}-month package`
      : isReschedule
        ? `Reschedule follow-up: ${extras.rescheduleDate}`
        : ''
  const combinedNote = [note, autoNote].filter(Boolean).join(' · ') || null

  // Trial-class scheduling — check capacity + create the appointment atomically
  // with the move so the UI can't overbook a slot past TRIAL_CAPACITY students.
  const updated = await prisma.$transaction(async (tx) => {
    if (isConfirmedTrial && extras.trialDate && extras.trialTimeSlot) {
      const [startStr] = extras.trialTimeSlot.split('–').map((s) => s.trim())
      const startAt = new Date(`${extras.trialDate}T${toHHMM(startStr)}:00`)

      // Re-booking a trial (e.g. after a reschedule back into CT) must replace
      // the lead's prior Trial Class appointment, not stack a second one —
      // otherwise the old slot stays "booked" forever (ghost capacity) and the
      // card's latest-appointment pill can show the wrong date.
      await tx.crm_appointment.deleteMany({
        where: { tenantId, contactId: opportunity.contactId, title: 'Trial Class' },
      })

      const booked = await tx.crm_appointment.count({
        where: {
          tenantId,
          branchId: opportunity.branchId,
          title: 'Trial Class',
          startAt,
          // Only live CT seats occupy the slot — retained records for leads who
          // moved on (SU/ENR/RSD/…) must not count toward capacity.
          contact: { opportunities: { some: { stageId: { in: ctSeatStageIds } } } },
        },
      })
      if (booked >= TRIAL_CAPACITY) {
        throw new Error(
          `This time slot is fully booked (${booked}/${TRIAL_CAPACITY}). Pick another slot.`,
        )
      }

      const endAt = new Date(startAt.getTime() + 60 * 60 * 1000)
      await tx.crm_appointment.create({
        data: {
          tenantId,
          branchId: opportunity.branchId,
          contactId: opportunity.contactId,
          userId,
          startAt,
          endAt,
          title: 'Trial Class',
          notes: note ?? undefined,
        },
      })

      // Mirror the trial weekday onto the contact. The Region "Day
      // Distribution" dashboard buckets CT/ENR by contact.preferredTrialDay,
      // so without this a confirmed trial booked from the kanban never shows
      // there (only the appointment-based Trial Schedule widget did).
      const TRIAL_DAY_BY_DOW: Record<number, 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN'> = {
        3: 'WED', 4: 'THU', 5: 'FRI', 6: 'SAT', 0: 'SUN',
      }
      const trialDay = TRIAL_DAY_BY_DOW[new Date(`${extras.trialDate}T00:00:00`).getDay()]
      if (trialDay) {
        await tx.crm_contact.update({
          where: { id: opportunity.contactId },
          data: { preferredTrialDay: trialDay },
        })
      }
    }

    // Drop the lead's Trial Class record when it backs out before the trial
    // (destination outside TRIAL_RETAIN_CODES). Runs inside the move txn so the
    // kanban refetch immediately reflects the cleared slot. Rescheduling (RSD)
    // RETAINS the record — the CT headline still counts it — while the schedule
    // grid + capacity (scoped by current stage) free the live slot.
    if (dropTrialRecord) {
      await tx.crm_appointment.deleteMany({
        where: { tenantId, contactId: opportunity.contactId, title: 'Trial Class' },
      })
    }

    const updated = await tx.crm_opportunity.update({
      where: { id: opportunityId },
      data: {
        stageId: toStageId,
        lastStageChangeAt: new Date(),
        updatedAt: new Date(),
      },
    })

    await tx.crm_stage_history.create({
      data: {
        tenantId,
        opportunityId,
        fromStageId,
        toStageId,
        changedByUserId: userId,
        note: combinedNote,
        changedAt: new Date(),
      },
    })

    return updated
  })

  // Remaining side-effects can run fire-and-forget — they don't need to block
  // the HTTP response and failures here only affect automation/logs.
  setImmediate(() => {
    void runStageSideEffects({
      isEnrolled,
      isReschedule,
      extras,
      opportunity: { id: opportunityId, contactId: opportunity.contactId, branchId: opportunity.branchId },
      tenantId,
      userId,
      fromStageId,
      toStageId,
    })
  })

  return updated
}

async function runStageSideEffects(args: {
  isEnrolled: boolean
  isReschedule: boolean
  extras: MoveOpportunityExtras
  opportunity: { id: string; contactId: string; branchId: string }
  tenantId: string
  userId: string
  fromStageId: string
  toStageId: string
}): Promise<void> {
  const { isEnrolled, isReschedule, extras, opportunity, tenantId, userId, fromStageId, toStageId } = args

  if (isEnrolled && extras.enrollmentMonths) {
    try {
      await prisma.crm_contact.update({
        where: { id: opportunity.contactId },
        data: { enrolledPackage: `${extras.enrollmentMonths} months` },
      })
    } catch (err) {
      console.error('[moveOpportunity] failed to update contact package:', err)
    }
  }

  if (isReschedule) {
    // The trial RECORD is retained (the CT headline still counts it) but the
    // live slot is freed because the schedule grid + capacity scope by current
    // stage (RSD is not CT). Here we only schedule the new-date follow-up task.
    if (extras.rescheduleDate) {
      try {
        const dueAt = new Date(`${extras.rescheduleDate}T09:00:00`)
        await prisma.crm_task.create({
          data: {
            tenantId,
            branchId: opportunity.branchId,
            contactId: opportunity.contactId,
            assignedUserId: userId,
            title: 'Reschedule follow-up',
            dueAt,
          },
        })
      } catch (err) {
        console.error('[moveOpportunity] failed to create reschedule task:', err)
      }
    }
  }

  try {
    await enqueueAutomation({
      automationId: `trigger:STAGE_CHANGED:${tenantId}`,
      contactId: opportunity.contactId,
      tenantId,
      triggeredBy: userId,
      triggerPayload: { opportunityId: opportunity.id, fromStageId, toStageId },
    })
  } catch (err) {
    console.error('[moveOpportunity] enqueueAutomation failed:', err)
  }

  try {
    await logAudit({
      tenantId,
      userId,
      action: 'UPDATE',
      entity: 'crm_opportunity',
      entityId: opportunity.id,
      meta: { action: 'stage_move', fromStageId, toStageId },
    })
  } catch {
    // logAudit already swallows errors internally; extra catch is defensive.
  }
}

// ─── Delete Opportunity ───────────────────────────────────────────────────────

export async function deleteOpportunity(
  opportunityId: string,
  userId: string,
  tenantId: string,
) {
  const scope = scopedPrisma(tenantId)

  const opportunity = await prisma.crm_opportunity.findFirst({
    where: scope.where({ id: opportunityId, deletedAt: null }),
    select: { id: true },
  })

  if (!opportunity) {
    throw new Error('Opportunity not found or access denied')
  }

  const deleted = await prisma.crm_opportunity.update({
    where: { id: opportunityId },
    data: { deletedAt: new Date(), updatedAt: new Date() },
  })

  void logAudit({
    tenantId,
    userId,
    action: 'DELETE',
    entity: 'crm_opportunity',
    entityId: opportunityId,
  })

  return deleted
}

// ─── Bulk Move Opportunities ──────────────────────────────────────────────────

export async function bulkMoveOpportunities(
  opportunityIds: string[],
  toStageId: string,
  userId: string,
  tenantId: string,
  note?: string,
) {
  const scope = scopedPrisma(tenantId)

  // Verify all opportunities belong to tenant
  const opportunities = await prisma.crm_opportunity.findMany({
    where: scope.where({
      id: { in: opportunityIds },
      deletedAt: null,
    }),
    select: { id: true, stageId: true, contactId: true },
  })

  if (opportunities.length === 0) {
    throw new Error('No valid opportunities found')
  }

  const now = new Date()

  // Batch update
  await prisma.crm_opportunity.updateMany({
    where: {
      id: { in: opportunities.map((o) => o.id) },
      tenantId,
    },
    data: {
      stageId: toStageId,
      lastStageChangeAt: now,
      updatedAt: now,
    },
  })

  // Write stage history for each
  await prisma.crm_stage_history.createMany({
    data: opportunities.map((o) => ({
      tenantId,
      opportunityId: o.id,
      fromStageId: o.stageId,
      toStageId,
      changedByUserId: userId,
      note: note ?? 'Bulk move',
      changedAt: now,
    })),
  })

  // Drop Trial Class records for leads bulk-moved to a stage where the trial no
  // longer counts (anything outside TRIAL_RETAIN_CODES) — mirrors moveOpportunity.
  // Keyed on the destination, regardless of the from-stage, so the CT headline
  // count stays correct after a bulk move.
  const toStageRow = await prisma.crm_stage.findFirst({
    where: { id: toStageId, tenantId },
    select: { shortCode: true },
  })
  const toCode = (toStageRow?.shortCode ?? '').toUpperCase()
  if (!new Set(['CT', 'SU', 'SNE', 'CNS', 'ENR', 'RSD']).has(toCode)) {
    const contactIds = Array.from(new Set(opportunities.map((o) => o.contactId)))
    if (contactIds.length > 0) {
      await prisma.crm_appointment.deleteMany({
        where: { tenantId, title: 'Trial Class', contactId: { in: contactIds } },
      })
    }
  }

  void logAudit({
    tenantId,
    userId,
    action: 'UPDATE',
    entity: 'crm_opportunity',
    meta: {
      action: 'bulk_move',
      count: opportunities.length,
      toStageId,
    },
  })

  return { moved: opportunities.length }
}

// ─── Bulk Delete Opportunities ────────────────────────────────────────────────

/**
 * Soft-delete a batch of opportunities by setting deletedAt. Only deletes rows
 * that belong to the calling tenant — anything outside is silently dropped from
 * the set rather than throwing, so a partially-stale client selection still
 * succeeds for the rows it can touch.
 */
export async function bulkDeleteOpportunities(
  opportunityIds: string[],
  userId: string,
  tenantId: string,
) {
  const scope = scopedPrisma(tenantId)

  const opportunities = await prisma.crm_opportunity.findMany({
    where: scope.where({
      id: { in: opportunityIds },
      deletedAt: null,
    }),
    select: { id: true },
  })

  if (opportunities.length === 0) {
    return { deleted: 0 }
  }

  const now = new Date()

  await prisma.crm_opportunity.updateMany({
    where: {
      id: { in: opportunities.map((o) => o.id) },
      tenantId,
    },
    data: { deletedAt: now, updatedAt: now },
  })

  void logAudit({
    tenantId,
    userId,
    action: 'DELETE',
    entity: 'crm_opportunity',
    meta: {
      action: 'bulk_delete',
      count: opportunities.length,
    },
  })

  return { deleted: opportunities.length }
}
