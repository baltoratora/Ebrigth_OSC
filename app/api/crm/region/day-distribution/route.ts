/**
 * /api/crm/region/day-distribution
 *
 * Powers the /crm/region "Day Distribution" dashboard: counts of CT and ENR
 * opportunities for each branch in scope, grouped by the contact's
 * preferredTrialDay (WED/THU/FRI/SAT/SUN).
 *
 * Query params:
 *   preset    today | yesterday | this_week | last_week | this_month |
 *             last_month | custom (default this_week)
 *   from,to   ISO timestamps (only used when preset=custom)
 *   region    all | A | B | C   (default all)
 *   branchId  all | <uuid>      (default all; when set, only that one branch)
 *
 * Role scope (via resolveBranchAccess):
 *   - SUPER_ADMIN / AGENCY_ADMIN  → every branch in the tenant
 *   - REGIONAL_MANAGER            → only the branches in their region(s)
 *     (the existing crm_user_branch links naturally limit them)
 *   - others                      → 403 (the page itself redirects them)
 *
 * CT / ENR detection: stage.shortCode = 'CT' / 'ENR' first, falling back to a
 * case-insensitive name match for legacy pipelines.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { resolveBranchAccess } from '@/lib/crm/branch-access'
import { isOperationAccount, OPERATION_HIDDEN_BRANCHES } from '@/lib/crm/operation-accounts'

type TrialDay = 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN'
const DAYS: TrialDay[] = ['WED', 'THU', 'FRI', 'SAT', 'SUN']
type Region = 'A' | 'B' | 'C'

// ─── Date range parsing (KL wall-clock — no DST) ──────────────────────────────
const KL_OFFSET_MS = 8 * 3600 * 1000

function startOfDayKL(now: Date = new Date()): Date {
  const wall = new Date(now.getTime() + KL_OFFSET_MS)
  const midnightKL = Date.UTC(
    wall.getUTCFullYear(),
    wall.getUTCMonth(),
    wall.getUTCDate(),
  )
  return new Date(midnightKL - KL_OFFSET_MS)
}

function parseDateRange(sp: URLSearchParams): { from: Date; to: Date } {
  const preset = sp.get('preset') ?? 'this_week'
  const today = startOfDayKL()
  const endOfToday = new Date(today.getTime() + 24 * 3600 * 1000 - 1)

  if (preset === 'custom') {
    const fromStr = sp.get('from') ?? today.toISOString()
    const toStr = sp.get('to') ?? endOfToday.toISOString()
    return { from: new Date(fromStr), to: new Date(toStr) }
  }

  const wall = new Date(today.getTime() + KL_OFFSET_MS)
  const dow = wall.getUTCDay() // 0 = Sun
  const daysSinceMon = dow === 0 ? 6 : dow - 1

  switch (preset) {
    case 'today':
      return { from: today, to: endOfToday }
    case 'yesterday': {
      const from = new Date(today.getTime() - 24 * 3600 * 1000)
      const to = new Date(today.getTime() - 1)
      return { from, to }
    }
    case 'last_week': {
      const fromMs = today.getTime() - (daysSinceMon + 7) * 24 * 3600 * 1000
      const toMs = today.getTime() - daysSinceMon * 24 * 3600 * 1000 - 1
      return { from: new Date(fromMs), to: new Date(toMs) }
    }
    case 'this_month': {
      const from = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), 1) - KL_OFFSET_MS)
      return { from, to: endOfToday }
    }
    case 'last_month': {
      const from = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth() - 1, 1) - KL_OFFSET_MS)
      const to = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), 1) - KL_OFFSET_MS - 1)
      return { from, to }
    }
    case 'this_week':
    default: {
      const from = new Date(today.getTime() - daysSinceMon * 24 * 3600 * 1000)
      return { from, to: endOfToday }
    }
  }
}

// ─── Response shape ──────────────────────────────────────────────────────────
type DayCounts = { CT: number; ENR: number }
type Branch = {
  branchId: string
  branchName: string
  /** e.g. "Subang Taipan" — branchName stripped of "NN Ebright (" prefix and ")" suffix */
  shortName: string
  region: Region | null
  totals: DayCounts
  days: Record<TrialDay, DayCounts>
}

function zeroDays(): Record<TrialDay, DayCounts> {
  return {
    WED: { CT: 0, ENR: 0 },
    THU: { CT: 0, ENR: 0 },
    FRI: { CT: 0, ENR: 0 },
    SAT: { CT: 0, ENR: 0 },
    SUN: { CT: 0, ENR: 0 },
  }
}

/** "17 Ebright (Bandar Rimbayu)" → "Bandar Rimbayu" (graceful fallback to full name). */
function shortNameOf(branchName: string): string {
  const m = branchName.match(/\(([^)]+)\)/)
  return m?.[1]?.trim() ?? branchName
}

