import { prisma } from '@/lib/crm/db'
import { scopedPrisma } from '@/lib/crm/tenancy'
import { normalizePhone } from '@/lib/crm/utils'
import type { Prisma } from '@prisma/client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContactsFilter {
  search?: string
  /** Single-branch filter (user-selected dropdown). Admins use this freely. */
  branchId?: string
  /**
   * Allowed-branch hard limit. When set, the query is restricted to contacts
   * whose `branchId` is in this list — non-elevated users (BRANCH_MANAGER /
   * BRANCH_STAFF) pass their own assigned branches here so they can never
   * fetch contacts outside their scope. Admins (elevated) leave it undefined
   * to see everything in the tenant.
   */
  branchIds?: string[]
  stageId?: string
  leadSourceId?: string
  assignedUserId?: string
  tagId?: string
  page?: number
  pageSize?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}

export interface PaginatedContacts {
  data: ContactListItem[]
  total: number
  page: number
  pageSize: number
}

const contactListInclude = {
  contactTags: { include: { tag: true } },
  assignedUser: { select: { id: true, name: true, email: true, image: true } },
  leadSource: { select: { id: true, name: true } },
  opportunities: {
    where: { deletedAt: null },
    orderBy: { lastStageChangeAt: 'desc' },
    take: 1,
    include: {
      stage: { select: { id: true, name: true, color: true, shortCode: true } },
    },
  },
} satisfies Prisma.crm_contactInclude

export type ContactListItem = Prisma.crm_contactGetPayload<{ include: typeof contactListInclude }>
export type ContactDetail = NonNullable<Awaited<ReturnType<typeof getContactById>>>

// ─── getContactsByTenant ──────────────────────────────────────────────────────

export async function getContactsByTenant(
  tenantId: string,
  filter: ContactsFilter = {},
): Promise<PaginatedContacts> {
  const scope = scopedPrisma(tenantId)
  const page = Math.max(1, filter.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 25))
  const skip = (page - 1) * pageSize
  const sortDir = filter.sortDir ?? 'desc'

  // Build orderBy
  const sortByMap: Record<string, Prisma.crm_contactOrderByWithRelationInput> = {
    name: { firstName: sortDir },
    createdAt: { createdAt: sortDir },
    updatedAt: { updatedAt: sortDir },
  }
  const orderBy: Prisma.crm_contactOrderByWithRelationInput =
    sortByMap[filter.sortBy ?? ''] ?? { createdAt: 'desc' }

  // Build where
  const baseWhere: Prisma.crm_contactWhereInput = {
    ...scope.whereOnly(),
    deletedAt: null,
  }

  // Branch scoping: if both filters are set, intersect them. branchIds is the
  // hard server-enforced gate; branchId is a user-selected refinement.
  if (filter.branchId && filter.branchIds?.length) {
    if (!filter.branchIds.includes(filter.branchId)) {
      // User asked for a branch they're not allowed to see — return empty set
      return { data: [], total: 0, page, pageSize }
    }
    baseWhere.branchId = filter.branchId
  } else if (filter.branchId) {
    baseWhere.branchId = filter.branchId
  } else if (filter.branchIds?.length) {
    baseWhere.branchId = { in: filter.branchIds }
  }
  if (filter.leadSourceId) baseWhere.leadSourceId = filter.leadSourceId
  if (filter.assignedUserId) baseWhere.assignedUserId = filter.assignedUserId

  if (filter.tagId) {
    baseWhere.contactTags = { some: { tagId: filter.tagId } }
  }

  // Stage filter: contact must have an opportunity in that stage
  if (filter.stageId) {
    baseWhere.opportunities = { some: { stageId: filter.stageId, deletedAt: null } }
  }

  // Search
  if (filter.search && filter.search.trim() !== '') {
    const q = filter.search.trim()
    const normalizedSearchPhone = normalizePhone(q)

    baseWhere.OR = [
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q, mode: 'insensitive' } },
      { phone: { contains: normalizedSearchPhone, mode: 'insensitive' } },
      { childName1: { contains: q, mode: 'insensitive' } },
      { childName2: { contains: q, mode: 'insensitive' } },
    ]
  }

  const [data, total] = await Promise.all([
    prisma.crm_contact.findMany({
      where: baseWhere,
      orderBy,
      skip,
      take: pageSize,
      include: contactListInclude,
    }),
    prisma.crm_contact.count({ where: baseWhere }),
  ])

  return { data, total, page, pageSize }
}

// ─── getContactById ───────────────────────────────────────────────────────────

