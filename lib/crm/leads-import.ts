/**
 * Shared lead-ingest logic.
 *
 * Used by both:
 *   - prisma/seed-from-powerbi.ts (one-shot bulk import)
 *   - server/workers/leadIngestWorker.ts (LISTEN/NOTIFY realtime + polling backstop)
 *
 * Takes one row from the `public.master_leads_unified` view in ebrightleads_db
 * and either creates a new crm_contact + crm_opportunity, or returns a status
 * explaining why it skipped.
 *
 * Idempotency: relies on the @@unique([tenantId, externalSourceTable,
 * externalSourceId]) constraint. A duplicate insert is caught and turned into
 * `{ status: 'duplicate' }` instead of throwing — so the polling backstop
 * can overlap with LISTEN events without breaking.
 */

import type { PrismaClient } from '@prisma/client'
import { Prisma } from '@prisma/client'
import { normalizePhone, phoneSearchDigits } from './utils'
import { createLeadNotifications } from './notifications'

// Importing './queue' transitively pulls in BullMQ + ioredis, which try to
// connect at module load. When Redis is unreachable the leadIngest worker
// must still boot — so we accept enqueueAutomation as an injected callback
// instead, and let the caller decide whether the Redis path is available.
type EnqueueAutomationFn = (data: {
  automationId: string
  contactId: string
  tenantId: string
  triggeredBy: string
  triggerPayload?: unknown
}) => Promise<void>

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Shape of one row from `public.master_leads_unified`. The view yields a
 * single nullable schema across Meta / TikTok / Wix submissions.
 */
export interface UnifiedLeadRow {
  source_table: string          // 'meta_leads' | 'social_posts' | 'raw_wix_leads'
  source_id: string             // PK of the source row, stringified.
                                // For Wix: composite "<uuid>#<sibling_idx>" so each child
                                // gets its own idempotency key.
  lead_source: string | null    // 'Meta' | 'TikTok' | 'Wix' | 'Website' | …
  full_name: string | null      // parent's name; for Wix children we override below
                                // from children_details
  phone: string | null
  email: string | null
  clean_branch: string | null   // resolved via branch_mapping in the view
  region: string | null
  submitted_at: Date | null
  // Source of truth for child names + ages. Shape depends on the caller:
  //   - leadIngestWorker / seed-from-powerbi read this from a Postgres jsonb
  //     column via node-postgres, which AUTO-PARSES it into a JS array. So in
  //     the worker path, this is already WixChildEntry[].
  //   - One-shot CSV / Power-BI imports read it as a raw JSON string.
  // parseChildrenDetails() below normalises both shapes — never call
  // JSON.parse on this field directly.
  children_details: WixChildEntry[] | string | null
  sibling_index: number | null     // 1-based; >1 only for Wix multi-child submissions
  campaign_name: string | null     // marketing campaign label, stored verbatim; null when
                                   // the lead didn't come from a tracked campaign
}

export type ImportStatus =
  | 'created'           // contact + opportunity inserted
  | 'duplicate'         // already imported (same source row — unique constraint hit)
  | 'duplicate_contact' // a different source row for the SAME human (phone + name) already exists
  | 'no_branch'         // clean_branch couldn't be matched to any crm_branch
  | 'no_pipeline'       // matched branch has no pipeline (seed not run for it)
  | 'no_pii'            // row has no name/email/phone — not worth creating

export interface ImportResult {
  status: ImportStatus
  contactId?: string
  branchId?: string
  reason?: string
}

export interface TenantContext {
  tenantId: string
}

