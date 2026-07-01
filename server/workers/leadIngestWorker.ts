/**
 * Lead-ingest worker.
 *
 * Listens on `lead_inserted` notifications from ebrightleads_db (Postgres
 * LISTEN/NOTIFY). On each notification, reads the new row from the
 * `master_leads_unified` view and imports it into the CRM via the shared
 * importer in lib/crm/leads-import.ts.
 *
 * Architecture:
 *
 *   ebrightleads_db                       ebright_crm
 *   ────────────────                      ────────────
 *   meta_leads      ─┐
 *   social_posts     ├─ AFTER INSERT TRIGGER → pg_notify('lead_inserted')
 *   raw_wix_leads   ─┘                                    │
 *                                                         ▼
 *                                              ┌──────────────────────┐
 *                                              │  this worker         │
 *                                              │   - LISTEN connection│
 *                                              │   - polling backstop │
 *                                              └──────────┬───────────┘
 *                                                         ▼
 *                                              importLead() in shared
 *                                              lib/crm/leads-import.ts
 *                                                         │
 *                                                         ▼
 *                                              crm_contact + crm_opportunity
 *
 * Two layers of resilience:
 *   1. LISTEN — sub-second realtime in the steady state
 *   2. Polling backstop — one query on startup catching anything that arrived
 *      while the worker was down. Uses the `MAX(crm_contact.createdAt)` of
 *      previously-ingested rows as the watermark, so it never re-processes
 *      old data even on a fresh deploy.
 *
 * If LEADS_DB_URL is not set, the worker logs a warning and disables itself —
 * useful for environments that don't have the leads DB linked yet.
 */

import { Client as PgClient } from 'pg'
import { prisma } from '@/lib/crm/db'
import {
  importLead,
  makeEmptyCaches,
  type ImportCaches,
  type ImportResult,
  type UnifiedLeadRow,
} from '@/lib/crm/leads-import'

// Set by index.ts after the Redis probe. When false the worker still ingests
// leads but skips firing NEW_LEAD automations (which would need BullMQ).
let enqueueAutomation: ((data: {
  automationId: string
  contactId: string
  tenantId: string
  triggeredBy: string
  triggerPayload?: unknown
}) => Promise<void>) | null = null

export function setAutomationEnqueuer(
  fn: typeof enqueueAutomation,
): void {
  enqueueAutomation = fn
}

// ─── Config ───────────────────────────────────────────────────────────────────

const LEADS_DB_URL    = process.env.LEADS_DB_URL
const TENANT_SLUG     = process.env.LEADS_TENANT_SLUG ?? 'ebright'
const NOTIFY_CHANNEL  = 'lead_inserted'
const RECONNECT_DELAY = 5_000  // ms — base delay; doubles per failure up to 60s
const MAX_RECONNECT   = 60_000
// Periodic re-run of the backstop so we self-heal from dropped notifications.
// Default 5 min — short enough that operations don't notice a missing lead,
// long enough to avoid wasted DB queries when nothing's new.
const BACKSTOP_INTERVAL_MS = 5 * 60_000

// ─── State ────────────────────────────────────────────────────────────────────

let client: PgClient | null = null
let reconnectAttempts        = 0
let reconnectTimer: NodeJS.Timeout | null = null
let backstopTimer: NodeJS.Timeout | null  = null
let stopping                 = false
let tenantId: string | null  = null
const caches: ImportCaches   = makeEmptyCaches()

// ─── Tenant resolution ────────────────────────────────────────────────────────

async function resolveTenantId(): Promise<string | null> {
  if (tenantId) return tenantId
  const tenant = await prisma.crm_tenant.findUnique({
    where: { slug: TENANT_SLUG },
    select: { id: true },
  })
  if (!tenant) {
    console.error(
      `[leadIngest] No tenant with slug="${TENANT_SLUG}". Set LEADS_TENANT_SLUG or seed first.`,
    )
    return null
  }
  tenantId = tenant.id
  return tenantId
}

// ─── Single-row import path ───────────────────────────────────────────────────

