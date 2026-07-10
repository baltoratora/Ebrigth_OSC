/**
 * WhatsApp provider abstraction.
 *
 * All provider implementations (Meta Cloud API, Twilio, etc.) must satisfy
 * this interface so the rest of the CRM can stay provider-agnostic.
 */

export interface ParsedInboundMessage {
  /** Sender phone number in E.164 format (e.g. "+60123456789") */
  from: string
  body: string
  providerMessageId: string
  timestamp: Date
  type: 'text' | 'image' | 'audio' | 'document'
}

export interface SendResult {
  providerMessageId: string
}

export interface WhatsAppProvider {
  /**
   * Send a plain-text message to a recipient.
   * @param to  Recipient phone in E.164 format (no leading "whatsapp:" prefix)
   */
  sendText(to: string, body: string): Promise<SendResult>

  /**
   * Send a pre-approved template message.
   * @param to           Recipient phone in E.164 format
   * @param templateName Approved template name registered with the provider
   * @param vars         Key → value substitution variables for the template
   */
  sendTemplate(
    to: string,
    templateName: string,
    vars: Record<string, string>,
  ): Promise<SendResult>

  /**
   * Verify the webhook request signature to guard against spoofed payloads.
   * @param rawBody Raw UTF-8 request body string (before any JSON parsing)
   * @param headers All request headers (lowercase keys recommended)
   * @returns true if the signature is valid
   */
  verifyWebhookSignature(
    rawBody: string,
    headers: Record<string, string>,
  ): boolean

  /**
   * Parse a raw webhook payload into a normalised inbound message.
   * Returns null if the payload does not represent an inbound user message
   * (e.g. delivery receipts, status updates).
   */
  parseWebhook(payload: unknown): ParsedInboundMessage | null
}