export interface ImportOptions {
  /**
   * Callback that enqueues a NEW_LEAD automation. Pass `enqueueAutomation`
   * from `lib/crm/queue` here when Redis is up; leave undefined to skip
   * automation firing (seed runs, dev environments without Redis).
   */
  enqueueAutomation?: EnqueueAutomationFn
  /**
   * Override the destination stage shortCode (default 'NL').
   * The seed uses this to preserve historical stage progression from
   * ghl_stages — e.g. a lead that already enrolled lands in 'ENR' rather
   * than 'NL'. The realtime worker leaves this unset, so brand-new
   * submissions always start in 'NL'.
   */
  stageShortCode?: string
  /**
   * When true, before creating a new contact we look for an existing,
   * non-deleted contact that represents the SAME human — matched on
   * phone-digit-core AND normalized name within a recent window — and skip
   * creation if found (`status: 'duplicate_contact'`).
   *
   * This catches the real-world duplicate the @@unique(sourceTable, sourceId)
   * key can't: upstream sources (roadshow website form re-taps, Meta webhook
   * re-delivery, form retries) emit MULTIPLE physical rows for one person, each
   * with a distinct source_id, so every one otherwise mints a fresh card.
   *
   * Sibling-safe by design: siblings share a parent phone but have DIFFERENT
   * names, so requiring the name to match too never merges them.
   *
   * OFF by default so the historical bulk seed (which sets stageShortCode and
   * legitimately imports many rows fast) is unaffected. The realtime
   * leadIngestWorker turns it ON.
   */
  dedupeByContact?: boolean
}

/** Days back to look for a same-human contact. Long enough to catch the
 *  minutes-to-days re-submission bursts we see in the data, short enough that a
 *  genuine re-inquiry months later still creates a fresh lead. */
const DEDUP_WINDOW_DAYS = 30

// ─── Caches ────────────────────────────────────────────────────────────────────
// Each call would otherwise do 4 DB lookups (branch, pipeline, NL stage, lead_source).
// For a 6M-row seed that's 24M extra queries. The caches live for the duration of
// one import run (one worker connection / one seed invocation) and are passed in
// explicitly so a long-running worker can reset them when branches are re-named.

export interface ImportCaches {
  /** clean_branch (lower-cased, trimmed) → branch.id */
  branchByCleanKey: Map<string, { id: string; tenantId: string }>
  /** branchId → pipelineId */
  pipelineByBranchId: Map<string, string>
  /** branchId → (NL stage shortCode) → stageId */
  stageByBranchByCode: Map<string, Map<string, string>>
  /** lead-source name (lower-cased) → lead_source.id */
  leadSourceByName: Map<string, string>
  /** Fallback branch for leads with no resolvable clean_branch.
   *  Cached as `null` once resolution fails so we don't re-query each row. */
  fallbackBranch?: { id: string; tenantId: string } | null
}

export function makeEmptyCaches(): ImportCaches {
  return {
    branchByCleanKey:    new Map(),
    pipelineByBranchId:  new Map(),
    stageByBranchByCode: new Map(),
    leadSourceByName:    new Map(),
  }
}

const FALLBACK_BRANCH_NAME = 'Ebright Marketing'

/**
 * Look up the catch-all branch every lead with no resolvable clean_branch
 * gets routed to. Cached per ImportCaches instance — checked once and
 * stored (including the negative result, so a missing Marketing branch
 * doesn't trigger 6M extra queries during a seed).
 */
async function resolveFallbackBranch(
  prisma: PrismaClient,
  tenantId: string,
  caches: ImportCaches,
): Promise<{ id: string; tenantId: string } | null> {
  if (caches.fallbackBranch !== undefined) return caches.fallbackBranch
  const branch = await prisma.crm_branch.findFirst({
    where:  { tenantId, name: FALLBACK_BRANCH_NAME },
    select: { id: true, tenantId: true },
  })
  caches.fallbackBranch = branch ?? null
  return caches.fallbackBranch
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function splitName(full: string | null): { firstName: string; lastName: string | null } {
  if (!full) return { firstName: 'Unknown', lastName: null }
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: 'Unknown', lastName: null }
  if (parts.length === 1) return { firstName: parts[0], lastName: null }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

interface WixChildEntry { name?: string | null; age?: string | null }

/**
 * Normalise `children_details` into a WixChildEntry[]. The field shows up in
 * two different shapes depending on the caller:
 *
 *   - node-postgres returns jsonb columns as already-parsed JS values, so the
 *     leadIngestWorker and seed-from-powerbi paths see an array here.
 *   - Some legacy / CSV import paths produce a raw JSON string instead.
 *
 * Calling JSON.parse on the pre-parsed array shape throws (it stringifies the
 * array to "[object Object],[object Object]" first and then fails to parse),
 * which used to silently fall through to the parent-name path — that's why
 * Naufal / Naura siblings were rendering as "Child 3" on the kanban even
 * though children_details clearly had their names.
 */
function parseChildrenDetails(value: unknown): WixChildEntry[] | null {
  if (value == null) return null
  if (Array.isArray(value)) return value as WixChildEntry[]
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    try {
      const parsed = JSON.parse(trimmed) as unknown
      return Array.isArray(parsed) ? (parsed as WixChildEntry[]) : null
    } catch {
      return null
    }
  }
  return null
}

