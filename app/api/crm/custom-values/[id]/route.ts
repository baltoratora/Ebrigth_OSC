import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
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
    const { value, scope, scopeId } = await req.json() as { value?: string; scope?: string; scopeId?: string }

    const updated = await prisma.crm_custom_value.updateMany({
      where: { id, tenantId: ctx.tenantId },
      data: {
        ...(value !== undefined ? { value } : {}),
        ...(scope !== undefined ? { scope: scope as 'TENANT' | 'BRANCH' } : {}),
        ...(scopeId !== undefined ? { scopeId: scopeId || null } : {}),
        updatedAt: new Date(),
      },
    })
    return NextResponse.json({ updated: updated.count })
  } catch (err) {
    console.error('[PATCH /api/crm/custom-values/[id]]', err)
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
    await prisma.crm_custom_value.deleteMany({ where: { id, tenantId: ctx.tenantId } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/crm/custom-values/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
