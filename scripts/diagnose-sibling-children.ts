// Run with: npx tsx scripts/diagnose-sibling-children.ts
//
// READ-ONLY. Reports anomalies in the sibling-children data pipeline. Nothing
// in this script modifies any database. Use it to confirm whether reported
// "two cards for the same parent" / "card count doesn't match children_count"
// issues are still present after a code fix, or to gather evidence before
// running the backfill script.
//
// What it checks:
//
//   A. master_leads_base rows whose children_count is GREATER than the
//      current number of crm_contact rows pointing back to that base_id.
//      These are submissions where the sibling explode didn't fully land in
//      the CRM (some siblings are missing).
//
//   B. crm_contact rows that share the same tenantId + phone where every
//      contact has the SAME firstName and parentFullName is null on all of
//      them — the visible "two Shuzana cards" signature.
//
//   C. crm_contact rows that have a placeholder firstName matching
//      /^Child \d+$/ — these came from the new fallback path and the BM
//      hasn't renamed them yet. Useful to know how many manual renames are
//      outstanding.
//
//   D. master_leads_base submissions where children_count > 1 but
//      children_details has no entry / fewer entries than children_count.
//      These are upstream-data quality issues that the fix will surface as
//      "Child 2", "Child 3" placeholders in the CRM.
//
// Requires both DATABASE_URL (CRM) and LEADS_DB_URL (ebrightleads_db) set.

import { Client as PgClient } from 'pg'
import { prisma } from '@/lib/crm/db'

const LEADS_DB_URL = process.env.LEADS_DB_URL
if (!LEADS_DB_URL) {
  console.error('LEADS_DB_URL is required (same one the worker uses).')
  process.exit(1)
}

interface BaseRow {
  base_id: string
  children_count: number | null
  children_details_len: number | null
  full_name: string | null
  phone: string | null
  email: string | null
  submitted_at: Date | null
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Sibling-children diagnostic (read-only)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const pg = new PgClient({ connectionString: LEADS_DB_URL })
  await pg.connect()

  // ── A. Submissions whose siblings are partially missing in CRM ──────────
  // The view emits one row per child. Each child should land in CRM as a
  // distinct crm_contact whose externalSourceId starts with the base_id.
  // If the count in CRM is below children_count, we lost siblings.
  console.log('A. Submissions with missing siblings in CRM')
  console.log('   (children_count > number of crm_contact rows referencing the base)')

  const baseRows = await pg.query<BaseRow>(`
    SELECT
      id::text                                 AS base_id,
      children_count                           AS children_count,
      CASE
        WHEN children_details IS NULL THEN 0
        WHEN jsonb_typeof(children_details) = 'array'
          THEN jsonb_array_length(children_details)
        ELSE 0
      END                                      AS children_details_len,
      full_name,
      phone,
      email,
      submitted_at
    FROM public.master_leads_base
    WHERE COALESCE(children_count, 1) > 1
    ORDER BY submitted_at DESC NULLS LAST
    LIMIT 5000
  `)

  let missingCount = 0
  for (const r of baseRows.rows) {
    const expected = r.children_count ?? 0
    if (expected <= 1) continue
    // Match either the new "<base>-<unix>-<idx>" format OR the legacy
    // "<base>#<idx>" format so both eras of contacts are counted.
    const actual = await prisma.crm_contact.count({
      where: {
        deletedAt: null,
        OR: [
          { externalSourceId: { startsWith: `${r.base_id}-` } },
          { externalSourceId: { startsWith: `${r.base_id}#` } },
          { externalSourceId: r.base_id },
        ],
      },
    })
    if (actual < expected) {
      missingCount++
      if (missingCount <= 20) {
        console.log(
          `   • base ${r.base_id}: children_count=${expected} but CRM has ${actual}` +
            ` (parent: ${r.full_name ?? '?'}, phone: ${r.phone ?? '?'})`,
        )
      }
    }
  }
  if (missingCount > 20) console.log(`   … ${missingCount - 20} more`)
  console.log(`   Total submissions with missing siblings: ${missingCount}\n`)

