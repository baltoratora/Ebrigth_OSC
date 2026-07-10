import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { getPipelineKanban } from '@/server/queries/opportunities'
import { createOpportunity } from '@/server/actions/opportunities'
import { CreateOpportunitySchema } from '@/lib/crm/validations/opportunity'
import { resolveBranchAccess } from '@/lib/crm/branch-access'
import { hasPermission } from '@/lib/crm/permissions'
import { createHash } from 'crypto'

// ─── Auth helper ──────────────────────────────────────────────────────────────

type Session = {
  tenantId: string
  userId: string | null
  branchId: string | null
  /** True for API-key + SUPER_ADMIN + AGENCY_ADMIN callers. */
  elevated: boolean
  /** All branches this user can read (empty = unrestricted for elevated). */
  branchIds: string[]
  /** Highest CRM role; API-key callers act with full (SUPER_ADMIN) rights. */
  role: 'SUPER_ADMIN' | 'AGENCY_ADMIN' | 'REGIONAL_MANAGER' | 'BRANCH_MANAGER' | 'BRANCH_STAFF'
}

async function resolveSession(req: NextRequest): Promise<Session | null> {
  const apiKey = req.headers.get('x-api-key')
  if (apiKey) {
    const hashed = createHash('sha256').update(apiKey, 'utf8').digest('hex')
    const keyRecord = await prisma.crm_api_key.findUnique({
      where: { hashedKey: hashed },
      select: { tenantId: true, revokedAt: true },
    })
    if (keyRecord && !keyRecord.revokedAt) {
      return {
        tenantId: keyRecord.tenantId,
        userId: null,
        branchId: null,
        elevated: true,
        branchIds: [],
        role: 'SUPER_ADMIN',
      }
    }
  }

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return null

  const access = await resolveBranchAccess(session.user.id)
  if (!access) return null

  return {
    tenantId: access.tenantId,
    userId: session.user.id,
    branchId: access.primaryBranchId,
    elevated: access.elevated,
    branchIds: access.branchIds,
    role: access.role,
  }
}

// ─── GET /api/crm/opportunities (kanban) ─────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const ctx = await resolveSession(req)
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const sp = req.nextUrl.searchParams
    const pipelineId = sp.get('pipelineId')

    if (!pipelineId) {
      return NextResponse.json({ error: 'pipelineId is required' }, { status: 400 })
    }

    const rawBranchId = sp.get('branchId')
    const isAllBranchesPipeline = pipelineId.startsWith('all:')

    // ── Non-elevated users (BRANCH_MANAGER / BRANCH_STAFF) ────────────────────
    //   - Cannot use the synthetic "All Branches" pipeline.
    //   - Can only request a pipeline that belongs to one of their granted branches.
    //   - branchId query param is ignored — the pipeline already scopes to one branch.
    if (!ctx.elevated) {
      if (isAllBranchesPipeline) {
        return NextResponse.json(
          { error: 'Aggregate view is restricted to admins.' },
          { status: 403 },
        )
      }
      const pipeline = await prisma.crm_pipeline.findFirst({
        where: { id: pipelineId, tenantId: ctx.tenantId },
        select: { branchId: true },
      })
      if (!pipeline || !ctx.branchIds.includes(pipeline.branchId)) {
        return NextResponse.json(
          { error: 'You do not have access to this branch.' },
          { status: 403 },
        )
      }
      const kanban = await getPipelineKanban(
        ctx.tenantId,
        pipelineId,
        pipeline.branchId,
        sp.get('search') ?? undefined,
      )
      return NextResponse.json(kanban)
    }

    // ── Elevated users — existing behavior ────────────────────────────────────
    //   - Explicit ?branchId=<uuid> → use that
    //   - ?branchId=all or empty → no filter
    //   - Null + specific pipeline → fall back to admin's own branch (legacy)
    let branchFilter: string | undefined
    if (rawBranchId && rawBranchId !== 'all' && rawBranchId !== '') {
      branchFilter = rawBranchId
    } else if (!isAllBranchesPipeline && rawBranchId === null) {
      branchFilter = ctx.branchId ?? undefined
    } else {
      branchFilter = undefined
    }

    const kanban = await getPipelineKanban(
      ctx.tenantId,
      pipelineId,
      branchFilter,
      sp.get('search') ?? undefined,
    )

    return NextResponse.json(kanban)
  } catch (err) {
    console.error('[GET /api/crm/opportunities]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── POST /api/crm/opportunities ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const ctx = await resolveSession(req)
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Leads are read-only for AGENCY_ADMIN.
    if (!hasPermission(ctx.role, 'opportunities:write')) {
      return NextResponse.json({ error: 'Your role cannot create leads.' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = CreateOpportunitySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
    }

    const branchId = body.branchId ?? ctx.branchId
    if (!branchId) {
      return NextResponse.json({ error: 'branchId is required' }, { status: 400 })
    }
    if (!ctx.elevated && !ctx.branchIds.includes(branchId)) {
      return NextResponse.json(
        { error: 'You cannot create opportunities for this branch.' },
        { status: 403 },
      )
    }

    const opportunity = await createOpportunity(branchId, {
      ...parsed.data,
      tenantId: ctx.tenantId,
      userId: ctx.userId ?? undefined,
    })

    return NextResponse.json(opportunity, { status: 201 })
  } catch (err) {
    console.error('[POST /api/crm/opportunities]', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
