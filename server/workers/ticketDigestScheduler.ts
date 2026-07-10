/**
 * Ticket Digest scheduler.
 *
 * Sends a per-submitter digest email four times a day in Asia/Kuala_Lumpur
 * local time: 12:00, 15:00, 18:00, 21:00. Each fire emails every submitter
 * who had at least one ticket created in the window since the previous
 * fire, listing those tickets and their CURRENT status as of fire-time.
 *
 * Window definition (KL wall-clock):
 *   12:00 fire → 21:00 previous day  → 12:00 today  (15h, covers overnight)
 *   15:00 fire → 12:00 today         → 15:00 today  (3h)
 *   18:00 fire → 15:00 today         → 18:00 today  (3h)
 *   21:00 fire → 18:00 today         → 21:00 today  (3h)
 *
 * Why setInterval and not BullMQ: the BullMQ-backed digest worker is
 * Redis-dependent and currently disabled on this deployment. Mirrors
 * burnlistScheduler.ts which is the established no-Redis pattern.
 *
 * Idempotency: a `core_audit_log` row with
 *   action   = 'TICKET_DIGEST_FIRED'
 *   entity   = 'ticket_digest_window'
 *   entityId = `<YYYY-MM-DD>:<hour>`   (KL date, KL hour)
 * marks each window as already-sent. The tick checks for that row before
 * sending. Survives container restarts.
 *
 * From address: hard-coded to `od@ebright.my` framed as no-reply, per the
 * product spec — distinct from the default CRM_FROM_EMAIL so digest
 * branding is consistent regardless of branch overrides.
 */

import { prisma } from '@/lib/crm/db'
import type { SendEmailOptions } from '@/lib/crm/email'

const TICK_INTERVAL_MS = 60 * 1000 // 1 minute
const KL_OFFSET_MS = 8 * 3600 * 1000

// ─── Lazy email loader ───────────────────────────────────────────────────────
// `@/lib/crm/email` throws at IMPORT time in production when
// CRM_RESEND_API_KEY is unset (it's a hard guard to catch missing config at
// boot — see lib/crm/email.ts:27). On staging that env var isn't always
// exported, and pulling the module statically at the top of this file would
// crash the entire worker on startup. Defer the import to first-send so the
// scheduler boots regardless; failures fall back to a per-fire warning.
let cachedSendEmail:
  | ((opts: SendEmailOptions) => Promise<{ id: string }>)
  | null
  | 'unavailable' = null

async function trySendEmail(opts: SendEmailOptions): Promise<{ id: string } | null> {
  if (cachedSendEmail === 'unavailable') return null
  if (cachedSendEmail === null) {
    try {
      const mod = await import('@/lib/crm/email')
      cachedSendEmail = mod.sendEmail
    } catch (e) {
      cachedSendEmail = 'unavailable'
      console.warn(
        '[ticketDigest] Email module unavailable — likely missing CRM_RESEND_API_KEY. ' +
          'Auto-fire will continue ticking but no emails will be sent until the env ' +
          'var is set and the worker is restarted. Underlying error:',
        e instanceof Error ? e.message : e,
      )
      return null
    }
  }
  return cachedSendEmail(opts)
}

/** The four daily fire hours, KL wall-clock. */
const FIRE_HOURS = [12, 15, 18, 21] as const
type FireHour = (typeof FIRE_HOURS)[number]

const DIGEST_FROM = 'Ebright CRM (no-reply) <od@ebright.my>'
const AUDIT_ACTION = 'TICKET_DIGEST_FIRED'
const AUDIT_ENTITY = 'ticket_digest_window'

let interval: NodeJS.Timeout | null = null

// ─── KL time helpers ─────────────────────────────────────────────────────────

interface KLNow {
  /** YYYY-MM-DD in KL wall-clock terms. */
  dateStr: string
  /** 0-23 in KL wall-clock terms. */
  hour: number
  /** 0-59. */
  minute: number
}

function klNow(now: Date = new Date()): KLNow {
  const shifted = new Date(now.getTime() + KL_OFFSET_MS)
  return {
    dateStr: shifted.toISOString().slice(0, 10),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  }
}

/** UTC instant for "KL <dateStr> <klHour>:00:00". */
function klMomentToUtc(dateStr: string, klHour: number): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, klHour, 0, 0) - KL_OFFSET_MS)
}