  // ── B. Lookalike groups (the "two Shuzana cards" pattern) ──────────────
  console.log('B. Contact groups with identical firstName + no parentFullName')
  console.log('   (kanban shows N parent-named cards — looks like duplicates)')

  const contacts = await prisma.crm_contact.findMany({
    where: { deletedAt: null, phone: { not: null } },
    select: {
      id: true,
      tenantId: true,
      firstName: true,
      phone: true,
      parentFullName: true,
    },
  })
  const groups = new Map<string, typeof contacts>()
  for (const c of contacts) {
    const key = `${c.tenantId}|${c.phone}`
    const arr = groups.get(key) ?? []
    arr.push(c)
    groups.set(key, arr)
  }

  let lookalikeGroups = 0
  let lookalikeContacts = 0
  let shown = 0
  for (const [key, members] of groups.entries()) {
    if (members.length < 2) continue
    const sameName = new Set(members.map((c) => c.firstName.toLowerCase())).size === 1
    const allNoParent = members.every((c) => !c.parentFullName)
    if (sameName && allNoParent) {
      lookalikeGroups++
      lookalikeContacts += members.length
      if (shown < 15) {
        console.log(
          `   • ${key} → ${members.length} cards all named "${members[0].firstName}"`,
        )
        shown++
      }
    }
  }
  if (lookalikeGroups > 15) console.log(`   … ${lookalikeGroups - 15} more`)
  console.log(`   Lookalike groups: ${lookalikeGroups} (${lookalikeContacts} contacts total)`)
  console.log(`   Fix: run \`npx tsx scripts/backfill-sibling-children.ts\` (use --dry-run first)\n`)

  // ── C. Placeholder firstNames ("Child 2", "Child 3", …) ────────────────
  console.log('C. Contacts with placeholder firstName from the fallback path')
  console.log('   (BM should rename these — the actual child name was missing in children_details)')

  const placeholders = await prisma.crm_contact.findMany({
    where: {
      deletedAt: null,
      firstName: { startsWith: 'Child ' },
    },
    select: {
      id: true,
      firstName: true,
      parentFullName: true,
      phone: true,
      createdAt: true,
    },
    take: 30,
    orderBy: { createdAt: 'desc' },
  })
  if (placeholders.length === 0) {
    console.log('   none\n')
  } else {
    for (const c of placeholders.slice(0, 15)) {
      console.log(`   • ${c.firstName} (parent: ${c.parentFullName ?? '?'}, phone: ${c.phone ?? '?'})`)
    }
    if (placeholders.length > 15) console.log(`   … (showing 15 of ${placeholders.length})`)
    console.log()
  }

  // ── D. Upstream data quality: children_details shorter than children_count
  console.log('D. master_leads_base submissions where children_details is shorter than children_count')
  console.log('   (the missing names will appear as "Child N" placeholders in the CRM)')

  let dataQualityCount = 0
  for (const r of baseRows.rows) {
    const cc = r.children_count ?? 0
    const len = r.children_details_len ?? 0
    if (cc > 1 && len < cc) {
      dataQualityCount++
      if (dataQualityCount <= 15) {
        console.log(
          `   • base ${r.base_id}: children_count=${cc}, children_details has ${len} entries` +
            ` (parent: ${r.full_name ?? '?'})`,
        )
      }
    }
  }
  if (dataQualityCount > 15) console.log(`   … ${dataQualityCount - 15} more`)
  console.log(`   Total upstream-incomplete rows: ${dataQualityCount}\n`)

  await pg.end()

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Summary')
  console.log(`  A. Submissions with missing siblings in CRM: ${missingCount}`)
  console.log(`  B. Lookalike contact groups (run backfill):  ${lookalikeGroups}`)
  console.log(`  C. Placeholder-named contacts:               ${placeholders.length}`)
  console.log(`  D. Upstream incomplete submissions:          ${dataQualityCount}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
