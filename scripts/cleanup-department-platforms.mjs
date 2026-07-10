// Idempotent cleanup: remove the legacy `dept-*` ticket platforms.
//
// An earlier iteration modelled each department as its own tkt_platform. We
// pivoted to the existing model — departments are a ticket SUB_TYPE of the
// "Others" platform — so those standalone platforms are no longer used and
// would only clutter the New-Ticket platform picker. This removes them (and
// any user-platform / counter links), but ONLY when no real ticket references
// them (so we never lose ticket data).
//
// Safe to re-run. No-op once the platforms are gone.
//
// Run: docker exec ebright-osc-worker-1 node scripts/cleanup-department-platforms.mjs

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DEPT_SLUGS = ['dept-marketing', 'dept-operation', 'dept-hr', 'dept-finance', 'dept-academy', 'dept-ceo']

async function main() {
  const platforms = await prisma.tkt_platform.findMany({
    where: { slug: { in: DEPT_SLUGS } },
    select: { id: true, slug: true },
  })
  if (platforms.length === 0) {
    console.log('[cleanup-dept] no legacy dept-* platforms; nothing to do')
    return
  }
  const ids = platforms.map((p) => p.id)

  const ticketCount = await prisma.tkt_ticket.count({ where: { platform_id: { in: ids } } })
  if (ticketCount > 0) {
    console.warn(`[cleanup-dept] ${ticketCount} tickets still reference dept-* platforms — leaving them in place`)
    return
  }

  await prisma.tkt_user_platform.deleteMany({ where: { platform_id: { in: ids } } })
  await prisma.tkt_counter.deleteMany({ where: { platform_id: { in: ids } } })
  const del = await prisma.tkt_platform.deleteMany({ where: { id: { in: ids } } })
  console.log(`[cleanup-dept] removed ${del.count} legacy department platform(s): ${platforms.map((p) => p.slug).join(', ')}`)
}

main()
  .catch((e) => { console.error('[cleanup-dept]', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
