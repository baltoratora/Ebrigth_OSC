/**
 * Twilio WhatsApp webhook endpoint.
 *
 * POST – Inbound message handler (Twilio sends URL-encoded form data)
 *
 * Route: /api/webhooks/whatsapp/twilio/[branchId]
 *
 * Twilio signature verification requires the full public URL of this endpoint.
 * The implementation reads it from:
 *   1. X-Forwarded-Host header (set by reverse proxy / CDN)
 *   2. HOST header
 *   3. NEXTAUTH_URL env var
 *
 * Return value MUST be a Twilio-compatible TwiML XML response:
 *   <Response></Response>
 */

import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/crm/db'
import { logAudit, getClientIp } from '@/lib/crm/audit'
import { normalizePhone } from '@/lib/crm/utils'
import { getWhatsAppProvider } from '@/lib/crm/whatsapp/factory'
import { enqueueAutomation } from '@/lib/crm/queue'

// ---------------------------------------------------------------------------
// Route segment config
// ---------------------------------------------------------------------------

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RouteContext {
  params: Promise<{ branchId: string }>
}

// Empty TwiML response — tells Twilio we handled the message successfully
// without sending a reply.
const TWIML_OK = '<Response></Response>'

function twimlResponse(status: number = 200): NextResponse {
  return new NextResponse(TWIML_OK, {
    status,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  })
}

// ---------------------------------------------------------------------------
// POST — Inbound message
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { branchId } = await context.params

  // 1. Read raw URL-encoded body
  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return twimlResponse(400)
  }

  // 2. Get the Twilio provider for this branch
  let provider: Awaited<ReturnType<typeof getWhatsAppProvider>>
  try {
    provider = await getWhatsAppProvider(branchId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[WhatsApp/Twilio] Provider load failed for branch ${branchId}:`, msg)
    return twimlResponse(500)
  }

  if (!provider) {
    return twimlResponse(404)
  }

  // 3. Build the canonical webhook URL for Twilio signature validation.
  //    Twilio signs the exact URL it POSTed to.
  const webhookUrl = resolveWebhookUrl(request, branchId)

  // 4. Build headers map and inject the webhook URL under a known key.
  //    TwilioWhatsAppProvider.verifyWebhookSignature reads 'x-twilio-url'.
  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    headers[key] = value
  })
  headers['x-twilio-url'] = webhookUrl

  // 5. Verify Twilio signature
  if (!provider.verifyWebhookSignature(rawBody, headers)) {
    void logAudit({
      action: 'CREATE',
      entity: 'crm_webhook_security',
      entityId: branchId,
      meta: { reason: 'invalid_signature', channel: 'WHATSAPP_TWILIO' },
      ipAddress: getClientIp(request.headers),
    })
    // Twilio expects 403 on bad signature
    return twimlResponse(403)
  }

  // 6. Parse form body into a plain object
  const formFields = parseUrlEncoded(rawBody)

  // 7. Parse inbound message via provider
  const inbound = provider.parseWebhook(formFields)
  if (!inbound) {
    // Status callbacks, delivery receipts, etc.
    return twimlResponse(200)
  }

  // 8. Load branch → tenantId
  const branch = await prisma.crm_branch.findUnique({
    where: { id: branchId },
    select: { tenantId: true },
  })

  if (!branch) {
    console.error(`[WhatsApp/Twilio] Branch not found: ${branchId}`)
    return twimlResponse(404)
  }

  const { tenantId } = branch

  // 9. Normalise phone + upsert crm_contact
  const normalizedPhone = normalizePhone(inbound.from) || inbound.from

  const contact = await prisma.crm_contact.upsert({
    where: {
      id: await resolveContactId(tenantId, normalizedPhone),
    },
    update: {
      updatedAt: new Date(),
    },
    create: {
      tenantId,
      branchId,
      firstName: normalizedPhone,
      phone: normalizedPhone,
    },
    select: { id: true },
  })

  // 10. Write crm_message
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

  // 11. Audit log
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

  // 12. Fire INCOMING_MESSAGE automations
  await triggerIncomingMessageAutomations({
    tenantId,
    branchId,
    contactId: contact.id,
    messageId: message.id,
  })

  // Twilio expects a 200 TwiML response
  return twimlResponse(200)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Reconstruct the full public-facing URL of this webhook so Twilio can
 * validate its HMAC-SHA1 signature.
 */
function resolveWebhookUrl(request: NextRequest, branchId: string): string {
  // Prefer explicit env override (most reliable in production)
  const baseUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL

  if (baseUrl) {
    const url = new URL(baseUrl)
    url.pathname = `/api/webhooks/whatsapp/twilio/${branchId}`
    return url.toString()
  }

  // Derive from request headers (works behind reverse proxies that set X-Forwarded-Host)
  const proto =
    request.headers.get('x-forwarded-proto') ??
    (request.nextUrl.protocol.replace(':', '') || 'https')

  const host =
    request.headers.get('x-forwarded-host') ??
    request.headers.get('host') ??
    'localhost:3000'

  return `${proto}://${host}/api/webhooks/whatsapp/twilio/${branchId}`
}

/**
 * Parse a URL-encoded form body string into a plain key→value record.
 * Multi-value keys are collapsed to their last value (Twilio doesn't send duplicates).
 */
function parseUrlEncoded(body: string): Record<string, string> {
  const result: Record<string, string> = {}
  const params = new URLSearchParams(body)
  params.forEach((value, key) => {
    result[key] = value
  })
  return result
}

/**
 * Find an existing contact by phone within the tenant, or return a sentinel ID
 * that triggers the `create` branch of `upsert`.
 */
async function resolveContactId(
  tenantId: string,
  phone: string,
): Promise<string> {
  const existing = await prisma.crm_contact.findFirst({
    where: { tenantId, phone },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })

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
        triggeredBy: 'webhook:whatsapp:twilio',
        triggerPayload: { messageId },
      }),
    ),
  )
}
