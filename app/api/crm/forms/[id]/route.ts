import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { logAudit } from '@/lib/crm/audit'
import { normalizeToV2 } from '@/lib/crm/forms-types'
import { denyReadOnlyViewer } from '@/lib/crm/admin-session'

async function resolveSession() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return null
  const ub = await prisma.crm_user_branch.findFirst({
    where: { userId: session.user.id },
    select: { tenantId: true, role: true },
  })
  if (!ub) return null
  return { tenantId: ub.tenantId, userId: session.user.id, role: ub.role, email: session.user.email }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveSession()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const form = await prisma.crm_website_form.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { branch: { select: { id: true, name: true } } },
  })
  if (!form) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    form: {
      ...form,
      schema: normalizeToV2(form.schema),
    },
  })
}

const UpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  branchId: z.string().uuid().optional(),
  schema: z.unknown().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await denyReadOnlyViewer(); if (denied) return denied
  const ctx = await resolveSession()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'AGENCY_ADMIN'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()
  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const existing = await prisma.crm_website_form.findFirst({ where: { id, tenantId: ctx.tenantId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.crm_website_form.update({
    where: { id },
    data: {
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      ...(parsed.data.branchId ? { branchId: parsed.data.branchId } : {}),
      ...(parsed.data.schema !== undefined ? { schema: parsed.data.schema as object } : {}),
    },
  })

  void logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    userEmail: ctx.email ?? undefined,
    action: 'UPDATE',
    entity: 'crm_website_form',
    entityId: id,
    meta: { name: updated.name },
  })

  return NextResponse.json({ data: updated })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await denyReadOnlyViewer(); if (denied) return denied
  const ctx = await resolveSession()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'AGENCY_ADMIN'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const existing = await prisma.crm_website_form.findFirst({ where: { id, tenantId: ctx.tenantId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.crm_website_form.delete({ where: { id } })

  void logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    userEmail: ctx.email ?? undefined,
    action: 'DELETE',
    entity: 'crm_website_form',
    entityId: id,
  })

  return NextResponse.json({ success: true })
}
