-- =============================================================================
-- BranchStaff workingHours column — re-import to pick up the new jsonb column
-- =============================================================================
-- Purpose: refresh `hrfs_remote."BranchStaff"` and `crm."BranchStaff"` after
-- adding `workingHours jsonb` to `ebright_hrfs.public."BranchStaff"`.
--
-- Foreign tables don't auto-discover new columns on the remote side, and the
-- `crm."BranchStaff"` view's `SELECT *` was expanded at view creation time,
-- so both layers need to be recreated for the new column to be visible to
-- Prisma (which queries via `?schema=crm`).
--
-- Symptom this fixes: the Staff Directory page errors at runtime because
-- `app/staff-directory/page.tsx` SELECTs `"workingHours"` from
-- `crm."BranchStaff"`, and `app/staff-directory/actions.ts` UPDATEs the
-- same column. Both throw "column does not exist" until this script runs.
--
-- Same DROP / IMPORT FOREIGN SCHEMA / CREATE VIEW pattern as
-- 2026-05-13-hr-fdw-views.sql, scoped to just BranchStaff. Idempotent.
--
-- WARNING: do NOT run `prisma db push` against ebright_crm after applying
-- this. See prisma/sql/README.md.
-- =============================================================================

BEGIN;

DROP VIEW          IF EXISTS crm."BranchStaff"          CASCADE;
DROP FOREIGN TABLE IF EXISTS hrfs_remote."BranchStaff"  CASCADE;

-- Re-import — postgres reads the live column list from ebright_hrfs and
-- picks up workingHours automatically.
IMPORT FOREIGN SCHEMA public
  LIMIT TO ("BranchStaff")
  FROM SERVER hrfs_srv
  INTO hrfs_remote;

-- Recreate the view. SELECT * expands to whatever columns the foreign table
-- now has, including workingHours.
CREATE VIEW crm."BranchStaff" AS SELECT * FROM hrfs_remote."BranchStaff";

-- Verify
DO $$
DECLARE
  v_count   bigint;
  v_has_col boolean;
BEGIN
  SELECT count(*) INTO v_count FROM crm."BranchStaff";
  RAISE NOTICE 'crm."BranchStaff" has % rows', v_count;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'crm'
      AND table_name   = 'BranchStaff'
      AND column_name  = 'workingHours'
  ) INTO v_has_col;
  RAISE NOTICE 'crm."BranchStaff" exposes workingHours column: %', v_has_col;
END $$;

COMMIT;
