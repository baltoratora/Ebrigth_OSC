 
/**
 * One-shot seed for the demo:
 *   1. Tenant   → Ebright Sdn Bhd (slug: ebright)
 *   2. Branches → 00 Ebright OD + 20 Public Speaking branches (GHL numbering)
 *   3. Lead pipeline (16 stages) cloned onto every branch
 *   4. Lead sources → Meta, TikTok, Wix, Website, Walk-In, Referral,
 *                    Self-Generated, Others
 *   5. Super-Admin user → admin@ebright.my / admin123
 *   6. Import every row of public.master_leads_powerbi into
 *        crm.crm_contact + crm.crm_opportunity, defaulted to "New Lead"
 *
 * Run:  npx tsx prisma/seed-from-powerbi.ts
 *
 * Idempotent — safe to re-run; it upserts on natural keys.
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { Client as PgClient } from 'pg'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import {
  importLead,
  makeEmptyCaches,
  type UnifiedLeadRow,
} from '../lib/crm/leads-import'

if (!process.env.DATABASE_URL) {
  console.error('✗ DATABASE_URL is not set — cannot run seed.')
  process.exit(1)
}

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

const LEADS_DB_URL = process.env.LEADS_DB_URL
if (!LEADS_DB_URL) {
  console.error('✗ LEADS_DB_URL is required to seed leads. Set it in .env and re-run.')
  process.exit(1)
}

// ─── Static config ───────────────────────────────────────────────────────────

const TENANT_SLUG = 'ebright'
const TENANT_NAME = 'Ebright Sdn Bhd'

// GHL-aligned numbering. "Kids" / "Academy" wording is preserved exactly as
// shown in the GHL admin UI so the dropdowns match what staff see there.
// HR is excluded — pipelines / dashboards never need it. Dataran Puchong Utama
// is NOT in the GHL list; we no longer create a row for it (historical data
// already in CRM stays routable via the existing UUID).
const BRANCHES = [
  '00 Ebright OD',
  '01 Ebright (Online)',
  '02 Ebright (Subang Taipan)',
  '03 Ebright (Setia Alam)',
  '04 Ebright (Sri Petaling)',
  '05 Ebright (Kota Damansara)',
  '06 Ebright (Putrajaya)',
  '07 Ebright (Ampang)',
  '08 Ebright (Cyberjaya)',
  '09 Ebright (Klang)',
  '10 Ebright (Denai Alam)',
  '11 Ebright (Bandar Baru Bangi)',
  '12 Ebright (Danau Kota)',
  '13 Ebright (Shah Alam)',
  '14 Ebright (Bandar Tun Hussein Onn)',
  '15 Ebright (Eco Grandeur)',
  '16 Ebright (Bandar Seri Putra)',
  '17 Ebright (Bandar Rimbayu)',
  '18 Ebright (Taman Sri Gombak)',
  '19 Ebright (Kota Warisan)',
  '20 Ebright (Kajang TTDI Grove)',
] as const

const STAGES = [
  { name: 'New Lead',              shortCode: 'NL',    color: 'slate'   },
  { name: 'Follow-Up 1st Attempt', shortCode: 'FU1',   color: 'slate'   },
  { name: 'Follow-Up 2nd Attempt', shortCode: 'FU2',   color: 'slate'   },
  { name: 'Follow-Up 3rd Attempt', shortCode: 'FU3',   color: 'slate'   },
  { name: 'Reschedule',            shortCode: 'RSD',   color: 'slate'   },
  { name: 'Trial Buffer',          shortCode: 'CTB',   color: 'cyan'    },
  { name: 'Confirmed for Trial',   shortCode: 'CT',    color: 'emerald' },
  { name: 'Confirmed No-Show',     shortCode: 'CNS',   color: 'amber'   },
  { name: 'Show-Up',               shortCode: 'SU',    color: 'emerald' },
  { name: 'Show-Up No-Enroll',     shortCode: 'SNE',   color: 'yellow'  },
  { name: 'Enroll Buffer',         shortCode: 'ENRB',  color: 'cyan'    },
  { name: 'Enrolled',              shortCode: 'ENR',   color: 'emerald' },
  { name: 'Unresponsive Week 1',   shortCode: 'UR_W1', color: 'slate'   },
  { name: 'Unresponsive Week 2',   shortCode: 'UR_W2', color: 'slate'   },
  { name: 'Unresponsive Week 3',   shortCode: 'UR_W3', color: 'slate'   },
  { name: 'Follow-Up 3 Months',    shortCode: 'FU3M',  color: 'slate'   },
  { name: 'Cold Lead',             shortCode: 'CL',    color: 'slate'   },
  { name: 'Do Not Disturb',        shortCode: 'DND',   color: 'red'     },
  { name: 'Buffer (OD use only)',  shortCode: 'SG',    color: 'indigo'  },
]

const LEAD_SOURCES = [
  'Meta',
  'TikTok',
  'Wix',
  'Website',
  'Walk-In',
  'Referral',
  'Self-Generated',
  'Others',
]

const SUPER_ADMIN = {
  email: 'admin@ebright.my',
  name: 'Denize',
  password: 'admin123',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Strip everything that isn't a digit so phones from different sources match. */
