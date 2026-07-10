-- Link rec_recruit cards to ebright_hrfs.career_applications submissions.
-- Additive + idempotent. Run against the portal DB (DATABASE_URL).
--
--   psql "$DATABASE_URL" -f prisma/sql/2026-06-30-rec-application-link.sql

ALTER TABLE rec_recruit ADD COLUMN IF NOT EXISTS "applicationId" integer;
-- One card per application (the reconcile relies on this for idempotency).
CREATE UNIQUE INDEX IF NOT EXISTS rec_recruit_application_uniq
  ON rec_recruit ("applicationId")
  WHERE "applicationId" IS NOT NULL;
