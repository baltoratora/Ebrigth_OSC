import { type NextRequest } from 'next/server'
import { prisma } from '@/lib/crm/db'
import { requireTktAuth, TktAuthError } from '@/lib/crm/tkt-auth'
import { getPresignedDownloadUrl, deleteS3Object } from '@/lib/crm/s3'
import { logAudit } from '@/lib/crm/audit'

function err(msg: string, status: number) {
  return Response.json({ error: msg }, { status })
}

/** GET — redirects to a presigned download URL */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; attId: string }> },
) {
  try {
    const ctx = await requireTktAuth(req.headers)
    const { id, attId } = await params

    const att = await prisma.tkt_ticket_attachment.findFirst({
      where: {
        id: attId,
        ticket_id: id,
        ticket: { tenant_id: ctx.tenantId },
      },
    })
    if (!att) return err('Attachment not found', 404)

    const url = await getPresignedDownloadUrl(att.url)
    return Response.redirect(url)
  } catch (e) {
    if (e instanceof TktAuthError) return err(e.message, e.statusCode)
    console.error('[GET attachment]', e)
    return err('Internal server error', 500)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; attId: string }> },
) {
  try {
    const ctx = await requireTktAuth(req.headers)
    const { id, attId } = await params

    const att = await prisma.tkt_ticket_attachment.findFirst({
      where: {
        id: attId,
        ticket_id: id,
        ticket: { tenant_id: ctx.tenantId },
      },
    })
    if (!att) return err('Attachment not found', 404)

    // Only platform_admin/super_admin can delete (uploader tracking removed
    // when tkt_ticket_attachment was simplified — uploader info now lives on
    // the related tkt_ticket_event 'attachment_added' meta payload).
    if (ctx.role === 'user') {
      return err('Forbidden', 403)
    }

    await deleteS3Object(att.url).catch((e) => console.error('[S3 delete failed]', e))
    await prisma.tkt_ticket_attachment.delete({ where: { id: attId } })

    void logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      userEmail: ctx.email,
      action: 'DELETE',
      entity: 'tkt_ticket_attachment',
      entityId: attId,
      meta: { ticketId: id, fileName: att.filename },
    })

    return Response.json({ success: true })
  } catch (e) {
    if (e instanceof TktAuthError) return err(e.message, e.statusCode)
    console.error('[DELETE attachment]', e)
    return err('Internal server error', 500)
  }
}
