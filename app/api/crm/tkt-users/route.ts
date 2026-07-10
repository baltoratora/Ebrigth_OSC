import { type NextRequest } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/crm/db'
import { requireTktAuth, TktAuthError } from '@/lib/crm/tkt-auth'
import { logAudit } from '@/lib/crm/audit'

function err(msg: string, status: number) {
  return Response.json({ error: msg }, { status })
}

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['super_admin', 'platform_admin', 'user']),
  platformIds: z.array(z.string().uuid()).default([]),
  branchIds: z.array(z.string().uuid()).default([]),
})

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireTktAuth(req.headers, { roles: ['super_admin'] })

    const profiles = await prisma.tkt_user_profile.findMany({
      where: { tenant_id: ctx.tenantId },
      include: {
        platforms: { include: { platform: { select: { id: true, name: true } } } },
        branches:  { include: { branch:   { select: { id: true, name: true, branch_number: true } } } },
      },
      orderBy: { created_at: 'desc' },
    })

    const ids = profiles.map((p) => p.user_id)
    const users = await prisma.crm_auth_user.findMany({
      where: { id: { in: ids } },
      select: { id: true, email: true, name: true },
    })
    const userMap = new Map(users.map((u) => [u.id, u]))

    const result = profiles.map((p) => ({
      user_id:  p.user_id,
      email:    userMap.get(p.user_id)?.email ?? '',
      name:     userMap.get(p.user_id)?.name ?? null,
      role:     p.role,
      platforms: p.platforms.map((x) => x.platform),
      branches:  p.branches.map((x) => x.branch),
    }))

    return Response.json(result)
  } catch (e) {
    if (e instanceof TktAuthError) return err(e.message, e.statusCode)
    console.error('[GET /api/crm/tkt-users]', e)
    return err('Internal server error', 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireTktAuth(req.headers, { roles: ['super_admin'] })

    const body = await req.json()
    const parsed = CreateUserSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
    }

    const { email, name, password, role, platformIds, branchIds } = parsed.data

    // Check for existing user
    let user = await prisma.crm_auth_user.findUnique({ where: { email } })

    const passwordHash = await bcrypt.hash(password, 10)

    const userId = await prisma.$transaction(async (tx) => {
      if (!user) {
        user = await tx.crm_auth_user.create({
          data: { email, name, emailVerified: true },
        })
        await tx.crm_auth_account.create({
          data: {
            userId: user.id,
            accountId: user.id,
            providerId: 'credential',
            password: passwordHash,
          },
        })
      } else {
        // Existing user — update password via their credential account
        const account = await tx.crm_auth_account.findFirst({
          where: { userId: user.id, providerId: 'credential' },
        })
        if (account) {
          await tx.crm_auth_account.update({
            where: { id: account.id },
            data: { password: passwordHash },
          })
        } else {
          await tx.crm_auth_account.create({
            data: {
              userId: user.id,
              accountId: user.id,
              providerId: 'credential',
              password: passwordHash,
            },
          })
        }
      }

      // Create or update tkt_user_profile
      await tx.tkt_user_profile.upsert({
        where: { user_id: user.id },
        create: { user_id: user.id, tenant_id: ctx.tenantId, role },
        update: { role },
      })

      // Replace platform + branch assignments
      await tx.tkt_user_platform.deleteMany({ where: { user_id: user.id } })
      await tx.tkt_user_branch.deleteMany({ where: { user_id: user.id } })

      if (platformIds.length > 0) {
        await tx.tkt_user_platform.createMany({
          data: platformIds.map((pid) => ({ user_id: user!.id, platform_id: pid })),
          skipDuplicates: true,
        })
      }
      if (branchIds.length > 0) {
        await tx.tkt_user_branch.createMany({
          data: branchIds.map((bid) => ({ user_id: user!.id, branch_id: bid })),
          skipDuplicates: true,
        })
      }

      return user.id
    })

    void logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      userEmail: ctx.email,
      action: 'CREATE',
      entity: 'tkt_user_profile',
      entityId: userId,
      meta: { email, name, role, platformIds, branchIds },
    })

    return Response.json({ success: true, userId }, { status: 201 })
  } catch (e) {
    if (e instanceof TktAuthError) return err(e.message, e.statusCode)
    console.error('[POST /api/crm/tkt-users]', e)
    return err('Internal server error', 500)
  }
}
