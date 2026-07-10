/**
 * Twilio WhatsApp implementation of WhatsAppProvider.
 *
 * Docs: https://www.twilio.com/docs/whatsapp/api
 */

import { createHmac, timingSafeEqual } from 'crypto'
import type {
  ParsedInboundMessage,
  SendResult,
  WhatsAppProvider,
} from './provider'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface TwilioWhatsAppProviderConfig {
  accountSid: string
  authToken: string
  /** Your Twilio WhatsApp-enabled number in E.164 format, e.g. "+14155238886" */
  fromNumber: string
}

// ---------------------------------------------------------------------------
// Raw API / webhook shapes
// ---------------------------------------------------------------------------

interface TwilioMessageResponse {
  sid?: string
  status?: string
  error_message?: string
  error_code?: number
  message?: string // Twilio error body key
}

// Twilio sends webhook form fields; we receive them as a Record after parsing.
type TwilioWebhookFields = Record<string, string>

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class TwilioWhatsAppProvider implements WhatsAppProvider {
  private readonly accountSid: string
  private readonly authToken: string
  private readonly fromNumber: string

  constructor(config: TwilioWhatsAppProviderConfig) {
    this.accountSid = config.accountSid
    this.authToken = config.authToken
    this.fromNumber = config.fromNumber
  }

  // -------------------------------------------------------------------------
  // sendText
  // -------------------------------------------------------------------------

  async sendText(to: string, body: string): Promise<SendResult> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`

    const params = new URLSearchParams({
      From: `whatsapp:${this.fromNumber}`,
      To: `whatsapp:${to}`,
      Body: body,
    })

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: this.buildBasicAuth(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    const data = (await response.json()) as TwilioMessageResponse

    if (!response.ok) {
      const errMsg =
        data.message ?? data.error_message ?? `HTTP ${response.status}`
      throw new Error(`[Twilio WhatsApp] sendText failed: ${errMsg}`)
    }

    if (!data.sid) {
      throw new Error('[Twilio WhatsApp] sendText: no SID in response')
    }

    return { providerMessageId: data.sid }
  }

  // -------------------------------------------------------------------------
  // sendTemplate
  // -------------------------------------------------------------------------

  /**
   * Twilio does not have a native template API in the same way as Meta.
   * The standard approach is to send the pre-filled template text as a body.
   * We interpolate {{key}} placeholders in order of sorted keys, then send.
   */
  async sendTemplate(
    to: string,
    templateName: string,
    vars: Record<string, string>,
  ): Promise<SendResult> {
    // Twilio uses ContentSid for content templates; fall back to raw text body
    // using the template name as the message body with substitutions appended.
    // Partners who have a Twilio content template SID should extend this.
    const varList = Object.entries(vars)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v)
      .join(', ')

    const body = varList
      ? `${templateName}: ${varList}`
      : templateName

    return this.sendText(to, body)
  }

  // -------------------------------------------------------------------------
  // verifyWebhookSignature
  // -------------------------------------------------------------------------

  /**
   * Twilio signature: HMAC-SHA1 of (url + sorted-params-concatenated).
   *
   * Algorithm:
   * 1. Take the full request URL.
   * 2. If POST with form params, sort them alphabetically and append
   *    key+value pairs (no separator) to the URL.
   * 3. Sign with HMAC-SHA1 using authToken.
   * 4. Compare base64 result with X-Twilio-Signature header.
   *
   * @param rawBody  The raw URL-encoded form body string
   * @param headers  All request headers (lowercase keys recommended)
   *
   * Note: The factory passes `rawBody` as the URL-encoded form body, and
   * callers must also include the full webhook URL in `headers['x-twilio-url']`
   * (a convention used by this implementation — see webhook route handler).
   */
  verifyWebhookSignature(
    rawBody: string,
    headers: Record<string, string>,
  ): boolean {
    const signature =
      headers['x-twilio-signature'] ?? headers['X-Twilio-Signature'] ?? ''

    if (!signature) return false

    // The webhook route handler places the full URL in a custom header.
    const webhookUrl =
      headers['x-twilio-url'] ?? headers['X-Twilio-Url'] ?? ''

    if (!webhookUrl) return false

    // Parse the form params
    const params = new URLSearchParams(rawBody)
    const sortedPairs = Array.from(params.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    )

    // Build the string to sign: url + key1value1key2value2...
    const stringToSign =
      webhookUrl +
      sortedPairs.map(([k, v]) => `${k}${v}`).join('')

    const expectedBase64 = createHmac('sha1', this.authToken)
      .update(stringToSign, 'utf8')
      .digest('base64')

    const receivedBuf = Buffer.from(signature, 'base64')
    const expectedBuf = Buffer.from(expectedBase64, 'base64')

    if (receivedBuf.length !== expectedBuf.length) return false

    return timingSafeEqual(receivedBuf, expectedBuf)
  }

  // -------------------------------------------------------------------------
  // parseWebhook
  // -------------------------------------------------------------------------

  /**
   * Twilio sends webhook payloads as URL-encoded form bodies.
   * By the time this method is called the caller has already parsed the body
   * into a plain object (TwilioWebhookFields).
   */
  parseWebhook(payload: unknown): ParsedInboundMessage | null {
    if (typeof payload !== 'object' || payload === null) return null

    const fields = payload as TwilioWebhookFields

    const messageSid = fields['MessageSid'] ?? ''
    const fromRaw = fields['From'] ?? ''
    const body = fields['Body'] ?? ''
    const numMedia = parseInt(fields['NumMedia'] ?? '0', 10)

    if (!messageSid || !fromRaw) return null

    // Strip "whatsapp:" prefix if present
    const fromPhone = fromRaw.startsWith('whatsapp:')
      ? fromRaw.slice('whatsapp:'.length)
      : fromRaw

    // Normalise to E.164: ensure leading +
    const from = fromPhone.startsWith('+') ? fromPhone : `+${fromPhone}`

    // Twilio provides DateCreated for inbound messages; fall back to now.
    const dateCreated = fields['DateCreated']
    const timestamp = dateCreated ? new Date(dateCreated) : new Date()

    const type = this.resolveType(numMedia, fields)

    return {
      from,
      body,
      providerMessageId: messageSid,
      timestamp,
      type,
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private buildBasicAuth(): string {
    const credentials = Buffer.from(
      `${this.accountSid}:${this.authToken}`,
      'utf8',
    ).toString('base64')
    return `Basic ${credentials}`
  }

  private resolveType(
    numMedia: number,
    fields: TwilioWebhookFields,
  ): 'text' | 'image' | 'audio' | 'document' {
    if (numMedia === 0) return 'text'

    const contentType = fields['MediaContentType0'] ?? ''
    if (contentType.startsWith('image/')) return 'image'
    if (contentType.startsWith('audio/')) return 'audio'
    return 'document'
  }
}
