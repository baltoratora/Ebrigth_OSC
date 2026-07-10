-- PCM: per-invitation type (Progress vs Renewal) + coach assignment.
--
-- "Progress" = student attending PCM toward the next grade-level chip on
--              pcm_progress_json. The normal flow.
-- "Renewal"  = student re-doing a grade they've already passed (e.g. for
--              a parent who wants extra reps). Tracked separately so the
--              dashboard can split "are kids progressing vs renewing".
--
-- Coach is a branchstaff member from the same branch. We don't FK to
-- branchstaff because that table lives in the main OSC DB (ebright_hrfs),
-- not the FA/PCM DB. The columns are denormalised — `coach_id` references
-- the staff record id, `coach_name` is cached at assignment time so the
-- BM UI can render the row without a cross-DB join.
--
-- Idempotent. Safe to re-run.

ALTER TABLE pcm_invitations
  ADD COLUMN IF NOT EXISTS invite_type text NOT NULL DEFAULT 'progress';

ALTER TABLE pcm_invitations
  ADD COLUMN IF NOT EXISTS coach_id   text;

ALTER TABLE pcm_invitations
  ADD COLUMN IF NOT EXISTS coach_name text;

-- Constrain invite_type to the two known values so a typo can't slip in.
-- DROP first so the migration is re-runnable.
ALTER TABLE pcm_invitations
  DROP CONSTRAINT IF EXISTS pcm_invitations_invite_type_check;
ALTER TABLE pcm_invitations
  ADD CONSTRAINT pcm_invitations_invite_type_check
  CHECK (invite_type IN ('progress', 'renewal'));

-- Index used by the dashboard ("how many of these were renewal vs progress?")
CREATE INDEX IF NOT EXISTS pcm_invitations_event_type_idx
  ON pcm_invitations (event_id, invite_type);
