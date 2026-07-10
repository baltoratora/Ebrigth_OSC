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
  code: z.string().min(2).max(10),
  branch_number: z.string().regex(/^\d{2}$/, 'Must be 2 digits like "01"'),
})

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireTktAuth(req.headers)

    // Branch scope:
    //   - super_admin / platform_admin: see every branch in the tenant.
    //   - regular user: see only the branches they're explicitly linked to
    //     via tkt_user_branch (so the ticket form's auto-default lands on
    //     the user's own branch, not branch 01).
    const where: Record<string, unknown> = { tenant_id: ctx.tenantId }
    if (ctx.role === 'user') {
      if (ctx.branchIds.length === 0) {
        // No branch assignments — return empty so the UI can show
        // "ask an admin" rather than silently defaulting to Online.
        return Response.json([])
      }
      where.id = { in: ctx.branchIds }
    }

    const branches = await prisma.tkt_branch.findMany({
      where,
      orderBy: { branch_number: 'asc' },
      include: {
        _count: { select: { tickets: true, user_branches: true } },
        tickets: {
          where: { status: { not: 'complete' } },
          select: { id: true, status: true },
        },
      },
    })

    const enriched = branches.map((b) => {
      const openCount = b.tickets.filter((t) => t.status !== 'complete' && t.status !== 'rejected').length
      return {
        id: b.id,
        name: b.name,
        code: b.code,
        branch_number: b.branch_number,
        ticket_count: b._count.tickets,
        open_ticket_count: openCount,
        user_count: b._count.user_branches,
      }
    })

    return Response.json(enriched)
  } catch (e) {
    if (e instanceof TktAuthError) return err(e.message, e.statusCode)
    console.error('[GET /api/crm/tkt-branches]', e)
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

    const created = await prisma.tkt_branch.create({
      data: { tenant_id: ctx.tenantId, ...parsed.data },
    })

    void logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      userEmail: ctx.email,
      action: 'CREATE',
      entity: 'tkt_branch',
      entityId: created.id,
      meta: { name: created.name, branch_number: created.branch_number },
    })

    return Response.json({ data: created }, { status: 201 })
  } catch (e) {
    if (e instanceof TktAuthError) return err(e.message, e.statusCode)
    if (e instanceof Error && e.message.includes('Unique constraint')) {
      return err('A branch with that number or code already exists', 409)
    }
    console.error('[POST /api/crm/tkt-branches]', e)
    return err('Internal server error', 500)
  }
}
