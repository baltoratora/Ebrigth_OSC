import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { Prisma } from '@prisma/client'
import { logAudit } from '@/lib/crm/audit'
import { emptySchema, type FormSchemaV2 } from '@/lib/crm/forms-types'
import { isPreviewMode } from '@/lib/crm/preview-mode'
import { isReadOnlyViewer } from '@/lib/crm/operation-accounts'

async function resolveSession() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return null

  const ub = await prisma.crm_user_branch.findFirst({
    where: { userId: session.user.id },
    select: { tenantId: true, role: true },
  })
  if (ub) {
    // viewerOnly is EMAIL-based: a read-only viewer who also holds a branch link
    // is still write-blocked (POST checks viewerOnly).
    return { tenantId: ub.tenantId, userId: session.user.id, role: ub.role, email: session.user.email, viewerOnly: isReadOnlyViewer(session.user.email) }
  }

  // Read-only viewer (CEO) without a branch link: view Forms like an admin, but
  // POST rejects viewerOnly (and middleware is the backstop).
  if (isReadOnlyViewer(session.user.email)) {
    const tenant = await prisma.crm_tenant.findFirst({
      where: { slug: { in: ['ebright', 'ebright-demo'] } },
      select: { id: true },
    }) ?? await prisma.crm_tenant.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } })
    if (tenant) {
      return { tenantId: tenant.id, userId: session.user.id, role: 'AGENCY_ADMIN', email: session.user.email, viewerOnly: true }
    }
  }

  // Fallback for preview mode / impersonated users without crm_user_branch:
  // use the default tenant + treat them as SUPER_ADMIN (preview users only).
  // Try 'ebright' (prod seed) first, then 'ebright-demo' (legacy demo seed).
  if (isPreviewMode()) {
    const tenant = await prisma.crm_tenant.findFirst({
      where: { slug: { in: ['ebright', 'ebright-demo'] } },
      select: { id: true },
    })
    if (tenant) {
      return { tenantId: tenant.id, userId: session.user.id, role: 'SUPER_ADMIN', email: session.user.email, viewerOnly: false }
    }
  }

  return null
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40)
}

const CreateSchema = z.object({
  name: z.string().min(1).max(100),
  branchId: z.string().uuid().optional(),
})

export async function GET() {
  const ctx = await resolveSession()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const forms = await prisma.crm_website_form.findMany({
    where: { tenantId: ctx.tenantId },
    include: { branch: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({
    forms: forms.map((f) => ({
      id: f.id,
      name: f.name,
      publicSlug: f.publicSlug,
      submissionsCount: f.submissionsCount,
      branchName: f.branch?.name ?? null,
      branchId: f.branchId,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    })),
  })
}

export async function POST(req: NextRequest) {
  const ctx = await resolveSession()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.viewerOnly) return NextResponse.json({ error: 'Read-only access' }, { status: 403 })
  if (!['SUPER_ADMIN', 'AGENCY_ADMIN'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
  }

  // Pick any branch for this tenant if none given (crm_website_form.branchId is required)
  let branchId = parsed.data.branchId
  if (!branchId) {
    const branch = await prisma.crm_branch.findFirst({
      where: { tenantId: ctx.tenantId },
      select: { id: true },
    })
    if (!branch) return NextResponse.json({ error: 'No branches exist — create one first' }, { status: 409 })
    branchId = branch.id
  }

  // Unique slug: append random suffix if collision
  const base = slugify(parsed.data.name) || 'form'
  let slug = base
  for (let i = 0; i < 5; i++) {
    const exists = await prisma.crm_website_form.findUnique({ where: { publicSlug: slug } })
    if (!exists) break
    slug = `${base}-${Math.random().toString(36).slice(2, 6)}`
  }

  const schema = emptySchema() satisfies FormSchemaV2

  const created = await prisma.crm_website_form.create({
    data: {
      tenantId: ctx.tenantId,
      branchId,
      name: parsed.data.name,
      publicSlug: slug,
      schema: schema as unknown as Prisma.InputJsonValue,
    },
  })

  void logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    userEmail: ctx.email ?? undefined,
    action: 'CREATE',
    entity: 'crm_website_form',
    entityId: created.id,
    meta: { name: created.name, slug: created.publicSlug },
  })

  return NextResponse.json({ data: created }, { status: 201 })
}
