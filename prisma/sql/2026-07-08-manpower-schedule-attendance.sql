-- Manpower Schedule: BM attendance tick (Present/Absent/Late) per staff name
-- for the week, shown as a new "Attendance" table on the Update Schedule page
-- under Staff Hours Comparison → Adjusted.
--
-- IMPORTANT: run this against ebright_hrfs, NOT the crm database that the
-- app's main DATABASE_URL points at. "ManpowerSchedule" in crm is a view
-- backed by a foreign table (FDW into ebright_hrfs; see the ON CONFLICT
-- comment on POST /api/schedules), so ALTER TABLE ADD COLUMN against it
-- fails — a first attempt at this feature tried exactly that and broke every
-- save. This table lives directly in ebright_hrfs instead, alongside
-- BranchStaff, and is accessed via hrfsPrisma (see lib/hrfs.ts).
--
-- NOTE: this file is documentation, not a required manual step. As of this
-- feature, app/api/schedules/route.ts self-provisions this table at runtime
-- via ensureAttendanceTable() (CREATE TABLE IF NOT EXISTS, run once per
-- server process before any read/write touches it) — same self-healing
-- pattern already used elsewhere in this app. Running this file by hand is
-- harmless (idempotent) but no longer necessary.

-- Explicitly schema-qualified: this DB also has a "crm" schema (an FDW import
-- mirroring the ebright_crm database), and that role's default search_path
-- resolves there before "public" — an unqualified CREATE TABLE landed in
-- "crm" by mistake on a first attempt. Always qualify as public.* here.
CREATE TABLE IF NOT EXISTS public."ManpowerScheduleAttendance" (
  "scheduleId" text PRIMARY KEY,
  attendance jsonb NOT NULL DEFAULT '{}'::jsonb,
  "attendanceLocked" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