/** Subtract one day from a YYYY-MM-DD string. */
function previousDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const prev = new Date(Date.UTC(y, m - 1, d) - 24 * 3600 * 1000)
  return prev.toISOString().slice(0, 10)
}

/** Window for a given fire (KL terms → UTC Date pair).
 *  start = previous fire's UTC instant (yesterday's 21:00 if firing 12:00)
 *  end   = this fire's UTC instant */
function computeWindow(dateStr: string, fireHour: FireHour): { start: Date; end: Date } {
  const idx = FIRE_HOURS.indexOf(fireHour)
  const end = klMomentToUtc(dateStr, fireHour)
  const start =
    idx === 0
      ? klMomentToUtc(previousDay(dateStr), FIRE_HOURS[FIRE_HOURS.length - 1])
      : klMomentToUtc(dateStr, FIRE_HOURS[idx - 1])
  return { start, end }
}

// ─── HTML rendering ──────────────────────────────────────────────────────────

interface DigestTicket {
  ticket_number: string
  status: string
  sub_type: string
  issue_context: string
  created_at: Date
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatKLTime(d: Date): string {
  return d.toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  })
}

function statusBadge(status: string): string {
  const colour =
    status === 'complete'    ? '#16a34a' :
    status === 'in_progress' ? '#2563eb' :
    status === 'rejected'    ? '#dc2626' :
                               '#6b7280'
  return `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:${colour};color:#fff;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(status.replace('_', ' '))}</span>`
}

