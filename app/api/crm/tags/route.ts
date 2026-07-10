import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { scopedPrisma } from '@/lib/crm/tenancy'
import { logAudit } from '@/lib/crm/audit'
import { resolveCrmAdminSession } from '@/lib/crm/admin-session'

// Read-only viewer (CEO) gets a synthetic reader (viewerOnly) so Tags renders;
// writes reject viewerOnly.
const resolveSession = resolveCrmAdminSession

export async function GET() {
  try {
    const ctx = await resolveSession()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tags = await prisma.crm_tag.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({ tags })
  } catch (err) {
    console.error('[GET /api/crm/tags]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await resolveSession()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (ctx.viewerOnly) return NextResponse.json({ error: 'Read-only access' }, { status: 403 })

    const { name, color, branchId } = await req.json() as { name: string; color: string; branchId?: string }
    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 422 })

    const tag = await prisma.crm_tag.create({
      data: {
        tenantId: ctx.tenantId,
        name: name.trim(),
        color: color ?? '#3b82f6',
        branchId: branchId ?? null,
      },
    })

    void logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'CREATE', entity: 'crm_tag', entityId: tag.id })
    return NextResponse.json(tag, { status: 201 })
  } catch (err) {
    console.error('[POST /api/crm/tags]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
