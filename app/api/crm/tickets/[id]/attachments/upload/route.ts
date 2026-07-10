import { type NextRequest } from 'next/server'
import { prisma } from '@/lib/crm/db'
import { requireTktAuth, TktAuthError } from '@/lib/crm/tkt-auth'
import { uploadToS3, MAX_SIZE_BYTES } from '@/lib/crm/s3'
import { logAudit } from '@/lib/crm/audit'

function err(msg: string, status: number) {
  return Response.json({ error: msg }, { status })
}

const FILE_TYPES = new Set(['black_white', 'general', 'other'])

/**
 * Server-side attachment upload. The client POSTs multipart form-data
 * (`file` + optional `fileType`); we upload to S3 from the server and register
 * the attachment row in one round-trip. This replaces the old presign →
 * browser-direct-PUT flow, which failed with "Failed to fetch" whenever the
 * S3 bucket's CORS didn't allow cross-origin PUTs from the app origin.
 */
export async function POST(
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

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return err('No file provided', 400)

    const fileTypeRaw = String(form.get('fileType') ?? 'general')
    const fileType = FILE_TYPES.has(fileTypeRaw) ? fileTypeRaw : 'general'

    const mimeType = file.type || 'application/octet-stream'
    if (file.size > MAX_SIZE_BYTES) return err('File exceeds 25 MB limit', 413)

    const buffer = Buffer.from(await file.arrayBuffer())
    let s3Key: string
    try {
      ;({ s3Key } = await uploadToS3({
        tenantId: ctx.tenantId,
        ticketId: id,
        fileName: file.name,
        mimeType,
        body: buffer,
      }))
    } catch (e) {
      // Surface validation (bad MIME / too big) and storage errors clearly.
      return err(e instanceof Error ? e.message : 'Upload failed', 400)
    }

    const [attachment] = await prisma.$transaction([
      prisma.tkt_ticket_attachment.create({
        data: {
          ticket_id: id,
          url: s3Key,
          filename: file.name,
          mime_type: mimeType,
          size: file.size,
        },
      }),
      prisma.tkt_ticket_event.create({
        data: {
          ticket_id: id,
          event_type: 'attachment_added',
          meta: {
            tenant_id: ctx.tenantId,
            actor_id: ctx.userId,
            fileType,
            fileName: file.name,
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
      meta: { ticketId: id, fileName: file.name },
    })

    const ui = {
      id:            attachment.id,
      ticket_id:     attachment.ticket_id,
      file_type:     fileType,
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
    console.error('[POST /api/crm/tickets/[id]/attachments/upload]', e)
    return err(e instanceof Error ? e.message : 'Internal server error', 500)
  }
}
