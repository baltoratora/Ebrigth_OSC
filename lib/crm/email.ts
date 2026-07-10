/**
 * CRM email service — sends via the shared SMTP mailer (lib/mailer.ts).
 *
 * Provides:
 *  - sendEmail          – low-level send with explicit html/subject
 *  - sendTemplatedEmail – render a merge-tag template then send
 *
 * Why SMTP and not Resend: production never had CRM_RESEND_API_KEY set, so
 * every CRM email (ticket digest, ticket-event notifications, automation
 * Send-Email actions) silently failed. We route through the same authenticated,
 * pooled SMTP transport the attendance emails already use (SMTP_HOST / PORT /
 * USER / PASS), which is configured and working in prod.
 *
 * The default "from" address falls back to:
 *   CRM_FROM_EMAIL → "Ebright CRM <SMTP_USER>" → "Ebright OSC <noreply@ebright.my>"
 * Gmail SMTP requires the From to match the authenticated account (or a verified
 * alias), so defaulting to SMTP_USER keeps sends from being rejected/rewritten.
 */

import { renderTemplate } from './template'
import type { TemplateContext } from './template'
import { sendMail } from '@/lib/mailer'

// ---------------------------------------------------------------------------
// Default sender
// ---------------------------------------------------------------------------

const DEFAULT_FROM =
  process.env.CRM_FROM_EMAIL ??
  (process.env.SMTP_USER
    ? `Ebright CRM <${process.env.SMTP_USER}>`
    : 'Ebright OSC <noreply@ebright.my>')

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SendEmailOptions {
  to: string | string[]
  subject: string
  /** Pre-rendered HTML body */
  html: string
  /** Overrides branch from_email or the module default */
  from?: string
  replyTo?: string
}

// ---------------------------------------------------------------------------
// sendEmail
// ---------------------------------------------------------------------------

/**
 * Send a transactional email via the shared SMTP transport.
 *
 * @returns the SMTP messageId for tracking / audit
 * @throws  On SMTP errors (auth, connection, rate-limit cooldown)
 */
export async function sendEmail(
  options: SendEmailOptions,
): Promise<{ id: string }> {
  const { to, subject, html, from, replyTo } = options

  const info = await sendMail({
    from: from ?? DEFAULT_FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    ...(replyTo ? { replyTo } : {}),
  })

  return { id: info?.messageId ?? 'smtp' }
}

// ---------------------------------------------------------------------------
// sendTemplatedEmail
// ---------------------------------------------------------------------------

/**
 * Render a merge-tag template string then send via SMTP.
 *
 * @param opts.to           Recipient email address
 * @param opts.templateBody Raw template string with `{{tag}}` placeholders
 * @param opts.subject      Email subject (not template-rendered; supply a plain string)
 * @param opts.ctx          Template context for merge-tag resolution
 * @param opts.from         Optional sender override
 */
export async function sendTemplatedEmail(opts: {
  to: string
  templateBody: string
  subject: string
  ctx: TemplateContext
  from?: string
}): Promise<{ id: string }> {
  const { to, templateBody, subject, ctx, from } = opts

  const html = renderTemplate(templateBody, ctx)

  return sendEmail({ to, subject, html, from })
}
