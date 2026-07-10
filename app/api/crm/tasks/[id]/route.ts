import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { createHash } from 'crypto'
import { denyReadOnlyViewer } from '@/lib/crm/admin-session'

async function resolveTenantId(req: NextRequest): Promise<string | null> {
  const apiKey = req.headers.get('x-api-key')
  if (apiKey) {
    const hashed = createHash('sha256').update(apiKey, 'utf8').digest('hex')
    const keyRecord = await prisma.crm_api_key.findUnique({
      where: { hashedKey: hashed },
      select: { tenantId: true, revokedAt: true },
    })
    if (keyRecord && !keyRecord.revokedAt) return keyRecord.tenantId
  }
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return null
  const userBranch = await prisma.crm_user_branch.findFirst({
    where: { userId: session.user.id },
    select: { tenantId: true },
  })
  return userBranch?.tenantId ?? null
}

// PATCH /api/crm/tasks/[id] — mark complete
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await denyReadOnlyViewer(); if (denied) return denied
    const tenantId = await resolveTenantId(req)
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const task = await prisma.crm_task.findFirst({
      where: { id, tenantId },
    })
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const body = await req.json().catch(() => ({})) as { completedAt?: string | null }
    const updated = await prisma.crm_task.update({
      where: { id },
      data: {
        completedAt: body.completedAt !== undefined
          ? (body.completedAt ? new Date(body.completedAt) : null)
          : new Date(),
      },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[PATCH /api/crm/tasks/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
