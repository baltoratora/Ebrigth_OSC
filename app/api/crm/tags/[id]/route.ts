import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { logAudit } from '@/lib/crm/audit'
import { denyReadOnlyViewer } from '@/lib/crm/admin-session'

async function resolveSession() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return null
  const ub = await prisma.crm_user_branch.findFirst({
    where: { userId: session.user.id },
    select: { tenantId: true },
  })
  if (!ub) return null
  return { tenantId: ub.tenantId, userId: session.user.id }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await denyReadOnlyViewer(); if (denied) return denied
    const ctx = await resolveSession()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const { name, color } = await req.json() as { name?: string; color?: string }

    const tag = await prisma.crm_tag.updateMany({
      where: { id, tenantId: ctx.tenantId },
      data: {
        ...(name ? { name } : {}),
        ...(color ? { color } : {}),
        updatedAt: new Date(),
      },
    })

    return NextResponse.json({ updated: tag.count })
  } catch (err) {
    console.error('[PATCH /api/crm/tags/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await denyReadOnlyViewer(); if (denied) return denied
    const ctx = await resolveSession()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params

    await prisma.crm_tag.deleteMany({
      where: { id, tenantId: ctx.tenantId },
    })

    void logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'DELETE', entity: 'crm_tag', entityId: id })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/crm/tags/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
