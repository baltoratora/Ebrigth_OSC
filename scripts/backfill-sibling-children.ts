// Run with: npx tsx scripts/backfill-sibling-children.ts [--dry-run]
//
// One-off fix for contacts that came in BEFORE the importer's sibling-index
// inference patch landed. Symptom in the UI: two (or more) lead cards for
// the same parent, every card displaying the parent's full name with no
// child age/level. The data is recoverable because master_leads_base.
// children_details (in ebrightleads_db) still has the array of children.
//
// Algorithm:
//   1. Group crm_contact rows by tenantId + phone (skip groups of size 1)
//      and only consider groups where every contact's firstName matches
//      the others' — that's the "they all show the parent name" signature.
//   2. For each group, look up children_details from master_leads_unified
//      via the contact's externalSourceId.
//   3. Order group contacts by createdAt ASC, assign children[0..N-1].
//   4. UPDATE crm_contact SET firstName, lastName, childAge1, parentFullName.
//
// Idempotent: rows whose firstName already differs from their parentFullName
// are skipped — re-running won't re-process already-fixed contacts.
//
// Requires LEADS_DB_URL in .env (same one the worker uses).

import { Client as PgClient } from 'pg'
import { prisma } from '@/lib/crm/db'

const DRY_RUN = process.argv.includes('--dry-run')
const LEADS_DB_URL = process.env.LEADS_DB_URL
if (!LEADS_DB_URL) {
  console.error('LEADS_DB_URL is required (see server/workers/leadIngestWorker.ts).')
  process.exit(1)
}

function splitName(full: string): { firstName: string; lastName: string | null } {
  const parts = full.trim().split(/\s+/)
  if (parts.length === 0) return { firstName: '', lastName: null }
  if (parts.length === 1) return { firstName: parts[0], lastName: null }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

interface ChildEntry {
  name?: string
  age?: string
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY (will UPDATE rows)'}`)

  const pg = new PgClient({ connectionString: LEADS_DB_URL })
  await pg.connect()

  // Pull every contact with a phone — we'll group them in JS. Doing this in
  // SQL is awkward without a window function the script can't easily filter
  // post-group.
  const allContacts = await prisma.crm_contact.findMany({
    where: { deletedAt: null, phone: { not: null } },
    select: {
      id: true,
      tenantId: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      childAge1: true,
      parentFullName: true,
      externalSourceTable: true,
      externalSourceId: true,
      createdAt: true,
    },
  })

  // Group by (tenantId, phone).
  const groups = new Map<string, typeof allContacts>()
  for (const c of allContacts) {
    const key = `${c.tenantId}|${c.phone}`
    const arr = groups.get(key) ?? []
    arr.push(c)
    groups.set(key, arr)
  }

  let scanned = 0
  let updated = 0
  let skipped = 0

  for (const [key, contacts] of groups.entries()) {
    if (contacts.length < 2) continue
    scanned += 1

    // Signature: every contact in the group shares the same firstName +
    // parentFullName is null (i.e. they all look like the parent). If even
    // one already has a distinct firstName, the group has been corrected
    // and we skip it.
    const firstNames = new Set(contacts.map((c) => c.firstName.toLowerCase()))
    const allSameName = firstNames.size === 1
    const noParentField = contacts.every((c) => !c.parentFullName)
    if (!allSameName || !noParentField) {
      skipped += 1
      continue
    }

    // Need an externalSourceId to look up children_details. Try the first
    // contact's; fall back to any other in the group if missing.
    const lookup = contacts.find((c) => c.externalSourceId)
    if (!lookup?.externalSourceId) {
      skipped += 1
      continue
    }

    // master_leads_unified mirrors master_leads_base by source_id. The
    // children_details column is a JSONB array — node-postgres returns it
    // as an already-parsed JS array, no JSON.parse needed.
    const baseId = lookup.externalSourceId.split('-')[0].split('#')[0]
    const res = await pg.query<{ children_details: ChildEntry[] | null }>(
      `SELECT children_details
         FROM public.master_leads_unified
        WHERE source_id LIKE $1
        LIMIT 1`,
      [`${baseId}%`],
    )
    const children = res.rows[0]?.children_details
    if (!Array.isArray(children) || children.length === 0) {
      skipped += 1
      continue
    }

    // Order contacts by createdAt so the assignment is deterministic.
    const ordered = [...contacts].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    )
    const parentFullName = ordered[0].firstName + (ordered[0].lastName ? ` ${ordered[0].lastName}` : '')

    for (let i = 0; i < ordered.length; i++) {
      const child = children[i]
      const target = ordered[i]

      // Real entry with a name → set the child's name + age, mark as child by
      // populating parentFullName. Missing entry (children_details shorter
      // than the group, or entry without a name) → leave the row showing the
      // parent's name and leave parentFullName NULL, so the kanban card
      // simply renders it like a parent submission. The BM can edit the name
      // in-place later once they know the actual child.
      if (child?.name) {
        const { firstName, lastName } = splitName(child.name)
        const childAge: string | null = child.age ?? null
        console.log(
          `  [${key}] contact ${target.id} → ${child.name}` +
            (childAge ? ` (${childAge})` : ''),
        )
        if (!DRY_RUN) {
          await prisma.crm_contact.update({
            where: { id: target.id },
            data: { firstName, lastName, childAge1: childAge, parentFullName },
          })
        }
        updated += 1
      } else {
        console.log(
          `  [${key}] contact ${target.id} → no child name at index ${i}, leaving parent-name fallback in place`,
        )
        // No-op: the existing row already shows the parent's name. We do NOT
        // set parentFullName here because the kanban would then render an
        // empty "child name" + parent below.
      }
    }
  }

  await pg.end()
  console.log('\n──────────────────────────')
  console.log(`Groups scanned: ${scanned}`)
  console.log(`Groups skipped: ${skipped}`)
  console.log(`Contacts ${DRY_RUN ? 'would be ' : ''}updated: ${updated}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
