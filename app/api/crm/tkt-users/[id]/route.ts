import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/crm/db'
import { requireTktAuth, TktAuthError } from '@/lib/crm/tkt-auth'
import { logAudit } from '@/lib/crm/audit'

function err(msg: string, status: number) {
  return Response.json({ error: msg }, { status })
}

const UpdateSchema = z.object({
  role: z.enum(['super_admin', 'platform_admin', 'user']).optional(),
  platformIds: z.array(z.string().uuid()).optional(),
  branchIds: z.array(z.string().uuid()).optional(),
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

    const profile = await prisma.tkt_user_profile.findUnique({ where: { user_id: id } })
    if (!profile || profile.tenant_id !== ctx.tenantId) {
      return err('User not found', 404)
    }

    await prisma.$transaction(async (tx) => {
      if (parsed.data.role) {
        await tx.tkt_user_profile.update({
          where: { user_id: id },
          data: { role: parsed.data.role },
        })
      }

      if (parsed.data.platformIds !== undefined) {
        await tx.tkt_user_platform.deleteMany({ where: { user_id: id } })
        if (parsed.data.platformIds.length > 0) {
          await tx.tkt_user_platform.createMany({
            data: parsed.data.platformIds.map((pid) => ({ user_id: id, platform_id: pid })),
            skipDuplicates: true,
          })
        }
      }

      if (parsed.data.branchIds !== undefined) {
        await tx.tkt_user_branch.deleteMany({ where: { user_id: id } })
        if (parsed.data.branchIds.length > 0) {
          await tx.tkt_user_branch.createMany({
            data: parsed.data.branchIds.map((bid) => ({ user_id: id, branch_id: bid })),
            skipDuplicates: true,
          })
        }
      }
    })

    void logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      userEmail: ctx.email,
      action: 'UPDATE',
      entity: 'tkt_user_profile',
      entityId: id,
      meta: parsed.data,
    })

    return Response.json({ success: true })
  } catch (e) {
    if (e instanceof TktAuthError) return err(e.message, e.statusCode)
    console.error('[PATCH tkt-user]', e)
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

    if (id === ctx.userId) {
      return err('You cannot delete your own ticket profile', 400)
    }

    const profile = await prisma.tkt_user_profile.findUnique({ where: { user_id: id } })
    if (!profile || profile.tenant_id !== ctx.tenantId) {
      return err('User not found', 404)
    }

    // Remove only ticket-module access. Leave crm_auth_user intact so the user
    // can still access the rest of the CRM.
    await prisma.tkt_user_profile.delete({ where: { user_id: id } })

    void logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      userEmail: ctx.email,
      action: 'DELETE',
      entity: 'tkt_user_profile',
      entityId: id,
    })

    return Response.json({ success: true })
  } catch (e) {
    if (e instanceof TktAuthError) return err(e.message, e.statusCode)
    console.error('[DELETE tkt-user]', e)
    return err('Internal server error', 500)
  }
}
