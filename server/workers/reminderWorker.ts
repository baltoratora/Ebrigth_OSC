/**
 * Reminder Worker — crm.reminder BullMQ worker.
 *
 * Processes individual reminder jobs AND runs a repeatable hourly scheduler
 * that scans for stuck opportunities and creates crm_notification records.
 *
 * Stuck thresholds are configured per-stage via stuckHoursYellow / stuckHoursRed.
 */

import { Worker, Queue } from 'bullmq'
import { redisConnection, reminderQueue } from '@/lib/crm/queue'
import type { ReminderJobData } from '@/lib/crm/queue'
import { prisma } from '@/lib/crm/db'

// ─── Hourly scan job name ─────────────────────────────────────────────────────

const SCAN_JOB_NAME = 'crm.reminder.scan'

// ─── Scan for stuck opportunities ────────────────────────────────────────────

async function scanStuckOpportunities(): Promise<void> {
  const now = new Date()
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  // Find all open opportunities that haven't changed stage in 24+ hours
  const stuckOpportunities = await prisma.crm_opportunity.findMany({
    where: {
      deletedAt: null,
      lastStageChangeAt: { lt: twentyFourHoursAgo },
    },
    include: {
      stage: {
        select: {
          id: true,
          name: true,
          stuckHoursYellow: true,
          stuckHoursRed: true,
        },
      },
      contact: {
        select: { id: true, firstName: true, lastName: true },
      },
      branch: {
        select: {
          id: true,
          branchManagerId: true,
          tenantId: true,
        },
      },
    },
  })

  for (const opp of stuckOpportunities) {
    const hoursInStage = (now.getTime() - opp.lastStageChangeAt.getTime()) / (1000 * 60 * 60)

    const isYellow = hoursInStage >= opp.stage.stuckHoursYellow
    const isRed = hoursInStage >= opp.stage.stuckHoursRed

    if (!isYellow) continue

    // Notify assigned user or branch manager
    const notifyUserId = opp.assignedUserId ?? opp.branch.branchManagerId
    if (!notifyUserId) continue

    const contactName =
      `${opp.contact.firstName}${opp.contact.lastName ? ' ' + opp.contact.lastName : ''}`.trim()
    const hoursFormatted = Math.round(hoursInStage)

    // Avoid duplicate notifications — check if one was already sent in the last hour
    const recentNotification = await prisma.crm_notification.findFirst({
      where: {
        tenantId: opp.tenantId,
        userId: notifyUserId,
        type: 'STUCK_LEAD',
        link: `/crm/contacts/${opp.contactId}`,
        createdAt: { gt: new Date(now.getTime() - 60 * 60 * 1000) },
      },
    })

    if (recentNotification) continue

    await prisma.crm_notification.create({
      data: {
        tenantId: opp.tenantId,
        userId: notifyUserId,
        type: 'STUCK_LEAD',
        title: `Lead stuck in ${opp.stage.name}`,
        body: `${contactName} has been in ${opp.stage.name} for ${hoursFormatted} hours${isRed ? ' — URGENT' : ''}`,
        link: `/crm/contacts/${opp.contactId}`,
      },
    })

    console.log(
      `[reminderWorker] Stuck lead notification created for ${contactName} ` +
      `(${hoursFormatted}h in "${opp.stage.name}")`,
    )
  }

  console.log(
    `[reminderWorker] Scan complete. Checked ${stuckOpportunities.length} stuck opportunities.`,
  )
}

// ─── Individual reminder job handler ─────────────────────────────────────────

export const reminderWorker = new Worker<ReminderJobData>(
  'crm.reminder',
  async (job) => {
    const { opportunityId, tenantId, branchId } = job.data

    if (job.name === SCAN_JOB_NAME) {
      // This is the repeatable hourly scan
      await scanStuckOpportunities()
      return
    }

    // Process a specific opportunity reminder
    const opportunity = await prisma.crm_opportunity.findUnique({
      where: { id: opportunityId },
      include: {
        stage: { select: { name: true, stuckHoursYellow: true, stuckHoursRed: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        branch: { select: { branchManagerId: true } },
      },
    })

    if (!opportunity || opportunity.deletedAt) {
      console.warn(`[reminderWorker] Opportunity ${opportunityId} not found or deleted`)
      return
    }

    const now = new Date()
    const hoursInStage =
      (now.getTime() - opportunity.lastStageChangeAt.getTime()) / (1000 * 60 * 60)

    if (hoursInStage < opportunity.stage.stuckHoursYellow) {
      // Not yet stuck
      return
    }

    const notifyUserId = opportunity.assignedUserId ?? opportunity.branch.branchManagerId
    if (!notifyUserId) return

    const contactName =
      `${opportunity.contact.firstName}${opportunity.contact.lastName ? ' ' + opportunity.contact.lastName : ''}`.trim()
    const hoursFormatted = Math.round(hoursInStage)
    const isRed = hoursInStage >= opportunity.stage.stuckHoursRed

    await prisma.crm_notification.create({
      data: {
        tenantId,
        userId: notifyUserId,
        type: 'STUCK_LEAD',
        title: `Lead stuck in ${opportunity.stage.name}`,
        body: `${contactName} has been in ${opportunity.stage.name} for ${hoursFormatted} hours${isRed ? ' — URGENT' : ''}`,
        link: `/crm/contacts/${opportunity.contactId}`,
      },
    })

    console.log(`[reminderWorker] Reminder sent for opportunity ${opportunityId}`)
  },
  {
    connection: redisConnection,
    concurrency: 5,
  },
)

reminderWorker.on('completed', (job) => {
  console.log(`[reminderWorker] Job ${job.id} (${job.name}) completed`)
})

reminderWorker.on('failed', (job, err) => {
  console.error(`[reminderWorker] Job ${job?.id} failed:`, err.message)
})

// ─── Schedule the hourly scan ─────────────────────────────────────────────────

export async function scheduleReminderScan(): Promise<void> {
  await reminderQueue.add(
    SCAN_JOB_NAME,
    // ReminderJobData fields are not needed for the scan job but the type requires them
    { opportunityId: 'scan', tenantId: 'all', branchId: 'all' },
    {
      repeat: { every: 3_600_000 }, // every 1 hour
      jobId: 'crm-reminder-hourly-scan',
    },
  )
  console.log('[reminderWorker] Hourly scan repeatable job scheduled')
}

export default reminderWorker