/**
 * Pick the contact name for one row of master_leads_unified.
 *
 * For Wix multi-child submissions the view yields N rows per submission and
 * sets sibling_index = 1..N. We override the parent's full_name with the
 * i-th child's name from children_details so each kanban card shows the
 * actual student rather than the parent. Falls back to the parent's name if
 * children_details is missing/malformed/short.
 *
 * Returns both the chosen name (split into firstName/lastName) and the
 * sibling's age if we can extract it — caller stores the age in childAge1
 * so it can be surfaced in the lead detail modal.
 */
function pickContactName(row: UnifiedLeadRow): {
  firstName: string
  lastName: string | null
  childAge: string | null
  /**
   * Parent's full name when the contact represents a CHILD with a known
   * child name (i.e. children_details had a usable name entry at
   * sibling_index). Null in every other case — including sibling rows
   * whose children_details is missing/short/has no name. Those rows fall
   * back to the parent's name as the contact's firstName/lastName, so the
   * kanban renders them with the parent's name (no "Child N" placeholder).
   */
  parentFullName: string | null
} {
  const idx = row.sibling_index
  if (idx && idx > 0) {
    const parsed = parseChildrenDetails(row.children_details)
    if (parsed) {
      const child = parsed[idx - 1] as WixChildEntry | undefined
      const childName = (child?.name ?? '').trim()
      if (childName) {
        const { firstName, lastName } = splitName(childName)
        return {
          firstName,
          lastName,
          childAge: child?.age ?? null,
          parentFullName: row.full_name ?? null,
        }
      }
    }
  }
  // Either a non-sibling row, OR a sibling row with no usable child name in
  // children_details. Render with the parent's name so the kanban card shows
  // something meaningful instead of a "Child N" placeholder. The sibling-
  // indexed externalSourceId still keeps these contacts as distinct rows in
  // the database when children_count > 1 — only the displayed name reuses
  // the parent's, which the BM can rename in-place once they know the child.
  const { firstName, lastName } = splitName(row.full_name)
  return { firstName, lastName, childAge: null, parentFullName: null }
}

/**
 * Normalise a lead-source label to one of the canonical CRM source rows.
 * Mirrors the seed's behaviour so the same source rows are reused across
 * the seed and the worker.
 */
function normalizeSourceName(raw: string | null): string {
  if (!raw) return 'Others'
  const lower = raw.trim().toLowerCase()
  if (lower.includes('meta') || lower.includes('facebook') || lower.includes('instagram')) return 'Meta'
  if (lower.includes('tiktok')) return 'TikTok'
  if (lower.includes('wix')) return 'Wix'
  if (lower.includes('website') || lower.includes('web')) return 'Website'
  if (lower.includes('walk')) return 'Walk-In'
  if (lower.includes('refer')) return 'Referral'
  if (lower.includes('self')) return 'Self-Generated'
  // Roadshow is its own first-class source (was previously collapsed into
  // "Others"), so it shows separately in every lead-source view/filter.
  if (lower.includes('roadshow') || lower.includes('road show') || lower.includes('road-show')) return 'Roadshow'
  return 'Others'
}

