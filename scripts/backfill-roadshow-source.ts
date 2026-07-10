/**
 * Backfill: promote "roadshow" leads to a first-class "Roadshow" lead source.
 *
 * Historically roadshow leads were bucketed into the "Others" crm_lead_source
 * with crm_contact.leadSourceDetail = "roadshow". normalizeSourceName() now
 * returns "Roadshow" for new imports; this script reassigns the EXISTING ones
 * so every lead-source view/filter shows Roadshow separately.
 *
 * For each tenant: ensure a "Roadshow" crm_lead_source exists, then repoint
 * every contact whose leadSourceDetail looks like roadshow to it and clear the
 * now-redundant detail. Idempotent. Dry-run unless --apply.
 *
 *   npx tsx scripts/backfill-roadshow-source.ts          # dry-run (counts)
 *   npx tsx scripts/backfill-roadshow-source.ts --apply  # write
 */
import { prisma } from '@/lib/crm/db'

const APPLY = process.argv.includes('--apply')

async function main() {
  const tenants = await prisma.crm_tenant.findMany({ select: { id: true, slug: true } })
  for (const tenant of tenants) {
    // Candidate contacts: detail mentions roadshow (any casing / spacing).
    const candidates = await prisma.crm_contact.findMany({
      where: {
        tenantId: tenant.id,
        OR: [
          { leadSourceDetail: { contains: 'roadshow', mode: 'insensitive' } },
          { leadSourceDetail: { contains: 'road show', mode: 'insensitive' } },
          { leadSourceDetail: { contains: 'road-show', mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    })
    if (candidates.length === 0) {
      console.log(`[${tenant.slug}] no roadshow contacts — skipping`)
      continue
    }

    console.log(`[${tenant.slug}] ${candidates.length} roadshow contact(s) to reassign`)
    if (!APPLY) continue

    // Find or create the Roadshow source for this tenant.
    let src = await prisma.crm_lead_source.findFirst({
      where: { tenantId: tenant.id, name: 'Roadshow' },
      select: { id: true },
    })
    if (!src) {
      src = await prisma.crm_lead_source.create({
        data: { tenantId: tenant.id, name: 'Roadshow' },
        select: { id: true },
      })
      console.log(`[${tenant.slug}] created "Roadshow" lead source ${src.id}`)
    }

    const res = await prisma.crm_contact.updateMany({
      where: { id: { in: candidates.map((c) => c.id) } },
      // Repoint to Roadshow and drop the now-redundant detail (bucket == detail).
      data: { leadSourceId: src.id, leadSourceDetail: null },
    })
    console.log(`[${tenant.slug}] reassigned ${res.count} contact(s) to Roadshow`)
  }
  console.log(APPLY ? '\nApplied.' : '\nDry-run only. Re-run with --apply to write.')
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