/**
 * Fetch all unified-view rows that came from one source row. For
 * master_leads_base submissions with N children, the view emits N rows
 * (source_id = "<base_id>#1", "<base_id>#2", …) — we want every one of them
 * so each child becomes its own contact.
 *
 * The trigger emits "<table>:<base_id>" without the "#idx" suffix, so we
 * match the view's source_id with a LIKE prefix.
 */
async function fetchUnifiedRows(
  pg: PgClient,
  sourceTable: string,
  sourceId: string,
): Promise<UnifiedLeadRow[]> {
  const res = await pg.query<UnifiedLeadRow>(
    `SELECT source_table, source_id, lead_source, full_name, phone, email,
            clean_branch, region, submitted_at, children_details, sibling_index,
            campaign_name
       FROM public.master_leads_unified
      WHERE source_table = $1
        AND (source_id = $2 OR source_id LIKE $2 || '#%')
      ORDER BY sibling_index ASC NULLS FIRST`,
    [sourceTable, sourceId],
  )
  return res.rows
}

async function processNotification(payload: string, pg: PgClient): Promise<void> {
  // Payload format: "<table>:<id>"
  const [sourceTable, sourceId] = payload.split(':')
  if (!sourceTable || !sourceId) {
    console.warn(`[leadIngest] Malformed payload: "${payload}"`)
    return
  }

  const tid = await resolveTenantId()
  if (!tid) return

  const rows = await fetchUnifiedRows(pg, sourceTable, sourceId)
  if (rows.length === 0) {
    // Row exists in source table but not in unified view (e.g. wrong platform
    // filter on social_posts, or the WHERE clauses excluded it). Not an error.
    console.log(`[leadIngest] No unified row for ${payload} — skipping`)
    return
  }

  for (const row of rows) {
    const label = `${row.source_table}:${row.source_id}`
    let result: ImportResult
    try {
      result = await importLead(prisma, { tenantId: tid }, row, caches, {
        enqueueAutomation: enqueueAutomation ?? undefined,
      })
    } catch (e) {
      console.error(`[leadIngest] importLead threw for ${label}:`, (e as Error).message)
      continue
    }
    logResult(label, result)
  }
}

function logResult(label: string, result: ImportResult): void {
  switch (result.status) {
    case 'created':
      console.log(`[leadIngest] ✓ ${label} → contact ${result.contactId} on branch ${result.branchId}`)
      break
    case 'duplicate':
      // Common during polling-backstop overlap with LISTEN — debug, not warn.
      console.log(`[leadIngest] = ${label} already imported`)
      break
    case 'no_branch':
      console.warn(`[leadIngest] ✗ ${label} ${result.reason}`)
      break
    case 'no_pipeline':
    case 'no_pii':
      console.warn(`[leadIngest] ⊘ ${label} ${result.reason}`)
      break
  }
}

// ─── Polling backstop ─────────────────────────────────────────────────────────
// Runs ONCE on connect. Catches anything inserted while the worker was down
// (deploy, crash, network blip). Uses the highest createdAt on already-ingested
// contacts as the watermark, so a fresh deploy doesn't re-process old data.

