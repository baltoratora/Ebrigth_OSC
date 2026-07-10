import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { isReadOnlyViewer } from '@/lib/crm/operation-accounts'

async function getSessionAndBranch(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return null

  const userBranch = await prisma.crm_user_branch.findFirst({
    where: { userId: session.user.id },
    select: { tenantId: true, branchId: true },
  })
  if (userBranch) return { session, ...userBranch }

  // Read-only viewer (CEO) without a branch link: let the Integrations page load
  // (tenant default, no specific branch). This route is GET-only; the connect
  // actions are separate write routes blocked by middleware.
  if (isReadOnlyViewer(session.user.email)) {
    const tenant =
      (await prisma.crm_tenant.findFirst({ where: { slug: { in: ['ebright', 'ebright-demo'] } }, select: { id: true } })) ??
      (await prisma.crm_tenant.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } }))
    if (tenant) return { session, tenantId: tenant.id, branchId: null as string | null }
  }
  return null
}

// GET /api/crm/integrations — list all integrations for branch
export async function GET(req: NextRequest) {
  try {
    const ctx = await getSessionAndBranch(req)
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const integrations = await prisma.crm_integration.findMany({
      // Viewer (no branch) sees all tenant integrations; branch users see theirs.
      where: { tenantId: ctx.tenantId, ...(ctx.branchId ? { branchId: ctx.branchId } : {}) },
      select: { type: true, status: true, lastSyncAt: true },
    })

    return NextResponse.json({ integrations, branchId: ctx.branchId })
  } catch (err) {
    console.error('[GET /api/crm/integrations]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
