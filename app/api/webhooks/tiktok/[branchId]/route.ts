import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/crm/db'
import { normalizePhone } from '@/lib/crm/utils'
import { enqueueAutomation } from '@/lib/crm/queue'

interface TikTokLeadField {
  name: string
  value: string
}

interface TikTokLeadPayload {
  form_id?: string
  lead_id?: string
  advertiser_id?: string
  fields?: TikTokLeadField[]
  create_time?: number
}

function getField(fields: TikTokLeadField[], ...names: string[]): string {
  for (const name of names) {
    const field = fields.find((f) => f.name.toLowerCase() === name.toLowerCase())
    if (field?.value) return field.value
  }
  return ''
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ branchId: string }> },
) {
  try {
    const { branchId } = await params

    const branch = await prisma.crm_branch.findUnique({
      where: { id: branchId },
      select: { tenantId: true },
    })
    if (!branch) {
      return NextResponse.json({ error: 'Branch not found' }, { status: 404 })
    }

    const body = (await req.json()) as TikTokLeadPayload | TikTokLeadPayload[]
    const payloads = Array.isArray(body) ? body : [body]

    for (const payload of payloads) {
      const fields = payload.fields ?? []

      const fullName = getField(fields, 'full_name', 'name')
      const nameParts = fullName.trim().split(/\s+/)
      const firstName = nameParts[0] ?? 'Unknown'
      const lastName = nameParts.slice(1).join(' ') || null

      const rawPhone = getField(fields, 'phone_number', 'phone')
      const phone = rawPhone ? normalizePhone(rawPhone) : null
      const email = getField(fields, 'email', 'email_address') || null

      // Find/create TikTok lead source
      let leadSource = await prisma.crm_lead_source.findFirst({
        where: { tenantId: branch.tenantId, name: { equals: 'TikTok', mode: 'insensitive' } },
      })
      if (!leadSource) {
        leadSource = await prisma.crm_lead_source.create({
          data: { tenantId: branch.tenantId, name: 'TikTok' },
        })
      }

      // Dedup
      const existing = await prisma.crm_contact.findFirst({
        where: {
          tenantId: branch.tenantId,
          deletedAt: null,
          OR: [
            ...(phone ? [{ phone }] : []),
            ...(email ? [{ email }] : []),
          ],
        },
      })
      if (existing) continue

      const contact = await prisma.crm_contact.create({
        data: {
          tenantId: branch.tenantId,
          branchId,
          firstName,
          lastName,
          phone,
          email,
          leadSourceId: leadSource.id,
        },
      })

      // Fire FORM_SUBMITTED automation
      const automations = await prisma.crm_automation.findMany({
        where: {
          tenantId: branch.tenantId,
          enabled: true,
          triggerType: 'FORM_SUBMITTED',
          OR: [{ branchId }, { branchId: null }],
        },
        select: { id: true },
      })
      for (const automation of automations) {
        await enqueueAutomation({
          automationId: automation.id,
          contactId: contact.id,
          tenantId: branch.tenantId,
          triggeredBy: 'tiktok_webhook',
          triggerPayload: { leadId: payload.lead_id, source: 'TikTok' },
        })
      }
    }

    await prisma.crm_integration.updateMany({
      where: { branchId, type: 'TIKTOK' },
      data: { lastSyncAt: new Date() },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/webhooks/tiktok/[branchId]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
