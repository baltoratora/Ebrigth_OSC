/**
 * GET  /api/crm/tickets — List tickets (role-scoped)
 * POST /api/crm/tickets — Create a new ticket
 */

import { type NextRequest } from 'next/server'
import { prisma } from '@/lib/crm/db'
import { requireTktAuth, TktAuthError } from '@/lib/crm/tkt-auth'
import { logAudit } from '@/lib/crm/audit'
import { enqueueTicketEmail } from '@/lib/crm/queue'
import { createTicketWithNumber } from '@/lib/crm/ticketNumber'
import {
  CreateTicketSchema,
  validateTicketFields,
} from '@/lib/crm/validations/ticket'
import { z } from 'zod'
import { Prisma } from '@prisma/client'

// ─── Error helper ─────────────────────────────────────────────────────────────

function err(msg: string, status: number) {
  return Response.json({ error: msg }, { status })
}

// ─── GET /api/crm/tickets ─────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireTktAuth(req.headers)
    const sp = req.nextUrl.searchParams

    // Parse query params. The list page sends platformId / branchId (UUIDs);
    // older callers (e.g. tickets/kanban topbar wiring) still send platform
    // (slug) / branch (branch_number). Accept both shapes.
    const platform        = sp.get('platform') ?? undefined
    const platformId      = sp.get('platformId') ?? undefined
    const branch          = sp.get('branch') ?? undefined
    const branchId        = sp.get('branchId') ?? undefined
    const status          = sp.get('status') ?? undefined
    const search          = sp.get('search') ?? undefined
    const dateFrom        = sp.get('dateFrom') ?? undefined
    const dateTo          = sp.get('dateTo') ?? undefined
    const includeArchived = sp.get('includeArchived') === 'true'
    const page            = Math.max(1, parseInt(sp.get('page') ?? '1', 10))
    const pageSize        = Math.min(100, Math.max(1, parseInt(sp.get('pageSize') ?? '25', 10)))

    // Build base where clause
    const where: Prisma.tkt_ticketWhereInput = { tenant_id: ctx.tenantId }

    // Role-scoped visibility
    if (ctx.departmentSubType) {
      // Scoped department account — only tickets directed to its department
      // (by sub_type), regardless of which "Others"-platform row they carry.
      where.sub_type = ctx.departmentSubType
    } else if (ctx.role === 'user') {
      // Basic users: see all tickets submitted from their branch(es).
      // Fall back to own tickets only if no branch assignments exist.
      if (ctx.branchIds.length > 0) {
        where.branch_id = { in: ctx.branchIds }
      } else {
        where.user_id = ctx.userId
      }
    } else if (ctx.role === 'platform_admin') {
      where.platform_id = { in: ctx.platformIds }
    }
    // super_admin sees all

    // Platform filter — accept either slug or UUID.
    if (platformId) {
      if (!ctx.departmentSubType && ctx.role === 'platform_admin' && !ctx.platformIds.includes(platformId)) {
        return Response.json({ data: [], total: 0, page, pageSize })
      }
      where.platform_id = platformId
    } else if (platform) {
      const plat = await prisma.tkt_platform.findFirst({
        where: { tenant_id: ctx.tenantId, slug: platform },
        select: { id: true },
      })
      if (plat) {
        if (!ctx.departmentSubType && ctx.role === 'platform_admin' && !ctx.platformIds.includes(plat.id)) {
          return Response.json({ data: [], total: 0, page, pageSize })
        }
        where.platform_id = plat.id
      }
    }

    // Branch filter — accept either branch_number or UUID.
    if (branchId) {
      where.branch_id = branchId
    } else if (branch) {
      where.branch = { branch_number: branch }
    }

    // Status filter
    if (status) {
      where.status = status
    }

    // Search filter (ticket_number or submitter name)
    if (search) {
      where.OR = [
        { ticket_number: { contains: search, mode: 'insensitive' } },
      ]
    }

    // Date range filter
    if (dateFrom || dateTo) {
      const createdFilter: Prisma.DateTimeFilter<'tkt_ticket'> = {}
      if (dateFrom) createdFilter.gte = new Date(dateFrom)
      if (dateTo)   createdFilter.lte = new Date(dateTo)
      where.created_at = createdFilter
    }

    // Visibility filter: hide completed tickets older than visible_until
    if (!(includeArchived && ctx.role === 'super_admin')) {
      const existingAnd = Array.isArray(where.AND)
        ? (where.AND as Prisma.tkt_ticketWhereInput[])
        : where.AND
        ? [where.AND as Prisma.tkt_ticketWhereInput]
        : []

      where.AND = [
        ...existingAnd,
        {
          OR: [
            { status: { not: 'complete' } },
            { visible_until: { gt: new Date() } },
          ],
        },
      ]
    }

    const [tickets, total] = await prisma.$transaction([
      prisma.tkt_ticket.findMany({
        where,
        include: {
          platform:  { select: { id: true, name: true, slug: true, code: true, accent_color: true } },
          branch:    { select: { id: true, name: true, code: true, branch_number: true } },
          submitter: { select: { user_id: true, role: true, email_notifications: true } },
          attachments: true,
          events:      { orderBy: { created_at: 'asc' } },
        },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.tkt_ticket.count({ where }),
    ])

    // Enrich submitter with name/email from crm_auth_user so the list can show
    // "Denize" instead of "f7fe1e37…". tkt_user_profile only carries
    // notification prefs / role, not display name.
    const submitterIds = Array.from(new Set(tickets.map((t) => t.user_id)))
    const submitterUsers = submitterIds.length
      ? await prisma.crm_auth_user.findMany({
          where: { id: { in: submitterIds } },
          select: { id: true, name: true, email: true },
        })
      : []
    const submitterById = new Map(submitterUsers.map((u) => [u.id, u]))

    // Reshape attachments/events to legacy UI field names — same adapter
    // applied in app/api/crm/tickets/[id]/route.ts. The schema was simplified
    // (event_type + meta JSON; url/filename/created_at on attachments) but
    // the UI consumers (TicketTable / TicketTimeline) still expect the rich
    // field set, so we adapt at the boundary.
    const data = tickets.map((t) => ({
      ...t,
      submitter: {
        ...t.submitter,
        // Flatten in the auth-user fields the UI displays. The base submitter
        // object only had role + prefs; the table needs a human-readable name.
        name:  submitterById.get(t.user_id)?.name  ?? null,
        email: submitterById.get(t.user_id)?.email ?? null,
      },
      attachments: t.attachments.map((a) => ({
        id:            a.id,
        ticket_id:     a.ticket_id,
        file_type:     'general',
        original_name: a.filename,
        s3_key:        a.url,
        mime_type:     a.mime_type,
        size_bytes:    a.size,
        uploaded_by:   '',
        uploaded_at:   a.created_at,
      })),
      events: t.events.map((ev) => {
        const meta = (ev.meta ?? {}) as Record<string, unknown>
        return {
          id:         ev.id,
          ticket_id:  ev.ticket_id,
          actor_id:   typeof meta.actor_id   === 'string' ? meta.actor_id   : '',
          type:       ev.event_type,
          from_value: typeof meta.from_value === 'string' ? meta.from_value : null,
          to_value:   typeof meta.to_value   === 'string' ? meta.to_value   : null,
          payload:    meta,
          created_at: ev.created_at,
        }
      }),
    }))

    return Response.json({ data, total, page, pageSize })
  } catch (e) {
    if (e instanceof TktAuthError) return err(e.message, e.statusCode)
    console.error('[GET /api/crm/tickets]', e)
    return err('Internal server error', 500)
  }
}

