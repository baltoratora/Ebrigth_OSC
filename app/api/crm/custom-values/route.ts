import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { resolveCrmAdminSession } from '@/lib/crm/admin-session'

// Read-only viewer (CEO) gets a synthetic reader (viewerOnly); writes reject it.
const resolveSession = resolveCrmAdminSession

export async function GET() {
  try {
    const ctx = await resolveSession()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const customValues = await prisma.crm_custom_value.findMany({
      where: { tenantId: ctx.tenantId },
      include: { branch: { select: { id: true, name: true } } },
      orderBy: { key: 'asc' },
    })
    return NextResponse.json({ customValues })
  } catch (err) {
    console.error('[GET /api/crm/custom-values]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await resolveSession()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (ctx.viewerOnly) return NextResponse.json({ error: 'Read-only access' }, { status: 403 })

    const { key, value, scope, scopeId } = await req.json() as {
      key: string; value: string; scope: 'TENANT' | 'BRANCH'; scopeId?: string
    }

    if (!key?.trim() || !value?.trim()) {
      return NextResponse.json({ error: 'key and value are required' }, { status: 422 })
    }

    const cv = await prisma.crm_custom_value.create({
      data: {
        tenantId: ctx.tenantId,
        key: key.trim(),
        value: value.trim(),
        scope: scope ?? 'TENANT',
        scopeId: scopeId || null,
      },
    })
    return NextResponse.json(cv, { status: 201 })
  } catch (err: unknown) {
    console.error('[POST /api/crm/custom-values]', err)
    if ((err as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'A custom value with this key already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
