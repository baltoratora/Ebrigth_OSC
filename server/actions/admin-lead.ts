'use server'

import type { Prisma } from '@prisma/client'
import { headers } from 'next/headers'
import { prisma } from '@/lib/crm/db'
import { auth } from '@/lib/crm/auth'
import { resolveBranchAccess } from '@/lib/crm/branch-access'
import { TRIAL_CAPACITY } from '@/lib/crm/trial-config'
import { logAudit } from '@/lib/crm/audit'

// ────────────────────────────────────────────────────────────────────────────
// SUPER-ADMIN-only lead edits, surfaced in the kanban card detail popup's
// "Action" sidebar. Every action re-verifies SUPER_ADMIN server-side, so
// AGENCY_ADMIN ("operation") and branch roles are rejected even if the UI is
// bypassed.
//
// The dashboard buckets each funnel metric by a different date signal:
//   CT  → trial-class appointment date
//   SU  → crm_stage_history.changedAt of the SU entry
//   ENR → crm_stage_history.changedAt of the ENR entry
// The "Last/This/Next week" control therefore edits whichever signal matches
// the lead's CURRENT stage, so the lead displays in the chosen dashboard week
// regardless of when the BM actually dragged it.
// ────────────────────────────────────────────────────────────────────────────

const KL = 8 * 3600 * 1000
const DAY = 86400000
const pad = (n: number) => String(n).padStart(2, '0')

async function requireSuperAdmin(): Promise<{ userId: string; tenantId: string }> {
  const session = await auth.api.getSession({ headers: await headers() })
  const userId = session?.user?.id
  if (!userId) throw new Error('Unauthorized')
  const access = await resolveBranchAccess(userId)
  if (!access?.isSuperAdmin) throw new Error('Only Super Admin can use lead admin actions.')
  return { userId, tenantId: access.tenantId }
}

/** Parse "07:15 PM" / "10am" / "14:00" → "HH:MM" (24h). */
function toHHMM(input: string): string {
  const t = input.trim().toUpperCase()
  const m24 = t.match(/^(\d{1,2}):(\d{2})$/)
  if (m24) return `${m24[1].padStart(2, '0')}:${m24[2]}`
  const m12 = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/)
  if (m12) {
    let h = parseInt(m12[1], 10)
    const min = m12[2] ?? '00'
    if (m12[3] === 'PM' && h !== 12) h += 12
    if (m12[3] === 'AM' && h === 12) h = 0
    return `${pad(h)}:${min}`
  }
  return '10:00'
}

// Appointment startAt is stored naive-KL-as-UTC (a 19:15 pick is saved 19:15Z),
// so read it back with UTC getters — matching how the kanban renders the pill.
function isoDateUTC(d: Date) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

type WeekChoice = 'last' | 'this' | 'next'
const weekOffset = (w: WeekChoice) => (w === 'last' ? -1 : w === 'next' ? 1 : 0)

/** KL "day index" (days since epoch in KL wall time) → Monday index of its week. */
function mondayIndexOf(dayIndex: number): number {
  const dow = new Date(dayIndex * DAY).getUTCDay()
  return dayIndex - (dow === 0 ? 6 : dow - 1)
}
/** Monday index of the CURRENT KL week. */
function todayMondayIndex(): number {
  const wall = new Date(Date.now() + KL)
  const todayIdx = Math.floor(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()) / DAY)
  return mondayIndexOf(todayIdx)
}
function dayIndexToYMD(idx: number): string {
  const d = new Date(idx * DAY)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
/** Classify a KL day index as last / this / next week (else 'other'). */
function classifyWeek(dayIndex: number): 'last' | 'this' | 'next' | 'other' {
  const diff = Math.round((mondayIndexOf(dayIndex) - todayMondayIndex()) / 7)
  return diff === 0 ? 'this' : diff === -1 ? 'last' : diff === 1 ? 'next' : 'other'
}
/** Same weekday in the target week → YYYY-MM-DD (KL). */
function sameWeekdayInWeek(w: WeekChoice, weekdayFromMon: number): string {
  return dayIndexToYMD(todayMondayIndex() + weekOffset(w) * 7 + weekdayFromMon)
}
/** Wednesday 12:00 KL of the target week → real-UTC Date (safely mid-week). */
function wedNoonOfWeek(w: WeekChoice): Date {
  const wedMidnightWallMs = (todayMondayIndex() + weekOffset(w) * 7 + 2) * DAY
  return new Date(wedMidnightWallMs + 12 * 3600000 - KL)
}

/** Replace the lead's Trial Class appointment (shared by trial edit + week shift). */
async function replaceTrial(
  tx: Prisma.TransactionClient,
  p: { tenantId: string; userId: string; contactId: string; branchId: string; date: string; slot: string },
) {
  const [startStr] = p.slot.split('–').map((s) => s.trim())
  const startAt = new Date(`${p.date}T${toHHMM(startStr)}:00`)
  if (Number.isNaN(startAt.getTime())) throw new Error('Invalid date/time')

  await tx.crm_appointment.deleteMany({
    where: { tenantId: p.tenantId, contactId: p.contactId, title: 'Trial Class' },
  })
  // Only live CT seats occupy the slot — retained records for leads who moved on
  // (SU/ENR/RSD/…) must not count toward capacity.
  const ctSeatStageIds = (
    await tx.crm_stage.findMany({
      where: {
        tenantId: p.tenantId,
        OR: [{ shortCode: 'CT' }, { name: { equals: 'Confirmed for Trial', mode: 'insensitive' } }],
      },
      select: { id: true },
    })
  ).map((s) => s.id)
  const booked = await tx.crm_appointment.count({
    where: {
      tenantId: p.tenantId,
      branchId: p.branchId,
      title: 'Trial Class',
      startAt,
      contact: { opportunities: { some: { stageId: { in: ctSeatStageIds } } } },
    },
  })
  if (booked >= TRIAL_CAPACITY) throw new Error(`That slot is fully booked (${booked}/${TRIAL_CAPACITY}). Pick another.`)
  await tx.crm_appointment.create({
    data: {
      tenantId: p.tenantId, branchId: p.branchId, contactId: p.contactId, userId: p.userId,
      startAt, endAt: new Date(startAt.getTime() + 60 * 60 * 1000), title: 'Trial Class',
    },
  })
  const TRIAL_DAY_BY_DOW: Record<number, 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN'> = {
    3: 'WED', 4: 'THU', 5: 'FRI', 6: 'SAT', 0: 'SUN',
  }
  const trialDay = TRIAL_DAY_BY_DOW[startAt.getUTCDay()]
  if (trialDay) await tx.crm_contact.update({ where: { id: p.contactId }, data: { preferredTrialDay: trialDay } })
}

