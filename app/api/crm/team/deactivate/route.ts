import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { deactivateUser } from '@/server/actions/team'
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

export async function POST(req: NextRequest) {
  try {
    const denied = await denyReadOnlyViewer(); if (denied) return denied
    const ctx = await resolveSession()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['SUPER_ADMIN', 'AGENCY_ADMIN'].includes(ctx.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { userId } = await req.json() as { userId: string }
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 422 })

    // Prevent self-deactivation
    if (userId === ctx.userId) {
      return NextResponse.json({ error: 'Cannot deactivate yourself' }, { status: 400 })
    }

    await deactivateUser(ctx.tenantId, ctx.userId, userId)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[POST /api/crm/team/deactivate]', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
