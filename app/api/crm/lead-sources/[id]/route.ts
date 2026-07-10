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
    const { name } = await req.json() as { name: string }
    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 422 })

    const updated = await prisma.crm_lead_source.updateMany({
      where: { id, tenantId: ctx.tenantId },
      data: { name: name.trim(), updatedAt: new Date() },
    })
    return NextResponse.json({ updated: updated.count })
  } catch (err) {
    console.error('[PATCH /api/crm/lead-sources/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
