/**
 * Admin API for managing which branches each crm_auth_user can access.
 *
 * GET  /api/crm/branch-access         → list users with their branch links
 * POST /api/crm/branch-access         → { userId, branchId, role } grant access
 * DELETE /api/crm/branch-access?id=.. → revoke a single link by crm_user_branch.id
 */

import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { logAudit } from '@/lib/crm/audit'
import { denyReadOnlyViewer } from '@/lib/crm/admin-session'

async function resolveAdmin() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return null
  const ub = await prisma.crm_user_branch.findFirst({
    where: { userId: session.user.id },
    select: { tenantId: true, role: true },
  })
  if (!ub) return null
  if (!['SUPER_ADMIN', 'AGENCY_ADMIN'].includes(ub.role)) return null
  return { tenantId: ub.tenantId, userId: session.user.id, email: session.user.email }
}

export async function GET() {
  const ctx = await resolveAdmin()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [users, branches, links] = await Promise.all([
    prisma.crm_auth_user.findMany({
      select: { id: true, email: true, name: true },
      orderBy: { email: 'asc' },
    }),
    prisma.crm_branch.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.crm_user_branch.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, userId: true, branchId: true, role: true, createdAt: true },
    }),
  ])

  // Group links by user
  const linksByUser = new Map<string, typeof links>()
  for (const link of links) {
    const bucket = linksByUser.get(link.userId) ?? []
    bucket.push(link)
    linksByUser.set(link.userId, bucket)
  }

  const result = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    links: linksByUser.get(u.id) ?? [],
  }))

  return NextResponse.json({ users: result, branches })
}

const GrantSchema = z.object({
  userId: z.string().uuid(),
  branchId: z.string().uuid(),
  role: z.enum(['SUPER_ADMIN', 'AGENCY_ADMIN', 'REGIONAL_MANAGER', 'BRANCH_MANAGER', 'BRANCH_STAFF']).default('BRANCH_MANAGER'),
})

export async function POST(req: NextRequest) {
  const denied = await denyReadOnlyViewer(); if (denied) return denied
  const ctx = await resolveAdmin()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const parsed = GrantSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  // Prevent duplicate links
  const existing = await prisma.crm_user_branch.findFirst({
    where: { userId: parsed.data.userId, branchId: parsed.data.branchId },
  })
  if (existing) {
    return NextResponse.json({ error: 'User already has access to that branch' }, { status: 409 })
  }

  const created = await prisma.crm_user_branch.create({
    data: {
      userId: parsed.data.userId,
      branchId: parsed.data.branchId,
      tenantId: ctx.tenantId,
      role: parsed.data.role,
    },
  })

  void logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    userEmail: ctx.email ?? undefined,
    action: 'CREATE',
    entity: 'crm_user_branch',
    entityId: created.id,
    meta: parsed.data,
  })

  return NextResponse.json({ data: created }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const denied = await denyReadOnlyViewer(); if (denied) return denied
  const ctx = await resolveAdmin()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const link = await prisma.crm_user_branch.findFirst({
    where: { id, tenantId: ctx.tenantId },
  })
  if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.crm_user_branch.delete({ where: { id } })

  void logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    userEmail: ctx.email ?? undefined,
    action: 'DELETE',
    entity: 'crm_user_branch',
    entityId: id,
  })

  return NextResponse.json({ success: true })
}
