/**
 * instrumentation.ts — Next.js server startup hook.
 *
 * Next.js calls register() exactly once when the server process boots.
 * We guard with NEXT_RUNTIME so the interval only runs in the Node.js
 * process (not Edge workers or the browser bundle).
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

const SYNC_INTERVAL_MS = 10_000; // 10 seconds — tune as needed

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { syncScannerToDb, syncDateToDb, yesterdayKL } = await import('@/lib/scanner-sync');

  console.log(
    `[scanner-sync] Background sync starting — polling every ${SYNC_INTERVAL_MS / 1000}s`
  );

  // On boot: backfill yesterday without sending emails (data already happened).
  // This ensures yesterday's records are always present even if the server was
  // down or restarted overnight.
  const yesterday = yesterdayKL();
  console.log(`[scanner-sync] Backfilling yesterday (${yesterday}) from device…`);
  syncDateToDb(yesterday, false).catch(err => {
    console.error('[scanner-sync] Yesterday backfill error:', err);
  });

  // Run today's sync once immediately on boot so we don't wait for the first interval.
  // sendEmails=false: clock-in/out emails are now driven by the Hikvision pipeline
  // (below), not the AttendanceLog poller — this silences the old AttendanceLog emails.
  syncScannerToDb(false).catch(err => {
    console.error('[scanner-sync] Initial sync error:', err);
  });

  setInterval(() => {
    syncScannerToDb(false).catch(err => {
      console.error('[scanner-sync] Sync error:', err);
    });
  }, SYNC_INTERVAL_MS);

  // ── Hikvision clock-in/out email notifications ────────────────────────────
  // Emails are driven off public.hikvision_attendance_all (the live pipeline).
  // Gated by HIKVISION_EMAIL_SYNC so it only runs where explicitly enabled —
  // set HIKVISION_EMAIL_SYNC=on in the environment to switch it on.
  if (process.env.HIKVISION_EMAIL_SYNC === 'on') {
    const { syncHikvisionEmails } = await import('@/lib/hikvision-email-sync');
    const EMAIL_INTERVAL_MS = 30_000; // 30s — emails don't need a 10s cadence
    console.log(`[hikvision-email] Notifications ON — checking every ${EMAIL_INTERVAL_MS / 1000}s`);
    syncHikvisionEmails().catch(err => console.error('[hikvision-email] Initial run error:', err));
    setInterval(() => {
      syncHikvisionEmails().catch(err => console.error('[hikvision-email] Run error:', err));
    }, EMAIL_INTERVAL_MS);
  } else {
    console.log('[hikvision-email] Disabled (set HIKVISION_EMAIL_SYNC=on to enable).');
  }

  // ── Missing-today reminder emails (HQ) ────────────────────────────────────
  // Once an HQ employee is 15 min past their scheduled start without clocking
  // in, email them a reminder to justify the absence to HR. Separate from the
  // clock-in/out emails. Gated by MISSING_REMINDER_EMAIL=on. Optional
  // HR_JUSTIFY_EMAIL env makes the HR address a clickable mailto in the email.
  if (process.env.MISSING_REMINDER_EMAIL === 'on') {
    const { sendMissingReminders } = await import('@/lib/missing-reminder');
    const MISSING_INTERVAL_MS = 5 * 60_000; // every 5 min — catches each start+15m window
    console.log(`[missing-reminder] ON — checking every ${MISSING_INTERVAL_MS / 60000}min (HQ)`);
    sendMissingReminders().catch(err => console.error('[missing-reminder] Initial run error:', err));
    setInterval(() => {
      sendMissingReminders().catch(err => console.error('[missing-reminder] Run error:', err));
    }, MISSING_INTERVAL_MS);
  } else {
    console.log('[missing-reminder] Disabled (set MISSING_REMINDER_EMAIL=on to enable).');
  }
}
