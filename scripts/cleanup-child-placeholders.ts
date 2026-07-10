// Run with: npx tsx scripts/cleanup-child-placeholders.ts [--dry-run]
//
// One-off cleanup for crm_contact rows that have a "Child N" placeholder
// firstName. These came from an earlier version of leads-import.ts whose
// JSON.parse() call was throwing on the pre-parsed jsonb array returned by
// node-postgres — silently falling through to the placeholder path even
// when children_details DID have a real child name (e.g. Naufal, Naura).
//
// For every contact whose firstName matches /^Child \d+$/:
//
//   1. Extract the sibling index from the firstName ("Child 3" → 3).
//   2. Pull master_leads_base.children_details for the source row via the
//      contact's externalSourceId (we split off the base_id prefix).
//   3. If children_details has a real name at index [N-1], use it →
//      firstName / lastName / childAge1 get the actual values, and
//      parentFullName stays set so the kanban treats it as a child card.
//   4. If children_details has no usable entry, fall back to splitting
//      parentFullName into firstName/lastName and clearing parentFullName
//      so the row renders as a parent submission.
//
// Idempotent — re-running won't re-process rows whose firstName no longer
// matches the placeholder pattern. The sibling-indexed externalSourceId is
// preserved throughout so contacts created from the same submission stay
// as distinct rows in the database.
//
// Requires LEADS_DB_URL in .env (same one the worker uses) for the
// master_leads_unified lookup.

import { Client as PgClient } from 'pg'
import { prisma } from '@/lib/crm/db'

const DRY_RUN = process.argv.includes('--dry-run')

const LEADS_DB_URL = process.env.LEADS_DB_URL
if (!LEADS_DB_URL) {
  console.error('LEADS_DB_URL is required (see server/workers/leadIngestWorker.ts).')
  process.exit(1)
}

interface ChildEntry { name?: string | null; age?: string | null }

function splitName(full: string): { firstName: string; lastName: string | null } {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: null }
  if (parts.length === 1) return { firstName: parts[0], lastName: null }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

/** Extract the base_id prefix from an externalSourceId.
 *  Modern shape: "<base_id>-<unix>-<idx>". Legacy shape: "<base_id>#<idx>" or just "<base_id>". */
function extractBaseId(externalSourceId: string): string {
  if (externalSourceId.includes('#')) return externalSourceId.split('#')[0]
  // The modern format is base-unix-idx. base_id may contain dashes too, so
  // strip the last two segments (unix + idx) rather than splitting on the
  // first dash. Heuristic: if there are ≥3 dash-segments, drop the last two.
  const parts = externalSourceId.split('-')
  if (parts.length >= 3) return parts.slice(0, parts.length - 2).join('-')
  return externalSourceId
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY (will UPDATE rows)'}`)

  const pg = new PgClient({ connectionString: LEADS_DB_URL })
  await pg.connect()

  const placeholders = await prisma.crm_contact.findMany({
    where: {
      deletedAt: null,
      firstName: { startsWith: 'Child ' },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      parentFullName: true,
      externalSourceId: true,
      externalSourceTable: true,
      phone: true,
    },
  })

  console.log(`Found ${placeholders.length} placeholder rows.\n`)

  let usedChildrenDetails = 0
  let usedParentFallback = 0
  let skipped = 0

  for (const c of placeholders) {
    const m = /^Child (\d+)$/.exec(c.firstName)
    if (!m) {
      skipped++
      continue
    }
    const idx = Number(m[1])
    if (!Number.isFinite(idx) || idx < 1) {
      skipped++
      continue
    }

    // Path 1 — look up children_details from master_leads_unified.
    let resolvedFromChildren = false
    if (c.externalSourceId) {
      const baseId = extractBaseId(c.externalSourceId)
      const res = await pg.query<{ children_details: unknown }>(
        `SELECT children_details
           FROM public.master_leads_unified
          WHERE source_id LIKE $1
          LIMIT 1`,
        [`${baseId}%`],
      )
      const raw = res.rows[0]?.children_details
      const children: ChildEntry[] | null = Array.isArray(raw)
        ? (raw as ChildEntry[])
        : typeof raw === 'string'
          ? (() => {
              try { return JSON.parse(raw) as ChildEntry[] } catch { return null }
            })()
          : null

      if (children) {
        const entry = children[idx - 1]
        const childName = (entry?.name ?? '').trim()
        if (childName) {
          const { firstName, lastName } = splitName(childName)
          const childAge = entry?.age ?? null
          console.log(
            `  ${c.id}: "${c.firstName}" → "${childName}"` +
              (childAge ? ` (${childAge})` : '') +
              ` [from children_details]`,
          )
          if (!DRY_RUN) {
            await prisma.crm_contact.update({
              where: { id: c.id },
              data: {
                firstName,
                lastName,
                childAge1: childAge,
                // parentFullName stays as-is — this row IS still a child.
              },
            })
          }
          usedChildrenDetails++
          resolvedFromChildren = true
        }
      }
    }

    if (resolvedFromChildren) continue

    // Path 2 — fall back to the parent's name (no usable entry in children_details).
    if (c.parentFullName) {
      const { firstName, lastName } = splitName(c.parentFullName)
      if (firstName) {
        console.log(
          `  ${c.id}: "${c.firstName}" → "${c.parentFullName}" [parent-name fallback]`,
        )
        if (!DRY_RUN) {
          await prisma.crm_contact.update({
            where: { id: c.id },
            data: {
              firstName,
              lastName,
              parentFullName: null, // row now reads as a parent submission
            },
          })
        }
        usedParentFallback++
        continue
      }
    }

    console.warn(`  ${c.id}: no children_details name + no parentFullName — leaving "${c.firstName}" untouched`)
    skipped++
  }

  await pg.end()

  console.log('\n──────────────────────────')
  console.log(`Placeholders scanned:                       ${placeholders.length}`)
  console.log(`Resolved from children_details:             ${usedChildrenDetails}${DRY_RUN ? ' (would be)' : ''}`)
  console.log(`Fell back to parentFullName (no child data): ${usedParentFallback}${DRY_RUN ? ' (would be)' : ''}`)
  console.log(`Skipped (couldn't resolve):                 ${skipped}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
