/**
 * BullMQ queue definitions and producer helpers for the CRM module.
 *
 * All queues share a single Redis connection. Import the specific queue and
 * enqueue* helpers from this module — never instantiate queues inline.
 *
 * Workers live in server/workers/ and are started via `npm run worker`.
 */

import { Queue, type JobsOptions } from 'bullmq'
import Redis from 'ioredis'

// ─── Redis connection ─────────────────────────────────────────────────────────
// `maxRetriesPerRequest: null` is required by BullMQ so it uses block-wait
// commands without timing out on the connection level.

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379'

// Singleton pattern so we don't exhaust connections in development hot-reloads.
const globalForRedis = global as unknown as { crmRedis: Redis }

const connection: Redis =
  globalForRedis.crmRedis ??
  new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,            // don't connect at import time
    connectTimeout: 1000,         // fail fast if Redis isn't running
    // On any connection error, emit a warn and stop retrying instead of hanging forever.
    retryStrategy(times) {
      if (times > 3) return null // give up after 3 tries
      return Math.min(times * 200, 2000)
    },
  })

// Swallow connection errors so they don't crash the process in dev-mode when
// Redis isn't running. The queue wrappers (`withQueueTimeout`) handle fallbacks.
connection.on('error', (err) => {
  if (process.env.NODE_ENV !== 'production') {
    // Only warn once to avoid spamming
    const g = global as unknown as { crmRedisErrorLogged?: boolean }
    if (!g.crmRedisErrorLogged) {
      console.warn('[queue] Redis unreachable — background jobs disabled:', err.message)
      g.crmRedisErrorLogged = true
    }
  }
})

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.crmRedis = connection
}

// ─── Shared queue defaults ────────────────────────────────────────────────────

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5_000, // 5 s initial delay
  },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 1_000 },
}

function makeQueue(name: string): Queue {
  return new Queue(name, {
    connection,
    defaultJobOptions,
  })
}

// ─── Queue definitions ────────────────────────────────────────────────────────

/** Trigger and advance automation workflows. */
export const automationQueue: Queue = makeQueue('crm.automation')

/** Deliver outbound messages (email / WhatsApp / SMS). */
export const messageSenderQueue: Queue = makeQueue('crm.message_sender')

/** Fire follow-up reminders for stalled opportunities. */
export const reminderQueue: Queue = makeQueue('crm.reminder')

/** Sync data with external integrations (Meta, TikTok, Wix, etc.). */
export const integrationSyncQueue: Queue = makeQueue('crm.integration_sync')

/** Send daily / weekly digest emails to branch managers. */
export const digestQueue: Queue = makeQueue('crm.digest')

/** Send ticket status notification emails (Resend). */
export const ticketEmailQueue: Queue = makeQueue('tkt.email_sender')

/** Cron: find stale received tickets and alert platform admins. */
export const staleTicketQueue: Queue = makeQueue('tkt.stale_reminder')

/** Cron: auto-progress unresponsive leads (FU3 → UR_W1 → UR_W2 → UR_W3 → CL). */
export const staleLeadQueue: Queue = makeQueue('crm.stale_lead')

// ─── Typed job data interfaces ────────────────────────────────────────────────

export interface AutomationJobData {
  automationId: string
  contactId: string
  tenantId: string
  triggeredBy: string
  triggerPayload?: unknown
}

export interface MessageSenderJobData {
  /** crm_message.id — worker reads the full record from DB. */
  messageId: string
  tenantId: string
  branchId: string
}

export interface ReminderJobData {
  opportunityId: string
  tenantId: string
  branchId: string
}

export interface IntegrationSyncJobData {
  integrationId: string
  tenantId: string
  branchId: string
  /** Optional cursor / page token for incremental syncs. */
  cursor?: string
}

export interface DigestJobData {
  tenantId: string
  branchId: string
  /** 'daily' | 'weekly' */
  frequency: 'daily' | 'weekly'
}

// ─── Producer helpers ─────────────────────────────────────────────────────────

/**
 * Race a promise against a timeout. If `ms` passes without the queue
 * responding (Redis unreachable), we resolve instead of throwing so that
 * critical request flows aren't blocked by background job infrastructure.
 */
async function withQueueTimeout<T>(label: string, p: Promise<T>, ms = 1500): Promise<void> {
  try {
    await Promise.race([
      p,
      new Promise<void>((resolve) =>
        setTimeout(() => {
          console.warn(`[queue] ${label} timed out after ${ms}ms — Redis likely unreachable, continuing.`)
          resolve()
        }, ms),
      ),
    ])
  } catch (err) {
    console.warn(`[queue] ${label} rejected:`, (err as Error).message)
  }
}

/**
 * Enqueue an automation trigger.
 * The worker picks up `AutomationJobData` and walks the automation graph.
 */
export async function enqueueAutomation(data: AutomationJobData): Promise<void> {
  await withQueueTimeout(
    'enqueueAutomation',
    automationQueue.add(
      `automation:${data.automationId}:${data.contactId}`,
      data,
      { jobId: `auto-${data.automationId}-${data.contactId}-${Date.now()}` },
    ),
  )
}

/**
 * Enqueue an outbound message for delivery.
 * The worker reads the crm_message record by `messageId` and dispatches via
 * the appropriate channel (Resend for email, Meta Cloud API for WhatsApp, etc.).
 */
export async function enqueueMessage(data: MessageSenderJobData): Promise<void> {
  await withQueueTimeout(
    'enqueueMessage',
    messageSenderQueue.add(
      `message:${data.messageId}`,
      data,
      {
        jobId: `msg-${data.messageId}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2_000 },
      },
    ),
  )
}

/**
 * Enqueue a reminder check for a specific opportunity.
 */
export async function enqueueReminder(data: ReminderJobData): Promise<void> {
  await withQueueTimeout(
    'enqueueReminder',
    reminderQueue.add(
      `reminder:${data.opportunityId}`,
      data,
      { jobId: `reminder-${data.opportunityId}` },
    ),
  )
}

/**
 * Enqueue an integration sync job.
 */
export async function enqueueIntegrationSync(data: IntegrationSyncJobData): Promise<void> {
  await withQueueTimeout(
    'enqueueIntegrationSync',
    integrationSyncQueue.add(
      `sync:${data.integrationId}`,
      data,
      { jobId: `sync-${data.integrationId}` },
    ),
  )
}

export interface TicketEmailJobData {
  ticketId: string
  tenantId: string
  /** "created" | "in_progress" | "complete" | "rejected" | "assigned" */
  event: string
  recipientUserId: string
}

export interface StaleTicketJobData {
  tenantId: string
  /** Threshold in hours; default 48 */
  thresholdHours?: number
}

export async function enqueueTicketEmail(data: TicketEmailJobData): Promise<void> {
  await withQueueTimeout(
    'enqueueTicketEmail',
    ticketEmailQueue.add(
      `tkt-email:${data.ticketId}:${data.event}`,
      data,
      { jobId: `tkt-email-${data.ticketId}-${data.event}-${Date.now()}`, attempts: 5, backoff: { type: 'exponential', delay: 2_000 } },
    ),
  )
}

/**
 * Expose the shared Redis connection for use by workers that need it
 * (e.g. QueueEvents, Worker constructor).
 */
export { connection as redisConnection }
