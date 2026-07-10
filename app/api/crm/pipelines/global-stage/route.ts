import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { createStageAllPipelines, deleteStageAllPipelines } from '@/server/actions/pipelines'
import { denyReadOnlyViewer } from '@/lib/crm/admin-session'

const ALLOWED_ROLES = new Set(['SUPER_ADMIN', 'AGENCY_ADMIN'])

/** Resolve session + tenant, and whether the caller may manage global stages. */
async function resolveSession() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return null
  const rows = await prisma.crm_user_branch.findMany({
    where: { userId: session.user.id },
    select: { tenantId: true, role: true },
  })
  if (rows.length === 0) return null
  return {
    tenantId: rows[0].tenantId,
    userId: session.user.id,
    canManageGlobal: rows.some((r) => ALLOWED_ROLES.has(r.role)),
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await denyReadOnlyViewer(); if (denied) return denied
    const ctx = await resolveSession()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!ctx.canManageGlobal) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json() as {
      name: string
      shortCode: string
      color?: string
      beforeShortCode?: string
    }
    const result = await createStageAllPipelines(ctx.tenantId, ctx.userId, {
      name: body.name,
      shortCode: body.shortCode,
      color: body.color,
      beforeShortCode: body.beforeShortCode,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    console.error('[POST /api/crm/pipelines/global-stage]', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await denyReadOnlyViewer(); if (denied) return denied
    const ctx = await resolveSession()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!ctx.canManageGlobal) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json() as { shortCode: string; reassignToShortCode?: string }
    const result = await deleteStageAllPipelines(ctx.tenantId, ctx.userId, body.shortCode, body.reassignToShortCode)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[DELETE /api/crm/pipelines/global-stage]', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
