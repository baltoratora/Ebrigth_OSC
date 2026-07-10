-- PCM System: track whether the absence make-up video was sent to the parent.
--
-- When a student is marked no_show (absent) in the Academy attendance view,
-- staff need to record that the catch-up video was sent to the parent. This is
-- a per-invitation boolean, only meaningful while status = 'no_show'.
--
-- Additive + idempotent. Defaults to false so existing rows are unaffected and
-- the app keeps working before/after deploy. Run against the PCM database
-- (ebrightleads_db).

ALTER TABLE pcm_invitations
  ADD COLUMN IF NOT EXISTS video_sent_to_parent boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN pcm_invitations.video_sent_to_parent IS
  'Academy follow-up: whether the absence make-up video was sent to the parent. '
  'Only surfaced/edited when the invitation status is no_show.';
