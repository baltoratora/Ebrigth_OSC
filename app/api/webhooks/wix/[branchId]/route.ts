import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/crm/db'
import { normalizePhone } from '@/lib/crm/utils'
import { enqueueAutomation } from '@/lib/crm/queue'

interface WixFormField {
  fieldName?: string
  fieldTitle?: string
  value?: string
}

interface WixSubmissionPayload {
  formId?: string
  submissionId?: string
  submittedAt?: string
  fields?: WixFormField[]
  // Wix may also send nested structure
  data?: {
    formId?: string
    submission?: {
      id?: string
      submittedAt?: string
      submissions?: Record<string, unknown>
    }
  }
}

function getWixField(fields: WixFormField[], ...names: string[]): string {
  for (const name of names) {
    const field = fields.find(
      (f) =>
        (f.fieldName ?? '').toLowerCase().includes(name.toLowerCase()) ||
        (f.fieldTitle ?? '').toLowerCase().includes(name.toLowerCase()),
    )
    if (field?.value) return field.value
  }
  return ''
}

function verifyWixHmac(req: NextRequest, rawBody: string, secret: string): boolean {
  const signature = req.headers.get('x-wix-signature') ?? ''
  if (!signature) return false
  const expected = createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex')
  try {
    return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ branchId: string }> },
) {
  try {
    const { branchId } = await params

    const rawBody = await req.text()

    // HMAC verification (optional — only if WIX_HMAC_SECRET is set)
    const hmacSecret = process.env.WIX_HMAC_SECRET
    if (hmacSecret) {
      if (!verifyWixHmac(req, rawBody, hmacSecret)) {
        return NextResponse.json({ error: 'Invalid HMAC signature' }, { status: 401 })
      }
    }

    const branch = await prisma.crm_branch.findUnique({
      where: { id: branchId },
      select: { tenantId: true },
    })
    if (!branch) {
      return NextResponse.json({ error: 'Branch not found' }, { status: 404 })
    }

    let payload: WixSubmissionPayload
    try {
      payload = JSON.parse(rawBody) as WixSubmissionPayload
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const fields = payload.fields ?? []

    const fullName = getWixField(fields, 'name', 'full_name', 'fullname')
    const nameParts = fullName.trim().split(/\s+/)
    const firstName = nameParts[0] ?? 'Unknown'
    const lastName = nameParts.slice(1).join(' ') || null

    const rawPhone = getWixField(fields, 'phone', 'mobile', 'contact')
    const phone = rawPhone ? normalizePhone(rawPhone) : null
    const email = getWixField(fields, 'email', 'email_address') || null

    // Find/create Website lead source
    let leadSource = await prisma.crm_lead_source.findFirst({
      where: {
        tenantId: branch.tenantId,
        name: { equals: 'Website (Conversion)', mode: 'insensitive' },
      },
    })
    if (!leadSource) {
      leadSource = await prisma.crm_lead_source.create({
        data: { tenantId: branch.tenantId, name: 'Website (Conversion)' },
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

    if (!existing) {
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
          triggeredBy: 'wix_webhook',
          triggerPayload: { source: 'Wix', submissionId: payload.submissionId },
        })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/webhooks/wix/[branchId]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