// ─── Handler ─────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const access = await resolveBranchAccess(session.user.id)
    if (!access) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const sp = req.nextUrl.searchParams
    const { from, to } = parseDateRange(sp)
    const regionParam = (sp.get('region') ?? 'all').toUpperCase() as 'ALL' | Region
    const branchIdParam = sp.get('branchId') ?? 'all'

    // ─── Resolve visible branches based on role + filters ────────────────────
    // Elevated callers see the whole tenant; non-elevated callers (incl.
    // REGIONAL_MANAGER) are scoped to their crm_user_branch link list.
    const branchWhere: Record<string, unknown> = { tenantId: access.tenantId }
    if (!access.elevated) {
      branchWhere.id = { in: access.branchIds }
    }
    // Operation accounts never see the internal OD + Marketing branches in the
    // Day Distribution (chips, overall, and per-branch rows all exclude them).
    if (isOperationAccount(session.user.email)) {
      branchWhere.name = { notIn: Array.from(OPERATION_HIDDEN_BRANCHES) }
    }
    if (regionParam !== 'ALL') {
      branchWhere.region = regionParam
    }
    if (branchIdParam !== 'all') {
      branchWhere.id = branchIdParam
    }

    const branchRows = await prisma.crm_branch.findMany({
      where: branchWhere,
      select: { id: true, name: true, region: true },
      orderBy: { name: 'asc' },
    })

    if (branchRows.length === 0) {
      return NextResponse.json({
        asOfDate: new Date().toISOString(),
        from: from.toISOString(),
        to: to.toISOString(),
        scope: access.elevated ? 'all' : 'regional',
        availableRegions: [],
        branches: [],
        overall: { totals: { CT: 0, ENR: 0 }, days: zeroDays() },
      })
    }

    const branchIds = branchRows.map((b) => b.id)

    // ─── Aggregate counts ─────────────────────────────────────────────────────
    // Single grouped SQL — count opportunities per (branch, day, bucket).
    // Bucket is 'CT' or 'ENR'; rows for any other stage are filtered out by
    // the WHERE clause. preferredTrialDay can be null (contact never picked a
    // day) — those rows are excluded from the grid since the dashboard
    // explicitly buckets by trial day.
    const rows = await prisma.$queryRaw<Array<{
      branchId: string
      day: TrialDay | null
      bucket: 'CT' | 'ENR'
      cnt: bigint
    }>>`
      SELECT
        o."branchId"                            AS "branchId",
        c."preferredTrialDay"::text             AS day,
        CASE
          WHEN s."shortCode" = 'CT'  OR s.name ~* '^confirmed for trial$' THEN 'CT'
          WHEN s."shortCode" = 'ENR' OR s.name ~* '^enrolled$'            THEN 'ENR'
        END                                     AS bucket,
        COUNT(*)::bigint                        AS cnt
      FROM   crm.crm_opportunity o
      JOIN   crm.crm_contact     c ON c.id = o."contactId"
      JOIN   crm.crm_stage       s ON s.id = o."stageId"
      WHERE  o."tenantId"  = ${access.tenantId}
        AND  o."branchId"  IN (${Prisma.join(branchIds)})
        AND  o."createdAt" >= ${from}
        AND  o."createdAt" <= ${to}
        AND  o."deletedAt" IS NULL
        AND  c."preferredTrialDay" IS NOT NULL
        AND  (
          s."shortCode" IN ('CT','ENR')
          OR s.name ~* '^(confirmed for trial|enrolled)$'
        )
      GROUP  BY o."branchId", c."preferredTrialDay", bucket
    `

    // ─── Build the response (Overall + per-branch rows) ──────────────────────
    const byBranch = new Map<string, Branch>()
    for (const b of branchRows) {
      byBranch.set(b.id, {
        branchId: b.id,
        branchName: b.name,
        shortName: shortNameOf(b.name),
        region: (b.region as Region | null) ?? null,
        totals: { CT: 0, ENR: 0 },
        days: zeroDays(),
      })
    }

    const overallDays = zeroDays()
    const overallTotals: DayCounts = { CT: 0, ENR: 0 }

    for (const r of rows) {
      if (!r.day) continue
      const branch = byBranch.get(r.branchId)
      if (!branch) continue
      const cnt = Number(r.cnt)
      branch.days[r.day][r.bucket] += cnt
      branch.totals[r.bucket] += cnt
      overallDays[r.day][r.bucket] += cnt
      overallTotals[r.bucket] += cnt
    }

    // List of regions the caller can switch between (drives the region
    // toolbar). Elevated users see all three; non-elevated users see only the
    // distinct regions of their granted branches.
    const availableRegions: Region[] = Array.from(
      new Set(
        branchRows
          .map((b) => b.region as Region | null)
          .filter((r): r is Region => !!r),
      ),
    ).sort()

    return NextResponse.json({
      asOfDate: new Date().toISOString(),
      from: from.toISOString(),
      to: to.toISOString(),
      scope: access.elevated ? 'all' : 'regional',
      availableRegions,
      overall: { totals: overallTotals, days: overallDays },
      branches: Array.from(byBranch.values()),
    })
  } catch (err) {
    console.error('[GET /api/crm/region/day-distribution]', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
