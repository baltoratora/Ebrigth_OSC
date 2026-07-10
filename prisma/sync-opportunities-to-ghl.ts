 
/**
 * Move every existing crm_opportunity to the stage shown in
 * `public.ghl_stages` for the same contact.
 *
 * Match logic per opportunity:
 *   1. Find ghl_stages row by NORMALIZED email (case-insensitive, trimmed)
 *   2. Fallback: match by NORMALIZED phone (digits only)
 *   3. Confirm names tally — full_name vs last_name (loose, lowercase substring)
 *   4. If match found: set opportunity.stageId to the crm_stage whose shortCode
 *      equals ghl_stages.stage_key, scoped to the opportunity's pipeline.
 *
 * Usage:
 *   npx tsx prisma/sync-opportunities-to-ghl.ts --dry-run   (preview only)
 *   npx tsx prisma/sync-opportunities-to-ghl.ts             (apply changes)
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

if (!process.env.DATABASE_URL) {
  console.error('✗ DATABASE_URL is not set — cannot run sync.')
  process.exit(1)
}

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

// ─── CLI ─────────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run')

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normEmail(v: string | null | undefined): string | null {
  if (!v) return null
  const t = v.trim().toLowerCase()
  return t.length > 0 ? t : null
}

function normPhone(v: string | null | undefined): string | null {
  if (!v) return null
  const digits = v.replace(/\D/g, '')
  return digits.length > 0 ? digits : null
}

function normName(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase()
}

/** Loose name match — ghl has just last_name; master has full_name. */
function namesTally(masterFullName: string | null, ghlLastName: string | null): boolean {
  const m = normName(masterFullName)
  const g = normName(ghlLastName)
  if (!m || !g) return true // can't disprove → don't block on name
  // accept if either contains the other
  return m.includes(g) || g.includes(m)
}

/** Stage codes we recognise from ghl_stages.stage_key */
const VALID_GHL_KEYS = new Set(['NL', 'CT', 'SU', 'ENR', 'CNS', 'SNE'])

interface GhlRow {
  email: string | null
  phone: string | null
  last_name: string | null
  stage_key: string | null
  received_at: Date | null
}

interface OppRow {
  id: string
  tenant_id: string
  pipeline_id: string
  branch_id: string
  current_stage_id: string
  contact_email: string | null
  contact_phone: string | null
  contact_first: string
  contact_last: string | null
}

