-- PCM System: bootstrap five tables mirroring fa_*.
--
-- The PCM (Pro-Class Mastery / Performance-Class-Module — academy-owned)
-- system reuses the same event/session/invitation shape as FA System,
-- but lives in its own tables so the two assessments can evolve
-- independently without one stepping on the other.
--
-- Student progress is tracked in the existing `pcm_progress_json` column
-- on studentrecords (parallel to FA's `fa_progress_json`). Nothing in
-- this migration touches studentrecords — the column is already there.
--
-- Run against the shared FA/PCM database (same DB as fa_*).
-- Safe to re-run: every CREATE uses IF NOT EXISTS.

-- ---------------------------------------------------------------------------
-- pcm_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pcm_events (
  id                     text         NOT NULL DEFAULT (gen_random_uuid())::text,
  tenant_id              text         NOT NULL DEFAULT 'ebright',
  name                   text         NOT NULL,
  month                  integer      NOT NULL,
  year                   integer      NOT NULL,
  start_date             date         NOT NULL,
  end_date               date         NOT NULL,
  number_of_days         integer      NOT NULL DEFAULT 1,
  venue                  text         NOT NULL,
  status                 text         NOT NULL DEFAULT 'draft',
  invitation_open_date   date         NOT NULL,
  invitation_close_date  date         NOT NULL,
  notes                  text,
  created_at             timestamptz  NOT NULL DEFAULT now(),
  updated_at             timestamptz  NOT NULL DEFAULT now(),
  created_by             text,
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS pcm_events_tenant_idx ON pcm_events (tenant_id);

-- ---------------------------------------------------------------------------
-- pcm_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pcm_sessions (
  id              text         NOT NULL DEFAULT (gen_random_uuid())::text,
  tenant_id       text         NOT NULL DEFAULT 'ebright',
  event_id        text         NOT NULL REFERENCES pcm_events(id) ON DELETE CASCADE,
  day_number      integer      NOT NULL,
  session_number  integer      NOT NULL,
  start_time      text         NOT NULL,
  end_time        text         NOT NULL,
  label           text,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS pcm_sessions_event_idx ON pcm_sessions (event_id);

-- ---------------------------------------------------------------------------
-- pcm_session_quotas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pcm_session_quotas (
  id          text         NOT NULL DEFAULT (gen_random_uuid())::text,
  tenant_id   text         NOT NULL DEFAULT 'ebright',
  session_id  text         NOT NULL REFERENCES pcm_sessions(id) ON DELETE CASCADE,
  branch      text         NOT NULL,
  quota       integer      NOT NULL DEFAULT 0,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (session_id, branch)
);
CREATE INDEX IF NOT EXISTS pcm_quotas_session_idx ON pcm_session_quotas (session_id);

-- ---------------------------------------------------------------------------
-- pcm_invitations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pcm_invitations (
  id                    text         NOT NULL DEFAULT (gen_random_uuid())::text,
  tenant_id             text         NOT NULL DEFAULT 'ebright',
  event_id              text         NOT NULL REFERENCES pcm_events(id) ON DELETE CASCADE,
  session_id            text         NOT NULL REFERENCES pcm_sessions(id) ON DELETE CASCADE,
  student_id            text         NOT NULL,
  branch                text         NOT NULL,
  status                text         NOT NULL DEFAULT 'invited',
  invited_by            text,
  confirmed_at          timestamptz,
  created_at            timestamptz  NOT NULL DEFAULT now(),
  updated_at            timestamptz  NOT NULL DEFAULT now(),
  invited_at            timestamptz  NOT NULL DEFAULT now(),
  attendance_marked_at  timestamptz,
  attendance_marked_by  text,
  notes                 text,
  target_grade          integer,
  PRIMARY KEY (id),
  CONSTRAINT pcm_invitations_event_student_grade_unique
    UNIQUE (tenant_id, event_id, student_id, target_grade)
);
CREATE INDEX IF NOT EXISTS pcm_invitations_event_idx   ON pcm_invitations (tenant_id, event_id);
CREATE INDEX IF NOT EXISTS pcm_invitations_session_idx ON pcm_invitations (session_id);

-- ---------------------------------------------------------------------------
-- pcm_event_branch_overrides
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pcm_event_branch_overrides (
  event_id     text         NOT NULL REFERENCES pcm_events(id) ON DELETE CASCADE,
  branch_code  text         NOT NULL,
  granted_by   text         NOT NULL,
  granted_at   timestamptz  NOT NULL DEFAULT now(),
  reason       text,
  PRIMARY KEY (event_id, branch_code)
);
CREATE INDEX IF NOT EXISTS pcm_event_branch_overrides_event_idx
  ON pcm_event_branch_overrides (event_id);

COMMENT ON TABLE pcm_event_branch_overrides IS
  'Per-event, per-branch opt-in allowing the branch to invite the same '
  'student to multiple grades within one PCM event (same day, different '
  'sessions). Granted only by ACADEMY / ADMIN / SUPER_ADMIN.';
