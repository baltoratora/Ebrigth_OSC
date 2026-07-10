// Run with: npx tsx scripts/rename-sg-to-buffer.ts
//
// One-off rename: every crm_stage row with shortCode='SG' becomes
// "Buffer (OD use only)". Idempotent — rerunning leaves correct rows alone.
//
// Runs against the ebright_crm database via @/lib/crm/db. Safe to execute on
// staging and production — there are no FKs on the stage `name` column, the
// dashboard's BUF detector pattern-matches both 'Self-Generated' and the new
// 'Buffer' label, and the kanban UI rebuilds from the name+shortCode each
// page load.
import { prisma } from '@/lib/crm/db'

async function main() {
  const before = await prisma.crm_stage.findMany({
    where: { shortCode: 'SG' },
    select: { id: true, name: true, tenantId: true, pipelineId: true },
  })
  console.log(`Found ${before.length} SG stage row(s)`)
  for (const r of before) {
    console.log(`  - tenant=${r.tenantId} pipeline=${r.pipelineId} name="${r.name}"`)
  }

  const result = await prisma.crm_stage.updateMany({
    where: { shortCode: 'SG' },
    data:  { name: 'Buffer (OD use only)' },
  })
  console.log(`Renamed ${result.count} stage row(s) to "Buffer (OD use only)".`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
