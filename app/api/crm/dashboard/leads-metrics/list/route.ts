/**
 * Drill-in list behind a Leads Dashboard number.
 *
 * Given a metric (NL | CT | SU | ENR), a scope (main | A | B | C) and the same
 * date preset the dashboard is showing, returns the individual opportunities
 * that make up that count — using the IDENTICAL date window, region grouping
 * and stage detection as /api/crm/dashboard/leads-metrics, so the list length
 * matches the card.
 *
 * Visible to every signed-in user (scoped to what they can already see).
 * `canSeeBranch` is true for elevated (super/agency admin) + regional managers,
 * who manage multiple branches — the client shows the Branch column for them.
 */
import { type NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { clampToDisplayMin } from '@/lib/crm/display-cutoff'
import { resolveBranchAccess } from '@/lib/crm/branch-access'
import {
  resolveTenantId,
  ELEVATED_DASHBOARD_EXCLUDE,
  BRANCH_CODES,
  REGIONS,
  STAGE_PATTERN,
  KL_OFFSET_MS,
  parseDateRange,
  ctKeepStageIds,
} from '@/lib/crm/dashboard-metrics'

const MAX_ROWS = 1000

const CONTACT_SELECT = {
  parentFullName: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  leadSource: { select: { name: true } },
} as const

type Metric = 'NL' | 'CT' | 'SU' | 'ENR'
type Scope = 'main' | 'A' | 'B' | 'C'

interface ContactShape {
  parentFullName: string | null
  firstName: string
  lastName: string | null
  email: string | null
  phone: string | null
  leadSource: { name: string } | null
}

function toRow(contact: ContactShape | null, branchName: string, code: string) {
  const child = contact?.parentFullName
    ? `${contact.firstName} ${contact.lastName ?? ''}`.trim()
    : ''
  const parent = contact?.parentFullName
    ? contact.parentFullName
    : `${contact?.firstName ?? ''} ${contact?.lastName ?? ''}`.trim()
  return {
    parentName: parent || '—',
    childName: child || '—',
    leadSource: contact?.leadSource?.name ?? null,
    email: contact?.email ?? null,
    phone: contact?.phone ?? null,
    branchName,
    branchCode: code,
  }
}

export async function GET(req: NextRequest) {
  try {
    const tenantId = await resolveTenantId()
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const sp = req.nextUrl.searchParams
    const metric = (sp.get('metric') ?? 'NL') as Metric
    if (!['NL', 'CT', 'SU', 'ENR'].includes(metric)) {
      return NextResponse.json({ error: 'Invalid metric' }, { status: 400 })
    }
    const scope = (sp.get('scope') ?? 'main') as Scope

    // Resolve role + branch scope (mirrors the metrics route exactly).
    const session = await auth.api.getSession({ headers: await headers() })
    const access = session?.user?.id ? await resolveBranchAccess(session.user.id) : null
    const isElevatedUser = access?.elevated ?? true
    // Honor the topbar branch picker for elevated admins AND non-elevated
    // multi-branch users (BM/RM linked to >1 branch); a branch outside a
    // non-elevated user's grant is ignored. Mirrors the metrics route so the
    // drill-in list scopes to the same branch the card counted.
    // Marketing may drill into any branch's lead list (read-only), mirroring
    // the metrics route's cross-branch allowance.
    let isMarketing = false
    if (access && !isElevatedUser) {
      const mk = await prisma.crm_branch.findFirst({
        where: { tenantId, name: 'Ebright Marketing' },
        select: { id: true },
      })
      isMarketing = !!mk && access.branchIds.includes(mk.id)
    }
    const canViewAnyBranch = isElevatedUser || isMarketing

    const requestedBranchId = sp.get('branchId')
    const accessibleBranchIds = access?.branchIds ?? []
    const viewAsBranch = requestedBranchId
      ? (canViewAnyBranch || accessibleBranchIds.includes(requestedBranchId))
        ? requestedBranchId
        : null
      : null
    const elevated = isElevatedUser && !viewAsBranch
    const allowedBranchIds = elevated ? null : viewAsBranch ? [viewAsBranch] : accessibleBranchIds

    // Branch column is shown to multi-branch roles: elevated admins + regional managers.
    const roleRows = session?.user?.id
      ? await prisma.crm_user_branch.findMany({ where: { userId: session.user.id }, select: { role: true } })
      : []
    const isRegionalManager = roleRows.some((r) => r.role === 'REGIONAL_MANAGER')
    const canSeeBranch = isElevatedUser || isRegionalManager

    // Resolve which branches this scope covers.
    let branchWhere: { tenantId: string; name?: { in: string[] }; id?: { in: string[] } }
    if (elevated) {
      const names = scope === 'A' ? REGIONS.A
        : scope === 'B' ? REGIONS.B
        : scope === 'C' ? REGIONS.C
        : Object.keys(BRANCH_CODES).filter((n) => !ELEVATED_DASHBOARD_EXCLUDE.has(n))
      branchWhere = { tenantId, name: { in: names } }
    } else {
      branchWhere = { tenantId, id: { in: allowedBranchIds ?? [] } }
    }
    const branches = await prisma.crm_branch.findMany({ where: branchWhere, select: { id: true, name: true } })
    const branchIds = branches.map((b) => b.id)
    const branchNameById = new Map(branches.map((b) => [b.id, b.name]))
    if (branchIds.length === 0) {
      return NextResponse.json({ metric, scope, count: 0, truncated: false, canSeeBranch, rows: [] })
    }

    const range = parseDateRange(sp)
    const from = clampToDisplayMin(range.from)
    const to = range.to

    let rows: ReturnType<typeof toRow>[] = []

    if (metric === 'NL') {
      // NL = opportunities CREATED in range within scope (matches the card).
      const opps = await prisma.crm_opportunity.findMany({
        where: { tenantId, deletedAt: null, contact: { deletedAt: null }, createdAt: { gte: from, lte: to }, branchId: { in: branchIds } },
        select: { branchId: true, createdAt: true, contact: { select: CONTACT_SELECT } },
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS + 1,
      })
      rows = opps.map((o) => {
        const name = branchNameById.get(o.branchId) ?? ''
        return toRow(o.contact, name, BRANCH_CODES[name] ?? '')
      })
    } else if (metric === 'CT') {
      // CT = every trial this period for a lead still somewhere it counts
      // (CT/SU/SNE/CNS/ENR/RSD), mirroring the headline card: naive-KL bounds
      // (startAt is stored naive-KL-as-UTC). A lead that backed out before the
      // trial (FU*, CL, DND, NL, …) is excluded — matches the count.
      const apptFrom = new Date(from.getTime() + KL_OFFSET_MS)
      const apptTo = new Date(to.getTime() + KL_OFFSET_MS)
      const ctKeepIds = ctKeepStageIds(
        await prisma.crm_stage.findMany({ where: { tenantId }, select: { id: true, shortCode: true, name: true } }),
      )
      const appts = await prisma.crm_appointment.findMany({
        where: {
          tenantId,
          title: 'Trial Class',
          branchId: { in: branchIds },
          startAt: { gte: apptFrom, lte: apptTo },
          contact: {
            deletedAt: null,
            opportunities: { some: { deletedAt: null, stageId: { in: ctKeepIds } } },
          },
        },
        select: { branchId: true, startAt: true, contactId: true, contact: { select: CONTACT_SELECT } },
        orderBy: { startAt: 'desc' },
      })
      const seen = new Set<string>()
      for (const a of appts) {
        if (seen.has(a.contactId)) continue
        seen.add(a.contactId)
        const name = branchNameById.get(a.branchId) ?? ''
        rows.push(toRow(a.contact, name, BRANCH_CODES[name] ?? ''))
        if (rows.length > MAX_ROWS) break
      }
    } else {
      // SU / ENR = opportunities that ENTERED the stage in range (by
      // stage_history), deduped per opportunity — matches the card.
      const stages = await prisma.crm_stage.findMany({ where: { tenantId }, select: { id: true, name: true, shortCode: true } })
      const re = STAGE_PATTERN[metric]
      const catStageIds = stages.filter((s) => s.shortCode !== 'SG' && re.test(s.name)).map((s) => s.id)
      if (catStageIds.length > 0) {
        const entries = await prisma.crm_stage_history.findMany({
          where: {
            tenantId,
            changedAt: { gte: from, lte: to },
            toStageId: { in: catStageIds },
            opportunity: { branchId: { in: branchIds }, deletedAt: null, contact: { deletedAt: null } },
          },
          select: {
            opportunityId: true,
            changedAt: true,
            opportunity: { select: { branchId: true, contact: { select: CONTACT_SELECT } } },
          },
          orderBy: { changedAt: 'desc' },
        })
        const seen = new Set<string>()
        for (const e of entries) {
          if (seen.has(e.opportunityId)) continue
          seen.add(e.opportunityId)
          const bId = e.opportunity?.branchId ?? ''
          const name = branchNameById.get(bId) ?? ''
          rows.push(toRow(e.opportunity?.contact ?? null, name, BRANCH_CODES[name] ?? ''))
          if (rows.length > MAX_ROWS) break
        }
      }
    }

    // Stable, readable ordering: branch then parent name.
    rows.sort((a, b) => a.branchName.localeCompare(b.branchName, undefined, { numeric: true }) || a.parentName.localeCompare(b.parentName))

    const truncated = rows.length > MAX_ROWS
    return NextResponse.json({
      metric,
      scope,
      count: rows.length > MAX_ROWS ? MAX_ROWS : rows.length,
      truncated,
      canSeeBranch,
      rows: rows.slice(0, MAX_ROWS),
    })
  } catch (e) {
    console.error('[GET leads-metrics/list]', e)
    const message = e instanceof Error ? e.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
