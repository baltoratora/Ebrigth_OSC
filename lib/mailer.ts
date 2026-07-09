import nodemailer, { type SendMailOptions, type SentMessageInfo } from 'nodemailer';

// Gmail throttles when the same account performs many fresh logins in a short
// window ("454-4.7.0 Too many login attempts"). Pooling reuses a single
// authenticated connection across all sends, and the rate limiter prevents
// burst sends during scanner-sync retry catch-up loops.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 465,
  secure: false,           // port 587 = STARTTLS
  pool: true,              // keep the SMTP connection open
  maxConnections: 1,       // Gmail prefers a single connection per account
  maxMessages: 100,        // re-auth after 100 messages (well under Gmail's daily cap)
  rateDelta: 1000,         // window for rateLimit, in ms
  rateLimit: 3,            // max 3 messages per second — safe for Gmail
  // Fast timeouts: a single bad email must not block the scanner-sync loop
  // for 30+ seconds. With these, a connection failure surfaces in <=5s and
  // immediately trips the cooldown (see safeSend below) so subsequent retries
  // bail instantly instead of each waiting for their own timeout.
  connectionTimeout: 5_000,  // TCP connect must complete within 5s
  greetingTimeout:   5_000,  // SMTP greeting must arrive within 5s
  socketTimeout:    10_000,  // overall send must complete within 10s
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ─── Cooldown circuit breaker ────────────────────────────────────────────────
// Once any send returns a Gmail rate-limit / auth failure, ALL further sends
// bail instantly for COOLDOWN_MS without touching Gmail. This stops the
// scanner-sync retry loop from re-hammering the account every 10s, which is
// what keeps the lockout going. Caller treats a cooldown skip as a failure
// (clockInEmailSent stays false), so the email naturally retries after cooldown.
const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
let cooldownUntil = 0;
let cooldownLogged = false;

function isRateLimitOrAuthError(err: unknown): boolean {
  const e = err as { code?: string; responseCode?: number; message?: string };
  // Auth / rate-limit errors from Gmail
  if (e?.code === 'EAUTH') return true;
  if (e?.responseCode === 454 || e?.responseCode === 535) return true;
  // Network errors — also trip cooldown so we don't burn 30s per retry
  // when the SMTP host is unreachable / slow / refusing connections.
  if (
    e?.code === 'ETIMEDOUT' ||
    e?.code === 'ECONNECTION' ||
    e?.code === 'ECONNREFUSED' ||
    e?.code === 'ECONNRESET' ||
    e?.code === 'ESOCKET'
  ) return true;
  const msg = (e?.message ?? '').toLowerCase();
  return msg.includes('too many login')
      || msg.includes('invalid login')
      || msg.includes('454')
      || msg.includes('etimedout')
      || msg.includes('econnrefused');
}

