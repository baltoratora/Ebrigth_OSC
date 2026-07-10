/**
 * Stale-lead Worker — crm.stale_lead BullMQ worker.
 *
 * Repeatable hourly scan that auto-progresses unresponsive leads down the
 * funnel: FU3 → UR_W1 → UR_W2 → UR_W3 → CL after 7 days of inactivity at
 * each step. The actual move logic lives in lib/crm/stale-leads.ts so it
 * can also be triggered from the HTTP cron endpoint at
 * /api/crm/cron/move-stale-leads (useful for staging where Redis isn't
 * available, and for manual one-off runs).
 */

import { Worker } from 'bullmq'
import { redisConnection, staleLeadQueue } from '@/lib/crm/queue'
import { moveStaleLeads } from '@/lib/crm/stale-leads'

const SCAN_JOB_NAME = 'crm.stale_lead.scan'

export const staleLeadWorker = new Worker(
  'crm.stale_lead',
  async (job) => {
    if (job.name !== SCAN_JOB_NAME) {
      console.warn(`[staleLeadWorker] Ignoring unexpected job ${job.name}`)
      return
    }
    const result = await moveStaleLeads()
    console.log(
      `[staleLeadWorker] Scan complete. Total moved: ${result.totalMoved}`,
      result.steps,
    )
    return result
  },
  {
    connection: redisConnection,
    concurrency: 1, // single-instance scan; no point parallelizing
  },
)

staleLeadWorker.on('completed', (job) => {
  console.log(`[staleLeadWorker] Job ${job.id} (${job.name}) completed`)
})

staleLeadWorker.on('failed', (job, err) => {
  console.error(`[staleLeadWorker] Job ${job?.id} failed:`, err.message)
})

/**
 * Register a repeatable hourly scan. Idempotent because BullMQ keys the
 * repeatable schedule on `jobId` — duplicate calls overwrite the existing
 * schedule with the same one.
 */
export async function scheduleStaleLeadScan(): Promise<void> {
  await staleLeadQueue.add(
    SCAN_JOB_NAME,
    {},
    {
      repeat: { every: 3_600_000 }, // every 1 hour
      jobId: 'crm-stale-lead-hourly-scan',
    },
  )
  console.log('[staleLeadWorker] Hourly stale-lead scan scheduled')
}

export default staleLeadWorker
