-- FA Assessment Reports — Marketing-filled appraisal per attended invitation.
--
-- One report per FA invitation. Once filled, the report becomes the
-- student's printable certificate (rendered client-side via window.print()).
--
-- Form mirrors the eBright Foundation Appraisal PDF template:
--   • 4 criteria, each scored 0–25
--   • Combined Remarks (free text)
--   • Total = sum of the four scores (computed in app, not stored)
--
-- The denormalised student snapshot keeps the certificate rendering even
-- when the source row in studentrecords later changes (rename, branch
-- move, etc).

CREATE TABLE IF NOT EXISTS fa_assessment_reports (
  id                       text         NOT NULL DEFAULT (gen_random_uuid())::text,
  tenant_id                text         NOT NULL DEFAULT 'ebright',
  invitation_id            text         NOT NULL,
  -- Denormalised so the cert renders even after source rows mutate.
  student_id               text         NOT NULL,
  student_name             text         NOT NULL,
  branch                   text         NOT NULL,
  grade                    integer      NOT NULL,
  assessment_date          date         NOT NULL,
  -- Four criteria from the FA template, each 0–25.
  communication_score      integer      NOT NULL,
  analysis_score           integer      NOT NULL,
  interaction_score        integer      NOT NULL,
  performance_score        integer      NOT NULL,
  -- Free-text remarks (single field per the template).
  remarks                  text         NOT NULL DEFAULT '',
  -- Who filled it (Marketing or Admin per current policy).
  prepared_by              text         NOT NULL DEFAULT '',
  prepared_by_id           text,
  created_at               timestamptz  NOT NULL DEFAULT now(),
  updated_at               timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT fa_reports_one_per_invitation UNIQUE (invitation_id),
  CONSTRAINT fa_reports_score_range CHECK (
        communication_score BETWEEN 0 AND 25
    AND analysis_score      BETWEEN 0 AND 25
    AND interaction_score   BETWEEN 0 AND 25
    AND performance_score   BETWEEN 0 AND 25
  )
);

CREATE INDEX IF NOT EXISTS fa_reports_invitation_idx
  ON fa_assessment_reports (invitation_id);

CREATE INDEX IF NOT EXISTS fa_reports_student_idx
  ON fa_assessment_reports (student_id);

CREATE INDEX IF NOT EXISTS fa_reports_branch_idx
  ON fa_assessment_reports (branch);
