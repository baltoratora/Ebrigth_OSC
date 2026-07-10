import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { scopedPrisma } from '@/lib/crm/tenancy'
import {
  updateAutomation,
  deleteAutomation,
} from '@/server/actions/automations'
import { UpdateAutomationSchema } from '@/lib/crm/validations/automation'
import { denyReadOnlyViewer } from '@/lib/crm/admin-session'

async function resolveTenant() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return null
  const ub = await prisma.crm_user_branch.findFirst({
    where: { userId: session.user.id },
    select: { tenantId: true },
  })
  return ub?.tenantId ?? null
}

// GET — load one automation (used by the editor).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = await resolveTenant()
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const scope = scopedPrisma(tenantId)
  const automation = await prisma.crm_automation.findFirst({
    where: scope.where({ id }),
    include: {
      branch: { select: { id: true, name: true } },
      runs: {
        orderBy: { startedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          status: true,
          startedAt: true,
          completedAt: true,
          logs: true,
          contact: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  })
  if (!automation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(automation)
}

// PATCH — save changes to an existing automation (used by the editor auto-save).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await denyReadOnlyViewer(); if (denied) return denied
  const tenantId = await resolveTenant()
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = UpdateAutomationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const result = await updateAutomation(id, parsed.data)
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ success: true })
}

// DELETE — remove an automation.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await denyReadOnlyViewer(); if (denied) return denied
  const tenantId = await resolveTenant()
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const result = await deleteAutomation(id)
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ success: true })
}
