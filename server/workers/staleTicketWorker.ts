/**
 * Stale Ticket Worker — tkt.stale_reminder BullMQ worker.
 *
 * Runs hourly (repeatable cron: '0 * * * *') to find tickets that have been
 * in "received" status beyond a configurable threshold (default 48 hours).
 *
 * For each stale ticket:
 *  - Creates crm_notification records for platform admins managing that platform
 *  - Enqueues ticketEmail jobs for admins with email_notifications=true
 *  - Writes a core_audit_log entry
 */

import { Worker } from 'bullmq'
import {
  redisConnection,
  staleTicketQueue,
  ticketEmailQueue,
  type StaleTicketJobData,
} from '@/lib/crm/queue'
import { prisma } from '@/lib/crm/db'
import { logAudit } from '@/lib/crm/audit'

const STALE_JOB_NAME = 'tkt.stale_reminder.scan'
const DEFAULT_THRESHOLD_HOURS = 48

// ─── Worker ───────────────────────────────────────────────────────────────────

export const staleTicketWorker = new Worker<StaleTicketJobData>(
  'tkt.stale_reminder',
  async (job) => {
    const { tenantId, thresholdHours = DEFAULT_THRESHOLD_HOURS } = job.data

    const thresholdDate = new Date(
      Date.now() - thresholdHours * 60 * 60 * 1000,
    )

    // 1. Find stale tickets: status='received' AND created before threshold
    const staleTickets = await prisma.tkt_ticket.findMany({
      where: {
        tenant_id: tenantId,
        status: 'received',
        created_at: { lt: thresholdDate },
      },
      include: {
        platform: {
          select: {
            id: true,
            name: true,
            accent_color: true,
            user_platforms: {
              select: { user_id: true },
            },
          },
        },
        branch: { select: { name: true } },
      },
    })

    if (staleTickets.length === 0) {
      console.log(
        `[staleTicketWorker] No stale tickets found for tenant ${tenantId} (threshold: ${thresholdHours}h)`,
      )
      return
    }

    console.log(
      `[staleTicketWorker] Found ${staleTickets.length} stale ticket(s) for tenant ${tenantId}`,
    )

    let notificationsCreated = 0
    let emailsEnqueued = 0

    for (const ticket of staleTickets) {
      // 2. Collect platform admin user_ids for this ticket's platform
      const adminUserIds = ticket.platform.user_platforms.map((up) => up.user_id)

      if (adminUserIds.length === 0) {
        console.log(
          `[staleTicketWorker] No admins found for platform ${ticket.platform.id} — skipping ticket ${ticket.ticket_number}`,
        )
        continue
      }

      // Load user profiles for each admin to check email_notifications
      const adminProfiles = await prisma.tkt_user_profile.findMany({
        where: {
          user_id: { in: adminUserIds },
          role: { in: ['platform_admin', 'super_admin'] },
        },
        select: {
          user_id: true,
          email_notifications: true,
        },
      })

      for (const adminProfile of adminProfiles) {
        // 3a. Create crm_notification
        try {
          await prisma.crm_notification.create({
            data: {
              tenantId,
              userId: adminProfile.user_id,
              type: 'stale_ticket',
              title: `Stale Ticket: ${ticket.ticket_number}`,
              body: `Ticket ${ticket.ticket_number} (${ticket.platform.name} / ${ticket.branch.name}) has been in "Received" status for over ${thresholdHours} hours.`,
              link: `/crm/tickets/${ticket.id}`,
            },
          })
          notificationsCreated++
        } catch (err) {
          console.error(
            `[staleTicketWorker] Failed to create notification for user ${adminProfile.user_id}:`,
            err,
          )
        }

        // 3b. Enqueue ticketEmail if email_notifications is enabled
        if (adminProfile.email_notifications) {
          try {
            await ticketEmailQueue.add(
              `tkt-stale:${ticket.id}:${adminProfile.user_id}`,
              {
                ticketId: ticket.id,
                tenantId,
                event: 'stale_reminder',
                recipientUserId: adminProfile.user_id,
              },
              {
                jobId: `tkt-stale-${ticket.id}-${adminProfile.user_id}-${Date.now()}`,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5_000 },
              },
            )
            emailsEnqueued++
          } catch (err) {
            console.error(
              `[staleTicketWorker] Failed to enqueue email for user ${adminProfile.user_id}:`,
              err,
            )
          }
        }
      }
    }

    // 4. Audit log
    void logAudit({
      tenantId,
      action: 'READ',
      entity: 'tkt_ticket',
      meta: {
        job: 'stale_ticket_scan',
        staleTickets: staleTickets.length,
        thresholdHours,
        notificationsCreated,
        emailsEnqueued,
      },
    })

    console.log(
      `[staleTicketWorker] Scan complete — ${staleTickets.length} stale, ${notificationsCreated} notifications, ${emailsEnqueued} emails enqueued`,
    )
  },
  {
    connection: redisConnection,
    concurrency: 2,
  },
)

staleTicketWorker.on('completed', (job) => {
  console.log(`[staleTicketWorker] Job ${job.id} (${job.name}) completed`)
})

staleTicketWorker.on('failed', (job, err) => {
  console.error(`[staleTicketWorker] Job ${job?.id} failed:`, err.message)
})

// ─── Start helper ─────────────────────────────────────────────────────────────

export async function startStaleTicketWorker(): Promise<void> {
  // Register the repeatable cron job: every hour at minute 0
  await staleTicketQueue.add(
    STALE_JOB_NAME,
    // tenantId 'all' is a sentinel — the worker will be called once per tenant
    // In production you may replace this with per-tenant job fan-out
    { tenantId: 'all', thresholdHours: DEFAULT_THRESHOLD_HOURS },
    {
      repeat: { pattern: '0 * * * *' },
      jobId: 'tkt-stale-hourly-scan',
    },
  )
  console.log('[staleTicketWorker] Started (tkt.stale_reminder) — hourly cron scheduled')
}

export default staleTicketWorker
