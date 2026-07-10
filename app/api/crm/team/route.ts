import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { resolveCrmAdminSession } from '@/lib/crm/admin-session'

// Read-only viewer (CEO) gets a synthetic elevated reader so the Team page
// renders. This route is GET-only; team writes live in team/{invite,role,
// deactivate} which keep their own (link-gated) checks + the middleware backstop.
const resolveSession = resolveCrmAdminSession

// ─── GET /api/crm/team ────────────────────────────────────────────────────────

export async function GET() {
  try {
    const ctx = await resolveSession()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const userBranches = await prisma.crm_user_branch.findMany({
      where: { tenantId: ctx.tenantId },
      include: {
        user: { select: { id: true, name: true, email: true, image: true, createdAt: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    // Group by user
    const userMap = new Map<
      string,
      {
        id: string
        name: string | null
        email: string
        image: string | null
        createdAt: Date
        branches: { id: string; name: string; role: string }[]
      }
    >()

    for (const ub of userBranches) {
      if (!userMap.has(ub.userId)) {
        userMap.set(ub.userId, {
          id: ub.user.id,
          name: ub.user.name,
          email: ub.user.email,
          image: ub.user.image,
          createdAt: ub.user.createdAt,
          branches: [],
        })
      }
      userMap.get(ub.userId)!.branches.push({
        id: ub.branch.id,
        name: ub.branch.name,
        role: ub.role,
      })
    }

    return NextResponse.json({ users: Array.from(userMap.values()) })
  } catch (err) {
    console.error('[GET /api/crm/team]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
