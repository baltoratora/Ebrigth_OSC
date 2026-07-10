import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { z } from 'zod'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { getDashboardStats } from '@/server/queries/dashboard'
import { createHash } from 'crypto'
import { startOfMonth, startOfQuarter, subDays, startOfDay, endOfDay } from 'date-fns'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import { isPreviewMode } from '@/lib/crm/preview-mode'
import { resolveBranchAccess } from '@/lib/crm/branch-access'

const KL_TZ = 'Asia/Kuala_Lumpur'

// ─── Validation ───────────────────────────────────────────────────────────────

const QuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  branchId: z.string().optional(),
  preset: z
    .enum(['today', '7d', '30d', 'this_month', 'this_quarter', 'custom'])
    .optional()
    .default('30d'),
})

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
  if (!session?.user?.id) {
    // DEV-ONLY preview mode fallback (no-op in production — see preview-mode.ts)
    if (isPreviewMode()) {
      const t = await prisma.crm_tenant.findUnique({
        where: { slug: 'ebright-demo' },
        select: { id: true },
      })
      return t?.id ?? null
    }
    return null
  }

  const userBranch = await prisma.crm_user_branch.findFirst({
    where: { userId: session.user.id },
    select: { tenantId: true },
  })
  return userBranch?.tenantId ?? null
}

// ─── Preset to date range ─────────────────────────────────────────────────────

function presetToRange(preset: string, from?: string, to?: string): { from: Date; to: Date } {
  const nowKL = toZonedTime(new Date(), KL_TZ)

  if (preset === 'custom' && from && to) {
    return {
      from: fromZonedTime(startOfDay(toZonedTime(new Date(from), KL_TZ)), KL_TZ),
      to: fromZonedTime(endOfDay(toZonedTime(new Date(to), KL_TZ)), KL_TZ),
    }
  }

  switch (preset) {
    case 'today':
      return {
        from: fromZonedTime(startOfDay(nowKL), KL_TZ),
        to: fromZonedTime(endOfDay(nowKL), KL_TZ),
      }
    case '7d':
      return {
        from: fromZonedTime(startOfDay(subDays(nowKL, 6)), KL_TZ),
        to: fromZonedTime(endOfDay(nowKL), KL_TZ),
      }
    case 'this_month':
      return {
        from: fromZonedTime(startOfMonth(nowKL), KL_TZ),
        to: fromZonedTime(endOfDay(nowKL), KL_TZ),
      }
    case 'this_quarter':
      return {
        from: fromZonedTime(startOfQuarter(nowKL), KL_TZ),
        to: fromZonedTime(endOfDay(nowKL), KL_TZ),
      }
    default: // 30d
      return {
        from: fromZonedTime(startOfDay(subDays(nowKL, 29)), KL_TZ),
        to: fromZonedTime(endOfDay(nowKL), KL_TZ),
      }
  }
}

// ─── GET /api/crm/dashboard ───────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const tenantId = await resolveTenantId(req)
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sp = req.nextUrl.searchParams
    const parsed = QuerySchema.safeParse({
      from: sp.get('from') ?? undefined,
      to: sp.get('to') ?? undefined,
      branchId: sp.get('branchId') ?? undefined,
      preset: sp.get('preset') ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query params', issues: parsed.error.issues },
        { status: 400 },
      )
    }

    const { preset, from, to, branchId: requestedBranchId } = parsed.data
    const dateRange = presetToRange(preset, from, to)

    // Hard-scope non-elevated users to their own branch. Even if they craft
    // a request without `branchId`, the dashboard returns *only* their data.
    let effectiveBranchId = requestedBranchId
    const session = await auth.api.getSession({ headers: await headers() })
    if (session?.user?.id) {
      const access = await resolveBranchAccess(session.user.id)
      if (access && !access.elevated) {
        if (requestedBranchId && !access.branchIds.includes(requestedBranchId)) {
          // User asked for a branch they don't have access to.
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        // Fall back to their primary branch if no specific request.
        effectiveBranchId = requestedBranchId ?? access.primaryBranchId ?? access.branchIds[0]
      }
    }

    const stats = await getDashboardStats(tenantId, dateRange, effectiveBranchId)
    return NextResponse.json(stats)
  } catch (err) {
    console.error('[GET /api/crm/dashboard]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
