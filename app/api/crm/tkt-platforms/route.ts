import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/crm/db'
import { requireTktAuth, TktAuthError } from '@/lib/crm/tkt-auth'
import { logAudit } from '@/lib/crm/audit'

function err(msg: string, status: number) {
  return Response.json({ error: msg }, { status })
}

const CreateSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  code: z.string().regex(/^\d{2}$/, 'Code must be exactly 2 digits'),
  accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be hex colour e.g. #dc2626'),
})

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireTktAuth(req.headers)

    const platforms = await prisma.tkt_platform.findMany({
      where: { tenant_id: ctx.tenantId },
      orderBy: { code: 'asc' },
      include: { _count: { select: { tickets: true } } },
    })

    return Response.json(
      platforms.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        code: p.code,
        accent_color: p.accent_color,
        ticket_count: p._count.tickets,
      })),
    )
  } catch (e) {
    if (e instanceof TktAuthError) return err(e.message, e.statusCode)
    console.error('[GET /api/crm/tkt-platforms]', e)
    return err('Internal server error', 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireTktAuth(req.headers, { roles: ['super_admin'] })

    const body = await req.json()
    const parsed = CreateSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
    }

    const created = await prisma.tkt_platform.create({
      data: { tenant_id: ctx.tenantId, ...parsed.data },
    })

    void logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      userEmail: ctx.email,
      action: 'CREATE',
      entity: 'tkt_platform',
      entityId: created.id,
      meta: { name: created.name, slug: created.slug },
    })

    return Response.json({ data: created }, { status: 201 })
  } catch (e) {
    if (e instanceof TktAuthError) return err(e.message, e.statusCode)
    if (e instanceof Error && e.message.includes('Unique constraint')) {
      return err('A platform with that name, slug, or code already exists', 409)
    }
    console.error('[POST /api/crm/tkt-platforms]', e)
    return err('Internal server error', 500)
  }
}
