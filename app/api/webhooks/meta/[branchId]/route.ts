import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/crm/db'
import { decrypt } from '@/lib/crm/crypto'
import { normalizePhone } from '@/lib/crm/utils'
import { enqueueAutomation } from '@/lib/crm/queue'

// ─── Meta verification ─────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ branchId: string }> },
) {
  const sp = req.nextUrl.searchParams
  const mode = sp.get('hub.mode')
  const token = sp.get('hub.verify_token')
  const challenge = sp.get('hub.challenge')

  const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN ?? 'ebright_meta_verify'

  if (mode === 'subscribe' && token === expectedToken) {
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// ─── Meta lead event ───────────────────────────────────────────────────────────

interface MetaLeadField {
  name: string
  values: string[]
}

interface MetaLeadEntry {
  id: string
  leadgen_id: string
  page_id: string
  form_id: string
  created_time: number
  changes?: Array<{ value: { leadgen_id: string; page_id: string; form_id: string } }>
}

interface MetaLeadData {
  id: string
  field_data: MetaLeadField[]
  created_time: number
}

function getField(fields: MetaLeadField[], ...names: string[]): string {
  for (const name of names) {
    const field = fields.find(
      (f) => f.name.toLowerCase() === name.toLowerCase(),
    )
    if (field?.values?.[0]) return field.values[0]
  }
  return ''
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ branchId: string }> },
) {
  try {
    const { branchId } = await params
    const body = await req.json() as { entry?: MetaLeadEntry[]; object?: string }

    if (body.object !== 'page') {
      return NextResponse.json({ ok: true })
    }

    const branch = await prisma.crm_branch.findUnique({
      where: { id: branchId },
      select: { tenantId: true },
    })
    if (!branch) {
      return NextResponse.json({ error: 'Branch not found' }, { status: 404 })
    }

    const integration = await prisma.crm_integration.findUnique({
      where: { branchId_type: { branchId, type: 'META' } },
      select: { id: true, oauthTokens: { orderBy: { createdAt: 'desc' }, take: 1 } },
    })
    if (!integration?.oauthTokens?.[0]) {
      return NextResponse.json({ error: 'Integration not connected' }, { status: 400 })
    }

    const rawToken = decrypt(integration.oauthTokens[0].accessToken)

    for (const entry of body.entry ?? []) {
      const changes = entry.changes ?? []
      for (const change of changes) {
        const leadgenId = change.value?.leadgen_id
        if (!leadgenId) continue

        // Fetch lead data from Meta Graph API
        let leadData: MetaLeadData
        try {
          const leadRes = await fetch(
            `https://graph.facebook.com/v20.0/${leadgenId}?fields=field_data,created_time&access_token=${rawToken}`,
          )
          if (!leadRes.ok) {
            console.error('[Meta webhook] Lead fetch failed:', await leadRes.text())
            continue
          }
          leadData = (await leadRes.json()) as MetaLeadData
        } catch (err) {
          console.error('[Meta webhook] Lead fetch error:', err)
          continue
        }

        const fields = leadData.field_data ?? []

        // Map fields to contact
        const fullName = getField(fields, 'full_name', 'name')
        const nameParts = fullName.trim().split(/\s+/)
        const firstName = nameParts[0] ?? 'Unknown'
        const lastName = nameParts.slice(1).join(' ') || null

        const rawPhone = getField(fields, 'phone_number', 'phone')
        const phone = rawPhone ? normalizePhone(rawPhone) : null

        const email = getField(fields, 'email', 'email_address') || null
        const childName = getField(fields, 'child_name', "child's name") || null
        const childAge = getField(fields, 'child_age', "child's age") || null
        const preferredBranch = getField(fields, 'preferred_branch', 'branch') || null

        // Find Meta lead source
        let leadSource = await prisma.crm_lead_source.findFirst({
          where: { tenantId: branch.tenantId, name: { equals: 'Meta', mode: 'insensitive' } },
        })
        if (!leadSource) {
          leadSource = await prisma.crm_lead_source.create({
            data: { tenantId: branch.tenantId, name: 'Meta' },
          })
        }

        // Dedup by phone or email
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

        // Create contact
        const contact = await prisma.crm_contact.create({
          data: {
            tenantId: branch.tenantId,
            branchId,
            firstName,
            lastName,
            phone,
            email,
            leadSourceId: leadSource.id,
            childName1: childName,
            childAge1: childAge,
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
            triggeredBy: 'meta_webhook',
            triggerPayload: { leadgenId, source: 'Meta' },
          })
        }
      }
    }

    // Update last sync
    await prisma.crm_integration.update({
      where: { branchId_type: { branchId, type: 'META' } },
      data: { lastSyncAt: new Date() },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/webhooks/meta/[branchId]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
