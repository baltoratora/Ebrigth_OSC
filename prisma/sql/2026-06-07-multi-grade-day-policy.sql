-- FA + PCM System: multi-grade day-policy.
--
-- Until now the per-branch multi-grade override (fa/pcm_event_branch_overrides)
-- was a binary toggle that hard-coded a single rule: an unlocked branch could
-- invite the same student to multiple grades, but ONLY on the same day
-- (different sessions). Different-day extra invites were always rejected.
--
-- Marketing/Academy now want to choose, per branch, which extra invites are
-- allowed:
--   • SAME_DAY  — same day, different session (the original behaviour)
--   • DIFF_DAY  — a different day from any existing invite
--   • BOTH      — no day restriction (any day)
--
-- The "different target_grade" rule is unchanged and still enforced in all
-- modes (UNIQUE(tenant_id, event_id, student_id, target_grade)).
--
-- This migration just adds a day_policy column to both override tables.
-- Existing rows default to SAME_DAY, so behaviour is unchanged until a branch
-- is explicitly switched to DIFF_DAY or BOTH. Safe to run before the app code.
--
-- Run against the FA/PCM database (ebrightleads_db) — same DB both systems use.
-- Idempotent: re-running is harmless.

-- ---------------------------------------------------------------------------
-- FA overrides
-- ---------------------------------------------------------------------------
ALTER TABLE fa_event_branch_overrides
  ADD COLUMN IF NOT EXISTS day_policy text NOT NULL DEFAULT 'SAME_DAY';

ALTER TABLE fa_event_branch_overrides
  DROP CONSTRAINT IF EXISTS fa_event_branch_overrides_day_policy_chk;
ALTER TABLE fa_event_branch_overrides
  ADD CONSTRAINT fa_event_branch_overrides_day_policy_chk
  CHECK (day_policy IN ('SAME_DAY', 'DIFF_DAY', 'BOTH'));

COMMENT ON COLUMN fa_event_branch_overrides.day_policy IS
  'Which extra multi-grade invites are allowed for this branch: SAME_DAY '
  '(same day, different session), DIFF_DAY (different day only), or BOTH. '
  'Different target_grade is always required regardless of policy.';

-- ---------------------------------------------------------------------------
-- PCM overrides (mirror)
-- ---------------------------------------------------------------------------
ALTER TABLE pcm_event_branch_overrides
  ADD COLUMN IF NOT EXISTS day_policy text NOT NULL DEFAULT 'SAME_DAY';

ALTER TABLE pcm_event_branch_overrides
  DROP CONSTRAINT IF EXISTS pcm_event_branch_overrides_day_policy_chk;
ALTER TABLE pcm_event_branch_overrides
  ADD CONSTRAINT pcm_event_branch_overrides_day_policy_chk
  CHECK (day_policy IN ('SAME_DAY', 'DIFF_DAY', 'BOTH'));

COMMENT ON COLUMN pcm_event_branch_overrides.day_policy IS
  'Which extra multi-grade invites are allowed for this branch: SAME_DAY '
  '(same day, different session), DIFF_DAY (different day only), or BOTH. '
  'Different target_grade is always required regardless of policy.';
