// Run with: npx tsx scripts/backfill-branch-code-region.ts [--dry-run]
//
// One-off populator for crm_branch.code and crm_branch.region from the
// hard-coded maps that used to live in app/api/crm/dashboard/leads-metrics/
// route.ts. After the manage-branches feature moved the source of truth
// into the DB columns, every existing branch needs a one-time copy so the
// dashboard widgets keep showing the same letter codes / region buckets.
//
// Idempotent — only writes a column when it's currently null AND we have
// a value for it. Re-running is safe.

import { prisma } from '@/lib/crm/db'

const DRY_RUN = process.argv.includes('--dry-run')

const BRANCH_CODES: Record<string, string> = {
  '00 Ebright (OD)':                       'OD',
  '01 Ebright (Online)':                   'ONL',
  '02 Ebright (Subang Taipan)':            'ST',
  '03 Ebright (Setia Alam)':               'SA',
  '04 Ebright (Sri Petaling)':             'SP',
  '05 Ebright (Kota Damansara)':           'KD',
  '06 Ebright (Putrajaya)':                'PJY',
  '07 Ebright (Ampang)':                   'AMP',
  '08 Ebright (Cyberjaya)':                'CJY',
  '09 Ebright (Klang)':                    'KLG',
  '10 Ebright (Denai Alam)':               'DA',
  '11 Ebright (Bandar Baru Bangi)':        'BBB',
  '12 Ebright (Danau Kota)':               'DK',
  '13 Ebright (Shah Alam)':                'SHA',
  '14 Ebright (Bandar Tun Hussein Onn)':   'BTHO',
  '15 Ebright (Eco Grandeur)':             'EGR',
  '16 Ebright (Bandar Seri Putra)':        'BSP',
  '17 Ebright (Bandar Rimbayu)':           'RBY',
  '18 Ebright (Taman Sri Gombak)':         'TSG',
  '19 Ebright (Kota Warisan)':             'KW',
  '20 Ebright (Kajang TTDI Grove)':        'KTG',
  '21 Ebright (Tropicana Sungai Buloh)':   'TSB',
  '22 Ebright (Puncak Jalil)':             'PJL',
  '23 Ebright (Puchong Utama)':            'PU',
}

const REGIONS: Record<'A' | 'B' | 'C', string[]> = {
  A: [
    '17 Ebright (Bandar Rimbayu)',
    '09 Ebright (Klang)',
    '13 Ebright (Shah Alam)',
    '03 Ebright (Setia Alam)',
    '10 Ebright (Denai Alam)',
    '15 Ebright (Eco Grandeur)',
    '02 Ebright (Subang Taipan)',
    '21 Ebright (Tropicana Sungai Buloh)',
  ],
  B: [
    '12 Ebright (Danau Kota)',
    '05 Ebright (Kota Damansara)',
    '07 Ebright (Ampang)',
    '04 Ebright (Sri Petaling)',
    '14 Ebright (Bandar Tun Hussein Onn)',
    '20 Ebright (Kajang TTDI Grove)',
    '18 Ebright (Taman Sri Gombak)',
    '22 Ebright (Puncak Jalil)',
  ],
  C: [
    '06 Ebright (Putrajaya)',
    '19 Ebright (Kota Warisan)',
    '11 Ebright (Bandar Baru Bangi)',
    '08 Ebright (Cyberjaya)',
    '16 Ebright (Bandar Seri Putra)',
    '01 Ebright (Online)',
    '23 Ebright (Puchong Utama)',
  ],
}

function regionFor(name: string): 'A' | 'B' | 'C' | null {
  if (REGIONS.A.includes(name)) return 'A'
  if (REGIONS.B.includes(name)) return 'B'
  if (REGIONS.C.includes(name)) return 'C'
  return null
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY (will UPDATE rows)'}`)

  const branches = await prisma.crm_branch.findMany({
    select: { id: true, tenantId: true, name: true, code: true, region: true },
  })
  console.log(`Scanning ${branches.length} branch row(s) across all tenants.`)

  let updated = 0
  let skipped = 0

  for (const b of branches) {
    const wantCode   = BRANCH_CODES[b.name]   ?? null
    const wantRegion = regionFor(b.name)
    // Only set columns that are currently null AND we have a mapping for.
    // Don't overwrite a code/region that an admin already curated.
    const nextCode   = b.code   == null && wantCode   ? wantCode   : null
    const nextRegion = b.region == null && wantRegion ? wantRegion : null
    if (!nextCode && !nextRegion) {
      skipped += 1
      continue
    }
    console.log(
      `  ${b.name}` +
        (nextCode   ? ` · code=${nextCode}`   : '') +
        (nextRegion ? ` · region=${nextRegion}` : ''),
    )
    if (!DRY_RUN) {
      await prisma.crm_branch.update({
        where: { id: b.id },
        data: {
          ...(nextCode   ? { code:   nextCode }   : {}),
          ...(nextRegion ? { region: nextRegion } : {}),
        },
      })
    }
    updated += 1
  }

  console.log('\n──────────────────────────')
  console.log(`Branches updated: ${updated}`)
  console.log(`Branches skipped: ${skipped}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
