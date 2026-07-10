/**
 * Dashboard server queries.
 *
 * All data is scoped to a tenant and optional branch.
 * KL timezone (Asia/Kuala_Lumpur) is applied for day-boundary calculations.
 */

import { prisma } from '@/lib/crm/db'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import { eachDayOfInterval, format, startOfDay, endOfDay } from 'date-fns'
import { clampToDisplayMin } from '@/lib/crm/display-cutoff'

const KL_TZ = 'Asia/Kuala_Lumpur'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface DateRange {
  from: Date
  to: Date
}

export interface DashboardStats {
  leadsByStage: { stage: string; shortCode: string; count: number; color: string }[]
  conversionRates: {
    conversionRate: number
    confirmedRate: number
    showUpRate: number
    enrolmentRate: number
    totalLeads: number
    enrolled: number
    confirmed: number
    showedUp: number
  }
  leadSourceBreakdown: { source: string; count: number }[]
  revenueStats: {
    total: number
    count: number
  }
  branchComparison: {
    branchId: string
    branchName: string
    totalLeads: number
    enrolled: number
    conversionRate: number
    revenue: number
  }[]
  todaysTasks: {
    id: string
    title: string
    contactId: string
    contactName: string
    dueAt: Date
    assignedUserId: string
  }[]
  trends: {
    date: string
    leadsCreated: number
    enrolled: number
  }[]
  leaderboard: {
    userId: string
    userName: string
    branchName: string
    enrolled: number
    conversionRate: number
    totalLeads: number
  }[]
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function toKLBounds(range: DateRange): { fromUtc: Date; toUtc: Date } {
  // Interpret from/to as KL local midnight boundaries, convert to UTC
  const fromKL = startOfDay(toZonedTime(range.from, KL_TZ))
  const toKL = endOfDay(toZonedTime(range.to, KL_TZ))
  return {
    fromUtc: fromZonedTime(fromKL, KL_TZ),
    toUtc: fromZonedTime(toKL, KL_TZ),
  }
}

function safeRate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0
  return Math.round((numerator / denominator) * 10000) / 100 // 2dp %
}

// ─── Main query ────────────────────────────────────────────────────────────────

