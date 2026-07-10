import { type NextRequest } from 'next/server'
import { prisma } from '@/lib/crm/db'
import { requireTktAuth, TktAuthError } from '@/lib/crm/tkt-auth'

function err(msg: string, status: number) {
  return Response.json({ error: msg }, { status })
}

/**
 * Resolve the requested date range. Supports both shapes:
 *   - ?days=30                        → last N days ending now
 *   - ?from=2026-05-01&to=2026-05-12  → explicit ISO date range
 *   - ?preset=today|yesterday|7d|month → named shortcuts (KL wall-clock)
 *
 * KL timezone: business operates in Asia/Kuala_Lumpur (UTC+8, no DST).
 */
const KL_OFFSET_MS = 8 * 3600 * 1000

function startOfDayKL(d: Date = new Date()): Date {
  const wall = new Date(d.getTime() + KL_OFFSET_MS)
  const mid = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate())
  return new Date(mid - KL_OFFSET_MS)
}

function parseRange(sp: URLSearchParams): { from: Date; to: Date } {
  const preset = sp.get('preset')
  const todayStart = startOfDayKL()
  const todayEnd = new Date(todayStart.getTime() + 24 * 3600 * 1000 - 1)

  if (preset === 'today') return { from: todayStart, to: todayEnd }
  if (preset === 'yesterday') {
    const from = new Date(todayStart.getTime() - 24 * 3600 * 1000)
    return { from, to: new Date(from.getTime() + 24 * 3600 * 1000 - 1) }
  }
  if (preset === '7d') {
    return { from: new Date(todayEnd.getTime() - 7 * 24 * 3600 * 1000 + 1), to: todayEnd }
  }
  if (preset === 'month') {
    const wall = new Date(todayStart.getTime() + KL_OFFSET_MS)
    const monthStart = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), 1)
    return { from: new Date(monthStart - KL_OFFSET_MS), to: todayEnd }
  }

  const fromStr = sp.get('from')
  const toStr = sp.get('to')
  if (fromStr && toStr) {
    return {
      from: new Date(`${fromStr}T00:00:00.000Z`),
      to: new Date(`${toStr}T23:59:59.999Z`),
    }
  }

  // Default: last 30 days
  const days = parseInt(sp.get('days') ?? '30', 10)
  const safe = Number.isFinite(days) && days > 0 && days <= 365 ? days : 30
  return {
    from: new Date(Date.now() - safe * 24 * 3600 * 1000),
    to: new Date(),
  }
}

/**
 * ISO week label "YYYY-Www" for a date — used to bucket the line-chart series.
 * Week 1 is the week containing Jan 4 (ISO 8601), Monday-start.
 */
