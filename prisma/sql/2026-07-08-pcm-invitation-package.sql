-- PCM: which renewal package a student paid for.
--
-- Picked by the BM the moment they mark a renewal student as paid (see the
-- "Unpaid" → package popover on the attendance roster). Cleared back to NULL
-- whenever paid is set back to false — "paid" and "which package" travel
-- together.
--
-- NOTE: this file is documentation, not a required manual step. As of this
-- feature, app/pcm-system/_lib/events.server.ts self-provisions this column
-- at runtime via ensurePackageColumn() (ADD COLUMN IF NOT EXISTS, run once per
-- server process before any read/write touches it) — same self-healing
-- pattern already used elsewhere in this app (paid, video_link,
-- arrival_window before it). Running this file by hand is harmless
-- (idempotent) but no longer necessary.

ALTER TABLE pcm_invitations
  ADD COLUMN IF NOT EXISTS package text;
