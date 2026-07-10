/**
 * Meta WhatsApp Cloud API implementation of WhatsAppProvider.
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 * API version: v20.0
 */

import { createHmac, timingSafeEqual } from 'crypto'
import type {
  ParsedInboundMessage,
  SendResult,
  WhatsAppProvider,
} from './provider'

// ---------------------------------------------------------------------------
// Raw API response shapes
// ---------------------------------------------------------------------------

interface MetaMessageResponse {
  messages?: Array<{ id: string }>
  error?: { message: string; code: number }
}

interface MetaWebhookMessage {
  id: string
  from: string
  timestamp: string
  type: string
  text?: { body: string }
}

interface MetaWebhookValue {
  messages?: MetaWebhookMessage[]
}

interface MetaWebhookChange {
  value?: MetaWebhookValue
}

interface MetaWebhookEntry {
  changes?: MetaWebhookChange[]
}

interface MetaWebhookPayload {
  entry?: MetaWebhookEntry[]
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface MetaWhatsAppProviderConfig {
  /** WhatsApp Business phone number ID from Meta developer console */
  phoneNumberId: string
  /** Permanent or temporary access token with whatsapp_business_messaging permission */
  accessToken: string
  /** App secret used to verify x-hub-signature-256 webhook signatures */
  appSecret: string
}

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

const API_BASE = 'https://graph.facebook.com/v20.0'

export class MetaWhatsAppProvider implements WhatsAppProvider {
  private readonly phoneNumberId: string
  private readonly accessToken: string
  private readonly appSecret: string

  constructor(config: MetaWhatsAppProviderConfig) {
    this.phoneNumberId = config.phoneNumberId
    this.accessToken = config.accessToken
    this.appSecret = config.appSecret
  }

  // -------------------------------------------------------------------------
  // sendText
  // -------------------------------------------------------------------------

  async sendText(to: string, body: string): Promise<SendResult> {
    const url = `${API_BASE}/${this.phoneNumberId}/messages`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body },
      }),
    })

    const data = (await response.json()) as MetaMessageResponse

    if (!response.ok) {
      const errMsg = data.error?.message ?? `HTTP ${response.status}`
      throw new Error(`[Meta WhatsApp] sendText failed: ${errMsg}`)
    }

    const messageId = data.messages?.[0]?.id
    if (!messageId) {
      throw new Error('[Meta WhatsApp] sendText: no message ID in response')
    }

    return { providerMessageId: messageId }
  }

  // -------------------------------------------------------------------------
  // sendTemplate
  // -------------------------------------------------------------------------

  async sendTemplate(
    to: string,
    templateName: string,
    vars: Record<string, string>,
  ): Promise<SendResult> {
    const url = `${API_BASE}/${this.phoneNumberId}/messages`

    // Build ordered parameter components from the vars object.
    // Convention: vars keys are "1", "2", … or any string; we sort by key.
    const parameters = Object.entries(vars)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => ({ type: 'text', text: value }))

    const components =
      parameters.length > 0
        ? [{ type: 'body', parameters }]
        : []

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'en' },
          components,
        },
      }),
    })

    const data = (await response.json()) as MetaMessageResponse

    if (!response.ok) {
      const errMsg = data.error?.message ?? `HTTP ${response.status}`
      throw new Error(`[Meta WhatsApp] sendTemplate failed: ${errMsg}`)
    }

    const messageId = data.messages?.[0]?.id
    if (!messageId) {
      throw new Error('[Meta WhatsApp] sendTemplate: no message ID in response')
    }

    return { providerMessageId: messageId }
  }

  // -------------------------------------------------------------------------
  // verifyWebhookSignature
  // -------------------------------------------------------------------------

  verifyWebhookSignature(
    rawBody: string,
    headers: Record<string, string>,
  ): boolean {
    // Meta sends: x-hub-signature-256: sha256=<hex>
    const signatureHeader =
      headers['x-hub-signature-256'] ?? headers['X-Hub-Signature-256'] ?? ''

    const prefix = 'sha256='
    if (!signatureHeader.startsWith(prefix)) {
      return false
    }

    const receivedHex = signatureHeader.slice(prefix.length)

    let receivedBuf: Buffer
    try {
      receivedBuf = Buffer.from(receivedHex, 'hex')
    } catch {
      return false
    }

    const expectedBuf = createHmac('sha256', this.appSecret)
      .update(rawBody, 'utf8')
      .digest()

    if (receivedBuf.length !== expectedBuf.length) {
      return false
    }

    return timingSafeEqual(receivedBuf, expectedBuf)
  }

  // -------------------------------------------------------------------------
  // parseWebhook
  // -------------------------------------------------------------------------

  parseWebhook(payload: unknown): ParsedInboundMessage | null {
    if (typeof payload !== 'object' || payload === null) return null

    const root = payload as MetaWebhookPayload

    const message =
      root.entry?.[0]?.changes?.[0]?.value?.messages?.[0]

    if (!message) return null

    // Only handle inbound messages (not status updates)
    if (!message.id || !message.from || !message.timestamp) return null

    const type = this.normaliseMessageType(message.type)
    const body = message.text?.body ?? ''

    const timestampSeconds = parseInt(message.timestamp, 10)
    const timestamp = isNaN(timestampSeconds)
      ? new Date()
      : new Date(timestampSeconds * 1000)

    return {
      from: `+${message.from.replace(/^\+/, '')}`,
      body,
      providerMessageId: message.id,
      timestamp,
      type,
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private normaliseMessageType(
    raw: string,
  ): 'text' | 'image' | 'audio' | 'document' {
    switch (raw) {
      case 'text':
        return 'text'
      case 'image':
        return 'image'
      case 'audio':
      case 'voice':
        return 'audio'
      default:
        return 'document'
    }
  }
}
