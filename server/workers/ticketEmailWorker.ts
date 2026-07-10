/**
 * Ticket Email Worker — tkt.email_sender BullMQ worker.
 *
 * Consumes TicketEmailJobData and sends transactional email notifications
 * to ticket recipients via Resend. Skips if user has email_notifications=false.
 *
 * Writes a tkt_ticket_event record on each send and logs to core_audit_log.
 */

import { Worker } from 'bullmq'
import {
  redisConnection,
  ticketEmailQueue,
  type TicketEmailJobData,
} from '@/lib/crm/queue'
import { prisma } from '@/lib/crm/db'
import { sendEmail } from '@/lib/crm/email'
import { logAudit } from '@/lib/crm/audit'

// ─── Email HTML builders ──────────────────────────────────────────────────────

function baseLayout(content: string, accentColor: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Ebright OSC</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
          <tr>
            <td style="background:${accentColor};padding:20px 32px;">
              <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.5px;">Ebright OSC</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">${content}</td>
          </tr>
          <tr>
            <td style="padding:16px 32px;background:#f1f5f9;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                You are receiving this email because you have email notifications enabled.
                Contact your administrator to update your preferences.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

interface TicketEmailContext {
  ticketNumber: string
  platformName: string
  branchName: string
  recipientName: string
  accentColor: string
  adminRemark?: string | null
  rejectionReason?: string | null
}

function buildTicketReceivedHtml(ctx: TicketEmailContext): string {
  const content = `
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0f172a;">Ticket Received</h2>
    <p style="margin:0 0 24px;font-size:14px;color:#64748b;">Hi ${ctx.recipientName},</p>
    <p style="margin:0 0 24px;font-size:15px;color:#1e293b;line-height:1.6;">
      Your support request has been received and is now in our queue.
      We'll update you as soon as a team member picks it up.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:24px;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Ticket Number</p>
        <p style="margin:0;font-size:18px;font-weight:700;color:#0f172a;">${ctx.ticketNumber}</p>
      </td></tr>
      <tr><td style="padding:0 20px 16px;">
        <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Platform</p>
        <p style="margin:0;font-size:14px;color:#1e293b;">${ctx.platformName}</p>
      </td></tr>
      <tr><td style="padding:0 20px 16px;">
        <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Branch</p>
        <p style="margin:0;font-size:14px;color:#1e293b;">${ctx.branchName}</p>
      </td></tr>
    </table>
    <p style="margin:0;font-size:14px;color:#64748b;">Thank you for reaching out. We'll be in touch soon.</p>
  `
  return baseLayout(content, ctx.accentColor)
}

function buildStatusChangedHtml(
  ctx: TicketEmailContext,
  status: string,
  statusLabel: string,
  statusColor: string,
): string {
  const remarkSection =
    ctx.adminRemark
      ? `<div style="margin-bottom:24px;padding:16px 20px;background:#f0f9ff;border-left:4px solid ${ctx.accentColor};border-radius:0 8px 8px 0;">
           <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;font-weight:600;text-transform:uppercase;">Admin Note</p>
           <p style="margin:0;font-size:14px;color:#1e293b;">${ctx.adminRemark}</p>
         </div>`
      : ''

  const content = `
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0f172a;">Ticket Status Update</h2>
    <p style="margin:0 0 24px;font-size:14px;color:#64748b;">Hi ${ctx.recipientName},</p>
    <p style="margin:0 0 24px;font-size:15px;color:#1e293b;line-height:1.6;">
      Your ticket <strong>${ctx.ticketNumber}</strong> status has been updated.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:24px;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Ticket Number</p>
        <p style="margin:0;font-size:18px;font-weight:700;color:#0f172a;">${ctx.ticketNumber}</p>
      </td></tr>
      <tr><td style="padding:0 20px 16px;">
        <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">New Status</p>
        <span style="display:inline-block;padding:4px 12px;background:${statusColor}20;color:${statusColor};border-radius:9999px;font-size:13px;font-weight:600;">${statusLabel}</span>
      </td></tr>
    </table>
    ${remarkSection}
    <p style="margin:0;font-size:14px;color:#64748b;">If you have questions, please contact your branch administrator.</p>
  `
  return baseLayout(content, ctx.accentColor)
}

function buildRejectedHtml(ctx: TicketEmailContext): string {
  const reasonSection =
    ctx.rejectionReason
      ? `<div style="margin-bottom:24px;padding:16px 20px;background:#fef2f2;border-left:4px solid #ef4444;border-radius:0 8px 8px 0;">
           <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;font-weight:600;text-transform:uppercase;">Reason</p>
           <p style="margin:0;font-size:14px;color:#1e293b;">${ctx.rejectionReason}</p>
         </div>`
      : ''

  const content = `
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0f172a;">Ticket Rejected</h2>
    <p style="margin:0 0 24px;font-size:14px;color:#64748b;">Hi ${ctx.recipientName},</p>
    <p style="margin:0 0 24px;font-size:15px;color:#1e293b;line-height:1.6;">
      Unfortunately, ticket <strong>${ctx.ticketNumber}</strong> has been rejected.
    </p>
    ${reasonSection}
    <p style="margin:0;font-size:14px;color:#64748b;">
      If you believe this is an error, please contact your branch administrator or submit a new request.
    </p>
  `
  return baseLayout(content, '#ef4444')
}

function buildAssignedHtml(ctx: TicketEmailContext): string {
  const content = `
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0f172a;">Ticket Assigned to You</h2>
    <p style="margin:0 0 24px;font-size:14px;color:#64748b;">Hi ${ctx.recipientName},</p>
    <p style="margin:0 0 24px;font-size:15px;color:#1e293b;line-height:1.6;">
      You have been assigned a support ticket that requires your attention.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:24px;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Ticket Number</p>
        <p style="margin:0;font-size:18px;font-weight:700;color:#0f172a;">${ctx.ticketNumber}</p>
      </td></tr>
      <tr><td style="padding:0 20px 16px;">
        <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Platform</p>
        <p style="margin:0;font-size:14px;color:#1e293b;">${ctx.platformName}</p>
      </td></tr>
    </table>
    <p style="margin:0;font-size:14px;color:#64748b;">Please log in to the OSC portal to review and action this ticket.</p>
  `
  return baseLayout(content, ctx.accentColor)
}

function buildStaleReminderHtml(ctx: TicketEmailContext): string {
  const content = `
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0f172a;">Stale Ticket Reminder</h2>
    <p style="margin:0 0 24px;font-size:14px;color:#64748b;">Hi ${ctx.recipientName},</p>
    <p style="margin:0 0 24px;font-size:15px;color:#1e293b;line-height:1.6;">
      The following ticket has been in <strong>Received</strong> status for an extended period and requires your attention.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;background:#fffbeb;border-radius:8px;border:1px solid #fcd34d;margin-bottom:24px;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Ticket Number</p>
        <p style="margin:0;font-size:18px;font-weight:700;color:#0f172a;">${ctx.ticketNumber}</p>
      </td></tr>
      <tr><td style="padding:0 20px 16px;">
        <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Platform</p>
        <p style="margin:0;font-size:14px;color:#1e293b;">${ctx.platformName}</p>
      </td></tr>
      <tr><td style="padding:0 20px 16px;">
        <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Branch</p>
        <p style="margin:0;font-size:14px;color:#1e293b;">${ctx.branchName}</p>
      </td></tr>
    </table>
    <p style="margin:0;font-size:14px;color:#64748b;">Please log in to the OSC portal to process this ticket.</p>
  `
  return baseLayout(content, '#f59e0b')
}

// ─── Build subject + HTML by event ───────────────────────────────────────────

function buildEmailContent(
  event: string,
  ctx: TicketEmailContext,
): { subject: string; html: string } {
  const n = ctx.ticketNumber

  switch (event) {
    case 'created':
      return {
        subject: `Ticket ${n} Received`,
        html: buildTicketReceivedHtml(ctx),
      }
    case 'in_progress':
      return {
        subject: `Ticket ${n} is In Progress`,
        html: buildStatusChangedHtml(ctx, 'in_progress', 'In Progress', '#3b82f6'),
      }
    case 'complete':
      return {
        subject: `Ticket ${n} has been Completed`,
        html: buildStatusChangedHtml(ctx, 'complete', 'Completed', '#10b981'),
      }
    case 'rejected':
      return {
        subject: `Ticket ${n} has been Rejected`,
        html: buildRejectedHtml(ctx),
      }
    case 'assigned':
      return {
        subject: `You've been assigned Ticket ${n}`,
        html: buildAssignedHtml(ctx),
      }
    case 'stale_reminder':
      return {
        subject: `Action Required: Ticket ${n} is awaiting processing`,
        html: buildStaleReminderHtml(ctx),
      }
    default:
      return {
        subject: `Ticket ${n} Update`,
        html: buildStatusChangedHtml(ctx, event, event, '#6b7280'),
      }
  }
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export const ticketEmailWorker = new Worker<TicketEmailJobData>(
  'tkt.email_sender',
  async (job) => {
    const { ticketId, tenantId, event, recipientUserId } = job.data

    // 1. Load ticket with relations
    const ticket = await prisma.tkt_ticket.findUnique({
      where: { id: ticketId },
      include: {
        platform: { select: { name: true, accent_color: true } },
        branch: { select: { name: true } },
        submitter: { select: { user_id: true } },
      },
    })

    if (!ticket) {
      console.warn(`[ticketEmailWorker] Ticket ${ticketId} not found — skipping`)
      return
    }

    // 2. Load recipient auth user (for email + name)
    const recipientAuth = await prisma.crm_auth_user.findUnique({
      where: { id: recipientUserId },
      select: { id: true, email: true, name: true },
    })

    if (!recipientAuth) {
      console.warn(`[ticketEmailWorker] Recipient user ${recipientUserId} not found — skipping`)
      return
    }

    // 3. Check email_notifications preference
    const recipientProfile = await prisma.tkt_user_profile.findUnique({
      where: { user_id: recipientUserId },
      select: { email_notifications: true },
    })

    if (recipientProfile && !recipientProfile.email_notifications) {
      console.log(
        `[ticketEmailWorker] User ${recipientUserId} has email_notifications=false — skipping`,
      )
      return
    }

    // 4. Build email content
    const ctx: TicketEmailContext = {
      ticketNumber: ticket.ticket_number,
      platformName: ticket.platform.name,
      branchName: ticket.branch.name,
      recipientName: recipientAuth.name ?? recipientAuth.email,
      accentColor: ticket.platform.accent_color,
      adminRemark: ticket.admin_remark,
      rejectionReason: ticket.rejection_reason,
    }

    const { subject, html } = buildEmailContent(event, ctx)

    // 5. Send email
    await sendEmail({ to: recipientAuth.email, subject, html })

    // 6. Write ticket event
    await prisma.tkt_ticket_event.create({
      data: {
        ticket_id: ticketId,
        event_type: 'email_sent',
        meta: {
          tenant_id: tenantId,
          actor_id: recipientUserId,
          to: recipientAuth.email,
          event,
        },
      },
    })

    // 7. Audit log
    void logAudit({
      tenantId,
      userId: recipientUserId,
      userEmail: recipientAuth.email,
      action: 'CREATE',
      entity: 'tkt_ticket_event',
      entityId: ticketId,
      meta: { subtype: 'email_sent', event, to: recipientAuth.email },
    })

    console.log(
      `[ticketEmailWorker] Sent "${event}" email for ticket ${ticket.ticket_number} → ${recipientAuth.email}`,
    )
  },
  {
    connection: redisConnection,
    concurrency: 10,
  },
)

ticketEmailWorker.on('completed', (job) => {
  console.log(`[ticketEmailWorker] Job ${job.id} (${job.name}) completed`)
})

ticketEmailWorker.on('failed', (job, err) => {
  console.error(`[ticketEmailWorker] Job ${job?.id} failed:`, err.message)
  // Rethrow is handled by BullMQ — the error propagates for retry logic
})

// ─── Start helper ─────────────────────────────────────────────────────────────

export function startTicketEmailWorker(): void {
  console.log('[ticketEmailWorker] Started (tkt.email_sender)')
}

export default ticketEmailWorker
