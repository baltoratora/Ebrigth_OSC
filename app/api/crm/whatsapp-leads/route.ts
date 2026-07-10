/**
 * WhatsApp leads — list / count (GET), super-admin manual add (POST),
 * super-admin delete (DELETE).
 *
 * GET is visible to anyone who can see the Opportunities board; it scopes to
 * the caller's branches (or the topbar-selected branch via ?branchId=). Pass
 * ?sync=1 to first pull new ws_leads rows from ebrightleads_db.
 *
 * POST + DELETE are restricted to elevated roles (SUPER_ADMIN / AGENCY_ADMIN):
 * branches can't add or delete interactions themselves — they must ask a super
 * admin (the red badge only clears by completing the WhatsApp form).
 */
import { type NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { logAudit } from '@/lib/crm/audit'
import { resolveBranchAccess } from '@/lib/crm/branch-access'
import { syncWhatsappLeads, listPendingWhatsappLeads } from '@/lib/crm/whatsapp-leads'

async function resolveScope(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return null
  const access = await resolveBranchAccess(session.user.id)
  if (!access) return null

  const requestedBranchId = req.nextUrl.searchParams.get('branchId')
  const viewAsBranch = requestedBranchId
    ? access.elevated || access.branchIds.includes(requestedBranchId)
      ? requestedBranchId
      : null
    : null
  const elevated = access.elevated && !viewAsBranch
  // null = all tenant branches (elevated); otherwise the concrete branch list.
  const branchIds = elevated ? null : viewAsBranch ? [viewAsBranch] : access.branchIds

  return {
    userId: session.user.id,
    userEmail: session.user.email ?? '',
    tenantId: access.tenantId,
    access,
    branchIds,
  }
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await resolveScope(req)
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (req.nextUrl.searchParams.get('sync') === '1') {
      // Never let a leads-DB hiccup break the badge — fall back to local rows.
      try {
        await syncWhatsappLeads(ctx.tenantId, ctx.branchIds)
      } catch (e) {
        console.error('[whatsapp-leads sync]', e)
      }
    }

    // Optional day-range filter (mirrors the kanban day filter) on submittedAt.
    const fromParam = req.nextUrl.searchParams.get('from')
    const toParam = req.nextUrl.searchParams.get('to')
    const range = fromParam && toParam ? { from: new Date(fromParam), to: new Date(toParam) } : null

    const items = await listPendingWhatsappLeads(ctx.tenantId, ctx.branchIds, range)
    return NextResponse.json({
      count: items.length,
      items,
      canManage: ctx.access.elevated,
    })
  } catch (e) {
    console.error('[GET whatsapp-leads]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

const AddSchema = z.object({
  branchId: z.string().min(1),
  fullName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  campaignName: z.string().trim().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const ctx = await resolveScope(req)
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (ctx.access.viewerOnly) {
      return NextResponse.json({ error: 'Read-only access' }, { status: 403 })
    }
    if (!ctx.access.elevated) {
      return NextResponse.json({ error: 'Only super admins can add WhatsApp leads.' }, { status: 403 })
    }
    const parsed = AddSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed' }, { status: 422 })
    }
    const branch = await prisma.crm_branch.findFirst({
      where: { id: parsed.data.branchId, tenantId: ctx.tenantId },
      select: { id: true },
    })
    if (!branch) return NextResponse.json({ error: 'Branch not found' }, { status: 404 })

    const created = await prisma.crm_whatsapp_lead.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: branch.id,
        wsLeadId: `manual_${randomUUID()}`,
        source: 'manual',
        status: 'PENDING',
        fullName: parsed.data.fullName || null,
        phone: parsed.data.phone || null,
        campaignName: parsed.data.campaignName || null,
        submittedAt: new Date(),
      },
      select: { id: true },
    })

    void logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      userEmail: ctx.userEmail,
      action: 'CREATE',
      entity: 'crm_whatsapp_lead',
      entityId: created.id,
      meta: { source: 'manual', branchId: branch.id },
    })

    return NextResponse.json({ success: true, id: created.id })
  } catch (e) {
    console.error('[POST whatsapp-leads]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

const DeleteSchema = z.object({
  id: z.string().min(1),
  reason: z.string().trim().optional(),
})

export async function DELETE(req: NextRequest) {
  try {
    const ctx = await resolveScope(req)
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (ctx.access.viewerOnly) {
      return NextResponse.json({ error: 'Read-only access' }, { status: 403 })
    }
    if (!ctx.access.elevated) {
      return NextResponse.json({ error: 'Only super admins can delete WhatsApp leads.' }, { status: 403 })
    }
    const parsed = DeleteSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed' }, { status: 422 })
    }
    const existing = await prisma.crm_whatsapp_lead.findFirst({
      where: { id: parsed.data.id, tenantId: ctx.tenantId, status: 'PENDING' },
      select: { id: true },
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await prisma.crm_whatsapp_lead.update({
      where: { id: existing.id },
      data: {
        status: 'DELETED',
        deletedByUserId: ctx.userId,
        deletedAt: new Date(),
        deleteReason: parsed.data.reason || null,
      },
    })

    void logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      userEmail: ctx.userEmail,
      action: 'DELETE',
      entity: 'crm_whatsapp_lead',
      entityId: existing.id,
      meta: { reason: parsed.data.reason ?? null },
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[DELETE whatsapp-leads]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
