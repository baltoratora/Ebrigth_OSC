/**
 * In-app notifications helper.
 *
 * Writes rows to `crm_notification`. The GET /api/crm/notifications endpoint
 * filters by the authenticated `userId`, so branch scoping is achieved purely
 * by *which users* we fan a notification out to — there is no per-row
 * audience field.
 *
 * Recipient resolution for branch-scoped events (new lead, transfer, etc.):
 *   - Every user linked to the event's branch via crm_user_branch
 *     (BRANCH_STAFF / BRANCH_MANAGER for that branch)
 *   - Every REGIONAL_MANAGER whose linked branches share a region with the
 *     event branch (a user managing region "A" sees all branches in region A)
 *   - Every elevated user (SUPER_ADMIN / AGENCY_ADMIN) in the tenant
 *
 * Each notification we write is also fanned out as a Web Push payload to any
 * subscribed devices for the recipient (best-effort; failures are logged but
 * don't roll back the in-app row).
 */

import type { PrismaClient } from '@prisma/client'
import { sendPushToUsers } from './push'

interface CreateLeadNotificationArgs {
  tenantId:   string
  branchId:   string
  contactId:  string
  leadName:   string
  leadSource: string | null
}

interface CreateTransferNotificationArgs {
  tenantId:       string
  fromBranchId:   string
  toBranchId:     string
  fromBranchName: string
  toBranchName:   string
  opportunityId:  string
  leadName:       string
  reason:         string
  transferredByUserId: string
}

// ─── Recipient resolution ─────────────────────────────────────────────────────

/**
 * Resolve the deduplicated user ID set that should receive a notification
 * about an event happening on `branchId`. See the file-header doc for the
 * full audience rules.
 */
async function resolveRecipients(
  prisma:   PrismaClient,
  tenantId: string,
  branchId: string,
): Promise<string[]> {
  // 1. Resolve the event branch's region (may be null for branches outside
  //    the canonical regional grouping — Ebright Marketing, OD, HR).
  const eventBranch = await prisma.crm_branch.findUnique({
    where:  { id: branchId },
    select: { region: true },
  })
  const region = eventBranch?.region ?? null

  // 2. Recipient set: (a) anyone linked to this branch, (b) any RM linked
  //    to ANY branch in the same region, (c) all elevated users.
  //    The OR-with-region check is skipped when region is null, since matching
  //    on NULL would otherwise pull in every other null-region branch's RMs.
  const recipientFilter: Array<Record<string, unknown>> = [
    { branchId },
    { role: { in: ['SUPER_ADMIN', 'AGENCY_ADMIN'] } },
  ]
  if (region) {
    recipientFilter.push({
      role:   'REGIONAL_MANAGER',
      branch: { is: { region } },
    })
  }

  const links = await prisma.crm_user_branch.findMany({
    where:  { tenantId, OR: recipientFilter },
    select: { userId: true },
  })

  return Array.from(new Set(links.map((l) => l.userId)))
}

// ─── Public helpers ───────────────────────────────────────────────────────────

export async function createLeadNotifications(
  prisma: PrismaClient,
  args:   CreateLeadNotificationArgs,
): Promise<number> {
  const { tenantId, branchId, contactId, leadName, leadSource } = args

  const userIds = await resolveRecipients(prisma, tenantId, branchId)
  if (userIds.length === 0) return 0

  const body  = leadSource
    ? `${leadName} submitted via ${leadSource}`
    : `${leadName} just came in`
  const title = 'New lead received'
  const link  = `/crm/contacts/${contactId}`

  const result = await prisma.crm_notification.createMany({
    data: userIds.map((userId) => ({
      tenantId,
      userId,
      type:  'NEW_LEAD',
      title,
      body,
      link,
    })),
  })

  // Web push fan-out — best effort, don't block on this.
  void sendPushToUsers(prisma, userIds, {
    title,
    body,
    url:   link,
    type:  'NEW_LEAD',
  }).catch((e) => {
    console.warn('[notifications] push fan-out failed (NEW_LEAD):', (e as Error).message)
  })

  return result.count
}

/**
 * Create notifications for a lead branch transfer. Notifies BOTH the source
 * and target branches with distinct title/body wording so each branch sees the
 * event from its own perspective.
 *
 * The user who initiated the transfer is excluded from their own notification
 * — they just clicked Transfer, no need to ping their own bell.
 */
export async function createTransferNotifications(
  prisma: PrismaClient,
  args:   CreateTransferNotificationArgs,
): Promise<{ outCount: number; inCount: number }> {
  const {
    tenantId, fromBranchId, toBranchId, fromBranchName, toBranchName,
    opportunityId, leadName, reason, transferredByUserId,
  } = args

  const [fromRecipients, toRecipients] = await Promise.all([
    resolveRecipients(prisma, tenantId, fromBranchId),
    resolveRecipients(prisma, tenantId, toBranchId),
  ])

  const filterInitiator = (ids: string[]) =>
    ids.filter((id) => id !== transferredByUserId)
  const outIds = filterInitiator(fromRecipients)
  const inIds  = filterInitiator(toRecipients)
  const link   = `/crm/opportunities/${opportunityId}`

  const outBody = `${leadName} was transferred to ${toBranchName} — Reason: ${reason}`
  const inBody  = `${leadName} was transferred from ${fromBranchName} — Reason: ${reason}`

  const [outResult, inResult] = await Promise.all([
    outIds.length === 0
      ? Promise.resolve({ count: 0 })
      : prisma.crm_notification.createMany({
          data: outIds.map((userId) => ({
            tenantId,
            userId,
            type:  'LEAD_TRANSFERRED_OUT',
            title: 'Lead transferred out',
            body:  outBody,
            link,
          })),
        }),
    inIds.length === 0
      ? Promise.resolve({ count: 0 })
      : prisma.crm_notification.createMany({
          data: inIds.map((userId) => ({
            tenantId,
            userId,
            type:  'LEAD_TRANSFERRED_IN',
            title: 'Lead transferred in',
            body:  inBody,
            link,
          })),
        }),
  ])

  void Promise.all([
    sendPushToUsers(prisma, outIds, {
      title: 'Lead transferred out',
      body:  outBody,
      url:   link,
      type:  'LEAD_TRANSFERRED_OUT',
    }),
    sendPushToUsers(prisma, inIds, {
      title: 'Lead transferred in',
      body:  inBody,
      url:   link,
      type:  'LEAD_TRANSFERRED_IN',
    }),
  ]).catch((e) => {
    console.warn('[notifications] push fan-out failed (TRANSFER):', (e as Error).message)
  })

  return { outCount: outResult.count, inCount: inResult.count }
}
