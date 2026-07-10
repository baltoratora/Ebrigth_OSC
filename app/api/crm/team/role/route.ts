import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { updateUserRole } from '@/server/actions/team'
import type { CrmUserRole } from '@/lib/crm/permissions'
import { denyReadOnlyViewer } from '@/lib/crm/admin-session'

async function resolveSession() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return null
  const ub = await prisma.crm_user_branch.findFirst({
    where: { userId: session.user.id },
    select: { tenantId: true, role: true },
  })
  if (!ub) return null
  return { tenantId: ub.tenantId, userId: session.user.id, role: ub.role }
}

export async function PATCH(req: NextRequest) {
  try {
    const denied = await denyReadOnlyViewer(); if (denied) return denied
    const ctx = await resolveSession()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['SUPER_ADMIN', 'AGENCY_ADMIN'].includes(ctx.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { userId, branchId, role } = await req.json() as {
      userId: string
      branchId: string
      role: CrmUserRole
    }

    await updateUserRole(ctx.tenantId, ctx.userId, userId, branchId, role)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[PATCH /api/crm/team/role]', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
