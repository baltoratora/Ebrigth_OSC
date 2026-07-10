import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireTktAuth, TktAuthError } from '@/lib/crm/tkt-auth'
import { getPresignedUploadUrl } from '@/lib/crm/s3'

function err(msg: string, status: number) {
  return Response.json({ error: msg }, { status })
}

const PresignSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive().optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireTktAuth(req.headers)
    const { id } = await params

    const body = await req.json()
    const parsed = PresignSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
    }

    const { url, s3Key } = await getPresignedUploadUrl({
      tenantId: ctx.tenantId,
      ticketId: id,
      fileName: parsed.data.fileName,
      mimeType: parsed.data.mimeType,
      sizeBytes: parsed.data.sizeBytes,
    })

    return Response.json({ url, s3Key })
  } catch (e) {
    if (e instanceof TktAuthError) return err(e.message, e.statusCode)
    console.error('[POST /api/crm/tickets/[id]/attachments/presign]', e)
    return err(e instanceof Error ? e.message : 'Internal server error', 500)
  }
}
