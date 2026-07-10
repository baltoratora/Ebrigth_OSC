-- 2026-06-18 — Working-hours schedule history (HRFS DB: ebright_hrfs)
--
-- WHY: BranchStaff.workingHours stored only ONE current weekly schedule and was
-- overwritten on every edit. The Attendance Report applied that single schedule
-- to every date, so changing this week's hours retroactively re-judged Late/
-- Early for past weeks. This table keeps a dated history; the report resolves
-- the version active on each date instead.
--
-- Applied manually via node+pg against HRFS_DATABASE_URL (not prisma migrate),
-- matching how prior shared-DB tables were added. Additive + empty — no impact
-- on existing functionality until the app code is deployed.
--
-- IMPORTANT — must live in the `public` schema. hrfsPrisma connects with
-- ?schema=public, but a raw node+pg connection on this server defaults to
-- search_path = "crm, public", so an UNqualified CREATE lands in `crm` and
-- Prisma then can't see it (42P01 "relation does not exist"). Always qualify
-- as public."BranchStaffSchedule" in standalone scripts.

CREATE TABLE IF NOT EXISTS public."BranchStaffSchedule" (
  id              SERIAL PRIMARY KEY,
  "branchStaffId" INTEGER NOT NULL,
  "effectiveFrom" DATE    NOT NULL,
  schedule        JSONB   NOT NULL,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_branchstaff_eff UNIQUE ("branchStaffId", "effectiveFrom")
);

CREATE INDEX IF NOT EXISTS idx_bss_staff_eff
  ON "BranchStaffSchedule" ("branchStaffId", "effectiveFrom");

-- Resolution rule (lib/working-hours.ts → scheduleForDate): for a given date,
-- pick the row for that employee with the greatest effectiveFrom <= date.
-- A date earlier than the earliest version → no schedule → no Late/Early badge.