// ─── POST /api/crm/tickets ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireTktAuth(req.headers)

    const body = await req.json()
    const parsed = CreateTicketSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 422 },
      )
    }

    const { platformSlug, branchId, subType, fields } = parsed.data

    // Branch-scope enforcement for non-admins. The dropdown in TicketForm
    // already restricts visible branches via GET /api/crm/tkt-branches, but
    // a tampered submission could send any UUID — so check here too. Admin
    // roles can target any branch in their tenant.
    if (ctx.role === 'user' && !ctx.branchIds.includes(branchId)) {
      return err('You do not have access to this branch', 403)
    }

    // Load platform by slug
    const platform = await prisma.tkt_platform.findFirst({
      where: { tenant_id: ctx.tenantId, slug: platformSlug },
    })
    if (!platform) return err(`Platform '${platformSlug}' not found`, 404)

    // Load branch
    const branch = await prisma.tkt_branch.findFirst({
      where: { tenant_id: ctx.tenantId, id: branchId },
    })
    if (!branch) return err('Branch not found', 404)

    // Validate dynamic fields
    try {
      validateTicketFields(platformSlug, subType, fields)
    } catch (ve) {
      if (ve instanceof z.ZodError) {
        return Response.json(
          { error: 'Field validation failed', details: ve.flatten() },
          { status: 422 },
        )
      }
      throw ve
    }

    // Create ticket + counter atomically
    const ticket = await prisma.$transaction(async (tx) => {
      const created = await createTicketWithNumber(tx, {
        tenant_id:     ctx.tenantId,
        branch_id:     branchId,
        platform_id:   platform.id,
        user_id:       ctx.userId,
        issue_context: `${platformSlug}/${subType}`,
        sub_type:      subType,
        fields,
        branch_number: branch.branch_number,
        platform_code: platform.code,
      })

      // Write initial status_change event
      await tx.tkt_ticket_event.create({
        data: {
          ticket_id: created.id,
          event_type: 'status_change',
          meta: {
            tenant_id: ctx.tenantId,
            actor_id: ctx.userId,
            to_value: 'received',
          },
        },
      })

      return created
    })

    // Enqueue notification email (fire-and-forget)
    void enqueueTicketEmail({
      ticketId:        ticket.id,
      tenantId:        ctx.tenantId,
      event:           'created',
      recipientUserId: ctx.userId,
    })

    // Audit log
    void logAudit({
      tenantId:  ctx.tenantId,
      userId:    ctx.userId,
      userEmail: ctx.email,
      action:    'CREATE',
      entity:    'tkt_ticket',
      entityId:  ticket.id,
      meta:      { ticketNumber: ticket.ticket_number, platformSlug, subType },
    })

    return Response.json(
      { ticketId: ticket.id, ticketNumber: ticket.ticket_number, data: ticket },
      { status: 201 },
    )
  } catch (e) {
    if (e instanceof TktAuthError) return err(e.message, e.statusCode)
    console.error('[POST /api/crm/tickets]', e)
    return err('Internal server error', 500)
  }
}