export async function getContactById(tenantId: string, contactId: string) {
  const scope = scopedPrisma(tenantId)

  return prisma.crm_contact.findFirst({
    where: scope.where({ id: contactId, deletedAt: null }),
    include: {
      contactTags: {
        include: { tag: true },
      },
      assignedUser: {
        select: { id: true, name: true, email: true, image: true },
      },
      leadSource: {
        select: { id: true, name: true },
      },
      notes: {
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
      },
      tasks: {
        where: {},
        orderBy: { dueAt: 'asc' },
        include: {
          assignedUser: { select: { id: true, name: true, image: true } },
        },
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
      },
      calls: {
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
      },
      opportunities: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        include: {
          stage: { select: { id: true, name: true, color: true, shortCode: true } },
          pipeline: { select: { id: true, name: true } },
          assignedUser: { select: { id: true, name: true, image: true } },
          stageHistory: {
            orderBy: { changedAt: 'desc' },
            take: 10,
            include: {
              fromStage: { select: { id: true, name: true, color: true } },
              toStage: { select: { id: true, name: true, color: true } },
              changedByUser: { select: { id: true, name: true, image: true } },
            },
          },
        },
      },
    },
  })
}

// ─── getContactActivity ───────────────────────────────────────────────────────

export type ActivityItem =
  | { type: 'note'; id: string; body: string; createdAt: Date; user: { id: string; name: string | null; image: string | null } | null }
  | { type: 'task'; id: string; title: string; dueAt: Date | null; completedAt: Date | null; createdAt: Date; assignedUser: { id: string; name: string | null; image: string | null } | null }
  | { type: 'call'; id: string; outcome: string | null; notes: string | null; duration: number | null; createdAt: Date; user: { id: string; name: string | null; image: string | null } | null }
  | { type: 'message'; id: string; channel: string; direction: string; body: string; subject: string | null; status: string; createdAt: Date; user: { id: string; name: string | null; image: string | null } | null }
  | { type: 'stage_change'; id: string; fromStage: { id: string; name: string; color: string } | null; toStage: { id: string; name: string; color: string }; changedByUser: { id: string; name: string | null; image: string | null } | null; note: string | null; changedAt: Date }

export async function getContactActivity(
  tenantId: string,
  contactId: string,
): Promise<ActivityItem[]> {
  const scope = scopedPrisma(tenantId)

  const [notes, tasks, calls, messages, opportunities] = await Promise.all([
    prisma.crm_note.findMany({
      where: scope.where({ contactId }),
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true, image: true } } },
    }),
    prisma.crm_task.findMany({
      where: scope.where({ contactId }),
      orderBy: { createdAt: 'desc' },
      include: { assignedUser: { select: { id: true, name: true, image: true } } },
    }),
    prisma.crm_call.findMany({
      where: scope.where({ contactId }),
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true, image: true } } },
    }),
    prisma.crm_message.findMany({
      where: scope.where({ contactId }),
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true, image: true } } },
    }),
    prisma.crm_opportunity.findMany({
      where: scope.where({ contactId, deletedAt: null }),
      include: {
        stageHistory: {
          orderBy: { changedAt: 'desc' },
          include: {
            fromStage: { select: { id: true, name: true, color: true } },
            toStage: { select: { id: true, name: true, color: true } },
            changedByUser: { select: { id: true, name: true, image: true } },
          },
        },
      },
    }),
  ])

  const items: ActivityItem[] = [
    ...notes.map((n) => ({
      type: 'note' as const,
      id: n.id,
      body: n.body,
      createdAt: n.createdAt,
      user: n.user,
    })),
    ...tasks.map((t) => ({
      type: 'task' as const,
      id: t.id,
      title: t.title,
      dueAt: t.dueAt,
      completedAt: t.completedAt,
      createdAt: t.createdAt,
      assignedUser: t.assignedUser,
    })),
    ...calls.map((c) => ({
      type: 'call' as const,
      id: c.id,
      outcome: c.outcome,
      notes: c.notes,
      duration: c.duration,
      createdAt: c.createdAt,
      user: c.user,
    })),
    ...messages.map((m) => ({
      type: 'message' as const,
      id: m.id,
      channel: m.channel,
      direction: m.direction,
      body: m.body,
      subject: m.subject,
      status: m.status,
      createdAt: m.createdAt,
      user: m.user,
    })),
    ...opportunities.flatMap((opp) =>
      opp.stageHistory.map((sh) => ({
        type: 'stage_change' as const,
        id: sh.id,
        fromStage: sh.fromStage,
        toStage: sh.toStage,
        changedByUser: sh.changedByUser,
        note: sh.note,
        changedAt: sh.changedAt,
      }))
    ),
  ]

  // Sort by date descending
  return items.sort((a, b) => {
    const dateA = 'changedAt' in a ? a.changedAt : a.createdAt
    const dateB = 'changedAt' in b ? b.changedAt : b.createdAt
    return dateB.getTime() - dateA.getTime()
  })
}
