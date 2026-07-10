import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { scopedPrisma } from '@/lib/crm/tenancy'
import { CreateAutomationSchema } from '@/lib/crm/validations/automation'
import { createAutomation } from '@/server/actions/automations'
import { createHash } from 'crypto'
import { resolveCrmAdminSession, denyReadOnlyViewer } from '@/lib/crm/admin-session'

// ─── Auth helper ──────────────────────────────────────────────────────────────

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

// ─── GET /api/crm/automations ─────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    let tenantId = await resolveTenantId(req)
    // Read-only viewer (CEO) without a branch link still gets to VIEW automations.
    // (POST keeps using resolveTenantId, which returns null for them → 403/401.)
    if (!tenantId) {
      const viewer = await resolveCrmAdminSession()
      if (viewer?.viewerOnly) tenantId = viewer.tenantId
    }
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const scope = scopedPrisma(tenantId)
    const sp = req.nextUrl.searchParams
    const branchId = sp.get('branchId') ?? undefined

    const automations = await prisma.crm_automation.findMany({
      where: scope.where({
        ...(branchId && { branchId }),
      }),
      orderBy: { createdAt: 'desc' },
      include: {
        branch: { select: { id: true, name: true } },
        runs: {
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            startedAt: true,
            completedAt: true,
          },
        },
      },
    })

    const result = automations.map((a) => ({
      id: a.id,
      name: a.name,
      triggerType: a.triggerType,
      enabled: a.enabled,
      branchId: a.branchId,
      branchName: a.branch?.name ?? null,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
      lastRun: a.runs[0]
        ? {
            id: a.runs[0].id,
            status: a.runs[0].status,
            startedAt: a.runs[0].startedAt.toISOString(),
            completedAt: a.runs[0].completedAt?.toISOString() ?? null,
          }
        : null,
    }))

    return NextResponse.json({ data: result, total: result.length })
  } catch (err) {
    console.error('[GET /api/crm/automations]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── POST /api/crm/automations ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const denied = await denyReadOnlyViewer(); if (denied) return denied
    const tenantId = await resolveTenantId(req)
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json() as { branchId?: string } & Record<string, unknown>

    const parsed = CreateAutomationSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', issues: parsed.error.issues },
        { status: 400 },
      )
    }

    const branchId = (body.branchId as string | undefined) ?? ''
    const result = await createAutomation(branchId, parsed.data)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ automationId: result.automationId }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/crm/automations]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