function digitsOnly(raw: string | null): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  return digits.length > 0 ? digits : null
}

/** GHL stage_keys we know how to map. Anything else falls back to NL. */
const GHL_STAGE_WHITELIST = new Set(['NL', 'CT', 'SU', 'ENR', 'CNS', 'SNE'])

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Seeding Ebright CRM from public.master_leads_powerbi')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // ── 1. Tenant ──────────────────────────────────────────────────────────────
  const tenant = await prisma.crm_tenant.upsert({
    where: { slug: TENANT_SLUG },
    update: { name: TENANT_NAME },
    create: { slug: TENANT_SLUG, name: TENANT_NAME },
  })
  console.log(`✓ Tenant         ${tenant.name} (${tenant.slug})`)

  // ── 2. Branches ────────────────────────────────────────────────────────────
  const branchByName = new Map<string, string>() // name → id
  for (const name of BRANCHES) {
    const existing = await prisma.crm_branch.findFirst({
      where: { tenantId: tenant.id, name },
      select: { id: true },
    })
    const branch = existing
      ? existing
      : await prisma.crm_branch.create({
          data: { tenantId: tenant.id, name },
          select: { id: true },
        })
    branchByName.set(name, branch.id)
  }
  console.log(`✓ Branches       ${branchByName.size} (incl. Ebright HR)`)

  // ── 3. Lead pipeline + 16 stages on every non-HR branch ────────────────────
  // The shared importer (lib/crm/leads-import.ts) does its own branch/pipeline
  // lookups via Prisma — no need to keep local maps for the import phase.
  for (const [name, branchId] of branchByName) {
    if (name === 'Ebright HR') continue

    const pipelineName = name // keep human-friendly
    const existingPipeline = await prisma.crm_pipeline.findFirst({
      where: { tenantId: tenant.id, branchId, name: pipelineName },
      select: { id: true },
    })
    const pipeline = existingPipeline
      ? existingPipeline
      : await prisma.crm_pipeline.create({
          data: { tenantId: tenant.id, branchId, name: pipelineName },
          select: { id: true },
        })

    for (let i = 0; i < STAGES.length; i++) {
      const s = STAGES[i]
      const existingStage = await prisma.crm_stage.findFirst({
        where: { tenantId: tenant.id, pipelineId: pipeline.id, shortCode: s.shortCode },
        select: { id: true },
      })
      if (!existingStage) {
        await prisma.crm_stage.create({
          data: {
            tenantId: tenant.id,
            pipelineId: pipeline.id,
            name: s.name,
            shortCode: s.shortCode,
            color: s.color,
            order: i,
          },
        })
      }
    }
  }
  console.log(`✓ Pipelines      ${branchByName.size - 1} (with ${STAGES.length} stages each)`)

  // ── 4. Lead sources ────────────────────────────────────────────────────────
  for (const name of LEAD_SOURCES) {
    const existing = await prisma.crm_lead_source.findFirst({
      where: { tenantId: tenant.id, name },
      select: { id: true },
    })
    if (!existing) {
      await prisma.crm_lead_source.create({
        data: { tenantId: tenant.id, name },
      })
    }
  }
  console.log(`✓ Lead sources   ${LEAD_SOURCES.length}`)

  // ── 5. Super Admin user ────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(SUPER_ADMIN.password, 10)
  const existingUser = await prisma.crm_auth_user.findFirst({
    where: { email: SUPER_ADMIN.email },
    select: { id: true },
  })
  const user = existingUser
    ? existingUser
    : await prisma.crm_auth_user.create({
        data: {
          id: randomUUID(),
          email: SUPER_ADMIN.email,
          name: SUPER_ADMIN.name,
          emailVerified: true,
        },
        select: { id: true },
      })

  // Better Auth credential account row (providerId='credential')
  const existingAccount = await prisma.crm_auth_account.findFirst({
    where: { userId: user.id, providerId: 'credential' },
    select: { id: true },
  })
  if (!existingAccount) {
    await prisma.crm_auth_account.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        accountId: SUPER_ADMIN.email,
        providerId: 'credential',
        password: passwordHash,
      },
    })
  } else {
    await prisma.crm_auth_account.update({
      where: { id: existingAccount.id },
      data: { password: passwordHash },
    })
  }

  // Link Super Admin to every branch as SUPER_ADMIN
  for (const branchId of branchByName.values()) {
    const link = await prisma.crm_user_branch.findFirst({
      where: { userId: user.id, branchId },
      select: { id: true },
    })
    if (!link) {
      await prisma.crm_user_branch.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          branchId,
          role: 'SUPER_ADMIN',
        },
      })
    }
  }
  console.log(`✓ Super Admin    ${SUPER_ADMIN.email} (password: ${SUPER_ADMIN.password})`)

  // ── 6. Import leads via the shared importer ────────────────────────────────
  // Connects directly to ebrightleads_db (NOT through the FDW) so the seed can
  // run on a fresh CRM database before the FDW links are set up. Uses the
  // unified view + ghl_stages we created in ebrightleads_db.

  const leadsClient = new PgClient({ connectionString: LEADS_DB_URL })
  await leadsClient.connect()

  // 6a. Pre-load GHL stage progression so historical leads land in the right
  //     stage instead of all clustering in NL. Live worker imports use NL
  //     because brand-new leads always start there.
  const ghlRes = await leadsClient.query<{ email: string | null; phone: string | null; stage_key: string | null }>(`
    SELECT email, phone, stage_key
      FROM public.ghl_stages
     WHERE stage_key IS NOT NULL
     ORDER BY received_at DESC NULLS LAST
  `)

  const stageByEmail = new Map<string, string>()
  const stageByPhone = new Map<string, string>()
  for (const g of ghlRes.rows) {
    const sk = (g.stage_key ?? '').toUpperCase().trim()
    if (!GHL_STAGE_WHITELIST.has(sk)) continue
    const e = g.email?.trim().toLowerCase()
    if (e && !stageByEmail.has(e)) stageByEmail.set(e, sk)
    const p = digitsOnly(g.phone)
    if (p && !stageByPhone.has(p)) stageByPhone.set(p, sk)
  }
  console.log(`✓ GHL stage map  ${stageByEmail.size.toLocaleString()} by email, ${stageByPhone.size.toLocaleString()} by phone`)

  function findStageKey(email: string | null, phone: string | null): string {
    if (email) {
      const v = stageByEmail.get(email.trim().toLowerCase())
      if (v) return v
    }
    const p = digitsOnly(phone)
    if (p) {
      const v = stageByPhone.get(p)
      if (v) return v
    }
    return 'NL'
  }

  // 6b. Stream from master_leads_unified — the view that combines Meta /
  //     TikTok / Wix into one table-shaped result.
  const leadsRes = await leadsClient.query<UnifiedLeadRow>(`
    SELECT source_table, source_id, lead_source, full_name, phone, email,
           clean_branch, region, submitted_at, children_details, sibling_index,
           campaign_name
      FROM public.master_leads_unified
     WHERE submitted_at IS NOT NULL
       AND (full_name IS NOT NULL OR phone IS NOT NULL OR email IS NOT NULL)
       AND source_table <> 'cns_leads'
     ORDER BY submitted_at ASC, sibling_index ASC NULLS FIRST
  `)
  console.log(`→ Found ${leadsRes.rows.length.toLocaleString()} importable leads`)

  const caches = makeEmptyCaches()
  const stageHits: Record<string, number> = {}
  let imported = 0, duplicates = 0, noBranch = 0, noPipeline = 0, noPii = 0

  for (let i = 0; i < leadsRes.rows.length; i++) {
    const row = leadsRes.rows[i]
    const stageKey = findStageKey(row.email, row.phone)
    stageHits[stageKey] = (stageHits[stageKey] ?? 0) + 1

    try {
      // No enqueueAutomation passed — bulk seed must NOT fire 1M automations.
      const r = await importLead(prisma, { tenantId: tenant.id }, row, caches, {
        stageShortCode: stageKey,
      })
      switch (r.status) {
        case 'created':     imported++;   break
        case 'duplicate':   duplicates++; break
        case 'no_branch':   noBranch++;   break
        case 'no_pipeline': noPipeline++; break
        case 'no_pii':      noPii++;      break
      }
    } catch (e) {
      console.error(`  ✗ ${row.source_table}:${row.source_id}: ${(e as Error).message}`)
    }

    if ((i + 1) % 1000 === 0) {
      console.log(`  …${imported.toLocaleString()} / ${leadsRes.rows.length.toLocaleString()}`)
    }
  }

  await leadsClient.end()

  console.log('  Stage breakdown:')
  for (const [k, v] of Object.entries(stageHits).sort(([, a], [, b]) => b - a)) {
    console.log(`    ${k.padEnd(5)} ${v.toLocaleString()}`)
  }

  console.log(
    `✓ Imported       ${imported.toLocaleString()} leads ` +
    `(${duplicates.toLocaleString()} dup, ${noBranch.toLocaleString()} unmapped branch, ` +
    `${noPipeline.toLocaleString()} no pipeline, ${noPii.toLocaleString()} no PII)`,
  )
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Done. Login at http://localhost:3000/login')
  console.log(`  Email:    ${SUPER_ADMIN.email}`)
  console.log(`  Password: ${SUPER_ADMIN.password}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
