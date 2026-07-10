 
/**
 * Seed crm_contact + crm_opportunity directly from `public.ghl_stages`.
 *
 * Use this instead of seed-from-powerbi.ts when master_leads_powerbi no
 * longer carries contact details (email/phone/name). ghl_stages has both
 * the contact AND the current stage, so the kanban lands at the correct
 * stage with no follow-up sync needed.
 *
 * Branch resolution: each ghl row's `pipeline_name` looks like "16 BSP" /
 * "15 EGR" — we strip the GHL number, take the trailing short code, and map
 * it to the canonical crm_branch via BRANCH_CODES.
 *
 * Pre-requisites (already run via seed-from-powerbi.ts):
 *   - crm_tenant     (slug 'ebright')
 *   - 21 crm_branch  (English-Speaking + HR)
 *   - crm_pipeline + crm_stage per branch (16-stage default)
 *   - crm_lead_source rows
 *
 * Recommended cleanup before running (in HeidiSQL):
 *   TRUNCATE crm.crm_opportunity, crm.crm_stage_history,
 *            crm.crm_contact_tag, crm.crm_contact CASCADE;
 *
 * Usage:
 *   npx tsx prisma/seed-from-ghl.ts --dry-run   (preview only)
 *   npx tsx prisma/seed-from-ghl.ts             (apply)
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

if (!process.env.DATABASE_URL) {
  console.error('✗ DATABASE_URL is not set — cannot run seed.')
  process.exit(1)
}

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

const DRY_RUN = process.argv.includes('--dry-run')

// ─── Branch short-code → canonical branch name ───────────────────────────────
// Pulled from leads-metrics route — same mapping the dashboard uses.

const BRANCH_BY_CODE: Record<string, string> = {
  OD:   '00 Ebright OD',
  ONL:  '01 Ebright (Online)',
  ST:   '02 Ebright (Subang Taipan)',
  SA:   '03 Ebright (Setia Alam)',
  SP:   '04 Ebright (Sri Petaling)',
  KD:   '05 Ebright (Kota Damansara)',
  PJY:  '06 Ebright (Putrajaya)',
  AMP:  '07 Ebright (Ampang)',
  CJY:  '08 Ebright (Cyberjaya)',
  KLG:  '09 Ebright (Klang)',
  DA:   '10 Ebright (Denai Alam)',
  BBB:  '11 Ebright (Bandar Baru Bangi)',
  DK:   '12 Ebright (Danau Kota)',
  SHA:  '13 Ebright (Shah Alam)',
  BTHO: '14 Ebright (Bandar Tun Hussein Onn)',
  EGR:  '15 Ebright (Eco Grandeur)',
  BSP:  '16 Ebright (Bandar Seri Putra)',
  RBY:  '17 Ebright (Bandar Rimbayu)',
  TSG:  '18 Ebright (Taman Sri Gombak)',
  KW:   '19 Ebright (Kota Warisan)',
  TTG:  '20 Ebright (Kajang TTDI Grove)',
}

const VALID_STAGE_KEYS = new Set(['NL', 'CT', 'SU', 'ENR', 'CNS', 'SNE'])

// ─── Helpers ─────────────────────────────────────────────────────────────────

function splitName(full: string | null): { firstName: string; lastName: string | null } {
  if (!full) return { firstName: 'Unknown', lastName: null }
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: 'Unknown', lastName: null }
  if (parts.length === 1) return { firstName: parts[0], lastName: null }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

/** "16 BSP" → "BSP". Defensive: also handles "BSP" alone, mixed case. */
function shortCodeFromPipelineName(name: string | null | undefined): string | null {
  if (!name) return null
  const trimmed = name.trim()
  // Take the LAST whitespace-separated token, uppercased.
  const tokens = trimmed.split(/\s+/)
  const last = tokens[tokens.length - 1]
  if (!last) return null
  const code = last.toUpperCase()
  return BRANCH_BY_CODE[code] ? code : null
}

