/**
 * PATCH /api/crm/tickets/[id]/status — Update ticket status with transition rules
 */

import { type NextRequest } from 'next/server'
import { prisma } from '@/lib/crm/db'
import { requireTktAuth, TktAuthError } from '@/lib/crm/tkt-auth'
import { enqueueTicketEmail } from '@/lib/crm/queue'
import { UpdateTicketStatusSchema, type TicketStatusType } from '@/lib/crm/validations/ticket'
import type { TktRole } from '@/lib/crm/permissions'

// ─── Error helper ─────────────────────────────────────────────────────────────

function err(msg: string, status: number) {
  return Response.json({ error: msg }, { status })
}

// ─── Route params ─────────────────────────────────────────────────────────────

interface RouteContext {
  params: Promise<{ id: string }>
}

// ─── Transition rules ─────────────────────────────────────────────────────────

type TransitionMap = Partial<Record<TicketStatusType, {
  to: TicketStatusType[]
  minRole: TktRole
}>>

const TRANSITIONS: TransitionMap = {
  received: {
    to: ['approved', 'rejected'],
    minRole: 'platform_admin',
  },
  approved: {
    to: ['in_progress', 'rejected'],
    minRole: 'platform_admin',
  },
  in_progress: {
    to: ['complete', 'rejected'],
    minRole: 'platform_admin',
  },
  rejected: {
    to: ['received', 'in_progress'],
    minRole: 'super_admin',
  },
  complete: {
    to: ['in_progress'],
    minRole: 'super_admin',
  },
}

function isTransitionAllowed(
  from: string,
  to: TicketStatusType,
  role: TktRole,
): boolean {
  // Super admin bypasses the workflow graph entirely. They can move a ticket
  // from any state to any state (e.g. received → in_progress, jumping the
  // 'approved' step, or complete → received to re-open). Lower roles must
  // follow TRANSITIONS.
  if (role === 'super_admin') return true

  const rule = TRANSITIONS[from as TicketStatusType]
  if (!rule) return false
  if (!rule.to.includes(to)) return false

  // Role hierarchy check
  if (rule.minRole === 'super_admin') return false  // super_admin already returned true above
  if (rule.minRole === 'platform_admin' && role === 'user') return false

  return true
}

// ─── PATCH /api/crm/tickets/[id]/status ──────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const ctx = await requireTktAuth(req.headers, {
      roles: ['platform_admin', 'super_admin'],
    })
    const { id } = await params

    const body = await req.json()
    const parsed = UpdateTicketStatusSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 422 },
      )
    }

    const { status: newStatus, adminRemark, rejectionReason } = parsed.data

    // Load ticket
    const ticket = await prisma.tkt_ticket.findFirst({
      where: { id, tenant_id: ctx.tenantId },
    })
    if (!ticket) return err('Ticket not found', 404)

    // Role-scoped access: a scoped department account may act only on tickets
    // directed to its department (by sub_type); other platform_admins by platform.
    if (ctx.departmentSubType) {
      if (ticket.sub_type !== ctx.departmentSubType) {
        return err('Access denied to this ticket', 403)
      }
    } else if (ctx.role === 'platform_admin' && !ctx.platformIds.includes(ticket.platform_id)) {
      return err('Access denied to this ticket', 403)
    }

    // Validate transition
    if (!isTransitionAllowed(ticket.status, newStatus, ctx.role)) {
      return err(
        `Transition from '${ticket.status}' to '${newStatus}' is not allowed for role '${ctx.role}'`,
        422,
      )
    }

    // Build update data
    const updateData: {
      status: string
      admin_remark?: string | null
      rejection_reason?: string | null
      completed_at?: Date | null
      visible_until?: Date | null
    } = { status: newStatus }

    if (adminRemark !== undefined) updateData.admin_remark = adminRemark
    if (rejectionReason !== undefined) updateData.rejection_reason = rejectionReason

    if (newStatus === 'complete') {
      const completedAt = new Date()
      const visibleUntil = new Date(completedAt.getTime() + 7 * 24 * 60 * 60 * 1000)
      updateData.completed_at = completedAt
      updateData.visible_until = visibleUntil
    }

    // Reopen: clear completion fields
    if (
      (newStatus === 'in_progress' && ticket.status === 'complete') ||
      (newStatus === 'in_progress' && ticket.status === 'rejected')
    ) {
      updateData.completed_at = null
      updateData.visible_until = null
      updateData.rejection_reason = null
    }

    // Perform update + write event in a transaction
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.tkt_ticket.update({
        where: { id },
        data: updateData,
        include: { platform: true, branch: true, submitter: true },
      })

      await tx.tkt_ticket_event.create({
        data: {
          ticket_id:  id,
          event_type: 'status_change',
          meta: {
            tenant_id:  ctx.tenantId,
            actor_id:   ctx.userId,
            from_value: ticket.status,
            to_value:   newStatus,
            ...(adminRemark    ? { adminRemark }    : {}),
            ...(rejectionReason ? { rejectionReason } : {}),
          },
        },
      })

      return result
    })

    // Notify submitter
    void enqueueTicketEmail({
      ticketId:        id,
      tenantId:        ctx.tenantId,
      event:           newStatus,
      recipientUserId: ticket.user_id,
    })

    return Response.json({ data: updated })
  } catch (e) {
    if (e instanceof TktAuthError) return err(e.message, e.statusCode)
    console.error('[PATCH /api/crm/tickets/[id]/status]', e)
    return err('Internal server error', 500)
  }
}