async function runBackstop(pg: PgClient): Promise<void> {
  const tid = await resolveTenantId()
  if (!tid) return

  const since = await prisma.crm_contact.findFirst({
    where: { tenantId: tid, externalSourceTable: { not: null } },
    select: { createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  // No prior ingest → don't pull every historical row. Either run the seed
  // first, or set the watermark to "now" so only fresh inserts get picked up.
  const watermark = since ? new Date(since.createdAt.getTime() + 1) : new Date()

  const res = await pg.query<UnifiedLeadRow>(
    `SELECT source_table, source_id, lead_source, full_name, phone, email,
            clean_branch, region, submitted_at, children_details, sibling_index,
            campaign_name
       FROM public.master_leads_unified
      WHERE submitted_at > $1
      ORDER BY submitted_at ASC, sibling_index ASC NULLS FIRST`,
    [watermark],
  )

  if (res.rows.length === 0) {
    console.log(`[leadIngest] Backstop: no rows since ${watermark.toISOString()}`)
    return
  }

  console.log(`[leadIngest] Backstop: ${res.rows.length} row(s) since ${watermark.toISOString()}`)
  let created = 0, dup = 0, skipped = 0
  for (const row of res.rows) {
    try {
      const r = await importLead(prisma, { tenantId: tid }, row, caches, {
        enqueueAutomation: enqueueAutomation ?? undefined,
      })
      if (r.status === 'created') created++
      else if (r.status === 'duplicate') dup++
      else skipped++
    } catch (e) {
      console.error(
        `[leadIngest] Backstop import failed for ${row.source_table}:${row.source_id}:`,
        (e as Error).message,
      )
      skipped++
    }
  }
  console.log(`[leadIngest] Backstop done: ${created} created, ${dup} dup, ${skipped} skipped`)
}

// ─── Connection + reconnect ───────────────────────────────────────────────────

async function connectAndListen(): Promise<void> {
  if (stopping) return
  if (!LEADS_DB_URL) return

  const pg = new PgClient({ connectionString: LEADS_DB_URL })
  client = pg

  pg.on('error', (err) => {
    console.error('[leadIngest] Postgres connection error:', err.message)
    void scheduleReconnect()
  })

  pg.on('notification', (msg) => {
    if (msg.channel !== NOTIFY_CHANNEL) return
    const payload = msg.payload ?? ''
    // Don't await — keep the listener responsive. processNotification handles
    // its own errors.
    void processNotification(payload, pg)
  })

  try {
    await pg.connect()
    await pg.query(`LISTEN ${NOTIFY_CHANNEL}`)
    console.log(`[leadIngest] Connected to leads DB, LISTENing on "${NOTIFY_CHANNEL}"`)
    reconnectAttempts = 0

    // Backstop runs after LISTEN is registered so any race-window inserts are
    // caught either by LISTEN or by the watermark query — never lost.
    await runBackstop(pg)

    // Periodic backstop: re-runs the watermark query on a loop so dropped
    // notifications (silent LISTEN connection drops, full notify queue, etc.)
    // self-heal within BACKSTOP_INTERVAL_MS instead of waiting for the next
    // worker restart. Idempotent — already-imported rows hit the unique
    // constraint and are counted as `dup`.
    if (backstopTimer) clearInterval(backstopTimer)
    backstopTimer = setInterval(() => {
      // Don't await — let it run in the background; runBackstop handles its
      // own errors.
      void runBackstop(pg).catch((e) => {
        console.error('[leadIngest] Periodic backstop failed:', (e as Error).message)
      })
    }, BACKSTOP_INTERVAL_MS)
  } catch (e) {
    console.error('[leadIngest] Connect failed:', (e as Error).message)
    void scheduleReconnect()
  }
}

function scheduleReconnect(): void {
  if (stopping) return
  if (reconnectTimer) return  // already pending

  // Stop the periodic backstop while the connection is down — it'd just
  // throw on every tick. We restart it after connectAndListen succeeds.
  if (backstopTimer) {
    clearInterval(backstopTimer)
    backstopTimer = null
  }

  if (client) {
    try { void client.end() } catch { /* ignore */ }
    client = null
  }

  reconnectAttempts++
  const delay = Math.min(RECONNECT_DELAY * 2 ** (reconnectAttempts - 1), MAX_RECONNECT)
  console.warn(`[leadIngest] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`)

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void connectAndListen()
  }, delay)
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Start the lead-ingest worker. Called from server/workers/index.ts.
 * No-op if LEADS_DB_URL is unset (so dev environments without the link still boot).
 */
export async function startLeadIngestWorker(): Promise<void> {
  if (!LEADS_DB_URL) {
    console.warn('[leadIngest] LEADS_DB_URL not set — lead-ingest worker disabled')
    return
  }
  await connectAndListen()
}

/** Graceful shutdown for the workers/index.ts SIGTERM handler. */
export async function stopLeadIngestWorker(): Promise<void> {
  stopping = true
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (backstopTimer) {
    clearInterval(backstopTimer)
    backstopTimer = null
  }
  if (client) {
    try { await client.end() } catch { /* ignore */ }
    client = null
  }
}
