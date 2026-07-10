import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { getContactsByTenant } from '@/server/queries/contacts'
import { CreateContactSchema } from '@/lib/crm/validations/contact'
import { createContact } from '@/server/actions/contacts'
import { resolveBranchAccess } from '@/lib/crm/branch-access'
import { createHash } from 'crypto'

// ─── Auth helper ──────────────────────────────────────────────────────────────

/**
 * Returns tenant + (when applicable) branch scope for the caller.
 * - API key → tenant only, treated as elevated (full tenant visibility)
 * - User session → tenant + user's allowed branches (or null to mean "no limit"
 *   when the user is super/agency admin)
 */
async function resolveScope(req: NextRequest): Promise<
  | { tenantId: string; allowedBranchIds: string[] | null }
  | null
> {
  const apiKey = req.headers.get('x-api-key')
  if (apiKey) {
    const hashed = createHash('sha256').update(apiKey, 'utf8').digest('hex')
    const keyRecord = await prisma.crm_api_key.findUnique({
      where: { hashedKey: hashed },
      select: { tenantId: true, revokedAt: true },
    })
    if (keyRecord && !keyRecord.revokedAt) {
      return { tenantId: keyRecord.tenantId, allowedBranchIds: null }
    }
  }

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return null

  const access = await resolveBranchAccess(session.user.id)
  if (!access) return null

  return {
    tenantId: access.tenantId,
    // Elevated users see every branch — pass null to mean "no restriction".
    allowedBranchIds: access.elevated ? null : access.branchIds,
  }
}

// ─── GET /api/crm/contacts ────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const scope = await resolveScope(req)
    if (!scope) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sp = req.nextUrl.searchParams
    const result = await getContactsByTenant(scope.tenantId, {
      search: sp.get('search') ?? undefined,
      branchId: sp.get('branchId') ?? undefined,
      // Server-enforced branch limit. Elevated users get null → no limit.
      // Non-elevated users get their own branchIds → can never see beyond.
      branchIds: scope.allowedBranchIds ?? undefined,
      stageId: sp.get('stageId') ?? undefined,
      leadSourceId: sp.get('leadSourceId') ?? undefined,
      assignedUserId: sp.get('assignedUserId') ?? undefined,
      tagId: sp.get('tagId') ?? undefined,
      page: sp.get('page') ? Number(sp.get('page')) : undefined,
      pageSize: sp.get('pageSize') ? Number(sp.get('pageSize')) : undefined,
      sortBy: sp.get('sortBy') ?? undefined,
      sortDir: (sp.get('sortDir') as 'asc' | 'desc') ?? undefined,
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('[GET /api/crm/contacts]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── POST /api/crm/contacts ───────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const scope = await resolveScope(req)
    if (!scope) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const tenantId = scope.tenantId

    const body = await req.json()
    const parsed = CreateContactSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', issues: parsed.error.issues },
        { status: 400 },
      )
    }

    const branchId = body.branchId
    if (!branchId || typeof branchId !== 'string') {
      return NextResponse.json({ error: 'branchId is required' }, { status: 400 })
    }

    const result = await createContact(branchId, parsed.data)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ contactId: result.contactId }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/crm/contacts]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
