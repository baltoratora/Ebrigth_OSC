import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/crm/db'
import { requireTktAuth, TktAuthError } from '@/lib/crm/tkt-auth'
import { enqueueTicketEmail } from '@/lib/crm/queue'
import { logAudit } from '@/lib/crm/audit'

function err(msg: string, status: number) {
  return Response.json({ error: msg }, { status })
}

const AssignSchema = z.object({ adminId: z.string().uuid() })

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireTktAuth(req.headers, {
      roles: ['platform_admin', 'super_admin'],
    })
    const { id } = await params

    const body = await req.json()
    const parsed = AssignSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
    }

    const ticket = await prisma.tkt_ticket.findFirst({
      where: { id, tenant_id: ctx.tenantId },
    })
    if (!ticket) return err('Ticket not found', 404)

    const [updated] = await prisma.$transaction([
      prisma.tkt_ticket.update({
        where: { id },
        data: { assigned_admin_id: parsed.data.adminId },
      }),
      prisma.tkt_ticket_event.create({
        data: {
          ticket_id: id,
          event_type: 'assigned',
          meta: {
            tenant_id: ctx.tenantId,
            actor_id: ctx.userId,
            from_value: ticket.assigned_admin_id,
            to_value: parsed.data.adminId,
          },
        },
      }),
    ])

    void enqueueTicketEmail({
      ticketId: id,
      tenantId: ctx.tenantId,
      event: 'assigned',
      recipientUserId: parsed.data.adminId,
    })

    void logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      userEmail: ctx.email,
      action: 'ASSIGN',
      entity: 'tkt_ticket',
      entityId: id,
      meta: { adminId: parsed.data.adminId },
    })

    return Response.json({ success: true, data: updated })
  } catch (e) {
    if (e instanceof TktAuthError) return err(e.message, e.statusCode)
    console.error('[PATCH /api/crm/tickets/[id]/assign]', e)
    return err('Internal server error', 500)
  }
}