/**
 * The raw source label worth storing as `crm_contact.leadSourceDetail`, or null
 * when the bucket already says everything the raw label does.
 *
 * normalizeSourceName collapses granular labels ("roadshow", "trial-class-e
 * form", "website (organic)") into a handful of buckets. We keep the raw label
 * around so the card can show "Others (roadshow)" — but only when it actually
 * adds information. We compare on alphanumerics-only so cosmetic differences
 * ("walk in" vs "Walk-In", "self generated" vs "Self-Generated", "others" vs
 * "Others") are treated as equal and don't produce noisy "Walk-In (walk in)".
 */
export function sourceDetailFor(rawLabel: string | null): string | null {
  const raw = (rawLabel ?? '').trim()
  if (!raw) return null
  const canon = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const bucket = normalizeSourceName(raw)
  return canon(raw) !== canon(bucket) ? raw : null
}

/**
 * Match the unified view's `clean_branch` against `crm_branch.name`.
 *
 * The view yields values like "Subang Taipan", "Setia Alam", "Online" —
 * branch_mapping.official_name. CRM branches are named "07 Ebright English
 * Speaking (Subang Taipan)". We cache by lower(clean_branch) and resolve via
 * case-insensitive substring match against crm_branch.name.
 */
async function resolveBranch(
  prisma: PrismaClient,
  tenantId: string,
  cleanBranch: string | null,
  caches: ImportCaches,
): Promise<{ id: string; tenantId: string } | null> {
  if (!cleanBranch) return null
  const key = cleanBranch.trim().toLowerCase()
  if (!key) return null

  const cached = caches.branchByCleanKey.get(key)
  if (cached) return cached

  const branch = await prisma.crm_branch.findFirst({
    where: {
      tenantId,
      name: { contains: cleanBranch.trim(), mode: 'insensitive' },
    },
    select: { id: true, tenantId: true },
  })

  if (branch) caches.branchByCleanKey.set(key, branch)
  return branch
}

async function resolvePipelineAndStage(
  prisma: PrismaClient,
  tenantId: string,
  branchId: string,
  caches: ImportCaches,
  shortCode: string,
): Promise<{ pipelineId: string; stageId: string } | null> {
  let pipelineId = caches.pipelineByBranchId.get(branchId)
  if (!pipelineId) {
    const pipeline = await prisma.crm_pipeline.findFirst({
      where: { tenantId, branchId },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    })
    if (!pipeline) return null
    pipelineId = pipeline.id
    caches.pipelineByBranchId.set(branchId, pipelineId)
  }

  let stageMap = caches.stageByBranchByCode.get(branchId)
  if (!stageMap) {
    const stages = await prisma.crm_stage.findMany({
      where: { tenantId, pipelineId },
      select: { id: true, shortCode: true },
    })
    stageMap = new Map(stages.map((s) => [s.shortCode, s.id]))
    caches.stageByBranchByCode.set(branchId, stageMap)
  }

  // Fallback chain: requested code → NL → first available stage. Guarantees
  // an opportunity is always parked somewhere even if the requested stage
  // doesn't exist on this branch.
  const stageId = stageMap.get(shortCode) ?? stageMap.get('NL') ?? stageMap.values().next().value
  if (!stageId) return null
  return { pipelineId, stageId }
}

async function resolveLeadSourceId(
  prisma: PrismaClient,
  tenantId: string,
  rawSource: string | null,
  caches: ImportCaches,
): Promise<string> {
  const name = normalizeSourceName(rawSource)
  const key = name.toLowerCase()
  const cached = caches.leadSourceByName.get(key)
  if (cached) return cached

  const existing = await prisma.crm_lead_source.findFirst({
    where: { tenantId, name },
    select: { id: true },
  })
  if (existing) {
    caches.leadSourceByName.set(key, existing.id)
    return existing.id
  }

  const created = await prisma.crm_lead_source.create({
    data: { tenantId, name },
    select: { id: true },
  })
  caches.leadSourceByName.set(key, created.id)
  return created.id
}

/**
 * Collapse a first/last name pair into the canonical form used for duplicate
 * matching: single-spaced, trimmed, lower-cased. MUST stay in lock-step with
 * the SQL expression in findDuplicateContactId so JS and Postgres agree on
 * what "the same name" means.
 */
