import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { createStage } from '@/server/actions/pipelines'
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

export async function POST(req: NextRequest) {
  try {
    const denied = await denyReadOnlyViewer(); if (denied) return denied
    const ctx = await resolveSession()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json() as {
      pipelineId: string
      name: string
      shortCode: string
      color?: string
      stuckHoursYellow?: number
      stuckHoursRed?: number
    }

    const stage = await createStage(ctx.tenantId, ctx.userId, body.pipelineId, {
      name: body.name,
      shortCode: body.shortCode,
      color: body.color,
      stuckHoursYellow: body.stuckHoursYellow,
      stuckHoursRed: body.stuckHoursRed,
    })
    return NextResponse.json(stage, { status: 201 })
  } catch (err) {
    console.error('[POST /api/crm/pipelines/stage]', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