export async function getDashboardStats(
  tenantId: string,
  dateRange: DateRange,
  branchId?: string,
): Promise<DashboardStats> {
  const { fromUtc: rawFromUtc, toUtc } = toKLBounds(dateRange)
  // Apply the global display floor — even if the user picks "Last 30 Days"
  // that would reach into April, the queries below clamp to 1 May 2026 so the
  // dashboard stays consistent with the kanban.
  const fromUtc = clampToDisplayMin(rawFromUtc)

  const branchFilter = branchId ? { branchId } : {}

  // ── 1. All stages for this tenant ──────────────────────────────────────────
  const stages = await prisma.crm_stage.findMany({
    where: { tenantId },
    orderBy: { order: 'asc' },
    select: { id: true, name: true, shortCode: true, color: true },
  })

  // ── 2. Opportunities in date range ─────────────────────────────────────────
  const oppsInRange = await prisma.crm_opportunity.findMany({
    where: {
      tenantId,
      ...branchFilter,
      deletedAt: null,
      createdAt: { gte: fromUtc, lte: toUtc },
    },
    select: {
      id: true,
      stageId: true,
      value: true,
      branchId: true,
      assignedUserId: true,
      createdAt: true,
    },
  })

  // ── 3. Build leads by stage ─────────────────────────────────────────────────
  const stageCountMap = new Map<string, number>()
  for (const opp of oppsInRange) {
    stageCountMap.set(opp.stageId, (stageCountMap.get(opp.stageId) ?? 0) + 1)
  }

  const leadsByStage = stages.map((s) => ({
    stage: s.name,
    shortCode: s.shortCode,
    count: stageCountMap.get(s.id) ?? 0,
    color: s.color,
  }))

  // ── 4. Conversion rates using stage shortCodes ──────────────────────────────
  const stageByCode = new Map(stages.map((s) => [s.shortCode.toUpperCase(), s.id]))

  const countByCode = (code: string): number => {
    const id = stageByCode.get(code)
    if (!id) return 0
    return stageCountMap.get(id) ?? 0
  }

  const totalLeads = oppsInRange.length
  const enrolled = countByCode('ENR')
  const confirmed = countByCode('CT')
  const showedUp = countByCode('SU')

  const conversionRates = {
    conversionRate: safeRate(enrolled, totalLeads),
    confirmedRate: safeRate(confirmed, totalLeads),
    showUpRate: safeRate(showedUp, confirmed),
    enrolmentRate: safeRate(enrolled, showedUp),
    totalLeads,
    enrolled,
    confirmed,
    showedUp,
  }

  // ── 5. Lead source breakdown ────────────────────────────────────────────────
  const contactsInRange = await prisma.crm_contact.findMany({
    where: {
      tenantId,
      ...branchFilter,
      deletedAt: null,
      createdAt: { gte: fromUtc, lte: toUtc },
    },
    select: {
      leadSourceId: true,
      leadSource: { select: { name: true } },
    },
  })

  const sourceMap = new Map<string, number>()
  for (const c of contactsInRange) {
    const name = c.leadSource?.name ?? 'Unknown'
    sourceMap.set(name, (sourceMap.get(name) ?? 0) + 1)
  }
  const leadSourceBreakdown = Array.from(sourceMap.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)

  // ── 6. Revenue stats ────────────────────────────────────────────────────────
  const enrStageId = stageByCode.get('ENR')
  const enrOpps = enrStageId
    ? oppsInRange.filter((o) => o.stageId === enrStageId)
    : []
  const revenueTotal = enrOpps.reduce(
    (sum, o) => sum + Number(o.value),
    0,
  )
  const revenueStats = { total: revenueTotal, count: enrOpps.length }

  // ── 7. Branch comparison (agency view) ─────────────────────────────────────
  let branchComparison: DashboardStats['branchComparison'] = []
  if (!branchId) {
    const branches = await prisma.crm_branch.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    })

    branchComparison = await Promise.all(
      branches.map(async (branch) => {
        const branchOpps = await prisma.crm_opportunity.findMany({
          where: {
            tenantId,
            branchId: branch.id,
            deletedAt: null,
            createdAt: { gte: fromUtc, lte: toUtc },
          },
          select: { stageId: true, value: true },
        })

        const total = branchOpps.length
        const branchEnrId = stageByCode.get('ENR')
        const branchEnrolled = branchEnrId
          ? branchOpps.filter((o) => o.stageId === branchEnrId).length
          : 0
        const branchRevenue = branchEnrId
          ? branchOpps
              .filter((o) => o.stageId === branchEnrId)
              .reduce((sum, o) => sum + Number(o.value), 0)
          : 0

        return {
          branchId: branch.id,
          branchName: branch.name,
          totalLeads: total,
          enrolled: branchEnrolled,
          conversionRate: safeRate(branchEnrolled, total),
          revenue: branchRevenue,
        }
      }),
    )
    branchComparison.sort((a, b) => b.conversionRate - a.conversionRate)
  }

  // ── 8. Today's tasks ────────────────────────────────────────────────────────
  const nowKL = toZonedTime(new Date(), KL_TZ)
  const todayStart = fromZonedTime(startOfDay(nowKL), KL_TZ)
  const todayEnd = fromZonedTime(endOfDay(nowKL), KL_TZ)

  const taskRows = await prisma.crm_task.findMany({
    where: {
      tenantId,
      ...branchFilter,
      completedAt: null,
      dueAt: { lte: todayEnd },
    },
    orderBy: { dueAt: 'asc' },
    take: 20,
    select: {
      id: true,
      title: true,
      contactId: true,
      assignedUserId: true,
      dueAt: true,
      contact: { select: { firstName: true, lastName: true } },
    },
  })

  const todaysTasks = taskRows
    .filter((t) => t.dueAt !== null)
    .map((t) => ({
      id: t.id,
      title: t.title,
      contactId: t.contactId ?? '',
      contactName: t.contact
        ? `${t.contact.firstName} ${t.contact.lastName ?? ''}`.trim()
        : 'Unknown',
      dueAt: t.dueAt as Date,
      assignedUserId: t.assignedUserId ?? '',
    }))

  // ── 9. Trends ───────────────────────────────────────────────────────────────
  const days = eachDayOfInterval({ start: range(fromUtc, toUtc).start, end: range(fromUtc, toUtc).end })
  const trendsMap = new Map<string, { leadsCreated: number; enrolled: number }>()
  for (const d of days) {
    trendsMap.set(format(toZonedTime(d, KL_TZ), 'yyyy-MM-dd'), {
      leadsCreated: 0,
      enrolled: 0,
    })
  }

  // Contacts created per day
  for (const c of contactsInRange) {
    // contacts are already filtered to range
  }
  const allContactsWithDates = await prisma.crm_contact.findMany({
    where: {
      tenantId,
      ...branchFilter,
      deletedAt: null,
      createdAt: { gte: fromUtc, lte: toUtc },
    },
    select: { createdAt: true },
  })
  for (const c of allContactsWithDates) {
    const key = format(toZonedTime(c.createdAt, KL_TZ), 'yyyy-MM-dd')
    const entry = trendsMap.get(key)
    if (entry) entry.leadsCreated++
  }

  // Enrolled per day
  for (const o of enrOpps) {
    const key = format(toZonedTime(o.createdAt, KL_TZ), 'yyyy-MM-dd')
    const entry = trendsMap.get(key)
    if (entry) entry.enrolled++
  }

  const trends = Array.from(trendsMap.entries()).map(([date, v]) => ({
    date,
    leadsCreated: v.leadsCreated,
    enrolled: v.enrolled,
  }))

  // ── 10. Leaderboard ─────────────────────────────────────────────────────────
  const assigneeMap = new Map<
    string,
    { userId: string; userName: string; branchName: string; enrolled: number; total: number }
  >()

  const userIds = [...new Set(oppsInRange.map((o) => o.assignedUserId).filter(Boolean))] as string[]
  const users = userIds.length
    ? await prisma.crm_auth_user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : []
  const userNameMap = new Map(users.map((u) => [u.id, u.name ?? u.email ?? u.id]))

  const branchIds = [...new Set(oppsInRange.map((o) => o.branchId))]
  const allBranches = await prisma.crm_branch.findMany({
    where: { id: { in: branchIds } },
    select: { id: true, name: true },
  })
  const branchNameMap = new Map(allBranches.map((b) => [b.id, b.name]))

  for (const o of oppsInRange) {
    const uid = o.assignedUserId ?? '__unassigned__'
    if (!assigneeMap.has(uid)) {
      assigneeMap.set(uid, {
        userId: uid,
        userName: uid === '__unassigned__' ? 'Unassigned' : (userNameMap.get(uid) ?? uid),
        branchName: branchNameMap.get(o.branchId) ?? '',
        enrolled: 0,
        total: 0,
      })
    }
    const entry = assigneeMap.get(uid)!
    entry.total++
    if (enrStageId && o.stageId === enrStageId) entry.enrolled++
  }

  const leaderboard = Array.from(assigneeMap.values())
    .map((e) => ({
      userId: e.userId,
      userName: e.userName,
      branchName: e.branchName,
      enrolled: e.enrolled,
      conversionRate: safeRate(e.enrolled, e.total),
      totalLeads: e.total,
    }))
    .sort((a, b) => b.enrolled - a.enrolled)
    .slice(0, 10)

  return {
    leadsByStage,
    conversionRates,
    leadSourceBreakdown,
    revenueStats,
    branchComparison,
    todaysTasks,
    trends,
    leaderboard,
  }
}

// Helper to get proper interval bounds for eachDayOfInterval
function range(from: Date, to: Date) {
  return { start: from, end: to }
}
