/**
 * Complete a WhatsApp lead — the branch fills the WhatsApp form and we convert
 * the anonymous interaction into a real CRM lead.
 *
 * On submit we create a crm_contact + crm_opportunity at the branch's "New
 * Lead" stage (source = WhatsApp), then mark the crm_whatsapp_lead COMPLETED
 * and link the contact. That clears the branch's red badge — the only way a
 * branch can clear it (otherwise a super admin deletes the interaction).
 *
 * The externalSourceTable/externalSourceId pair points back at the ws_lead, so
 * the contact's unique constraint makes a double-conversion impossible.
 */
import { type NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { z } from 'zod'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { logAudit } from '@/lib/crm/audit'
import { resolveBranchAccess } from '@/lib/crm/branch-access'
import { hasPermission } from '@/lib/crm/permissions'
import { normalizePhone } from '@/lib/crm/utils'
import { enqueueAutomation } from '@/lib/crm/queue'

const Schema = z.object({
  id: z.string().min(1),
  parentName: z.string().trim().min(1),
  childName: z.string().trim().optional(),
  phone: z.string().trim().min(1),
  email: z.string().trim().email(),
})

function splitName(full: string): { firstName: string; lastName: string | null } {
  const parts = full.trim().split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0], lastName: null }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const access = await resolveBranchAccess(session.user.id)
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // Converting a WhatsApp interaction creates a lead — read-only for AGENCY_ADMIN.
    if (!hasPermission(access.role, 'opportunities:write')) {
      return NextResponse.json({ error: 'Your role cannot create leads.' }, { status: 403 })
    }

    const parsed = Schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
    }
    const { id, parentName, childName, phone, email } = parsed.data

    const wsl = await prisma.crm_whatsapp_lead.findFirst({
      where: { id, tenantId: access.tenantId, status: 'PENDING' },
      select: { id: true, branchId: true, wsLeadId: true, campaignName: true },
    })
    if (!wsl) return NextResponse.json({ error: 'WhatsApp lead not found' }, { status: 404 })

    // Branch-scope guard: a branch can only clear its own interactions.
    if (!access.elevated && !access.branchIds.includes(wsl.branchId)) {
      return NextResponse.json({ error: 'You can only complete WhatsApp leads for your own branch.' }, { status: 403 })
    }

    // New Lead = first stage of the branch's pipeline.
    const pipeline = await prisma.crm_pipeline.findFirst({
      where: { tenantId: access.tenantId, branchId: wsl.branchId },
      include: { stages: { orderBy: { order: 'asc' }, take: 1 } },
    })
    if (!pipeline || pipeline.stages.length === 0) {
      return NextResponse.json({ error: 'No pipeline / New Lead stage for this branch' }, { status: 409 })
    }
    const newLeadStage = pipeline.stages[0]

    // "WhatsApp" lead source (created on first use).
    let leadSource = await prisma.crm_lead_source.findFirst({
      where: { tenantId: access.tenantId, name: 'WhatsApp' },
    })
    if (!leadSource) {
      leadSource = await prisma.crm_lead_source.create({
        data: { tenantId: access.tenantId, name: 'WhatsApp' },
      })
    }

    const { firstName, lastName } = splitName(parentName)
    const normalizedPhone = normalizePhone(phone)

    const result = await prisma.$transaction(async (tx) => {
      const contact = await tx.crm_contact.create({
        data: {
          tenantId: access.tenantId,
          branchId: wsl.branchId,
          // Parent is the primary contact (parent-centric form). childName1
          // holds the optional child name; leaving parentFullName null keeps
          // the parent's name as the card's display name.
          firstName,
          lastName,
          email,
          phone: normalizedPhone,
          leadSourceId: leadSource!.id,
          preferredBranchId: wsl.branchId,
          childName1: childName || null,
          campaignName: wsl.campaignName,
          externalSourceTable: 'ws_leads',
          externalSourceId: wsl.wsLeadId,
        },
        select: { id: true },
      })

      const opportunity = await tx.crm_opportunity.create({
        data: {
          tenantId: access.tenantId,
          branchId: wsl.branchId,
          contactId: contact.id,
          pipelineId: pipeline.id,
          stageId: newLeadStage.id,
          value: 0,
          lastStageChangeAt: new Date(),
        },
      })

      // Initial stage history (mirrors createOpportunity) so the lead has a
      // proper New Lead entry in its timeline.
      await tx.crm_stage_history.create({
        data: {
          tenantId: access.tenantId,
          opportunityId: opportunity.id,
          fromStageId: null,
          toStageId: newLeadStage.id,
          changedByUserId: session.user.id,
          note: 'Created from WhatsApp lead',
          changedAt: new Date(),
        },
      })

      await tx.crm_whatsapp_lead.update({
        where: { id: wsl.id },
        data: {
          status: 'COMPLETED',
          contactId: contact.id,
          completedByUserId: session.user.id,
          completedAt: new Date(),
        },
      })

      return { contactId: contact.id }
    })

    // Fire automations: WHATSAPP_LEAD (WhatsApp-specific workflows) AND
    // NEW_LEAD (general new-lead workflows) — a converted WhatsApp lead is both.
    // Enqueue each enabled, in-scope automation by its real id (the proven
    // fan-out pattern used by the public form-submit route). Fire-and-forget;
    // a missing Redis just no-ops via the queue's timeout guard.
    try {
      const automations = await prisma.crm_automation.findMany({
        where: {
          tenantId: access.tenantId,
          enabled: true,
          triggerType: { in: ['WHATSAPP_LEAD', 'NEW_LEAD'] },
          OR: [{ branchId: null }, { branchId: wsl.branchId }],
        },
        select: { id: true, triggerType: true },
      })
      for (const auto of automations) {
        void enqueueAutomation({
          automationId: auto.id,
          contactId: result.contactId,
          tenantId: access.tenantId,
          triggeredBy: auto.triggerType,
          triggerPayload: { whatsappLeadId: wsl.id, branchId: wsl.branchId },
        })
      }
    } catch (err) {
      console.error('[whatsapp-leads/complete] automation dispatch failed:', err)
    }

    void logAudit({
      tenantId: access.tenantId,
      userId: session.user.id,
      userEmail: session.user.email ?? '',
      action: 'CREATE',
      entity: 'crm_whatsapp_lead',
      entityId: wsl.id,
      meta: { completed: true, contactId: result.contactId, branchId: wsl.branchId },
    })

    return NextResponse.json({ success: true, contactId: result.contactId })
  } catch (e) {
    // The contact unique constraint (tenant, ws_leads, wsLeadId) trips if this
    // interaction was already converted — surface a friendly conflict.
    const msg = e instanceof Error ? e.message : 'Internal error'
    if (/unique|constraint/i.test(msg)) {
      return NextResponse.json({ error: 'This WhatsApp lead was already converted.' }, { status: 409 })
    }
    console.error('[POST whatsapp-leads/complete]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
