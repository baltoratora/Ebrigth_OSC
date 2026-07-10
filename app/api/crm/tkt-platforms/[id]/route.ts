import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/crm/db'
import { requireTktAuth, TktAuthError } from '@/lib/crm/tkt-auth'
import { logAudit } from '@/lib/crm/audit'

function err(msg: string, status: number) {
  return Response.json({ error: msg }, { status })
}

const UpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/).optional(),
  code: z.string().regex(/^\d{2}$/).optional(),
  accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireTktAuth(req.headers, { roles: ['super_admin'] })
    const { id } = await params

    const body = await req.json()
    const parsed = UpdateSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
    }

    const existing = await prisma.tkt_platform.findFirst({
      where: { id, tenant_id: ctx.tenantId },
    })
    if (!existing) return err('Platform not found', 404)

    const updated = await prisma.tkt_platform.update({
      where: { id },
      data: parsed.data,
    })

    void logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      userEmail: ctx.email,
      action: 'UPDATE',
      entity: 'tkt_platform',
      entityId: id,
      meta: parsed.data,
    })

    return Response.json({ data: updated })
  } catch (e) {
    if (e instanceof TktAuthError) return err(e.message, e.statusCode)
    console.error('[PATCH tkt-platform]', e)
    return err('Internal server error', 500)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireTktAuth(req.headers, { roles: ['super_admin'] })
    const { id } = await params

    const existing = await prisma.tkt_platform.findFirst({
      where: { id, tenant_id: ctx.tenantId },
      include: { _count: { select: { tickets: true } } },
    })
    if (!existing) return err('Platform not found', 404)
    if (existing._count.tickets > 0) {
      return err(`Cannot delete — platform has ${existing._count.tickets} ticket(s)`, 409)
    }

    await prisma.tkt_platform.delete({ where: { id } })

    void logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      userEmail: ctx.email,
      action: 'DELETE',
      entity: 'tkt_platform',
      entityId: id,
      meta: { name: existing.name },
    })

    return Response.json({ success: true })
  } catch (e) {
    if (e instanceof TktAuthError) return err(e.message, e.statusCode)
    console.error('[DELETE tkt-platform]', e)
    return err('Internal server error', 500)
  }
}