function fmtRemaining(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

async function safeSend(msg: SendMailOptions): Promise<SentMessageInfo> {
  const now = Date.now();
  if (now < cooldownUntil) {
    const remaining = cooldownUntil - now;
    if (!cooldownLogged) {
      console.warn(`[mailer] ❄ In cooldown for ${fmtRemaining(remaining)} — skipping sends until Gmail unlocks`);
      cooldownLogged = true;
    }
    throw new Error(`mailer in cooldown for ${fmtRemaining(remaining)}`);
  }

  try {
    const info = await transporter.sendMail(msg);
    cooldownLogged = false; // success — reset for next cooldown event
    return info;
  } catch (err) {
    if (isRateLimitOrAuthError(err)) {
      cooldownUntil = Date.now() + COOLDOWN_MS;
      cooldownLogged = false;
      console.error(`[mailer] ✗ Gmail rejected send — entering ${COOLDOWN_MS / 60000}min cooldown`);
    }
    throw err;
  }
}

// One-time SMTP auth check at module load so the cause of any failure is obvious.
transporter.verify().then(
  () => console.log(`[mailer] ✓ SMTP authenticated as ${process.env.SMTP_USER}`),
  (err: Error) => {
    console.error(`[mailer] ✗ SMTP auth failed: ${err.message}`);
    if (isRateLimitOrAuthError(err)) {
      cooldownUntil = Date.now() + COOLDOWN_MS;
      console.error(`[mailer] ❄ Entering ${COOLDOWN_MS / 60000}min cooldown — no sends will be attempted`);
    }
  },
);

/**
 * Generic SMTP send — used by the CRM email layer (lib/crm/email.ts) so all
 * CRM mail (ticket digest, ticket-event notifications, automation Send-Email)
 * goes through this same authenticated, pooled, cooldown-protected transport.
 * Throws on failure (and trips the shared cooldown on auth/rate-limit errors).
 */
export async function sendMail(msg: SendMailOptions): Promise<SentMessageInfo> {
  return safeSend(msg);
}

export async function sendClockInEmail(to: string, name: string, time: string): Promise<void> {
  await safeSend({
    from: `"Ebright Attendance" <${process.env.SMTP_USER}>`,
    to,
    subject: `✅ Clock-In Recorded — ${name}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">
        <div style="background:#1d4ed8;border-radius:8px;padding:16px 24px;margin-bottom:24px;">
          <h1 style="color:white;margin:0;font-size:20px;">Ebright Attendance</h1>
        </div>
        <p style="font-size:16px;color:#111827;">Hi <strong>${name}</strong>,</p>
        <p style="font-size:15px;color:#374151;">
          Your <strong style="color:#16a34a;">clock-in</strong> has been recorded.
        </p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:20px 0;">
          <p style="margin:0;font-size:14px;color:#15803d;">
            🕐 <strong>Time:</strong> ${time}
          </p>
        </div>
        <p style="font-size:13px;color:#9ca3af;margin-top:24px;">
          This is an automated message from the Ebright HR System. Please do not reply.
        </p>
      </div>
    `,
  });
}

/**
 * Daily "you're marked missing today" reminder, asking the employee to email
 * HR to justify their absence. NOT a clock-in/out email — sent by the
 * missing-reminder sweep once a person is 15 min past their scheduled start
 * without having clocked in.
 */
export async function sendMissingReminderEmail(
  to: string,
  name: string,
  opts: { branch: string; date: string; hrEmail?: string; deadline?: string },
): Promise<void> {
  const hrEmail = opts.hrEmail || 'hr@ebright.my';
  const deadline = opts.deadline || '6:00 PM';
  const hrLink = `<a href="mailto:${hrEmail}" style="color:#b45309;">${hrEmail}</a>`;
  await safeSend({
    from: `"Ebright HR" <${process.env.SMTP_USER}>`,
    to,
    subject: `Action Required: Attendance Justification for ${opts.date}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;color:#111827;">
        <p style="font-size:15px;">Dear <strong>${name}</strong>,</p>

        <p style="font-size:15px;">
          Please be informed that we are missing your biometric clock-in record for the following shift:
        </p>

        <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
          <tr>
            <td style="padding:6px 0;color:#6b7280;width:160px;">Affected Branch:</td>
            <td style="padding:6px 0;"><strong>${opts.branch}</strong></td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#6b7280;">Timeline / Date:</td>
            <td style="padding:6px 0;"><strong>${opts.date}</strong></td>
          </tr>
        </table>

        <p style="font-size:15px;">
          To ensure company compliance and protect your monthly payroll from errors, you must justify this
          missing log. Please reply to this email or contact us at ${hrLink} before
          <strong>${deadline}</strong> today with your status update:
        </p>

        <p style="font-size:14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin:16px 0;">
          <strong>Scenario A (Working):</strong> I was at work at the branch but missed the scan because
          [Provide Reason: Forgot / System Error] and my true arrival time was [Insert Time].
        </p>

        <p style="font-size:14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin:16px 0;">
          <strong>Scenario B (Not Working):</strong> I was absent from the branch because
          [Provide Reason: Sick Leave / Rest Day / Leave].
        </p>

        <p style="font-size:13px;color:#6b7280;">
          Please ignore this automated notice if you are on prior approved leave or have already corrected
          your attendance log.
        </p>

        <p style="font-size:14px;margin-top:24px;">
          Sincerely,<br />
          The HR Attendance Desk
        </p>
      </div>
    `,
  });
}

export async function sendClockOutEmail(to: string, name: string, time: string): Promise<void> {
  await safeSend({
    from: `"Ebright Attendance" <${process.env.SMTP_USER}>`,
    to,
    subject: `🔴 Clock-Out Recorded — ${name}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">
        <div style="background:#1d4ed8;border-radius:8px;padding:16px 24px;margin-bottom:24px;">
          <h1 style="color:white;margin:0;font-size:20px;">Ebright Attendance</h1>
        </div>
        <p style="font-size:16px;color:#111827;">Hi <strong>${name}</strong>,</p>
        <p style="font-size:15px;color:#374151;">
          Your <strong style="color:#dc2626;">clock-out</strong> has been recorded.
        </p>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:20px 0;">
          <p style="margin:0;font-size:14px;color:#b91c1c;">
            🕐 <strong>Time:</strong> ${time}
          </p>
        </div>
        <p style="font-size:13px;color:#9ca3af;margin-top:24px;">
          This is an automated message from the Ebright HR System. Please do not reply.
        </p>
      </div>
    `,
  });
}
