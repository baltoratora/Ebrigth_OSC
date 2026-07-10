import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/crm/db'
import { requireTktAuth, TktAuthError } from '@/lib/crm/tkt-auth'
import { getPresignedDownloadUrl } from '@/lib/crm/s3'
import { logAudit } from '@/lib/crm/audit'

function err(msg: string, status: number) {
  return Response.json({ error: msg }, { status })
}

const RegisterSchema = z.object({
  s3Key: z.string().min(1),
  originalName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive().optional(),
  fileType: z.enum(['black_white', 'general', 'other']),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireTktAuth(req.headers)
    const { id } = await params

    const ticket = await prisma.tkt_ticket.findFirst({
      where: { id, tenant_id: ctx.tenantId },
      select: { id: true },
    })
    if (!ticket) return err('Ticket not found', 404)

    const attachments = await prisma.tkt_ticket_attachment.findMany({
      where: { ticket_id: id },
      orderBy: { created_at: 'desc' },
    })

    // Reshape to legacy UI field names — see app/api/crm/tickets/[id]/route.ts
    // for the matching adapter applied to events.
    const enriched = await Promise.all(
      attachments.map(async (a) => ({
        id:            a.id,
        ticket_id:     a.ticket_id,
        file_type:     'general',
        original_name: a.filename,
        s3_key:        a.url,
        mime_type:     a.mime_type,
        size_bytes:    a.size,
        uploaded_by:   '',
        uploaded_at:   a.created_at,
        downloadUrl:   await getPresignedDownloadUrl(a.url).catch(() => null),
      })),
    )

    return Response.json(enriched)
  } catch (e) {
    if (e instanceof TktAuthError) return err(e.message, e.statusCode)
    console.error('[GET /api/crm/tickets/[id]/attachments]', e)
    return err('Internal server error', 500)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireTktAuth(req.headers)
    const { id } = await params

    const body = await req.json()
    const parsed = RegisterSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
    }

    const ticket = await prisma.tkt_ticket.findFirst({
      where: { id, tenant_id: ctx.tenantId },
    })
    if (!ticket) return err('Ticket not found', 404)

    const [attachment] = await prisma.$transaction([
      prisma.tkt_ticket_attachment.create({
        data: {
          ticket_id: id,
          url: parsed.data.s3Key,
          filename: parsed.data.originalName,
          mime_type: parsed.data.mimeType,
          size: parsed.data.sizeBytes ?? 0,
        },
      }),
      prisma.tkt_ticket_event.create({
        data: {
          ticket_id: id,
          event_type: 'attachment_added',
          meta: {
            tenant_id: ctx.tenantId,
            actor_id: ctx.userId,
            fileType: parsed.data.fileType,
            fileName: parsed.data.originalName,
          },
        },
      }),
    ])

    void logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      userEmail: ctx.email,
      action: 'CREATE',
      entity: 'tkt_ticket_attachment',
      entityId: attachment.id,
      meta: { ticketId: id, fileName: parsed.data.originalName },
    })

    // Reshape to legacy UI field names (see GET above for the same adapter).
    const ui = {
      id:            attachment.id,
      ticket_id:     attachment.ticket_id,
      file_type:     parsed.data.fileType,
      original_name: attachment.filename,
      s3_key:        attachment.url,
      mime_type:     attachment.mime_type,
      size_bytes:    attachment.size,
      uploaded_by:   ctx.userId,
      uploaded_at:   attachment.created_at,
    }
    return Response.json({ data: ui }, { status: 201 })
  } catch (e) {
    if (e instanceof TktAuthError) return err(e.message, e.statusCode)
    console.error('[POST /api/crm/tickets/[id]/attachments]', e)
    return err('Internal server error', 500)
  }
}
