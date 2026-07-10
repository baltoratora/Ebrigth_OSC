import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/crm/db'
import { normalizePhone } from '@/lib/crm/utils'
import { enqueueAutomation } from '@/lib/crm/queue'

/**
 * Pull the parent's free-text remark out of a form submission. The "Remarks"
 * textarea is keyed by a generated field id, so walk the form schema for any
 * field whose label looks like "remarks" and read that id from the body;
 * fall back to common literal keys.
 */
function extractRemarks(schema: unknown, body: Record<string, string>): string | undefined {
  const direct = body.remarks ?? body.message ?? body.notes
  if (direct && String(direct).trim()) return String(direct).trim()

  const ids: string[] = []
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) { node.forEach(walk); return }
    const obj = node as Record<string, unknown>
    if (typeof obj.label === 'string' && /remark/i.test(obj.label) && typeof obj.id === 'string') ids.push(obj.id)
    for (const v of Object.values(obj)) walk(v)
  }
  walk(schema)
  for (const id of ids) {
    const v = body[id]
    if (v && String(v).trim()) return String(v).trim()
  }
  return undefined
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const form = await prisma.crm_website_form.findUnique({
    where: { publicSlug: slug },
    include: { branch: true },
  })
  if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 })

  const body = await req.json() as Record<string, string>

  // Map form fields to contact fields
  const firstName = (body.firstName ?? body.first_name ?? body.name ?? '').split(' ')[0] || 'Unknown'
  const lastName = (body.lastName ?? body.last_name ?? body.name ?? '').split(' ').slice(1).join(' ') || undefined
  const email = body.email || undefined
  const rawPhone = body.phone ?? body.mobile ?? ''
  const phone = rawPhone ? normalizePhone(rawPhone) : undefined

  // Parent's free-text "Remarks" — the textarea uses a generated field id, so
  // resolve it from the form schema (any field labelled like "remarks") and
  // fall back to common keys. Without this the remark never reaches the lead
  // card (only the trial-submit form stored it before).
  const remarks = extractRemarks(form.schema, body)

  // Find lead source for website
  const leadSource = await prisma.crm_lead_source.findFirst({
    where: { tenantId: form.tenantId, name: { contains: 'Website' } },
  })

  // Check for duplicate
  const existing = phone
    ? await prisma.crm_contact.findFirst({ where: { tenantId: form.tenantId, phone, deletedAt: null } })
    : email
    ? await prisma.crm_contact.findFirst({ where: { tenantId: form.tenantId, email, deletedAt: null } })
    : null

  let contactId: string

  if (existing) {
    contactId = existing.id
    // Existing contact re-submitting with a remark — keep the latest non-empty.
    if (remarks) await prisma.crm_contact.update({ where: { id: existing.id }, data: { remarks } })
  } else {
    const contact = await prisma.crm_contact.create({
      data: {
        tenantId: form.tenantId,
        branchId: form.branchId,
        firstName,
        lastName,
        email,
        phone,
        leadSourceId: leadSource?.id,
        childName1: body.childName ?? body.child_name ?? undefined,
        childAge1: body.childAge ?? body.child_age ?? undefined,
        preferredBranchId: body.preferredBranch ?? undefined,
        remarks: remarks ?? null,
      },
    })
    contactId = contact.id
  }

  // Increment submission count
  await prisma.crm_website_form.update({
    where: { id: form.id },
    data: { submissionsCount: { increment: 1 } },
  })

  // Fire FORM_SUBMITTED automations
  const automations = await prisma.crm_automation.findMany({
    where: { tenantId: form.tenantId, enabled: true, triggerType: 'FORM_SUBMITTED' },
  })
  for (const auto of automations) {
    await enqueueAutomation({
      automationId: auto.id,
      contactId,
      tenantId: form.tenantId,
      triggeredBy: 'FORM_SUBMITTED',
      triggerPayload: { formId: form.id, slug, data: body },
    })
  }

  return NextResponse.json({ ok: true, contactId })
}
