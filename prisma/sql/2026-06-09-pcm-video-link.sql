-- PCM System: store the absence make-up video link per invitation.
--
-- When a student is marked no_show, staff paste the catch-up video link in the
-- attendance detail modal. Once a link exists, the "Video to Parent" control
-- becomes a Send action; the existing video_sent_to_parent flag records that
-- it was sent. Nullable — blank = no link yet.
--
-- Additive + idempotent. Run against the PCM database (ebrightleads_db).

ALTER TABLE pcm_invitations
  ADD COLUMN IF NOT EXISTS video_link text;

COMMENT ON COLUMN pcm_invitations.video_link IS
  'Absence make-up video link to send to the parent (only meaningful when '
  'status = no_show). Pairs with video_sent_to_parent.';
