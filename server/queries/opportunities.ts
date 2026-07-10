import { prisma } from '@/lib/crm/db'
import { scopedPrisma } from '@/lib/crm/tenancy'
import { DISPLAY_MIN_CREATED_AT } from '@/lib/crm/display-cutoff'
import { phoneSearchDigits } from '@/lib/crm/utils'

/**
 * Resolve contact IDs whose stored phone matches a phone-like search term.
 *
 * Stored phones come in mixed shapes (+60…, 0…, raw with spaces/dashes), so a
 * plain `contains` misses obvious matches. We reduce BOTH the search term (via
 * phoneSearchDigits) and the stored column — strip to digits, drop a leading
 * Malaysian country code + trunk zero — to the shared national number and
 * substring-match on that. Returns null when the term isn't phone-like, so the
 * caller leaves the name/email search untouched.
 */
async function phoneMatchContactIds(tenantId: string, search: string): Promise<string[] | null> {
  const core = phoneSearchDigits(search)
  if (!core) return null
  const like = `%${core}%`
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM crm.crm_contact
    WHERE "tenantId" = ${tenantId}
      AND "deletedAt" IS NULL
      AND regexp_replace(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), '^(60)?0*', '') LIKE ${like}
  `
  return rows.map((r) => r.id)
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type OpportunityCard = {
  id: string
  tenantId: string
  branchId: string
  contactId: string
  pipelineId: string
  stageId: string
  value: string | number
  assignedUserId: string | null
  lastStageChangeAt: Date
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
  contact: {
    id: string
    firstName: string
    lastName: string | null
    email: string | null
    phone: string | null
    childName1: string | null
    childAge1: string | null
    childName2: string | null
    childAge2: string | null
    parentFullName: string | null
    campaignName: string | null
    preferredBranchId: string | null
    leadSourceId: string | null
    leadSource: { id: string; name: string } | null
    contactTags: {
      tag: { id: string; name: string; color: string }
    }[]
    /** Latest "Trial Class" appointment for this contact — surfaced on the
     *  kanban card + lead detail so BMs can see the booked timeslot at a
     *  glance without clicking through to the modal. Empty when the lead
     *  hasn't been moved to CT yet. */
    appointments: {
      id:      string
      startAt: Date
    }[]
  }
  assignedUser: {
    id: string
    name: string | null
    email: string
    image: string | null
  } | null
}

export type KanbanStage = {
  id: string
  tenantId: string
  pipelineId: string
  name: string
  shortCode: string
  order: number
  color: string
  stuckHoursYellow: number
  stuckHoursRed: number
  createdAt: Date
  updatedAt: Date
  opportunities: OpportunityCard[]
}

export type KanbanData = {
  stages: KanbanStage[]
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * When pipelineId starts with "all:<referenceId>", aggregate opportunities
 * from ALL pipelines in the tenant, grouped by stage NAME using the reference
 * pipeline's stage list as the column template (names are identical across
 * pipelines since they're cloned from the same template).
 */
export async function getAllBranchesKanban(
  tenantId: string,
  referencePipelineId: string,
  branchId?: string,
  search?: string,
): Promise<KanbanData> {
  const scope = scopedPrisma(tenantId)

  // Template stages from the reference pipeline — these are what we display as columns
  const referenceStages = await prisma.crm_stage.findMany({
    where: scope.where({ pipelineId: referencePipelineId }),
    orderBy: { order: 'asc' },
    select: {
      id: true,
      name: true,
      shortCode: true,
      color: true,
      order: true,
      stuckHoursYellow: true,
      stuckHoursRed: true,
    },
  })

  // Map every stage id in the tenant → its name (so we can group by name)
  const allStages = await prisma.crm_stage.findMany({
    where: scope.where({}),
    select: { id: true, name: true },
  })
  const stageNameById = new Map(allStages.map((s) => [s.id, s.name]))

  // Phone-digit pre-match: ids whose normalised phone contains the search's
  // national number (handles +60 / spaces / dashes). Null when not phone-like.
  const phoneIds = search ? await phoneMatchContactIds(tenantId, search) : null

  // Fetch every opportunity in the tenant (respecting branch + search filters)
  const opportunities = await prisma.crm_opportunity.findMany({
    where: {
      ...scope.where({}),
      deletedAt: null,
      createdAt: { gte: DISPLAY_MIN_CREATED_AT },
      ...(branchId ? { branchId } : {}),
      // Deleting a lead soft-deletes the CONTACT but not its opportunity, so a
      // contact-deleted card would otherwise linger on the board — exclude them.
      contact: {
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
                ...(phoneIds && phoneIds.length ? [{ id: { in: phoneIds } }] : []),
              ],
            }
          : {}),
      },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          childName1: true,
          childAge1: true,
          childName2: true,
          childAge2: true,
          parentFullName: true,
          campaignName: true,
          preferredBranchId: true,
          leadSourceId: true,
          leadSource: { select: { id: true, name: true } },
          contactTags: {
            include: { tag: { select: { id: true, name: true, color: true } } },
          },
          // Latest Trial Class appointment for the kanban card timeslot pill.
          appointments: {
            where: { title: 'Trial Class' },
            orderBy: { startAt: 'desc' },
            take: 1,
            select: { id: true, startAt: true },
          },
        },
      },
      assignedUser: { select: { id: true, name: true, email: true, image: true } },
    },
  })

  // Group by stage NAME
  const byStageName = new Map<string, typeof opportunities>()
  for (const o of opportunities) {
    const name = stageNameById.get(o.stageId)
    if (!name) continue
    const list = byStageName.get(name) ?? []
    list.push(o)
    byStageName.set(name, list)
  }

  // Build KanbanStage list using the reference template order + names
  const stages = referenceStages.map((s) => ({
    ...s,
    opportunities: byStageName.get(s.name) ?? [],
  }))

  return { stages: stages as unknown as KanbanStage[] }
}

export async function getPipelineKanban(
  tenantId: string,
  pipelineId: string,
  branchId?: string,
  search?: string,
): Promise<KanbanData> {
  // Synthetic "all:<referencePipelineId>" — aggregate across all pipelines
  if (pipelineId.startsWith('all:')) {
    const referenceId = pipelineId.slice(4)
    return getAllBranchesKanban(tenantId, referenceId, branchId, search)
  }

  const scope = scopedPrisma(tenantId)

  // Phone-digit pre-match (see getAllBranchesKanban) — null when not phone-like.
  const phoneIds = search ? await phoneMatchContactIds(tenantId, search) : null

  const stages = await prisma.crm_stage.findMany({
    where: scope.where({ pipelineId }),
    orderBy: { order: 'asc' },
    include: {
      opportunities: {
        where: {
          deletedAt: null,
          createdAt: { gte: DISPLAY_MIN_CREATED_AT },
          ...(branchId ? { branchId } : {}),
          // Contact-deletes don't cascade to the opp — exclude contact-deleted
          // leads so a deleted card doesn't linger on the board.
          contact: {
            deletedAt: null,
            ...(search
              ? {
                  OR: [
                    { firstName: { contains: search, mode: 'insensitive' } },
                    { lastName: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                    { phone: { contains: search, mode: 'insensitive' } },
                    ...(phoneIds && phoneIds.length ? [{ id: { in: phoneIds } }] : []),
                  ],
                }
              : {}),
          },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              childName1: true,
              childAge1: true,
              childName2: true,
              childAge2: true,
              parentFullName: true,
              campaignName: true,
              preferredBranchId: true,
              leadSourceId: true,
              leadSource: {
                select: { id: true, name: true },
              },
              contactTags: {
                include: {
                  tag: {
                    select: { id: true, name: true, color: true },
                  },
                },
              },
              // Latest Trial Class appointment so the kanban card can show
              // the booked timeslot at a glance.
              appointments: {
                where: { title: 'Trial Class' },
                orderBy: { startAt: 'desc' },
                take: 1,
                select: { id: true, startAt: true },
              },
            },
          },
          assignedUser: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      },
    },
  })

  // Map Prisma Decimal -> string|number on opportunity.value to match the
  // KanbanStage / OpportunityCard public type. Decimal carries extra runtime
  // surface that the UI doesn't need.
  const mapped = stages.map((s) => ({
    ...s,
    opportunities: s.opportunities.map((o) => ({
      ...o,
      value: o.value == null ? null : Number(o.value),
    })),
  })) as unknown as KanbanStage[]

  return { stages: mapped }
}

export async function getPipelinesByBranch(
  tenantId: string,
  branchId: string,
) {
  const scope = scopedPrisma(tenantId)

  return prisma.crm_pipeline.findMany({
    where: scope.where({ branchId }),
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      branchId: true,
      tenantId: true,
      createdAt: true,
      updatedAt: true,
    },
  })
}

export async function getOpportunityById(
  tenantId: string,
  opportunityId: string,
) {
  const scope = scopedPrisma(tenantId)

  return prisma.crm_opportunity.findFirst({
    where: scope.where({ id: opportunityId, deletedAt: null }),
    include: {
      contact: {
        include: {
          leadSource: true,
          contactTags: { include: { tag: true } },
          // Lead detail modal renders these inline so the BM can read recent
          // context + add a new note without leaving the kanban.
          notes: {
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
          // Latest Trial Class appointment surfaced as a "timeslot" pill
          // on the lead detail page + the kanban detail modal.
          appointments: {
            where: { title: 'Trial Class' },
            orderBy: { startAt: 'desc' },
            take: 1,
            select: { id: true, startAt: true },
          },
        },
      },
      stage: true,
      pipeline: true,
      assignedUser: {
        select: { id: true, name: true, email: true, image: true },
      },
      stageHistory: {
        include: {
          fromStage: true,
          toStage: true,
          changedByUser: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { changedAt: 'desc' },
      },
    },
  })
}

export async function getAllPipelinesForTenant(tenantId: string) {
  return prisma.crm_pipeline.findMany({
    where: { tenantId },
    include: {
      stages: {
        orderBy: { order: 'asc' },
      },
      branch: {
        select: { id: true, name: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}
