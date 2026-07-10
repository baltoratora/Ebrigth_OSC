/**
 * One-time backfill for crm_contact.leadSourceDetail.
 *
 * normalizeSourceName() collapses granular raw labels ("roadshow",
 * "trial-class-e form", "website (organic)") into a few buckets. The new
 * leadSourceDetail column preserves the raw label so the lead card can show
 * "Others (roadshow)". New imports populate it going forward; this script
 * fills it in for contacts already imported.
 *
 * Recovery path: the raw label still lives in ebrightleads_db's
 * master_leads_unified view. We join CRM contacts back to the view on
 * (externalSourceTable, base source_id). The base is the part of the id
 * BEFORE any sibling suffix — CRM ids are "<base>-<unix>-<sibling>" (worker)
 * or "<base>#<sibling>" (legacy); the view's source_id is "<base>#<sibling>"
 * or just "<base>". Siblings of one submission share the same lead_source, so
 * matching on the base is sufficient.
 *
 * Only fills NULLs — never overwrites a value. Idempotent: re-running does
 * nothing once populated.
 *
 *   npx tsx scripts/backfill-lead-source-detail.ts          # dry-run
 *   npx tsx scripts/backfill-lead-source-detail.ts --apply  # write
 */
import { prisma } from '@/lib/crm/db'
import { Client } from 'pg'
import { sourceDetailFor } from '@/lib/crm/leads-import'

const APPLY = process.argv.includes('--apply')

/** Reduce any id to its submission base: strip a "#sibling" or "-unix-sibling" suffix. */
function baseOf(id: string): string {
  if (id.includes('#')) return id.split('#')[0]
  // Worker format "<base>-<unix>-<sibling>". Base ids are numeric (no internal
  // dashes), so the segment before the first dash is the base.
  if (id.includes('-')) return id.split('-')[0]
  return id
}

async function main() {
  const tenant = await prisma.crm_tenant.findFirst({
    where: { slug: { in: ['ebright', 'ebright-demo'] } },
    select: { id: true, slug: true },
  })
  if (!tenant) throw new Error('No tenant')

  // ── Build (source_table, base) → raw lead_source map from the view ──────────
  const pg = new Client({ connectionString: process.env.LEADS_DB_URL })
  await pg.connect()
  const { rows } = await pg.query<{ source_table: string; source_id: string; lead_source: string | null }>(
    `SELECT source_table, source_id::text AS source_id, lead_source
     FROM public.master_leads_unified`,
  )
  await pg.end()

  const labelByKey = new Map<string, string>()
  for (const r of rows) {
    if (!r.lead_source) continue
    labelByKey.set(`${r.source_table}::${baseOf(r.source_id)}`, r.lead_source)
  }
  console.log(`View rows: ${rows.length}; distinct (table,base) keys with a label: ${labelByKey.size}`)

  const tables = Array.from(new Set(rows.map((r) => r.source_table)))

  // ── CRM contacts still missing a detail that came from one of those tables ──
  const contacts = await prisma.crm_contact.findMany({
    where: {
      tenantId: tenant.id,
      deletedAt: null,
      leadSourceDetail: null,
      externalSourceTable: { in: tables },
    },
    select: { id: true, externalSourceTable: true, externalSourceId: true },
  })
  console.log(`CRM contacts missing detail (from known tables): ${contacts.length}\n`)

  // contactId → detail to write; tally by detail for the report.
  const idsByDetail = new Map<string, string[]>()
  let unmatched = 0
  for (const c of contacts) {
    if (!c.externalSourceTable || !c.externalSourceId) { unmatched++; continue }
    const raw = labelByKey.get(`${c.externalSourceTable}::${baseOf(c.externalSourceId)}`)
    if (!raw) { unmatched++; continue }
    const detail = sourceDetailFor(raw)
    if (!detail) continue   // raw == bucket, nothing worth storing
    const list = idsByDetail.get(detail) ?? []
    list.push(c.id)
    idsByDetail.set(detail, list)
  }

  console.log('Would set leadSourceDetail =')
  let total = 0
  for (const [detail, ids] of [...idsByDetail.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${ids.length.toString().padStart(6)}  "${detail}"`)
    total += ids.length
  }
  console.log(`\nTotal to update: ${total}`)
  console.log(`Unmatched (no recoverable label — left NULL): ${unmatched}`)

  if (!APPLY) {
    console.log('\nDry-run only. Re-run with --apply to write.')
    return
  }

  console.log('\nApplying…')
  let written = 0
  for (const [detail, ids] of idsByDetail.entries()) {
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500)
      const res = await prisma.crm_contact.updateMany({
        where: { id: { in: chunk }, leadSourceDetail: null },
        data: { leadSourceDetail: detail },
      })
      written += res.count
    }
  }
  console.log(`Done. Rows written: ${written}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