export interface LeadAdminContext {
  stageName: string
  stageShort: string
  branchId: string
  contactName: string
  trial: { date: string; slot: string } | null
  enrolledPackage: string | null
  rescheduleDate: string | null
  /** Which funnel metric the week control re-buckets (null = not applicable). */
  weekMetric: 'CT' | 'SU' | 'ENR' | null
  /** The lead's current dashboard week for that metric (pre-ticks the control). */
  currentWeek: 'last' | 'this' | 'next' | 'other' | null
}

export async function getLeadAdminContext(
  opportunityId: string,
): Promise<{ ok: boolean; ctx?: LeadAdminContext; error?: string }> {
  try {
    const { tenantId } = await requireSuperAdmin()

    const opp = await prisma.crm_opportunity.findFirst({
      where: { id: opportunityId, tenantId, deletedAt: null },
      select: {
        branchId: true, contactId: true, stageId: true,
        stage: { select: { name: true, shortCode: true } },
        contact: { select: { firstName: true, lastName: true, enrolledPackage: true } },
      },
    })
    if (!opp) return { ok: false, error: 'Lead not found' }
    const code = (opp.stage.shortCode ?? '').toUpperCase()

    const appt = await prisma.crm_appointment.findFirst({
      where: { tenantId, contactId: opp.contactId, title: 'Trial Class' },
      orderBy: { startAt: 'desc' },
      select: { startAt: true },
    })
    let trial: LeadAdminContext['trial'] = null
    if (appt) {
      const d = new Date(appt.startAt)
      trial = { date: isoDateUTC(d), slot: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` }
    }

    const task = await prisma.crm_task.findFirst({
      where: { tenantId, contactId: opp.contactId, title: 'Reschedule follow-up' },
      orderBy: { dueAt: 'desc' },
      select: { dueAt: true },
    })
    const rescheduleDate = task?.dueAt ? isoDateUTC(new Date(task.dueAt)) : null

    // Week metric + current week, based on the lead's CURRENT stage.
    let weekMetric: LeadAdminContext['weekMetric'] = null
    let currentWeek: LeadAdminContext['currentWeek'] = null
    if (code === 'CT' && trial) {
      weekMetric = 'CT'
      const [y, m, d] = trial.date.split('-').map(Number)
      currentWeek = classifyWeek(Math.floor(Date.UTC(y, m - 1, d) / DAY))
    } else if (code === 'SU' || code === 'ENR') {
      weekMetric = code
      const h = await prisma.crm_stage_history.findFirst({
        where: { tenantId, opportunityId, toStageId: opp.stageId },
        orderBy: { changedAt: 'desc' },
        select: { changedAt: true },
      })
      if (h) currentWeek = classifyWeek(Math.floor((new Date(h.changedAt).getTime() + KL) / DAY))
    }

    return {
      ok: true,
      ctx: {
        stageName: opp.stage.name,
        stageShort: opp.stage.shortCode,
        branchId: opp.branchId,
        contactName: `${opp.contact.firstName} ${opp.contact.lastName ?? ''}`.trim() || '(No name)',
        trial, enrolledPackage: opp.contact.enrolledPackage, rescheduleDate,
        weekMetric, currentWeek,
      },
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to load' }
  }
}

/**
 * Re-bucket the lead into last/this/next dashboard week by editing the date
 * signal of its current funnel stage (CT → trial date; SU/ENR → stage-entry date).
 */
export async function adminSetLeadWeek(
  opportunityId: string,
  which: WeekChoice,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { userId, tenantId } = await requireSuperAdmin()
    const opp = await prisma.crm_opportunity.findFirst({
      where: { id: opportunityId, tenantId, deletedAt: null },
      select: { contactId: true, branchId: true, stageId: true, stage: { select: { shortCode: true } } },
    })
    if (!opp) return { ok: false, error: 'Lead not found' }
    const code = (opp.stage.shortCode ?? '').toUpperCase()

    if (code === 'CT') {
      const a = await prisma.crm_appointment.findFirst({
        where: { tenantId, contactId: opp.contactId, title: 'Trial Class' },
        orderBy: { startAt: 'desc' },
        select: { startAt: true },
      })
      if (!a) return { ok: false, error: 'No trial to move' }
      const d = new Date(a.startAt)
      const slot = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
      const weekdayFromMon = d.getUTCDay() === 0 ? 6 : d.getUTCDay() - 1
      const date = sameWeekdayInWeek(which, weekdayFromMon)
      await prisma.$transaction((tx) =>
        replaceTrial(tx, { tenantId, userId, contactId: opp.contactId, branchId: opp.branchId, date, slot }),
      )
    } else if (code === 'SU' || code === 'ENR') {
      const h = await prisma.crm_stage_history.findFirst({
        where: { tenantId, opportunityId, toStageId: opp.stageId },
        orderBy: { changedAt: 'desc' },
        select: { id: true },
      })
      if (!h) return { ok: false, error: 'No stage entry to move' }
      await prisma.crm_stage_history.update({ where: { id: h.id }, data: { changedAt: wedNoonOfWeek(which) } })
    } else {
      return { ok: false, error: 'Week control only applies to CT / SU / ENR leads.' }
    }

    void logAudit({
      tenantId, userId, action: 'UPDATE', entity: 'crm_opportunity', entityId: opportunityId,
      meta: { action: 'admin_set_week', which, stage: code },
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to set week' }
  }
}

/** Set / replace the lead's Trial Class appointment (full editor: date + slot). */
export async function adminSetTrial(
  opportunityId: string, date: string, timeSlot: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { userId, tenantId } = await requireSuperAdmin()
    const opp = await prisma.crm_opportunity.findFirst({
      where: { id: opportunityId, tenantId, deletedAt: null },
      select: { contactId: true, branchId: true },
    })
    if (!opp) return { ok: false, error: 'Lead not found' }
    await prisma.$transaction((tx) =>
      replaceTrial(tx, { tenantId, userId, contactId: opp.contactId, branchId: opp.branchId, date, slot: timeSlot }),
    )
    void logAudit({
      tenantId, userId, action: 'UPDATE', entity: 'crm_opportunity', entityId: opportunityId,
      meta: { action: 'admin_set_trial', date, timeSlot },
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to set trial' }
  }
}

/** Change the enrolled package length. */
export async function adminSetPackage(
  opportunityId: string, months: 3 | 6 | 9 | 12 | 18 | 24,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { userId, tenantId } = await requireSuperAdmin()
    const opp = await prisma.crm_opportunity.findFirst({
      where: { id: opportunityId, tenantId, deletedAt: null },
      select: { contactId: true },
    })
    if (!opp) return { ok: false, error: 'Lead not found' }
    await prisma.crm_contact.update({ where: { id: opp.contactId }, data: { enrolledPackage: `${months} months` } })
    void logAudit({
      tenantId, userId, action: 'UPDATE', entity: 'crm_contact', entityId: opp.contactId,
      meta: { action: 'admin_set_package', months },
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to set package' }
  }
}

/** Change the reschedule follow-up date. */
export async function adminSetRescheduleDate(
  opportunityId: string, date: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { userId, tenantId } = await requireSuperAdmin()
    const opp = await prisma.crm_opportunity.findFirst({
      where: { id: opportunityId, tenantId, deletedAt: null },
      select: { contactId: true, branchId: true },
    })
    if (!opp) return { ok: false, error: 'Lead not found' }
    const dueAt = new Date(`${date}T09:00:00`)
    if (Number.isNaN(dueAt.getTime())) return { ok: false, error: 'Invalid date' }
    const task = await prisma.crm_task.findFirst({
      where: { tenantId, contactId: opp.contactId, title: 'Reschedule follow-up' },
      orderBy: { createdAt: 'desc' }, select: { id: true },
    })
    if (task) await prisma.crm_task.update({ where: { id: task.id }, data: { dueAt } })
    else await prisma.crm_task.create({
      data: { tenantId, branchId: opp.branchId, contactId: opp.contactId, assignedUserId: userId, title: 'Reschedule follow-up', dueAt },
    })
    void logAudit({
      tenantId, userId, action: 'UPDATE', entity: 'crm_opportunity', entityId: opportunityId,
      meta: { action: 'admin_set_reschedule', date },
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to set date' }
  }
}