function buildDigestHtml(
  recipientName: string | null,
  tickets: DigestTicket[],
  window: { start: Date; end: Date },
): string {
  const rows = tickets
    .map(
      (t) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-size:13px;color:#111827;">${escapeHtml(t.ticket_number)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${statusBadge(t.status)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;">${escapeHtml(t.issue_context)} · ${escapeHtml(t.sub_type)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280;white-space:nowrap;">${formatKLTime(t.created_at)}</td>
      </tr>`,
    )
    .join('')

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:640px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="padding:20px 24px;border-bottom:1px solid #e5e7eb;">
      <div style="font-size:18px;font-weight:700;color:#111827;">Ticket Digest</div>
      <div style="margin-top:4px;font-size:13px;color:#6b7280;">${formatKLTime(window.start)} → ${formatKLTime(window.end)} (Asia/Kuala_Lumpur)</div>
    </div>
    <div style="padding:20px 24px;">
      <p style="margin:0 0 12px;font-size:14px;color:#374151;">Hi ${escapeHtml(recipientName ?? 'there')},</p>
      <p style="margin:0 0 16px;font-size:14px;color:#374151;">You submitted <strong>${tickets.length}</strong> ticket${tickets.length === 1 ? '' : 's'} in this window. Current statuses:</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#f9fafb;">
            <th align="left" style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;">Ticket #</th>
            <th align="left" style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;">Status</th>
            <th align="left" style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;">Type</th>
            <th align="left" style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;">Submitted</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;line-height:1.5;">
      This is an automated message from Ebright CRM. Please do not reply to this email — replies are not monitored. Manage your tickets in the CRM portal.
    </div>
  </div>
</body></html>`
}

// ─── Main tick ───────────────────────────────────────────────────────────────

async function tick(): Promise<void> {
  try {
    const now = klNow()
    const fireHour = FIRE_HOURS.find((h) => h === now.hour) as FireHour | undefined
    if (fireHour === undefined) return // not a fire hour — quiet 56 min/hr.
    // No minute throttle: the audit-log check below is fast and is the real
    // idempotency guard. Skipping the throttle lets a worker that boots at
    // 12:30 KL still send the noon digest if no audit row exists yet.

    const entityId = `${now.dateStr}:${String(fireHour).padStart(2, '0')}`

    // Idempotency — already fired for this window?
    const already = await prisma.core_audit_log.findFirst({
      where: { action: AUDIT_ACTION, entity: AUDIT_ENTITY, entityId },
      select: { id: true },
    })
    if (already) return

    const { start, end } = computeWindow(now.dateStr, fireHour)

    // Fetch tickets created in the window. Cast tenantId as nullable since the
    // digest spans every tenant — multi-tenancy isn't a constraint here.
    const tickets = await prisma.tkt_ticket.findMany({
      where: { created_at: { gte: start, lt: end } },
      select: {
        id: true,
        ticket_number: true,
        tenant_id: true,
        user_id: true,
        status: true,
        sub_type: true,
        issue_context: true,
        created_at: true,
      },
      orderBy: { created_at: 'asc' },
    })

    if (tickets.length === 0) {
      // Mark fired anyway so we don't recheck every minute for the rest of
      // the fire hour. Tenant column on core_audit_log is nullable.
      await prisma.core_audit_log.create({
        data: {
          action: AUDIT_ACTION,
          entity: AUDIT_ENTITY,
          entityId,
          meta: {
            tickets: 0,
            recipients: 0,
            windowStart: start.toISOString(),
            windowEnd: end.toISOString(),
          },
        },
      })
      console.log(`[ticketDigest] ${entityId} — no tickets in window, marked fired.`)
      return
    }

    // Resolve submitter emails. tkt_ticket.user_id == crm_auth_user.id.
    const submitterIds = Array.from(new Set(tickets.map((t) => t.user_id)))
    const submitters = await prisma.crm_auth_user.findMany({
      where: { id: { in: submitterIds } },
      select: { id: true, email: true, name: true },
    })
    const byId = new Map(submitters.map((u) => [u.id, u]))

    // Group tickets by submitter.
    const buckets = new Map<string, typeof tickets>()
    for (const t of tickets) {
      const arr = buckets.get(t.user_id) ?? []
      arr.push(t)
      buckets.set(t.user_id, arr)
    }

    // Fire one email per submitter. Failures on individual sends are logged
    // but don't abort the whole batch — the next fire's audit-log check will
    // skip THIS window so we accept that some submitters may miss a digest.
    // (Bigger fix: per-submitter audit rows. Out of scope for v1.)
    let sentCount = 0
    let failedCount = 0
    for (const [userId, userTickets] of buckets) {
      const user = byId.get(userId)
      if (!user?.email) {
        failedCount++
        console.warn(`[ticketDigest] No email for user ${userId}, skipping.`)
        continue
      }
      try {
        const r = await trySendEmail({
          to: user.email,
          subject: `Ticket Digest — ${userTickets.length} new ticket${userTickets.length === 1 ? '' : 's'} (${formatKLTime(end)})`,
          html: buildDigestHtml(user.name, userTickets, { start, end }),
          from: DIGEST_FROM,
        })
        if (r === null) {
          // Email module unavailable (e.g. CRM_RESEND_API_KEY unset). The
          // warning was already printed once by trySendEmail on first call;
          // count this attempt as a failure so the audit row reflects reality.
          failedCount++
        } else {
          sentCount++
        }
      } catch (e) {
        failedCount++
        console.warn(
          `[ticketDigest] Send failed for ${user.email}:`,
          e instanceof Error ? e.message : e,
        )
      }
    }

    await prisma.core_audit_log.create({
      data: {
        action: AUDIT_ACTION,
        entity: AUDIT_ENTITY,
        entityId,
        meta: {
          tickets: tickets.length,
          recipients: buckets.size,
          sent: sentCount,
          failed: failedCount,
          windowStart: start.toISOString(),
          windowEnd: end.toISOString(),
        },
      },
    })
    console.log(
      `[ticketDigest] ${entityId} — fired: ${tickets.length} tickets, ${sentCount} sent, ${failedCount} failed.`,
    )
  } catch (err) {
    console.warn(
      '[ticketDigest] tick failed:',
      err instanceof Error ? err.message : err,
    )
  }
}

export async function startTicketDigestScheduler(): Promise<void> {
  // Catch-up on startup: if the container restarted just past a fire hour
  // and the audit row for the current window was never written, this tick
  // will fire it now. The minute===0 throttle inside tick() blocks the
  // catch-up unless it's still within the first minute, but the audit-log
  // check makes repeated start-stop cycles safe regardless.
  await tick()
  interval = setInterval(() => {
    void tick()
  }, TICK_INTERVAL_MS)
  console.log('[ticketDigest] Started — fires 12:00 / 15:00 / 18:00 / 21:00 KL')
}

export async function stopTicketDigestScheduler(): Promise<void> {
  if (interval) {
    clearInterval(interval)
    interval = null
  }
}
