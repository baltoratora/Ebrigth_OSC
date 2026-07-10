import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { generateApiKey } from '@/lib/crm/utils'
import { logAudit } from '@/lib/crm/audit'
import { resolveCrmAdminSession } from '@/lib/crm/admin-session'

// Shared resolver: real users get their crm_user_branch role; the read-only
// viewer (CEO) gets a synthetic elevated READER (viewerOnly) so the page renders.
const resolveSession = resolveCrmAdminSession

export async function GET() {
  try {
    const ctx = await resolveSession()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const apiKeys = await prisma.crm_api_key.findMany({
      where: { tenantId: ctx.tenantId },
      select: {
        id: true,
        name: true,
        scopes: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ apiKeys })
  } catch (err) {
    console.error('[GET /api/crm/api-keys]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await resolveSession()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (ctx.viewerOnly) return NextResponse.json({ error: 'Read-only access' }, { status: 403 })
    if (!['SUPER_ADMIN', 'AGENCY_ADMIN'].includes(ctx.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { name, scopes } = await req.json() as { name: string; scopes: string[] }
    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 422 })
    if (!scopes?.length) return NextResponse.json({ error: 'Scopes required' }, { status: 422 })

    const { key, hashed } = generateApiKey()

    const apiKey = await prisma.crm_api_key.create({
      data: {
        tenantId: ctx.tenantId,
        name: name.trim(),
        hashedKey: hashed,
        scopes,
        createdByUserId: ctx.userId,
      },
    })

    void logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'CREATE',
      entity: 'crm_api_key',
      entityId: apiKey.id,
      meta: { name, scopes },
    })

    // Return plain key ONCE
    return NextResponse.json({ id: apiKey.id, name: apiKey.name, key }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/crm/api-keys]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