interface StageRow {
  id: string
  pipeline_id: string
  short_code: string
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Sync opportunities → ghl_stages   (${DRY_RUN ? 'DRY RUN' : 'APPLY'})`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // ── 1. Pre-load every opportunity + its contact ───────────────────────────
  const opps = (await prisma.$queryRawUnsafe(`
    SELECT
      o.id              AS id,
      o."tenantId"      AS tenant_id,
      o."pipelineId"    AS pipeline_id,
      o."branchId"      AS branch_id,
      o."stageId"       AS current_stage_id,
      c.email           AS contact_email,
      c.phone           AS contact_phone,
      c."firstName"     AS contact_first,
      c."lastName"      AS contact_last
    FROM crm.crm_opportunity o
    JOIN crm.crm_contact      c ON c.id = o."contactId"
    WHERE o."deletedAt" IS NULL
  `)) as OppRow[]
  console.log(`  loaded ${opps.length.toLocaleString()} opportunities`)

  // ── 2. Pre-load every stage in the CRM keyed by pipeline+shortCode ────────
  const stages = (await prisma.$queryRawUnsafe(`
    SELECT id, "pipelineId" AS pipeline_id, "shortCode" AS short_code
    FROM crm.crm_stage
  `)) as StageRow[]
  const stageByPipelineCode = new Map<string, string>() // `${pipelineId}|${shortCode}` → stage.id
  for (const s of stages) {
    stageByPipelineCode.set(`${s.pipeline_id}|${s.short_code}`, s.id)
  }
  console.log(`  indexed ${stageByPipelineCode.size.toLocaleString()} pipeline-stage entries`)

  // ── 3. Pre-load ghl_stages, latest stage per email + phone ────────────────
  const ghlRows = (await prisma.$queryRawUnsafe(`
    SELECT email, phone, last_name, stage_key, received_at
    FROM public.ghl_stages
    WHERE stage_key IS NOT NULL
    ORDER BY received_at DESC NULLS LAST
  `)) as GhlRow[]

  const ghlByEmail = new Map<string, GhlRow>()
  const ghlByPhone = new Map<string, GhlRow>()
  for (const g of ghlRows) {
    const k = (g.stage_key ?? '').toUpperCase().trim()
    if (!VALID_GHL_KEYS.has(k)) continue
    const e = normEmail(g.email)
    if (e && !ghlByEmail.has(e)) ghlByEmail.set(e, g)
    const p = normPhone(g.phone)
    if (p && !ghlByPhone.has(p)) ghlByPhone.set(p, g)
  }
  console.log(`  ghl: ${ghlByEmail.size.toLocaleString()} by email, ${ghlByPhone.size.toLocaleString()} by phone`)
  console.log()

  // ── 4. Walk every opportunity, decide what to do ──────────────────────────
  let matched = 0
  let nameMismatch = 0
  let noGhlMatch = 0
  let alreadyCorrect = 0
  let stageMissingInPipeline = 0
  let willMove = 0
  const moves: Array<{ oppId: string; tenantId: string; fromStage: string; toStage: string; key: string }> = []

  for (const opp of opps) {
    // Match
    let g: GhlRow | undefined
    let matchedBy = ''
    const e = normEmail(opp.contact_email)
    if (e) {
      const found = ghlByEmail.get(e)
      if (found) {
        g = found
        matchedBy = 'email'
      }
    }
    if (!g) {
      const p = normPhone(opp.contact_phone)
      if (p) {
        const found = ghlByPhone.get(p)
        if (found) {
          g = found
          matchedBy = 'phone'
        }
      }
    }
    if (!g) {
      noGhlMatch++
      continue
    }

    // Name tally check
    const fullName = `${opp.contact_first} ${opp.contact_last ?? ''}`.trim()
    if (!namesTally(fullName, g.last_name)) {
      nameMismatch++
      continue
    }
    matched++

    // Resolve target stage in the opportunity's own pipeline
    const targetKey = (g.stage_key ?? '').toUpperCase().trim()
    const targetStageId = stageByPipelineCode.get(`${opp.pipeline_id}|${targetKey}`)
    if (!targetStageId) {
      stageMissingInPipeline++
      continue
    }
    if (targetStageId === opp.current_stage_id) {
      alreadyCorrect++
      continue
    }
    willMove++
    moves.push({
      oppId: opp.id,
      tenantId: opp.tenant_id,
      fromStage: opp.current_stage_id,
      toStage: targetStageId,
      key: targetKey,
    })
  }

  // ── 5. Report ─────────────────────────────────────────────────────────────
  console.log('Match summary')
  console.log(`  matched          ${matched.toLocaleString()}`)
  console.log(`  name mismatch    ${nameMismatch.toLocaleString()}`)
  console.log(`  no ghl row       ${noGhlMatch.toLocaleString()}`)
  console.log()
  console.log('Move plan')
  console.log(`  will move        ${willMove.toLocaleString()}`)
  console.log(`  already correct  ${alreadyCorrect.toLocaleString()}`)
  console.log(`  stage not in pipe ${stageMissingInPipeline.toLocaleString()}`)
  console.log()

  // Stage breakdown
  const byKey: Record<string, number> = {}
  for (const m of moves) byKey[m.key] = (byKey[m.key] ?? 0) + 1
  console.log('Move breakdown by target stage')
  for (const [k, v] of Object.entries(byKey).sort(([, a], [, b]) => b - a)) {
    console.log(`  ${k.padEnd(5)} ${v.toLocaleString()}`)
  }
  console.log()

  if (DRY_RUN) {
    console.log('— DRY RUN — no changes written.')
    console.log('Re-run without --dry-run to apply.')
    return
  }

  // ── 6. Apply moves in batches (transaction per batch) ─────────────────────
  const BATCH = 200
  const now = new Date()
  let applied = 0

  for (let i = 0; i < moves.length; i += BATCH) {
    const batch = moves.slice(i, i + BATCH)
    await prisma.$transaction(async (tx) => {
      for (const m of batch) {
        await tx.crm_opportunity.update({
          where: { id: m.oppId },
          data: {
            stageId: m.toStage,
            lastStageChangeAt: now,
            updatedAt: now,
          },
        })
        await tx.crm_stage_history.create({
          data: {
            tenantId: m.tenantId,
            opportunityId: m.oppId,
            fromStageId: m.fromStage,
            toStageId: m.toStage,
            note: 'Synced from ghl_stages',
            changedAt: now,
          },
        })
        applied++
      }
    })
    if ((i + BATCH) % 1000 < BATCH) {
      console.log(`  …${applied.toLocaleString()} / ${moves.length.toLocaleString()} applied`)
    }
  }

  console.log(`✓ Applied ${applied.toLocaleString()} stage moves`)
}

main()
  .catch((e) => {
    console.error('Sync failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
