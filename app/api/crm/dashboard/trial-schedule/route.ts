/**
 * Trial-class schedule grid for the branch-scoped Leads Dashboard.
 *
 * Query crm_appointment rows with title='Trial Class' that fall in the
 * window, bucket each one by (day-of-week × HH:MM slot label), and return
 * counts + the student list for each bucket so the UI can render the GHL-
 * style grid AND the click-through "who's joining" modal from a single
 * fetch.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { resolveBranchAccess } from '@/lib/crm/branch-access'
import { regionFor, scheduleKeepStageIds } from '@/lib/crm/dashboard-metrics'
import {
  TRIAL_DAY_ORDER,
  TRIAL_ALL_SLOTS,
} from '@/lib/crm/trial-config'

const KL_OFFSET_MS = 8 * 3600 * 1000

function startOfDayKL(d: Date = new Date()): Date {
  const wall = new Date(d.getTime() + KL_OFFSET_MS)
  const mid = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate())
  return new Date(mid - KL_OFFSET_MS)
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const access = await resolveBranchAccess(session.user.id)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  // Branch resolution mirrors the leads-metrics endpoint:
  //   - explicit ?branchId wins (admin viewing-as-branch)
  //   - else non-elevated users see their own branch(es)
  //   - else (elevated, no override) returns empty grid — the trial widget is
  //     a branch-level tool, not a tenant-wide rollup.
  const requestedBranchId = sp.get('branchId')
  // Branch name/region lookup for every branch in the tenant — used both to
  // resolve the "All Branches" set and to label each student with branch +
  // region in the drill-in.
  const allBranches = await prisma.crm_branch.findMany({
    where: { tenantId: access.tenantId },
    select: { id: true, name: true },
  })
  const branchNameById = new Map(allBranches.map((b) => [b.id, b.name]))

  // A non-elevated caller (branch manager / regional manager) may only query
  // a branch they're linked to — the RM trial-schedule picker sends each of
  // their region's branches, so this both enables that and closes the hole
  // where any signed-in user could read another branch's grid via ?branchId.
  const canSeeBranch = (id: string) => access.elevated || access.branchIds.includes(id)
  // "all" → every branch the caller may see (whole tenant for elevated, their
  // own links otherwise), so the widget can show an aggregated all-branches grid.
  const branchIds: string[] | null =
    requestedBranchId === 'all'
      ? (access.elevated ? allBranches.map((b) => b.id) : access.branchIds)
      : requestedBranchId
        ? (canSeeBranch(requestedBranchId) ? [requestedBranchId] : [])
        : access.elevated
          ? null              // No branch chosen → no data
          : access.branchIds

  if (!branchIds || branchIds.length === 0) {
    return NextResponse.json({
      range: { from: null, to: null },
      branchIds: [],
      days: TRIAL_DAY_ORDER.map((d) => ({
        key: d.key,
        label: d.label,
        slots: TRIAL_ALL_SLOTS.map((slot) => ({ slot, count: 0, students: [] })),
      })),
    })
  }

  // Time window — driven by ?preset. All boundaries are KL wall-clock days.
  //   today / yesterday          → 24h window
  //   this_week                  → current calendar week Mon-Sun in KL
  //   last_week / next_week      → rolling 7 days backwards or forwards from today
  //   this_month                 → calendar month containing today
  //   default ("next_7d")        → next 7 days starting today (back-compat)
  const preset = (sp.get('preset') ?? 'next_7d').toLowerCase()
  const today = startOfDayKL()
  const DAY = 24 * 3600 * 1000
  const WEEK = 7 * DAY
  // Monday 00:00 (KL) of the current week, as a real-UTC instant.
  const wall = new Date(today.getTime() + KL_OFFSET_MS)
  const dow = wall.getUTCDay() // 0=Sun..6=Sat
  const daysBackToMon = dow === 0 ? 6 : dow - 1 // 0 when today is Monday
  const thisMonday = new Date(today.getTime() - daysBackToMon * DAY)
  let from: Date
  let to:   Date
  switch (preset) {
    case 'today':
      from = today
      to   = new Date(today.getTime() + DAY - 1)
      break
    case 'yesterday':
      from = new Date(today.getTime() - DAY)
      to   = new Date(today.getTime() - 1)
      break
    case 'this_week':
      // Mon 00:00 → Sun 23:59:59.999 (KL) of the current calendar week.
      from = thisMonday
      to   = new Date(thisMonday.getTime() + WEEK - 1)
      break
    case 'last_week':
      from = new Date(thisMonday.getTime() - WEEK)
      to   = new Date(thisMonday.getTime() - 1)
      break
    case 'next_week':
      // Proper NEXT calendar week (Mon-Sun). NOT a rolling 7 days from today —
      // that overlapped this week's tail and made this-Sunday trials show up
      // under "next week" as well.
      from = new Date(thisMonday.getTime() + WEEK)
      to   = new Date(thisMonday.getTime() + 2 * WEEK - 1)
      break
    case 'this_month': {
      const monthStartUtc = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), 1)
      const nextMonthStartUtc = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth() + 1, 1)
      from = new Date(monthStartUtc - KL_OFFSET_MS)
      to   = new Date(nextMonthStartUtc - KL_OFFSET_MS - 1)
      break
    }
    case 'custom': {
      // from/to are YYYY-MM-DD KL calendar days. Build naive-KL midnight then
      // subtract the offset to get the real-UTC instant — same convention as
      // the other presets so the +KL_OFFSET appt-window shift below stays valid.
      const fromStr = sp.get('from')
      const toStr = sp.get('to')
      const fp = fromStr?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      const tp = toStr?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (fp && tp) {
        from = new Date(Date.UTC(+fp[1], +fp[2] - 1, +fp[3]) - KL_OFFSET_MS)
        to   = new Date(Date.UTC(+tp[1], +tp[2] - 1, +tp[3]) + DAY - 1 - KL_OFFSET_MS)
      } else {
        // Malformed/missing dates → fall back to the current week.
        from = thisMonday
        to   = new Date(thisMonday.getTime() + WEEK - 1)
      }
      break
    }
    case 'next_7d':
    default:
      from = today
      to   = new Date(today.getTime() + WEEK - 1)
      break
  }

  // Only show a trial while its lead still occupies a live slot — i.e. current
  // stage is CT (booked) or SU (showed up). A lead that moved past the trial
  // (SNE/CNS/ENR), rescheduled (RSD), or backed out leaves the grid even if its
  // trial record lingers.
  const scheduleStageIds = scheduleKeepStageIds(
    await prisma.crm_stage.findMany({
      where: { tenantId: access.tenantId },
      select: { id: true, shortCode: true, name: true },
    }),
  )

  const appointments = await prisma.crm_appointment.findMany({
    where: {
      tenantId: access.tenantId,
      title: 'Trial Class',
      branchId: { in: branchIds },
      // Trial appointments are stored "naive-KL-as-UTC" (a 10:30 KL trial has
      // UTC hour 10:30 — see the slot-label bucketing below). from/to are
      // real-UTC instants of KL midnights, so shift them +8h to compare in the
      // same naive-KL space. Without this, the last 8h of Sunday (the evening
      // slots) spilled out of "this week" into "next week".
      startAt: {
        gte: new Date(from.getTime() + KL_OFFSET_MS),
        lte: new Date(to.getTime() + KL_OFFSET_MS),
      },
      // Exclude soft-deleted leads, and scope to leads currently in CT / SU so
      // moved-on / rescheduled trials drop off the grid (see scheduleStageIds).
      contact: {
        deletedAt: null,
        opportunities: { some: { deletedAt: null, stageId: { in: scheduleStageIds } } },
      },
    },
    select: {
      id: true,
      startAt: true,
      branchId: true,
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          childAge1: true,
          leadSource: { select: { name: true } },
          opportunities: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true },
          },
        },
      },
    },
    orderBy: { startAt: 'asc' },
  })

  interface Student {
    appointmentId: string
    contactId: string
    opportunityId: string | null
    name: string
    phone: string | null
    branchName: string | null
    region: 'A' | 'B' | 'C' | null
    source: string | null
    childAge: string | null
    startAt: string
  }

  // Pre-build empty grid so cells with zero attendees still render in the
  // canonical order — the dashboard doesn't need to deal with sparse keys.
  const grid: Record<string, Record<string, Student[]>> = {}
  for (const d of TRIAL_DAY_ORDER) {
    grid[d.key] = {}
    for (const slot of TRIAL_ALL_SLOTS) grid[d.key][slot] = []
  }

  for (const a of appointments) {
    // moveOpportunity stores trial times as "naive-KL-as-UTC": the user
    // picks 06:00 PM and the row's startAt has UTC hour = 18. So we read
    // back via getUTCHours / getUTCDay directly — adding KL_OFFSET_MS
    // here would double-shift and bump every appointment off the grid.
    // (This relies on the existing storage convention; if a future fix
    // stores real UTC, both the storage and read sides change together.)
    const dow = a.startAt.getUTCDay()
    const dayMeta = TRIAL_DAY_ORDER.find((d) => d.dayIndex === dow)
    if (!dayMeta) continue
    const h24 = a.startAt.getUTCHours()
    const mm  = String(a.startAt.getUTCMinutes()).padStart(2, '0')
    const period = h24 >= 12 ? 'PM' : 'AM'
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12
    const slotLabel = `${String(h12).padStart(2, '0')}:${mm} ${period}`
    const bucket = grid[dayMeta.key]?.[slotLabel]
    if (!bucket) continue
    const name = `${a.contact.firstName}${a.contact.lastName ? ' ' + a.contact.lastName : ''}`.trim()
    const branchName = branchNameById.get(a.branchId) ?? null
    bucket.push({
      appointmentId:  a.id,
      contactId:      a.contact.id,
      opportunityId:  a.contact.opportunities[0]?.id ?? null,
      name:           name || '(No name)',
      phone:          a.contact.phone,
      branchName,
      region:         branchName ? regionFor(branchName) : null,
      source:         a.contact.leadSource?.name ?? null,
      childAge:       a.contact.childAge1,
      startAt:        a.startAt.toISOString(),
    })
  }

  return NextResponse.json({
    range:     { from: from.toISOString(), to: to.toISOString() },
    branchIds,
    days: TRIAL_DAY_ORDER.map((d) => ({
      key: d.key,
      label: d.label,
      slots: TRIAL_ALL_SLOTS.map((slot) => ({
        slot,
        count: grid[d.key][slot].length,
        students: grid[d.key][slot],
      })),
    })),
  })
}
