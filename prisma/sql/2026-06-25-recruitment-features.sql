-- Recruitment feature tables: interviews + resume uploads. Additive + idempotent.
-- Run against the portal DB (DATABASE_URL), same as 2026-06-20-recruitment-tables.sql.
--
--   psql "$DATABASE_URL" -f prisma/sql/2026-06-25-recruitment-features.sql
--
-- Column names quoted to preserve Prisma's camelCase mapping.

-- One scheduled interview per recruit (rescheduling updates the same row). The
-- "Interview Date (ID)" drag captures scheduledAt; the Calendar page lists +
-- edits these.
CREATE TABLE IF NOT EXISTS rec_interview (
  id            text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  "recruitId"   text NOT NULL REFERENCES rec_recruit(id) ON DELETE CASCADE,
  "scheduledAt" timestamp(3) NOT NULL,           -- naive-KL-as-UTC (see notes in code)
  location      text,
  note          text,
  "createdBy"   text,
  "createdAt"   timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"   timestamp(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS rec_interview_recruit_uniq ON rec_interview ("recruitId");
CREATE INDEX IF NOT EXISTS rec_interview_when_idx ON rec_interview ("scheduledAt");

-- Uploaded resumes. Binary kept in-DB (bytea) so it survives container redeploys
-- without external object storage; the Library page lists these and a streaming
-- API route serves the file. (Swap to Drive/S3 later by replacing `data` with a
-- url column — the model + actions already abstract the read.)
CREATE TABLE IF NOT EXISTS rec_resume (
  id           text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  "recruitId"  text NOT NULL REFERENCES rec_recruit(id) ON DELETE CASCADE,
  "fileName"   text NOT NULL,
  "mimeType"   text NOT NULL DEFAULT 'application/octet-stream',
  "sizeBytes"  integer NOT NULL DEFAULT 0,
  data         bytea NOT NULL,
  "uploadedBy" text,
  "uploadedAt" timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rec_resume_recruit_idx ON rec_resume ("recruitId");
CREATE INDEX IF NOT EXISTS rec_resume_uploaded_idx ON rec_resume ("uploadedAt");
