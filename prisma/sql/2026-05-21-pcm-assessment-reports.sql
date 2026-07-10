-- PCM Assessment Reports — coach-filled rubric per attended invitation.
--
-- One report per invitation. The report becomes the student's certificate
-- (printable PDF rendered client-side via window.print()). Once filled, the
-- invitation row turns green in the BM panel; un-filled = warning amber.
--
-- Score rubric mirrors the eBright "Speech Preparation & Delivery" form
-- (4 criteria, each 1–5). Strengths and improvement plan are free-text.

CREATE TABLE IF NOT EXISTS pcm_assessment_reports (
  id                       text         NOT NULL DEFAULT (gen_random_uuid())::text,
  tenant_id                text         NOT NULL DEFAULT 'ebright',
  invitation_id            text         NOT NULL REFERENCES pcm_invitations(id) ON DELETE CASCADE,
  -- Denormalised snapshots so the certificate keeps rendering even if the
  -- source rows change after the assessment (e.g. student gets renamed).
  student_id               text         NOT NULL,
  student_name             text         NOT NULL,
  branch                   text         NOT NULL,
  grade                    integer      NOT NULL,
  assessment_date          date         NOT NULL,
  -- Rubric scores. Each 1–5. CHECK constraints guard against bad writes.
  confidence_score         integer      NOT NULL,
  voice_clarity_score      integer      NOT NULL,
  eye_contact_score        integer      NOT NULL,
  idea_expression_score    integer      NOT NULL,
  -- Coach narrative
  strengths                text         NOT NULL DEFAULT '',
  improvement_plan         text         NOT NULL DEFAULT '',
  -- Who filled it. Cached for the cert; coach_id loosely references
  -- branchstaff (cross-DB, no FK).
  prepared_by              text         NOT NULL DEFAULT '',
  prepared_by_id           text,
  received_by              text         NOT NULL DEFAULT '',
  created_at               timestamptz  NOT NULL DEFAULT now(),
  updated_at               timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT pcm_reports_one_per_invitation UNIQUE (invitation_id),
  CONSTRAINT pcm_reports_score_range CHECK (
        confidence_score      BETWEEN 1 AND 5
    AND voice_clarity_score   BETWEEN 1 AND 5
    AND eye_contact_score     BETWEEN 1 AND 5
    AND idea_expression_score BETWEEN 1 AND 5
  )
);

CREATE INDEX IF NOT EXISTS pcm_reports_invitation_idx
  ON pcm_assessment_reports (invitation_id);

CREATE INDEX IF NOT EXISTS pcm_reports_student_idx
  ON pcm_assessment_reports (student_id);

CREATE INDEX IF NOT EXISTS pcm_reports_branch_idx
  ON pcm_assessment_reports (branch);
