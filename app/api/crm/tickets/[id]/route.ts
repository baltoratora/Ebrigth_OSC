/**
 * GET    /api/crm/tickets/[id] — Get a single ticket with full details
 * DELETE /api/crm/tickets/[id] — Hard-delete ticket (super_admin only)
 */

import { type NextRequest } from 'next/server'
import { prisma } from '@/lib/crm/db'
import { requireTktAuth, TktAuthError } from '@/lib/crm/tkt-auth'
import { logAudit } from '@/lib/crm/audit'
import { deleteS3Object, getPresignedDownloadUrl } from '@/lib/crm/s3'

// ─── Error helper ─────────────────────────────────────────────────────────────

function err(msg: string, status: number) {
  return Response.json({ error: msg }, { status })
}

// ─── Route params ─────────────────────────────────────────────────────────────

interface RouteContext {
  params: Promise<{ id: string }>
}

// ─── GET /api/crm/tickets/[id] ────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const ctx = await requireTktAuth(req.headers)
    const { id } = await params

    const ticket = await prisma.tkt_ticket.findFirst({
      where: { id, tenant_id: ctx.tenantId },
      include: {
        platform:    true,
        branch:      true,
        submitter:   true,
        attachments: { orderBy: { created_at: 'asc' } },
        events:      { orderBy: { created_at: 'asc' } },
      },
    })

    if (!ticket) return err('Ticket not found', 404)

    // Role-scoped access
    if (ctx.role === 'user' && ticket.user_id !== ctx.userId) {
      return err('Access denied', 403)
    }
    if (ctx.role === 'platform_admin' && !ctx.platformIds.includes(ticket.platform_id)) {
      return err('Access denied', 403)
    }

    // Audit log for super_admin reading archived tickets
    if (
      ctx.role === 'super_admin' &&
      ticket.status === 'complete' &&
      ticket.visible_until &&
      ticket.visible_until < new Date()
    ) {
      void logAudit({
        tenantId:  ctx.tenantId,
        userId:    ctx.userId,
        userEmail: ctx.email,
        action:    'READ',
        entity:    'tkt_ticket',
        entityId:  ticket.id,
        meta:      { archived: true, ticketNumber: ticket.ticket_number },
      })
    }

    // Generate presigned download URLs for attachments + reshape to the
    // legacy field names the UI (TicketTimeline / TicketDetail) consumes.
    // Schema was simplified (`url`, `filename`, `created_at`) but the UI
    // still expects (`s3_key`, `original_name`, `uploaded_at`, `file_type`,
    // `uploaded_by`, `size_bytes`).
    const attachmentsWithUrls = await Promise.all(
      ticket.attachments.map(async (att) => {
        let downloadUrl: string | null = null
        try {
          downloadUrl = await getPresignedDownloadUrl(att.url)
        } catch {
          // Non-fatal — URL generation failure doesn't break the response
        }
        return {
          id:            att.id,
          ticket_id:     att.ticket_id,
          file_type:     'general',
          original_name: att.filename,
          s3_key:        att.url,
          mime_type:     att.mime_type,
          size_bytes:    att.size,
          uploaded_by:   '',
          uploaded_at:   att.created_at,
          downloadUrl,
        }
      }),
    )

    // Reshape ticket events from the slim schema (event_type + meta JSON)
    // back to the rich shape the timeline component expects. Keeps the
    // schema simple while preserving UI behavior.
    const eventsForUi = ticket.events.map((ev) => {
      const meta = (ev.meta ?? {}) as Record<string, unknown>
      return {
        id:         ev.id,
        ticket_id:  ev.ticket_id,
        actor_id:   typeof meta.actor_id   === 'string' ? meta.actor_id   : '',
        type:       ev.event_type,
        from_value: typeof meta.from_value === 'string' ? meta.from_value : null,
        to_value:   typeof meta.to_value   === 'string' ? meta.to_value   : null,
        payload:    meta,
        created_at: ev.created_at,
      }
    })

    return Response.json({
      data: { ...ticket, attachments: attachmentsWithUrls, events: eventsForUi },
    })
  } catch (e) {
    if (e instanceof TktAuthError) return err(e.message, e.statusCode)
    console.error('[GET /api/crm/tickets/[id]]', e)
    return err('Internal server error', 500)
  }
}

// ─── DELETE /api/crm/tickets/[id] ────────────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    const ctx = await requireTktAuth(req.headers, { roles: ['super_admin'] })
    const { id } = await params

    const ticket = await prisma.tkt_ticket.findFirst({
      where: { id, tenant_id: ctx.tenantId },
      include: { attachments: true },
    })

    if (!ticket) return err('Ticket not found', 404)

    // Delete S3 objects for all attachments
    await Promise.allSettled(
      ticket.attachments.map((att) => deleteS3Object(att.url)),
    )

    // Hard-delete ticket (cascades to attachments + events via FK)
    await prisma.tkt_ticket.delete({ where: { id } })

    void logAudit({
      tenantId:  ctx.tenantId,
      userId:    ctx.userId,
      userEmail: ctx.email,
      action:    'DELETE',
      entity:    'tkt_ticket',
      entityId:  ticket.id,
      meta:      { ticketNumber: ticket.ticket_number },
    })

    return Response.json({ success: true })
  } catch (e) {
    if (e instanceof TktAuthError) return err(e.message, e.statusCode)
    console.error('[DELETE /api/crm/tickets/[id]]', e)
    return err('Internal server error', 500)
  }
}
