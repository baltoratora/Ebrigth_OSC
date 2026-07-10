/**
 * Backfill crm_contact.preferredTrialDay from each contact's Trial Class
 * appointment weekday.
 *
 * Why: the Region "Day Distribution" dashboard buckets CT/ENR by
 * contact.preferredTrialDay, but the kanban "Confirmed for Trial" move only
 * ever created a crm_appointment — it never set preferredTrialDay (now fixed
 * going forward). This one-time pass fills the field for EXISTING leads from
 * their booked trial so the dashboard reflects them.
 *
 * Only fills contacts where preferredTrialDay is currently NULL (never
 * overwrites a manual value). Uses the contact's LATEST Trial Class
 * appointment. Appointments are stored naive-KL-as-UTC, so the UTC weekday
 * already represents the KL trial day.
 *
 * Usage:
 *   npx tsx scripts/backfill-preferred-trial-day.ts            # dry-run
 *   npx tsx scripts/backfill-preferred-trial-day.ts --apply    # write
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

const DAY_BY_DOW: Record<number, 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN'> = {
  3: 'WED', 4: 'THU', 5: 'FRI', 6: 'SAT', 0: 'SUN',
}

async function main() {
  const apply = process.argv.includes('--apply')
  console.log(`Mode: ${apply ? 'APPLY (writes)' : 'DRY-RUN (no writes)'}\n`)

  const tenant = await prisma.crm_tenant.findFirst({ select: { id: true } })
  if (!tenant) throw new Error('No tenant')

  // Latest Trial Class appointment per contact.
  const appts = await prisma.crm_appointment.findMany({
    where: { tenantId: tenant.id, title: 'Trial Class' },
    select: { contactId: true, startAt: true },
    orderBy: { startAt: 'desc' },
  })
  const latestByContact = new Map<string, Date>()
  for (const a of appts) {
    if (!latestByContact.has(a.contactId)) latestByContact.set(a.contactId, a.startAt)
  }
  console.log(`Contacts with a Trial Class appointment: ${latestByContact.size}`)

  // Only contacts that still have NULL preferredTrialDay.
  const contactIds = [...latestByContact.keys()]
  const nullContacts = await prisma.crm_contact.findMany({
    where: { tenantId: tenant.id, deletedAt: null, preferredTrialDay: null, id: { in: contactIds } },
    select: { id: true },
  })
  const nullSet = new Set(nullContacts.map((c) => c.id))
  console.log(`...of which preferredTrialDay is null: ${nullSet.size}`)

  // Build per-day update buckets.
  const byDay = new Map<'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN', string[]>()
  let skippedMonTue = 0
  for (const [contactId, startAt] of latestByContact) {
    if (!nullSet.has(contactId)) continue
    const day = DAY_BY_DOW[startAt.getUTCDay()]
    if (!day) { skippedMonTue++; continue }
    ;(byDay.get(day) ?? byDay.set(day, []).get(day)!).push(contactId)
  }

  const total = [...byDay.values()].reduce((s, a) => s + a.length, 0)
  console.log('\nWould set preferredTrialDay:')
  for (const [day, ids] of [...byDay.entries()].sort()) console.log(`  ${day}: ${ids.length}`)
  console.log(`  (skipped Mon/Tue trials: ${skippedMonTue})`)
  console.log(`TOTAL to update: ${total}`)

  if (apply && total > 0) {
    let done = 0
    for (const [day, ids] of byDay) {
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500)
        await prisma.crm_contact.updateMany({
          where: { id: { in: chunk }, preferredTrialDay: null },
          data: { preferredTrialDay: day },
        })
        done += chunk.length
      }
    }
    console.log(`\n✓ updated ${done} contacts`)
  }

  await prisma.$disconnect()
}

main().catch((e) => { console.error('ERROR:', e); process.exit(1) })