function normalizeSource(raw: string | null): string {
  if (!raw) return 'Others'
  const lower = raw.trim().toLowerCase()
  if (lower.includes('meta') || lower.includes('facebook') || lower.includes('instagram')) return 'Meta'
  if (lower.includes('tiktok')) return 'TikTok'
  if (lower.includes('wix')) return 'Wix'
  if (lower.includes('website') || lower.includes('web')) return 'Website'
  if (lower.includes('walk')) return 'Walk-In'
  if (lower.includes('refer')) return 'Referral'
  if (lower.includes('self')) return 'Self-Generated'
  return 'Others'
}

interface GhlRow {
  email: string | null
  phone: string | null
  last_name: string | null
  student_name: string | null
  stage_raw: string | null
  stage_key: string | null
  pipeline_name: string | null
  branch: string | null
  lead_source: string | null
  received_at: Date | null
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Seed crm_contact + crm_opportunity from ghl_stages   (${DRY_RUN ? 'DRY RUN' : 'APPLY'})`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // ── Resolve tenant ─────────────────────────────────────────────────────────
  const tenant = await prisma.crm_tenant.findFirst({
    where: { slug: { in: ['ebright', 'ebright-demo'] } },
    select: { id: true, name: true, slug: true },
  })
  if (!tenant) {
    console.error('No tenant found with slug "ebright" or "ebright-demo".')
    console.error('Run seed-from-powerbi.ts first to create the tenant + branches.')
    process.exit(1)
  }
  console.log(`✓ Tenant         ${tenant.name} (${tenant.slug})`)

  // ── Pre-load branches keyed by canonical name ──────────────────────────────
  const branches = await prisma.crm_branch.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true },
  })
  const branchIdByName = new Map<string, string>()
  for (const b of branches) branchIdByName.set(b.name, b.id)

  // ── Pre-load pipelines per branch (one default lead pipeline per branch) ───
  const pipelines = await prisma.crm_pipeline.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, branchId: true },
    orderBy: { createdAt: 'asc' },
  })
  const pipelineIdByBranch = new Map<string, string>()
  for (const p of pipelines) {
    if (!pipelineIdByBranch.has(p.branchId)) pipelineIdByBranch.set(p.branchId, p.id)
  }

  // ── Pre-load stages per pipeline keyed by shortCode ────────────────────────
  const stages = await prisma.crm_stage.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, pipelineId: true, shortCode: true },
  })
  const stageByPipelineCode = new Map<string, string>()
  for (const s of stages) stageByPipelineCode.set(`${s.pipelineId}|${s.shortCode}`, s.id)

  // ── Pre-load lead sources ──────────────────────────────────────────────────
  const sources = await prisma.crm_lead_source.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true },
  })
  const sourceIdByName = new Map<string, string>()
  for (const ls of sources) sourceIdByName.set(ls.name, ls.id)
  const fallbackSourceId = sourceIdByName.get('Others') ?? sources[0]?.id ?? null
  if (!fallbackSourceId) {
    console.error('No crm_lead_source rows. Run seed-from-powerbi.ts first.')
    process.exit(1)
  }

  console.log(`✓ Mapped         ${branches.length} branches, ${pipelines.length} pipelines, ${stages.length} stages, ${sources.length} sources`)

  // ── Pull ghl_stages ────────────────────────────────────────────────────────
  const rows = (await prisma.$queryRawUnsafe(`
    SELECT email, phone, last_name, student_name, stage_raw, stage_key,
           pipeline_name, branch, lead_source, received_at
    FROM public.ghl_stages
    WHERE stage_key IS NOT NULL
    ORDER BY received_at DESC NULLS LAST
  `)) as GhlRow[]
  console.log(`→ Loaded ${rows.length.toLocaleString()} ghl_stages rows`)

  // ── Walk + create ──────────────────────────────────────────────────────────
  let imported = 0
  let skippedNoBranch = 0
  let skippedNoStage = 0
  let skippedNoIdentity = 0
  const stageHits: Record<string, number> = {}
  const BATCH = 200

  // De-dupe: only the latest row per email/phone gets imported.
  const seen = new Set<string>()
  function dedupKey(r: GhlRow): string | null {
    const e = r.email?.trim().toLowerCase()
    if (e) return `e:${e}`
    const p = r.phone?.replace(/\D/g, '')
    if (p) return `p:${p}`
    return null
  }

  const eligible: GhlRow[] = []
  for (const r of rows) {
    const k = dedupKey(r)
    if (!k) {
      skippedNoIdentity++
      continue
    }
    if (seen.has(k)) continue
    seen.add(k)
    eligible.push(r)
  }
  console.log(`→ ${eligible.length.toLocaleString()} unique contacts after dedup (skipped ${skippedNoIdentity.toLocaleString()} with no email/phone)`)

  if (DRY_RUN) {
    // Just simulate to give a preview
    for (const r of eligible) {
      const code = shortCodeFromPipelineName(r.pipeline_name) ?? shortCodeFromPipelineName(r.branch)
      if (!code) { skippedNoBranch++; continue }
      const branchName = BRANCH_BY_CODE[code]
      const branchId = branchIdByName.get(branchName)
      if (!branchId) { skippedNoBranch++; continue }
      const pipelineId = pipelineIdByBranch.get(branchId)
      if (!pipelineId) { skippedNoBranch++; continue }
      const sk = (r.stage_key ?? '').toUpperCase().trim()
      if (!VALID_STAGE_KEYS.has(sk)) { skippedNoStage++; continue }
      const stageId = stageByPipelineCode.get(`${pipelineId}|${sk}`)
      if (!stageId) { skippedNoStage++; continue }
      stageHits[sk] = (stageHits[sk] ?? 0) + 1
      imported++
    }
  } else {
    for (let i = 0; i < eligible.length; i += BATCH) {
      const batch = eligible.slice(i, i + BATCH)
      await prisma.$transaction(async (tx) => {
        for (const r of batch) {
          const code =
            shortCodeFromPipelineName(r.pipeline_name) ??
            shortCodeFromPipelineName(r.branch)
          if (!code) { skippedNoBranch++; continue }
          const branchName = BRANCH_BY_CODE[code]
          const branchId = branchIdByName.get(branchName)
          if (!branchId) { skippedNoBranch++; continue }
          const pipelineId = pipelineIdByBranch.get(branchId)
          if (!pipelineId) { skippedNoBranch++; continue }

          const sk = (r.stage_key ?? '').toUpperCase().trim()
          if (!VALID_STAGE_KEYS.has(sk)) { skippedNoStage++; continue }
          const stageId = stageByPipelineCode.get(`${pipelineId}|${sk}`)
          if (!stageId) { skippedNoStage++; continue }

          const sourceId =
            sourceIdByName.get(normalizeSource(r.lead_source)) ?? fallbackSourceId

          // Use student_name if present; else split last_name as fallback.
          const fullName = r.student_name?.trim() || r.last_name?.trim() || null
          const { firstName, lastName } = splitName(fullName)

          const createdAt = r.received_at ?? new Date()

          const contact = await tx.crm_contact.create({
            data: {
              tenantId: tenant.id,
              branchId,
              firstName,
              lastName,
              email: r.email,
              phone: r.phone,
              leadSourceId: sourceId,
              createdAt,
            },
          })

          await tx.crm_opportunity.create({
            data: {
              tenantId: tenant.id,
              branchId,
              contactId: contact.id,
              pipelineId,
              stageId,
              value: 0,
              createdAt,
              lastStageChangeAt: createdAt,
            },
          })

          stageHits[sk] = (stageHits[sk] ?? 0) + 1
          imported++
        }
      })

      if ((i + BATCH) % 1000 < BATCH) {
        console.log(`  …${imported.toLocaleString()} / ${eligible.length.toLocaleString()} imported`)
      }
    }
  }

  console.log()
  console.log('Result')
  console.log(`  imported          ${imported.toLocaleString()}`)
  console.log(`  skipped no branch ${skippedNoBranch.toLocaleString()}`)
  console.log(`  skipped no stage  ${skippedNoStage.toLocaleString()}`)
  console.log()
  console.log('Stage breakdown')
  for (const [k, v] of Object.entries(stageHits).sort(([, a], [, b]) => b - a)) {
    console.log(`  ${k.padEnd(5)} ${v.toLocaleString()}`)
  }

  if (DRY_RUN) {
    console.log()
    console.log('— DRY RUN — no changes written. Re-run without --dry-run to apply.')
  }
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
