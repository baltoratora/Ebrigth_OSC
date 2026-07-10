/**
 * Meta WhatsApp Cloud API webhook endpoint.
 *
 * GET  – Webhook verification challenge (Meta calls this during setup)
 * POST – Inbound message handler
 *
 * Route: /api/webhooks/whatsapp/meta/[branchId]
 */

import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/crm/db'
import { logAudit, getClientIp } from '@/lib/crm/audit'
import { normalizePhone } from '@/lib/crm/utils'
import { getWhatsAppProvider } from '@/lib/crm/whatsapp/factory'
import { enqueueAutomation } from '@/lib/crm/queue'

// ---------------------------------------------------------------------------
// Route segment config — disable body parsing so we can read the raw buffer
// for signature verification.
// ---------------------------------------------------------------------------

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RouteContext {
  params: Promise<{ branchId: string }>
}

// ---------------------------------------------------------------------------
// GET — Webhook verification challenge
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { branchId } = await context.params
  const { searchParams } = request.nextUrl

  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  // Retrieve the branch's expected verify token from DB
  // We store it in crm_whatsapp_settings.credentials (decrypted by factory),
  // but for the challenge we need a lightweight lookup.
  // Convention: the verify token is stored as env CRM_META_VERIFY_TOKEN
  // or per-branch as crm_custom_value key "meta_verify_token".
  const expectedToken = await resolveVerifyToken(branchId)

  if (
    mode === 'subscribe' &&
    token === expectedToken &&
    challenge !== null
  ) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// ---------------------------------------------------------------------------
// POST — Inbound message
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { branchId } = await context.params

  // 1. Read raw body for signature verification
  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return NextResponse.json({ error: 'Cannot read body' }, { status: 400 })
  }

  // 2. Get the Meta provider for this branch
  let provider: Awaited<ReturnType<typeof getWhatsAppProvider>>
  try {
    provider = await getWhatsAppProvider(branchId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[WhatsApp/Meta] Provider load failed for branch ${branchId}:`, msg)
    return NextResponse.json({ error: 'Configuration error' }, { status: 500 })
  }

  if (!provider) {
    return NextResponse.json({ error: 'Not configured' }, { status: 404 })
  }

  // 3. Verify signature
  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    headers[key] = value
  })

  if (!provider.verifyWebhookSignature(rawBody, headers)) {
    void logAudit({
      action: 'CREATE',
      entity: 'crm_webhook_security',
      entityId: branchId,
      meta: { reason: 'invalid_signature', channel: 'WHATSAPP_META' },
      ipAddress: getClientIp(request.headers),
    })
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 4. Parse the inbound message
  let payload: unknown
  try {
    payload = JSON.parse(rawBody) as unknown
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const inbound = provider.parseWebhook(payload)
  if (!inbound) {
    // Status updates, delivery receipts, etc. — acknowledge but don't process
    return NextResponse.json({ status: 'ok' })
  }

  // 5. Load branch → tenantId
  const branch = await prisma.crm_branch.findUnique({
    where: { id: branchId },
    select: { tenantId: true },
  })

  if (!branch) {
    console.error(`[WhatsApp/Meta] Branch not found: ${branchId}`)
    return NextResponse.json({ error: 'Branch not found' }, { status: 404 })
  }

  const { tenantId } = branch

  // 6. Normalise phone + upsert crm_contact
  const normalizedPhone = normalizePhone(inbound.from) || inbound.from

  const contact = await prisma.crm_contact.upsert({
    where: {
      // Use a compound unique approach: find by phone within the tenant
      // Prisma doesn't support compound unique on nullable, so we use findFirst + create.
      // Workaround: use update-or-create pattern below.
      id: await resolveContactId(tenantId, branchId, normalizedPhone),
    },
    update: {
      // Keep existing data, just bump updatedAt via the update below
      updatedAt: new Date(),
    },
    create: {
      tenantId,
      branchId,
      firstName: normalizedPhone, // placeholder until we have a name
      phone: normalizedPhone,
    },
    select: { id: true },
  })

  // 7. Write crm_message
  const message = await prisma.crm_message.create({
    data: {
      tenantId,
      branchId,
      contactId: contact.id,
      channel: 'WHATSAPP',
      direction: 'IN',
      body: inbound.body,
      status: 'delivered',
      providerMessageId: inbound.providerMessageId,
    },
    select: { id: true },
  })

  // 8. Audit log
  void logAudit({
    tenantId,
    action: 'CREATE',
    entity: 'crm_message',
    entityId: message.id,
    meta: {
      channel: 'WHATSAPP',
      direction: 'IN',
      from: normalizedPhone,
      providerMessageId: inbound.providerMessageId,
    },
    ipAddress: getClientIp(request.headers),
    userAgent: request.headers.get('user-agent') ?? undefined,
  })

  // 9. Fire INCOMING_MESSAGE automations
  await triggerIncomingMessageAutomations({
    tenantId,
    branchId,
    contactId: contact.id,
    messageId: message.id,
  })

  return NextResponse.json({ status: 'ok' })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveVerifyToken(branchId: string): Promise<string> {
  // First look for a per-branch override in crm_custom_value
  const customValue = await prisma.crm_custom_value.findFirst({
    where: {
      scopeId: branchId,
      key: 'meta_verify_token',
    },
    select: { value: true },
  })

  if (customValue?.value) return customValue.value

  // Fall back to global env variable
  return process.env.CRM_META_VERIFY_TOKEN ?? ''
}

/**
 * Find an existing contact by phone within the tenant, or return a sentinel ID
 * that triggers the `create` branch of `upsert`.
 *
 * Because crm_contact.phone is nullable and not unique, we can't use a Prisma
 * `@@unique` upsert key on (tenantId, phone). We do a findFirst + upsert by id.
 */
async function resolveContactId(
  tenantId: string,
  branchId: string,
  phone: string,
): Promise<string> {
  const existing = await prisma.crm_contact.findFirst({
    where: { tenantId, phone },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })

  // Return a non-existent ID so prisma upsert falls into the `create` branch
  return existing?.id ?? 'non-existent-placeholder-id'
}

interface AutomationTriggerPayload {
  tenantId: string
  branchId: string
  contactId: string
  messageId: string
}

async function triggerIncomingMessageAutomations(
  payload: AutomationTriggerPayload,
): Promise<void> {
  const { tenantId, branchId, contactId, messageId } = payload

  const automations = await prisma.crm_automation.findMany({
    where: {
      tenantId,
      branchId,
      triggerType: 'INCOMING_MESSAGE',
      enabled: true,
    },
    select: { id: true },
  })

  await Promise.all(
    automations.map((automation) =>
      enqueueAutomation({
        automationId: automation.id,
        contactId,
        tenantId,
        triggeredBy: 'webhook:whatsapp:meta',
        triggerPayload: { messageId },
      }),
    ),
  )
}
