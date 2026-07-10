-- 2026-07-02 — Trial & Probation moves to career_applications (ebright_hrfs)
--
-- The HR dashboard "Trial & Probation" card now reads/writes
-- public.career_applications instead of the old hr_trial_probation table.
--
-- 1) Four new columns on career_applications. The API adds these automatically
--    at runtime (ALTER ... ADD COLUMN IF NOT EXISTS in ensureColumns), so this
--    block is documentation / a manual fallback — safe to run either way.
ALTER TABLE public.career_applications
  ADD COLUMN IF NOT EXISTS feedback1 text,
  ADD COLUMN IF NOT EXISTS feedback2 text,
  ADD COLUMN IF NOT EXISTS status1   text,
  ADD COLUMN IF NOT EXISTS status2   text;

-- Flow the card enforces (via /api/hr-dashboard/trial-probation):
--   stage='trial'     : write feedback1 → status1='complete' → stage='probation'
--   stage='probation' : write feedback2 → status2='accept'  → stage='hired'
--                                          status2='reject'  → stage='rejected'
-- A person appears in the card only while stage IN ('trial','probation').

-- 2) Drop the now-unused tracker table from the earlier version. It was
--    self-created (CREATE TABLE IF NOT EXISTS) and only held throwaway test rows.
DROP TABLE IF EXISTS public.hr_trial_probation;
