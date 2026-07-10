import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { resolveCrmAdminSession } from '@/lib/crm/admin-session'

const GLOBAL_STAGE_ROLES = new Set(['SUPER_ADMIN', 'AGENCY_ADMIN'])

async function resolveSession() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return null
  const rows = await prisma.crm_user_branch.findMany({
    where: { userId: session.user.id },
    select: { tenantId: true, role: true },
  })
  if (rows.length === 0) {
    // Read-only viewer (CEO) has no link: let them VIEW pipelines, but never
    // surface the global-stage write panel (canManageGlobal stays false).
    const viewer = await resolveCrmAdminSession()
    if (viewer?.viewerOnly) {
      return { tenantId: viewer.tenantId, userId: viewer.userId, canManageGlobal: false }
    }
    return null
  }
  // Highest role wins for display purposes (whether the global-stage panel shows).
  const canManageGlobal = rows.some((r) => GLOBAL_STAGE_ROLES.has(r.role))
  return { tenantId: rows[0].tenantId, userId: session.user.id, canManageGlobal }
}

export async function GET() {
  try {
    const ctx = await resolveSession()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const pipelines = await prisma.crm_pipeline.findMany({
      where: { tenantId: ctx.tenantId },
      include: {
        stages: {
          orderBy: { order: 'asc' },
          include: {
            _count: { select: { opportunities: { where: { deletedAt: null } } } },
          },
        },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json({ pipelines, canManageGlobal: ctx.canManageGlobal })
  } catch (err) {
    console.error('[GET /api/crm/pipelines]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
