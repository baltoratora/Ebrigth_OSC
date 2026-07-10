import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { resolveCrmAdminSession } from '@/lib/crm/admin-session'

// Read-only viewer (CEO) gets a synthetic elevated reader so the audit log
// renders; this route is GET-only so there's nothing to write-guard.
const resolveSession = resolveCrmAdminSession

export async function GET(req: NextRequest) {
  try {
    const ctx = await resolveSession()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['SUPER_ADMIN', 'AGENCY_ADMIN', 'BRANCH_MANAGER'].includes(ctx.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const sp = req.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') ?? '1'))
    const pageSize = Math.min(100, Math.max(1, parseInt(sp.get('pageSize') ?? '25')))
    const search = sp.get('search')
    const action = sp.get('action')
    const entity = sp.get('entity')
    const dateFrom = sp.get('dateFrom')
    const dateTo = sp.get('dateTo')

    const where = {
      tenantId: ctx.tenantId,
      ...(search ? {
        OR: [
          { userEmail: { contains: search, mode: 'insensitive' as const } },
          { userId: { contains: search } },
          { entity: { contains: search } },
        ],
      } : {}),
      ...(action ? { action } : {}),
      ...(entity ? { entity: { contains: entity } } : {}),
      ...(dateFrom || dateTo ? {
        createdAt: {
          ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
          ...(dateTo ? { lte: new Date(dateTo + 'T23:59:59Z') } : {}),
        },
      } : {}),
    }

    const [logs, total] = await Promise.all([
      prisma.core_audit_log.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.core_audit_log.count({ where }),
    ])

    const enriched = await enrichLogs(logs, ctx.tenantId)
    return NextResponse.json({ logs: enriched, total, page, pageSize })
  } catch (err) {
    console.error('[GET /api/crm/audit-log]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── Enrichment: who (name + branch), which branch, what was done ──────────────

type RawLog = {
  id: string
  userId: string | null
  userEmail: string | null
  action: string
  entity: string
  entityId: string | null
  meta: unknown
  [k: string]: unknown
}

const ENTITY_LABEL: Record<string, string> = {
  crm_contact: 'contact',
  crm_opportunity: 'opportunity',
  crm_stage: 'pipeline stage',
  crm_pipeline: 'pipeline',
  crm_automation: 'automation',
  crm_tag: 'tag',
  crm_lead_source: 'lead source',
  crm_custom_value: 'custom value',
  crm_api_key: 'API key',
  crm_website_form: 'form',
  crm_branch: 'branch',
  crm_auth_user: 'user',
  tkt_ticket: 'ticket',
  tkt_platform: 'ticket platform',
  tkt_branch: 'ticket branch',
}
const ACTION_VERB: Record<string, string> = {
  CREATE: 'Created', UPDATE: 'Updated', DELETE: 'Deleted', READ: 'Viewed',
  LOGIN: 'Logged in', LOGOUT: 'Logged out', EXPORT: 'Exported', IMPORT: 'Imported',
  ASSIGN: 'Assigned', IMPERSONATE: 'Logged in as',
}

/** "09 Ebright (Klang)" → "Ebright (Klang)" for compact display. */
function cleanBranch(name: string): string {
  return name.replace(/^\d+\s+/, '')
}

function describe(entity: string, action: string, meta: Record<string, unknown>): string {
  const entityLabel = ENTITY_LABEL[entity] ?? entity
  const verb = ACTION_VERB[action] ?? action

  if (entity === 'crm_stage') {
    if (meta.scope === 'all-branches') {
      if (action === 'CREATE') return `Added stage "${meta.shortCode ?? ''}" to all branches`
      if (action === 'DELETE') return `Removed stage "${meta.shortCode ?? ''}" from all branches`
    }
    if (meta.action === 'reorder') return 'Reordered pipeline stages'
    if (Array.isArray(meta.fields)) return `Updated stage (${(meta.fields as string[]).join(', ')})`
  }
  if (entity === 'crm_auth_user' && action === 'IMPERSONATE') return 'Logged in as another user'

  const named = typeof meta.name === 'string' ? ` "${meta.name}"` : ''
  return `${verb} ${entityLabel}${named}`
}

async function enrichLogs(logs: RawLog[], tenantId: string) {
  const userIds = [...new Set(logs.map((l) => l.userId).filter((x): x is string => !!x))]
  const metaBranchIds = [...new Set(
    logs.map((l) => (l.meta as { branchId?: unknown } | null)?.branchId)
      .filter((x): x is string => typeof x === 'string'),
  )]

  const [users, links, metaBranches] = await Promise.all([
    userIds.length
      ? prisma.crm_auth_user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
      : Promise.resolve([]),
    userIds.length
      ? prisma.crm_user_branch.findMany({
          where: { userId: { in: userIds }, tenantId },
          select: { userId: true, role: true, branch: { select: { name: true } } },
        })
      : Promise.resolve([]),
    metaBranchIds.length
      ? prisma.crm_branch.findMany({ where: { id: { in: metaBranchIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ])

  const userById = new Map(users.map((u) => [u.id, u]))
  const branchById = new Map(metaBranches.map((b) => [b.id, b.name]))
  const linksByUser = new Map<string, { role: string; branchName: string | null }[]>()
  for (const l of links) {
    const arr = linksByUser.get(l.userId) ?? []
    arr.push({ role: l.role, branchName: l.branch?.name ?? null })
    linksByUser.set(l.userId, arr)
  }

  function actorBranch(userId: string | null): string | null {
    if (!userId) return null
    const ls = linksByUser.get(userId)
    if (!ls?.length) return null
    if (ls.some((x) => x.role === 'SUPER_ADMIN')) return 'Super Admin (all branches)'
    if (ls.some((x) => x.role === 'AGENCY_ADMIN')) return 'Agency Admin (all branches)'
    const names = [...new Set(ls.map((x) => x.branchName).filter((n): n is string => !!n))]
    return names.length ? names.map(cleanBranch).join(', ') : null
  }

  return logs.map((l) => {
    const meta = (l.meta ?? {}) as Record<string, unknown>
    const u = l.userId ? userById.get(l.userId) : undefined
    const metaBranchName = typeof meta.branchId === 'string'
      ? branchById.get(meta.branchId) ?? null
      : (typeof meta.branchName === 'string' ? meta.branchName : null)
    const aBranch = actorBranch(l.userId)
    return {
      ...l,
      actorName: u?.name ?? l.userEmail ?? null,
      actorEmail: u?.email ?? l.userEmail ?? null,
      actorBranch: aBranch,
      // "which branch" the change touched: from meta when available, else the
      // actor's own branch (a branch manager only ever edits their branch).
      affectedBranch: metaBranchName ? cleanBranch(metaBranchName) : aBranch,
      description: describe(l.entity, l.action, meta),
    }
  })
}
