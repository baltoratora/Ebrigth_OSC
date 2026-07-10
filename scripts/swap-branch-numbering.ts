/**
 * Swap the branch NUMBER between Tropicana Sungai Buloh and Dataran Puchong
 * Utama. The number lives only in crm_branch.name ("NN Ebright (…)"); `code`
 * (TSB / DPU) and `region` (A / B) carry no number and stay as-is.
 *
 *   Tropicana Sungai Buloh : 23 → 21   (stays Region A, code TSB)
 *   Dataran Puchong Utama  : 21 → 23   (stays Region B, code DPU)
 *
 * Every branch dropdown in the CRM reads crm_branch.name, so this single
 * rename propagates everywhere (super-admin switcher, impersonation, branch
 * filter, ticket system, dashboards). Matched by location substring so it
 * works regardless of the current prefix; idempotent.
 *
 * IMPORTANT: run this together with the matching code change (BRANCH_CODES /
 * REGIONS keyed by the new names). Renaming the DB while the old code is still
 * live leaves those two branches without a code/region mapping until deploy.
 *
 *   npx tsx scripts/swap-branch-numbering.ts          # dry-run
 *   npx tsx scripts/swap-branch-numbering.ts --apply  # write
 */
import { prisma } from '@/lib/crm/db'

const APPLY = process.argv.includes('--apply')

const TARGETS = [
  { match: 'Tropicana Sungai Buloh', newName: '21 Ebright (Tropicana Sungai Buloh)' },
  { match: 'Dataran Puchong Utama',  newName: '23 Ebright (Dataran Puchong Utama)' },
]

async function main() {
  for (const { match, newName } of TARGETS) {
    const rows = await prisma.crm_branch.findMany({
      where: { name: { contains: match, mode: 'insensitive' } },
      select: { id: true, name: true, code: true, region: true },
    })
    if (rows.length === 0) {
      console.log(`! No branch matched "${match}"`)
      continue
    }
    for (const r of rows) {
      const change = r.name === newName ? '(already correct)' : `"${r.name}" → "${newName}"`
      console.log(`${match}: ${change}  [code=${r.code} region=${r.region}]`)
      if (APPLY && r.name !== newName) {
        await prisma.crm_branch.update({ where: { id: r.id }, data: { name: newName } })
      }
    }
  }
  console.log(APPLY ? '\nApplied.' : '\nDry-run only. Re-run with --apply (deploy the code change at the same time).')
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
