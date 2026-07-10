-- Add a free-text video_link column to both PCM and FA assessment-reports
-- tables. Stores the URL of a recording of the student's performance —
-- Marketing/coach pastes the link into the form; the report viewer can
-- click through to watch the student speak.
--
-- Nullable + idempotent (IF NOT EXISTS) so this can be re-applied safely.

ALTER TABLE pcm_assessment_reports
  ADD COLUMN IF NOT EXISTS video_link text;

ALTER TABLE fa_assessment_reports
  ADD COLUMN IF NOT EXISTS video_link text;