function isoWeekKey(d: Date): string {
  const wall = new Date(d.getTime() + KL_OFFSET_MS)
  const yr = wall.getUTCFullYear()
  const jan4 = Date.UTC(yr, 0, 4)
  const jan4Day = new Date(jan4).getUTCDay() || 7
  const week1Start = jan4 - (jan4Day - 1) * 24 * 3600 * 1000
  const dayUtc = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate())
  const week = Math.floor((dayUtc - week1Start) / (7 * 24 * 3600 * 1000)) + 1
  return `${yr}-W${String(week).padStart(2, '0')}`
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireTktAuth(req.headers)
    const sp = req.nextUrl.searchParams
    const { from, to } = parseRange(sp)

    const isAdmin = ctx.role === 'super_admin' || ctx.role === 'platform_admin'
    const deptParam = sp.get('dept')

    // Scope, mirroring the triage board so each account's dashboard reflects
    // exactly the tickets it can act on:
    //   • scoped DEPARTMENT account → only its directed tickets (by sub_type)
    //   • super admin viewing a department (?dept=) → that department's tickets
    //   • non-admin branch user → only its branch(es)
    //   • super admin → every ticket in the tenant
    const scopeFilter =
      ctx.departmentSubType
        ? { sub_type: ctx.departmentSubType }
        : isAdmin && deptParam
          ? { sub_type: deptParam }
          : !isAdmin && ctx.branchIds.length > 0
            ? { branch_id: { in: ctx.branchIds } }
            : !isAdmin
              ? { branch_id: '__none__' } // user has no branches → no tickets
              : {}

    const tickets = await prisma.tkt_ticket.findMany({
      where: {
        tenant_id: ctx.tenantId,
        created_at: { gte: from, lte: to },
        ...scopeFilter,
      },
      include: {
        platform: { select: { id: true, name: true, code: true, accent_color: true } },
        branch:   { select: { id: true, name: true, branch_number: true, code: true } },
      },
      orderBy: { created_at: 'asc' },
    })

    // ─── Totals by status ─────────────────────────────────────────────────────
    const byStatus: Record<string, number> = {
      received: 0,
      in_progress: 0,
      complete: 0,
      rejected: 0,
    }
    for (const t of tickets) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1

    // ─── Platform / branch aggregates ─────────────────────────────────────────
    const platformMap = new Map<string, { id: string; name: string; code: string; accent_color: string; total: number; open: number; completed: number }>()
    for (const t of tickets) {
      const key = t.platform.id
      const curr = platformMap.get(key) ?? {
        id: t.platform.id, name: t.platform.name, code: t.platform.code,
        accent_color: t.platform.accent_color, total: 0, open: 0, completed: 0,
      }
      curr.total += 1
      if (t.status === 'received' || t.status === 'in_progress') curr.open += 1
      if (t.status === 'complete') curr.completed += 1
      platformMap.set(key, curr)
    }
    const byPlatform = Array.from(platformMap.values()).sort((a, b) => b.total - a.total)

    const branchMap = new Map<string, { id: string; name: string; code: string; branch_number: string; total: number }>()
    for (const t of tickets) {
      const key = t.branch.id
      const curr = branchMap.get(key) ?? {
        id: t.branch.id, name: t.branch.name, code: t.branch.code, branch_number: t.branch.branch_number, total: 0,
      }
      curr.total += 1
      branchMap.set(key, curr)
    }
    const topBranches = Array.from(branchMap.values()).sort((a, b) => b.total - a.total).slice(0, 10)

    // ─── Weekly trend (line chart series) ─────────────────────────────────────
    // For super_admin: stacked-by-branch AND stacked-by-platform series.
    // For non-admin: single "total" series since they only see their branch.
    const weeks = new Set<string>()
    const branchWeekTotals = new Map<string, Map<string, number>>() // branchId → week → count
    const platformWeekTotals = new Map<string, Map<string, number>>() // platformId → week → count
    const overallWeekTotals = new Map<string, number>()              // week → count

    for (const t of tickets) {
      const wk = isoWeekKey(new Date(t.created_at))
      weeks.add(wk)
      overallWeekTotals.set(wk, (overallWeekTotals.get(wk) ?? 0) + 1)

      const branchMap = branchWeekTotals.get(t.branch.id) ?? new Map<string, number>()
      branchMap.set(wk, (branchMap.get(wk) ?? 0) + 1)
      branchWeekTotals.set(t.branch.id, branchMap)

      const platformMap = platformWeekTotals.get(t.platform.id) ?? new Map<string, number>()
      platformMap.set(wk, (platformMap.get(wk) ?? 0) + 1)
      platformWeekTotals.set(t.platform.id, platformMap)
    }
    const sortedWeeks = Array.from(weeks).sort()

    // Recharts likes an array of objects per X tick. Each row keyed by week,
    // values keyed by series name.
    const weeklyByBranch = sortedWeeks.map((wk) => {
      const row: Record<string, string | number> = { week: wk }
      for (const b of topBranches) {
        row[b.name] = branchWeekTotals.get(b.id)?.get(wk) ?? 0
      }
      return row
    })
    const weeklyByPlatform = sortedWeeks.map((wk) => {
      const row: Record<string, string | number> = { week: wk }
      for (const p of byPlatform) {
        row[p.name] = platformWeekTotals.get(p.id)?.get(wk) ?? 0
      }
      return row
    })
    const weeklyTotal = sortedWeeks.map((wk) => ({ week: wk, total: overallWeekTotals.get(wk) ?? 0 }))

    // ─── Daily trend (sparkline series for /crm/analytics) ───────────────────
    // The older Analytics page renders a per-day sparkline, while the newer
    // Ticket Dashboard uses the weekly buckets above. We emit both so a
    // single endpoint serves both pages without either crashing on missing
    // fields. Buckets are seeded for every KL day in the range so the chart
    // shows zeros instead of holes.
    const DAY_MS = 24 * 3600 * 1000
    const trendBuckets = new Map<string, number>()
    const trendStartKL = startOfDayKL(from)
    for (let t = trendStartKL.getTime(); t <= to.getTime(); t += DAY_MS) {
      const wall = new Date(t + KL_OFFSET_MS)
      const key = wall.toISOString().slice(0, 10)
      trendBuckets.set(key, 0)
    }
    for (const tk of tickets) {
      const wall = new Date(new Date(tk.created_at).getTime() + KL_OFFSET_MS)
      const key = wall.toISOString().slice(0, 10)
      if (trendBuckets.has(key)) {
        trendBuckets.set(key, (trendBuckets.get(key) ?? 0) + 1)
      }
    }
    const trend = Array.from(trendBuckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }))

    // ─── Resolution metrics ───────────────────────────────────────────────────
    const completed = tickets.filter((t) => t.status === 'complete' && t.completed_at)
    const avgResolutionMs = completed.length
      ? completed.reduce((sum, t) => sum + (new Date(t.completed_at!).getTime() - new Date(t.created_at).getTime()), 0) / completed.length
      : 0
    const avgResolutionHours = avgResolutionMs / 3_600_000
    const rejectionRate = tickets.length ? (byStatus.rejected ?? 0) / tickets.length : 0

    // ─── Top admins (assigned-ticket count) ───────────────────────────────────
    const adminMap = new Map<string, number>()
    for (const t of tickets) {
      if (t.assigned_admin_id) {
        adminMap.set(t.assigned_admin_id, (adminMap.get(t.assigned_admin_id) ?? 0) + 1)
      }
    }
    const adminIds = Array.from(adminMap.keys())
    const adminUsers = adminIds.length
      ? await prisma.crm_auth_user.findMany({
          where: { id: { in: adminIds } },
          select: { id: true, name: true, email: true },
        })
      : []
    const topAdmins = adminUsers
      .map((u) => ({ id: u.id, name: u.name ?? u.email, email: u.email, count: adminMap.get(u.id) ?? 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    // Day count for the legacy /crm/analytics header ("N day window"). Always
    // at least 1 so the label reads sensibly for the today/yesterday presets.
    const periodDays = Math.max(
      1,
      Math.round((to.getTime() - from.getTime()) / DAY_MS),
    )

    return Response.json({
      period:        { from: from.toISOString(), to: to.toISOString(), days: periodDays },
      scope:         { isAdmin, viewerBranchIds: ctx.branchIds, viewerRole: ctx.role },
      totals: {
        all:         tickets.length,
        received:    byStatus.received ?? 0,
        in_progress: byStatus.in_progress ?? 0,
        complete:    byStatus.complete ?? 0,
        rejected:    byStatus.rejected ?? 0,
      },
      byPlatform,
      topBranches,
      // Weekly buckets — consumed by /crm/tickets/dashboard.
      weeklyTotal,
      weeklyByBranch,
      weeklyByPlatform,
      // Daily bucket — consumed by /crm/analytics sparkline.
      trend,
      avgResolutionHours,
      rejectionRate,
      topAdmins,
    })
  } catch (e) {
    if (e instanceof TktAuthError) return err(e.message, e.statusCode)
    console.error('[GET analytics]', e)
    return err('Internal server error', 500)
  }
}
