-- Per-scan clock-in/out email de-dup log (ebright_hrfs).
--
-- The attendance email watcher (lib/hikvision-email-sync.ts) changed from
-- "one clock-in + one clock-out per person per day" to PER-SCAN: the first
-- scan of the day is a clock-in, and EVERY later scan is a clock-out, so every
-- scan produces an email the employee can use as proof they used the scanner.
--
-- De-dup is now per individual scan (person_id + exact scan timestamp) instead
-- of per (person_id, date, kind). The watcher creates this table on boot, but
-- it is recorded here for documentation.
--
-- IMPORTANT one-time seed (already run directly on the prod ebright_hrfs DB on
-- 2026-06-12): every scan that already existed at switch-over time was inserted
-- as 'seed' so the new per-scan logic does NOT re-email the day's backlog — it
-- only emails scans that arrive after the switch. Re-run is safe (idempotent).

CREATE TABLE IF NOT EXISTS public.hikvision_scan_email_log (
  person_id text        NOT NULL,
  scan_time timestamptz NOT NULL,
  kind      text        NOT NULL,        -- 'in' | 'out' | 'seed'
  sent_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (person_id, scan_time)
);

-- One-time backlog seed (no-op on re-run):
INSERT INTO public.hikvision_scan_email_log (person_id, scan_time, kind)
SELECT person_id, event_time, 'seed'
  FROM public.hikvision_attendance_all
 WHERE event_time <= now()
   AND person_id IS NOT NULL AND person_id <> '' AND person_id <> '0'
ON CONFLICT DO NOTHING;
