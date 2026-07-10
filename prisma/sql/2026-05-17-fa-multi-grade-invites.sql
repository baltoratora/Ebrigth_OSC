-- FA System: multi-grade invitations.
--
-- Today, fa_invitations has a unique constraint on (tenant_id, event_id,
-- student_id) — one row per student per event. That stops a Branch Manager
-- from inviting the same student twice, but it also stops the legitimate
-- backlog case: e.g. a Grade 4 student who missed FA at G2 and G3 should
-- be invitable for THREE grades within one event (one per session, all on
-- the same day).
--
-- This migration:
--   1. Drops the old (event, student) unique and replaces it with
--      (event, student, target_grade) — so the DB enforces "one appraisal
--      per grade per event" instead of "one invite per student per event".
--   2. Creates fa_event_branch_overrides — the per-event-per-branch toggle
--      that Marketing/Admin uses to opt a branch into multi-grade invites.
--      Branches without an override row still get the old "one per student"
--      behaviour, enforced at the application layer.
--
-- Run this against the FA database (ebrightleads_db) BEFORE deploying the
-- app code. The new code is backward-compatible with the new unique
-- (it's stricter on grade and looser on student), so it's safe to apply
-- the migration first and roll the app out afterwards.

-- ---------------------------------------------------------------------------
-- 1. Unique constraint swap on fa_invitations
-- ---------------------------------------------------------------------------

-- The old constraint can appear under any of these names depending on how
-- it was originally created. All three are tried with IF EXISTS so the
-- migration is safe to run regardless of which name is in use, and idempotent
-- once any of them has been removed.
ALTER TABLE fa_invitations
  DROP CONSTRAINT IF EXISTS fa_invitations_event_id_student_id_key;

ALTER TABLE fa_invitations
  DROP CONSTRAINT IF EXISTS fa_invitations_tenant_id_event_id_student_id_key;

ALTER TABLE fa_invitations
  DROP CONSTRAINT IF EXISTS fa_invitations_event_student_unique;

-- New per-grade key. Backlog students legitimately get multiple invites
-- per event, one row per target_grade.
ALTER TABLE fa_invitations
  ADD CONSTRAINT fa_invitations_event_student_grade_unique
  UNIQUE (tenant_id, event_id, student_id, target_grade);

-- ---------------------------------------------------------------------------
-- 2. Per-event per-branch override table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fa_event_branch_overrides (
  -- fa_events.id is text (not uuid) in this deploy, so match the type
  -- to keep the foreign key valid.
  event_id     text        NOT NULL REFERENCES fa_events(id) ON DELETE CASCADE,
  branch_code  text        NOT NULL,
  granted_by   text        NOT NULL,        -- email of the Marketing/Admin user
  granted_at   timestamptz NOT NULL DEFAULT now(),
  reason       text,                        -- optional free-text audit note
  PRIMARY KEY (event_id, branch_code)
);

-- Reverse lookup used by the BM-side invite modal:
-- "for this event, which branches are unlocked?"
CREATE INDEX IF NOT EXISTS fa_event_branch_overrides_event_idx
  ON fa_event_branch_overrides (event_id);

COMMENT ON TABLE fa_event_branch_overrides IS
  'Per-event, per-branch opt-in to allow multi-grade invitations of the same '
  'student. Granted only by Marketing/Admin. Without a row, branch falls back '
  'to the default "one invite per student per event" rule, enforced in the app.';
