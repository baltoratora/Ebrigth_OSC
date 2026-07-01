/**
 * Shared constants + helpers for the Leads Dashboard metrics and the
 * drill-in list endpoint. Kept in one place so the headline counts
 * (leads-metrics route) and the "click a number to see who" list
 * (leads-metrics/list route) are guaranteed to use identical date windows,
 * region groupings and stage detection.
 */

import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { isPreviewMode } from '@/lib/crm/preview-mode'

export async function resolveTenantId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    if (!isPreviewMode()) return null
  }
  if (session?.user?.id) {
    const ub = await prisma.crm_user_branch.findFirst({
      where: { userId: session.user.id },
      select: { tenantId: true },
    })
    if (ub) return ub.tenantId
  }
  const bySlug = await prisma.crm_tenant.findFirst({
    where: { slug: { in: ['ebright', 'ebright-demo'] } },
    select: { id: true },
  })
  if (bySlug) return bySlug.id
  const first = await prisma.crm_tenant.findFirst({ select: { id: true }, orderBy: { createdAt: 'asc' } })
  return first?.id ?? null
}

/** Branches excluded from the elevated (super-admin) dashboard headline. */
export const ELEVATED_DASHBOARD_EXCLUDE = new Set<string>([
  '00 Ebright (OD)',
])

/** Stored branch name → short code (Data Studio labels). */
export const BRANCH_CODES: Record<string, string> = {
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

export const REGIONS: Record<'A' | 'B' | 'C', string[]> = {
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

/** Stage-name detection for the funnel categories. */
export const STAGE_PATTERN = {
  NL:  /^new lead$/i,
  CT:  /^confirmed for trial$/i,
  SU:  /^show[- ]up$/i,
  ENR: /^enrolled$/i,
  BUF: /^(self[- ]generated|buffer)/i,
}

export type StageCategory = keyof typeof STAGE_PATTERN

// ─── Trial-record stage scoping ─────────────────────────────────────────────
// The dashboard CT headline counts a lead's Trial Class record (by trial date)
// only while the lead is somewhere the trial still "counts": CT (booked), SU
// (showed up), SNE / CNS (showed-no-enrol / confirmed-no-show), ENR (enrolled)
// and RSD (rescheduling). A lead that backed out before the trial (FU*, CL,
// DND, NL, UR_W*, …) is NOT counted. The Trial Class Schedule grid is stricter:
// a lead only occupies a live slot while it's in CT or SU.
export const CT_DASHBOARD_KEEP_CODES = new Set(['CT', 'SU', 'SNE', 'CNS', 'ENR', 'RSD'])
export const TRIAL_SCHEDULE_KEEP_CODES = new Set(['CT', 'SU'])

type StageRow = { id: string; shortCode: string | null; name: string }
const normCode = (s: StageRow): string => (s.shortCode ?? '').toUpperCase().replace(/_/g, '')

/** Stage IDs whose lead's Trial Class record counts toward the CT headline. */
export function ctKeepStageIds(stages: StageRow[]): string[] {
  return stages
    .filter(
      (s) =>
        CT_DASHBOARD_KEEP_CODES.has(normCode(s)) ||
        /^confirmed for trial$/i.test(s.name) ||
        /^show[- ]up$/i.test(s.name) ||
        /^enrolled$/i.test(s.name),
    )
    .map((s) => s.id)
}

/** Stage IDs whose lead still occupies a live Trial Class schedule slot. */
export function scheduleKeepStageIds(stages: StageRow[]): string[] {
  return stages
    .filter(
      (s) =>
        TRIAL_SCHEDULE_KEEP_CODES.has(normCode(s)) ||
        /^confirmed for trial$/i.test(s.name) ||
        /^show[- ]up$/i.test(s.name),
    )
    .map((s) => s.id)
}

/** Resolve a branch name → region letter using REGIONS. */
export function regionFor(branchName: string): 'A' | 'B' | 'C' | null {
  if (REGIONS.A.includes(branchName)) return 'A'
  if (REGIONS.B.includes(branchName)) return 'B'
  if (REGIONS.C.includes(branchName)) return 'C'
  return null
}

// All dashboard ranges are computed in Asia/Kuala_Lumpur wall-clock terms.
// KL has no DST so a fixed +8h offset is safe.
export const KL_OFFSET_MS = 8 * 3600 * 1000

/** UTC instant at midnight Asia/Kuala_Lumpur for the KL day containing `now`. */
export function startOfDayKL(now: Date = new Date()): Date {
  const wall = new Date(now.getTime() + KL_OFFSET_MS)
  const midnightKL = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate())
  return new Date(midnightKL - KL_OFFSET_MS)
}

export function parseDateRange(sp: URLSearchParams): { from: Date; to: Date } {
  const preset = sp.get('preset') ?? 'this_week'
  const today = startOfDayKL()
  const endOfToday = new Date(today.getTime() + 24 * 3600 * 1000 - 1)

  if (preset === 'custom') {
    const fromStr = sp.get('from') ?? today.toISOString()
    const toStr = sp.get('to') ?? endOfToday.toISOString()
    return { from: new Date(fromStr), to: new Date(toStr) }
  }

  switch (preset) {
    case 'yesterday': {
      const from = new Date(today.getTime() - 24 * 3600 * 1000)
      const to = new Date(today.getTime() - 1)
      return { from, to }
    }
    case 'today': {
      return { from: today, to: endOfToday }
    }
    case 'last_week': {
      const wall = new Date(today.getTime() + KL_OFFSET_MS)
      const dow = wall.getUTCDay()
      const daysSinceMon = dow === 0 ? 6 : dow - 1
      const fromMs = today.getTime() - (daysSinceMon + 7) * 24 * 3600 * 1000
      const toMs   = today.getTime() - daysSinceMon * 24 * 3600 * 1000 - 1
      return { from: new Date(fromMs), to: new Date(toMs) }
    }
    case 'next_week': {
      // Full calendar week AFTER the current one (Mon 00:00 → Sun 23:59 KL).
      // Lets the dashboard show CT for trials booked next week (CT is counted
      // by trial-class date), mirroring the Trial Class Schedule widget.
      const wall = new Date(today.getTime() + KL_OFFSET_MS)
      const dow = wall.getUTCDay()
      const daysSinceMon = dow === 0 ? 6 : dow - 1
      const nextMonMs = today.getTime() + (7 - daysSinceMon) * 24 * 3600 * 1000
      return { from: new Date(nextMonMs), to: new Date(nextMonMs + 7 * 24 * 3600 * 1000 - 1) }
    }
    case '30d': {
      const from = new Date(today.getTime() - 29 * 24 * 3600 * 1000)
      return { from, to: endOfToday }
    }
    case 'this_week':
    default: {
      // Full calendar week (Mon 00:00 → Sun 23:59 KL). The end runs to Sunday
      // rather than "today" so CT — counted by trial-class date — includes
      // trials booked for later this week, matching the Trial Class Schedule
      // widget. NL / SU / ENR have no future-dated rows, so widening the end
      // doesn't change their counts; only the date-range label extends.
      const wall = new Date(today.getTime() + KL_OFFSET_MS)
      const dow = wall.getUTCDay()
      const daysBack = dow === 0 ? 6 : dow - 1
      const from = new Date(today.getTime() - daysBack * 24 * 3600 * 1000)
      const to = new Date(from.getTime() + 7 * 24 * 3600 * 1000 - 1)
      return { from, to }
    }
  }
}
