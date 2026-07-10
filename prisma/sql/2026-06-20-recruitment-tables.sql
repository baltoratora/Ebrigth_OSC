-- Recruitment module tables (additive, idempotent). Run against the portal DB
-- (DATABASE_URL) — same DB the app's Prisma client uses, where BranchStaff is
-- also readable. Safe to re-run: CREATE TABLE IF NOT EXISTS + ON CONFLICT seeds.
--
--   psql "$DATABASE_URL" -f prisma/sql/2026-06-20-recruitment-tables.sql
--
-- Column names are quoted to preserve Prisma's camelCase mapping.

CREATE TABLE IF NOT EXISTS rec_stage (
  id          text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  name        text NOT NULL,
  "shortCode" text NOT NULL UNIQUE,
  "order"     integer NOT NULL,
  color       text NOT NULL DEFAULT 'slate',
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rec_stage_order_idx ON rec_stage ("order");

CREATE TABLE IF NOT EXISTS rec_recruit (
  id                 text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  name               text NOT NULL,
  email              text,
  phone              text,
  source             text,
  position           text,
  branch             text,
  "stageId"          text NOT NULL REFERENCES rec_stage(id),
  hired              boolean NOT NULL DEFAULT false,
  "branchStaffId"    integer,
  "ghlOpportunityId" text UNIQUE,
  "ghlContactId"     text,
  "ghlCreatedAt"     timestamp(3),
  "deletedAt"        timestamp(3),
  "createdAt"        timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"        timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rec_recruit_stage_idx       ON rec_recruit ("stageId");
CREATE INDEX IF NOT EXISTS rec_recruit_hired_idx       ON rec_recruit (hired);
CREATE INDEX IF NOT EXISTS rec_recruit_branchstaff_idx ON rec_recruit ("branchStaffId");

CREATE TABLE IF NOT EXISTS rec_stage_history (
  id            text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  "recruitId"   text NOT NULL REFERENCES rec_recruit(id) ON DELETE CASCADE,
  "fromStageId" text REFERENCES rec_stage(id),
  "toStageId"   text NOT NULL REFERENCES rec_stage(id),
  "changedBy"   text,
  note          text,
  "changedAt"   timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rec_stage_history_recruit_idx ON rec_stage_history ("recruitId");

-- Seed the canonical 29-stage HR recruitment pipeline (order + placeholder
-- colours — HR said colours are random; tweak later in the UI/DB).
INSERT INTO rec_stage (name, "shortCode", "order", color) VALUES
  ('Candidate (CD)',               'CD',     1,  'slate'),
  ('Intern',                       'INTERN', 2,  'slate'),
  ('Full Time',                    'FT',     3,  'slate'),
  ('Part Timer',                   'PT',     4,  'slate'),
  ('Buffer Resume',                'BR',     5,  'zinc'),
  ('Resume Submission (RS)',       'RS',     6,  'sky'),
  ('Buffer Video',                 'BV',     7,  'zinc'),
  ('Complete Submission (VS)',     'VS',     8,  'sky'),
  ('Health Declaration (HD)',      'HD',     9,  'cyan'),
  ('Google Search (GS)',           'GS',     10, 'cyan'),
  ('Interview Date (ID)',          'ID',     11, 'indigo'),
  ('Follow Up (FUP)',              'FUP',    12, 'violet'),
  ('Shortlisted (SL)',             'SL',     13, 'violet'),
  ('Reschedule',                   'RSD',    14, 'amber'),
  ('Interviewed (INT)',            'INT',    15, 'indigo'),
  ('Hired (HRD)',                  'HRD',    16, 'emerald'),
  ('1st Day Trial',                'DT1',    17, 'teal'),
  ('2nd Day Trial',                'DT2',    18, 'teal'),
  ('3rd Day Trial',                'DT3',    19, 'teal'),
  ('Send Agreement Letter',        'SAL',    20, 'teal'),
  ('Rejected (RJT)',               'RJT',    21, 'rose'),
  ('1st Training Day',             'TR1',    22, 'green'),
  ('2nd Training Day',             'TR2',    23, 'green'),
  ('3rd Training Day',             'TR3',    24, 'green'),
  ('Access To Payroll (Finance)',  'PAY',    25, 'green'),
  ('IOP Sessions 2 week',          'IOP1',   26, 'lime'),
  ('IOP Sessions 2nd month',       'IOP2',   27, 'lime'),
  ('IOP Sessions 3rd month',       'IOP3',   28, 'lime'),
  ('Buffer (For OD Use)',          'OD',     29, 'slate')
ON CONFLICT ("shortCode") DO NOTHING;