function normalizeNameForMatch(firstName: string, lastName: string | null): string {
  return `${firstName} ${lastName ?? ''}`.replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * Find an existing, non-deleted contact that represents the SAME human as the
 * row we're about to import — matched on phone-digit-core AND normalized name,
 * within DEDUP_WINDOW_DAYS. Returns its id, or null when there's no match.
 *
 * The stored `phone` column is a mix of E.164 ("+60123456789"), local
 * ("0123456789") and raw form strings with spaces/dashes, so we reduce BOTH
 * sides to the bare national significant number (drop non-digits, a leading
 * Malaysian "60", then leading zeros) exactly like phoneSearchDigits does — a
 * CNS-form "+60 18-576 3367" and a marketing "+60185763367" then compare equal.
 *
 * Requiring the name to match as well is what keeps this sibling-safe: siblings
 * share the parent phone but differ in name, so they are never collapsed.
 */
async function findDuplicateContactId(
  prisma: PrismaClient,
  tenantId: string,
  phoneDigits: string,
  normalizedName: string,
): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id
      FROM crm.crm_contact
     WHERE "tenantId" = ${tenantId}
       AND "deletedAt" IS NULL
       AND "createdAt" > now() - (${DEDUP_WINDOW_DAYS} || ' days')::interval
       AND regexp_replace(
             regexp_replace(
               regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'),
             '^60', ''),
           '^0+', '') = ${phoneDigits}
       AND lower(btrim(regexp_replace(
             coalesce("firstName", '') || ' ' || coalesce("lastName", ''),
             '[[:space:]]+', ' ', 'g'))) = ${normalizedName}
     LIMIT 1
  `
  return rows[0]?.id ?? null
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Import a single unified-view row into the CRM.
 *
 * Returns a status without throwing, except for unexpected errors. The two
 * common "soft skip" cases (`duplicate` and `no_branch`) are not errors —
 * they're the polling backstop overlapping with a recent LISTEN event,
 * and a lead whose form pointed at an unknown branch respectively.
 */
export async function importLead(
  prisma: PrismaClient,
  ctx: TenantContext,
  row: UnifiedLeadRow,
  caches: ImportCaches,
  opts: ImportOptions = {},
): Promise<ImportResult> {
  // Guard: row must have at least one piece of PII to be useful.
  if (!row.full_name && !row.phone && !row.email) {
    return { status: 'no_pii', reason: 'row has no name, phone, or email' }
  }

  let branch = await resolveBranch(prisma, ctx.tenantId, row.clean_branch, caches)
  if (!branch) {
    // Fallback: leads with no resolvable clean_branch land on the
    // "Ebright Marketing" catch-all branch instead of being dropped, so the
    // Marketing BM can triage and transfer them to the correct branch.
    branch = await resolveFallbackBranch(prisma, ctx.tenantId, caches)
    if (!branch) {
      return {
        status: 'no_branch',
        reason:
          `clean_branch="${row.clean_branch ?? 'null'}" did not match any crm_branch.name ` +
          `and fallback branch "${FALLBACK_BRANCH_NAME}" is not seeded`,
      }
    }
  }

  const pipelineStage = await resolvePipelineAndStage(
    prisma,
    ctx.tenantId,
    branch.id,
    caches,
    opts.stageShortCode ?? 'NL',
  )
  if (!pipelineStage) {
    return {
      status: 'no_pipeline',
      reason: `branch ${branch.id} has no pipeline (seed not run for this branch)`,
    }
  }

  const leadSourceId = await resolveLeadSourceId(prisma, ctx.tenantId, row.lead_source, caches)
  // Preserve the raw source label when normaliseSourceName collapsed it into a
  // generic bucket (e.g. raw "roadshow" → bucket "Others"). Stored so the
  // lead-detail card can show "Others (roadshow)". Null when the raw label
  // already equals the bucket (no extra info to surface).
  const rawSourceLabel = (row.lead_source ?? '').trim()
  const leadSourceDetail = sourceDetailFor(rawSourceLabel)
  const phone = row.phone ? normalizePhone(row.phone) : null
  const submittedAt = row.submitted_at ?? new Date()

  const { firstName, lastName, childAge, parentFullName } = pickContactName(row)

  // ── Content-level dedup (same human, different source row) ───────────────────
  // The @@unique(sourceTable, sourceId) key only stops the SAME source row from
  // importing twice. It can't stop the upstream sources from emitting SEVERAL
  // rows for one person (roadshow form re-taps, Meta webhook re-delivery, form
  // retries) — each carries a distinct source_id, so each would otherwise mint a
  // fresh card minutes-to-hours apart. When the caller opts in (the realtime
  // worker does; the bulk seed does not), skip creation if a contact with the
  // same phone-digit-core AND name already exists in the recent window. Requiring
  // BOTH keeps siblings (shared phone, different names) as separate contacts.
  if (opts.dedupeByContact) {
    const phoneDigits = row.phone ? phoneSearchDigits(row.phone) : null
    const normalizedName = normalizeNameForMatch(firstName, lastName)
    if (phoneDigits && normalizedName) {
      const existingId = await findDuplicateContactId(
        prisma,
        ctx.tenantId,
        phoneDigits,
        normalizedName,
      )
      if (existingId) {
        return { status: 'duplicate_contact', contactId: existingId, branchId: branch.id }
      }
    }
  }

  // ── Idempotency key ────────────────────────────────────────────────────────
  // This MUST be a pure function of the source ROW so the unique constraint
  // (tenantId, externalSourceTable, externalSourceId) actually catches a
  // re-import. If any part of the key varies between runs, the LISTEN/NOTIFY
  // worker and the polling backstop each mint a BRAND-NEW contact+opportunity
  // on every pass — the "duplicate leads that keep re-appearing even after they
  // were moved to another stage or deleted" bug. (A stable key hits P2002 →
  // soft-skip/backfill instead, and a soft-deleted row still holds its key so
  // it is never resurrected.)
  //
  //   <base_id>-<submitted_unix>-<sibling>
  //
  // Two former sources of drift, now removed:
  //   1. `submitted_at ?? new Date()` — a NULL submitted_at fell back to the
  //      current wall-clock, so the key changed every second. We now derive the
  //      epoch ONLY from the row (0 when the view has no submitted_at).
  //   2. sibling index inferred from a live COUNT of existing contacts sharing
  //      the phone/email — that count grew with each duplicate, so the key
  //      changed on every pass and the duplication compounded. We now use the
  //      view's own sibling_index only (1 when absent).
  // Rows that were already imported correctly keep the exact same key (their
  // submitted_at and sibling_index are unchanged), so this does not re-import
  // them.
  const baseId = row.source_id.includes('#') ? row.source_id.split('#')[0] : row.source_id
  const keyEpoch = row.submitted_at ? Math.floor(row.submitted_at.getTime() / 1000) : 0
  const siblingIdx = row.sibling_index ?? 1
  const externalSourceId = `${baseId}-${keyEpoch}-${siblingIdx}`

  try {
    const result = await prisma.$transaction(async (tx) => {
      const contact = await tx.crm_contact.create({
        data: {
          tenantId:            ctx.tenantId,
          branchId:            branch.id,
          firstName,
          lastName,
          email:               row.email,
          phone,
          leadSourceId,
          leadSourceDetail,
          // childAge1 holds the sibling's age for Wix multi-child submissions
          // so the lead detail modal can show it. The contact itself IS the
          // child, so we don't fill childName1 (that would be redundant).
          childAge1:           childAge,
          // Parent's full_name when this contact represents a child (sibling-
          // exploded row). Null when the contact already IS the parent — in
          // that case firstName/lastName already hold the parent's name.
          parentFullName,
          // Marketing campaign as written in master_leads_base.campaign_name.
          // Verbatim — no trim/normalise — UI surfaces this in the modal +
          // lead-detail page; null becomes "-" at render time.
          campaignName:        row.campaign_name,
          externalSourceTable: row.source_table,
          externalSourceId,
          createdAt:           submittedAt,
        },
      })

      await tx.crm_opportunity.create({
        data: {
          tenantId:          ctx.tenantId,
          branchId:          branch.id,
          contactId:         contact.id,
          pipelineId:        pipelineStage.pipelineId,
          stageId:           pipelineStage.stageId,
          value:             0,
          createdAt:         submittedAt,
          lastStageChangeAt: submittedAt,
        },
      })

      return contact.id
    })

    if (opts.enqueueAutomation) {
      // NEW_LEAD trigger — fire any tenant-wide or branch-scoped automations.
      // We swallow enqueue failures; the contact already exists, missing an
      // automation run is recoverable, missing the contact isn't.
      const enqueue = opts.enqueueAutomation
      try {
        const automations = await prisma.crm_automation.findMany({
          where: {
            tenantId: ctx.tenantId,
            enabled:  true,
            triggerType: 'NEW_LEAD',
            OR: [{ branchId: branch.id }, { branchId: null }],
          },
          select: { id: true },
        })
        for (const a of automations) {
          await enqueue({
            automationId:   a.id,
            contactId:      result,
            tenantId:       ctx.tenantId,
            triggeredBy:    `lead_ingest:${row.source_table}`,
            triggerPayload: {
              source: row.lead_source,
              sourceTable: row.source_table,
              sourceId: row.source_id,
            },
          })
        }
      } catch (e) {
        console.warn('[leads-import] Automation enqueue failed:', (e as Error).message)
      }
    }

    // In-app bell notifications — one row per recipient (branch users +
    // elevated admins). Best-effort: the contact already exists, so failing
    // to write notifications shouldn't bubble up and roll anything back.
    try {
      const displayName = lastName ? `${firstName} ${lastName}` : firstName
      await createLeadNotifications(prisma, {
        tenantId:   ctx.tenantId,
        branchId:   branch.id,
        contactId:  result,
        leadName:   displayName,
        leadSource: normalizeSourceName(row.lead_source),
      })
    } catch (e) {
      console.warn('[leads-import] Notification fan-out failed:', (e as Error).message)
    }

    return { status: 'created', contactId: result, branchId: branch.id }
  } catch (e) {
    // Unique-constraint hit on (tenantId, externalSourceTable, externalSourceId)
    // means this row is already imported. Treat as a soft skip — but also
    // backfill columns the view newly exposes (campaignName, parentFullName,
    // childAge1) whenever the existing CRM row left them NULL.
    //
    // We only fill NULLs — that way fields a user has manually edited or
    // corrected stay intact. Re-firing pg_notify after a column-add becomes a
    // safe one-pass migration: created counts go up where the row was missing,
    // duplicate counts go up where it was already there but gets its new
    // fields populated in-place.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      try {
        const updates: Prisma.crm_contactUpdateManyMutationInput = {}
        if (row.campaign_name) updates.campaignName = row.campaign_name
        if (parentFullName)    updates.parentFullName = parentFullName
        if (childAge)          updates.childAge1 = childAge
        if (leadSourceDetail)  updates.leadSourceDetail = leadSourceDetail

        if (Object.keys(updates).length > 0) {
          // updateMany allows the NULL-only filter and doesn't require knowing
          // the compound-unique key's Prisma alias. Only touches rows where the
          // target field is still NULL.
          for (const [field, value] of Object.entries(updates)) {
            await prisma.crm_contact.updateMany({
              where: {
                tenantId:            ctx.tenantId,
                externalSourceTable: row.source_table,
                externalSourceId,
                [field]:             null,
              },
              data: { [field]: value },
            })
          }
        }
      } catch (updateErr) {
        // Don't fail the import path if backfill misfires — the row is at
        // least already present; the operator can re-run later.
        console.warn(
          '[leads-import] Backfill on duplicate failed:',
          (updateErr as Error).message,
        )
      }
      return { status: 'duplicate', branchId: branch.id }
    }
    throw e
  }
}
