/**
 * Workers entry point.
 *
 * Starts all background workers and sets up repeatable scheduled jobs.
 * Run via: npm run worker  (i.e. tsx server/workers/index.ts)
 *
 * Two classes of worker live here:
 *
 *   1. BullMQ-backed workers (need Redis)
 *      automation, messageSender, reminder, digest, ticketEmail, staleTicket
 *
 *   2. Pg-LISTEN-backed worker (does NOT need Redis)
 *      leadIngest — listens on ebrightleads_db.lead_inserted notifications.
 *
 * If Redis is unreachable we PROBE once and skip the BullMQ imports entirely.
 * Their internal connection pools spawn dozens of reconnect loops we can't
 * silence with normal error handlers — the only way to keep the log clean
 * (and the process alive) is to never instantiate them in the first place.
 */

import Redis from 'ioredis'

// Probe Redis once with fast-fail settings. If we can connect, we keep the
// connection open and reuse it via the singleton in lib/crm/queue.ts; if not
// we close it and skip every BullMQ worker.
async function probeRedis(): Promise<boolean> {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379'
  const probe = new Redis(url, {
    maxRetriesPerRequest: 0,
    enableReadyCheck: false,
    lazyConnect: true,
    connectTimeout: 1000,
    retryStrategy: () => null, // never retry — we want a single yes/no
  })
  // Attach a no-op error listener BEFORE connect to suppress the
  // "[ioredis] Unhandled error event" warning ioredis emits otherwise.
  probe.on('error', () => {})
  try {
    await probe.connect()
    await probe.ping()
    await probe.quit()
    return true
  } catch {
    try { probe.disconnect() } catch { /* ignore */ }
    return false
  }
}

async function main() {
  console.log('[workers] Starting CRM workers...')

  const redisUp = await probeRedis()

  if (redisUp) {
    console.log('[workers] Redis OK — starting BullMQ-backed workers')

    // Dynamic imports so worker modules (which create their own Redis
    // connections at module load) are only ever loaded when Redis is reachable.
    const [
      { automationWorker },
      { messageSenderWorker },
      { reminderWorker, scheduleReminderScan },
      { digestWorker, scheduleDigest },
      { ticketEmailWorker, startTicketEmailWorker },
      { staleTicketWorker, startStaleTicketWorker },
      { staleLeadWorker, scheduleStaleLeadScan },
    ] = await Promise.all([
      import('./automationWorker'),
      import('./messageSenderWorker'),
      import('./reminderWorker'),
      import('./digestWorker'),
      import('./ticketEmailWorker'),
      import('./staleTicketWorker'),
      import('./staleLeadWorker'),
    ])

    const bullWorkers = [
      automationWorker,
      messageSenderWorker,
      reminderWorker,
      digestWorker,
      ticketEmailWorker,
      staleTicketWorker,
      staleLeadWorker,
    ]

    // Per-worker error swallow — BullMQ emits 'error' for transient connection
    // blips even when Redis is up. We log once and let it self-heal.
    let workerErrorLogged = false
    for (const w of bullWorkers) {
      w.on('error', (err) => {
        if (!workerErrorLogged) {
          console.warn('[workers] BullMQ worker error:', err.message)
          workerErrorLogged = true
        }
      })
    }

    await scheduleReminderScan()
    await scheduleDigest()
    startTicketEmailWorker()
    await startStaleTicketWorker()
    await scheduleStaleLeadScan()

    // Wire the leadIngest worker's automation enqueuer to BullMQ.
    // Imported here (inside the Redis-up branch) so queue.ts is never loaded
    // when Redis is down — its constructors would otherwise spam reconnect logs.
    const [{ enqueueAutomation }, { setAutomationEnqueuer }] = await Promise.all([
      import('@/lib/crm/queue'),
      import('./leadIngestWorker'),
    ])
    setAutomationEnqueuer(enqueueAutomation)

    // Stash the workers + cleanup hook for SIGTERM handler.
    setShutdownHook(async () => {
      await Promise.allSettled(bullWorkers.map((w) => w.close()))
    })

    console.log('  - automationWorker    (crm.automation)')
    console.log('  - messageSenderWorker (crm.message_sender)')
    console.log('  - reminderWorker      (crm.reminder) — hourly scan')
    console.log('  - digestWorker        (crm.digest)   — daily at 08:00 KL')
    console.log('  - ticketEmailWorker   (tkt.email_sender)')
    console.log('  - staleTicketWorker   (tkt.stale_reminder) — hourly scan')
    console.log('  - staleLeadWorker     (crm.stale_lead)     — hourly scan, FU3→URW1→URW2→URW3→CL')
  } else {
    console.warn('[workers] Redis unreachable — BullMQ-backed workers DISABLED')
    console.warn('[workers] (automation/messages/reminders/digest/ticket-email)')
    console.warn('[workers] Install Redis or run `docker run -d -p 6379:6379 redis:7` to enable them.')
  }

  // Always start the lead-ingest worker — it uses Postgres LISTEN/NOTIFY,
  // not Redis. Dynamic import so it's only loaded after the redis probe.
  const { startLeadIngestWorker, stopLeadIngestWorker } = await import('./leadIngestWorker')
  await startLeadIngestWorker()
  setShutdownHook(stopLeadIngestWorker, true)

  console.log('  - leadIngestWorker    (LISTEN ebrightleads_db.lead_inserted)')

  // Always start the burnlist Wednesday scheduler — runs in-process, no
  // Redis required. Wakes every minute and creates the new BurnlistWeek
  // snapshot the moment the calendar crosses into a new Wednesday.
  const { startBurnlistScheduler, stopBurnlistScheduler } = await import('./burnlistScheduler')
  await startBurnlistScheduler()
  setShutdownHook(stopBurnlistScheduler, true)

  console.log('  - burnlistScheduler   (Wednesday 00:00 snapshot rollover)')

  // Always start the ticket-digest scheduler — also Redis-free. Fires at
  // 12:00 / 15:00 / 18:00 / 21:00 KL each day and emails each ticket
  // submitter a digest of their tickets created in that window.
  const { startTicketDigestScheduler, stopTicketDigestScheduler } =
    await import('./ticketDigestScheduler')
  await startTicketDigestScheduler()
  setShutdownHook(stopTicketDigestScheduler, true)

  console.log('  - ticketDigest        (12/15/18/21 KL submitter digest)')
  console.log('[workers] Startup complete.')
}

// ─── Shutdown plumbing ────────────────────────────────────────────────────────

const shutdownHooks: Array<() => Promise<void>> = []
function setShutdownHook(fn: () => Promise<void>, append = false) {
  if (append) shutdownHooks.push(fn)
  else shutdownHooks.unshift(fn)
}

async function shutdown(signal: string) {
  console.log(`\n[workers] Received ${signal} — shutting down gracefully...`)
  await Promise.allSettled(shutdownHooks.map((fn) => fn()))
  console.log('[workers] All workers closed. Exiting.')
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

// ─── Last-resort process-level guards ─────────────────────────────────────────
// Even with the probe-then-import approach, a transient Redis blip after
// startup could surface as an unhandled error. Catch and log once instead of
// crashing the whole process.

process.on('unhandledRejection', (reason) => {
  console.warn('[workers] Unhandled rejection (suppressed):', (reason as Error)?.message ?? String(reason))
})

process.on('uncaughtException', (err) => {
  console.error('[workers] Uncaught exception:', err.message)
})

main().catch((err) => {
  console.error('[workers] Fatal startup error:', err)
  process.exit(1)
})
