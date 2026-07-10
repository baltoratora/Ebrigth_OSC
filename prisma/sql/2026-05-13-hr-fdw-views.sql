-- =============================================================================
-- HR Tables FDW — extends crm.hrfs_users pattern to the remaining 7 HR tables
-- =============================================================================
-- Purpose: expose 7 ebright_hrfs.public.* HR tables (BranchStaff,
-- ManpowerSchedule, AttendanceLog, AttendanceLogST, MedicalLeave,
-- LeaveTransaction, Employee) through ebright_crm by creating foreign tables
-- in hrfs_remote.* and matching views in crm.* — same two-layer pattern
-- already used by crm.hrfs_users (view over hrfs_remote."User").
--
-- crm."User" is intentionally NOT touched. It currently holds 3 hand-rolled
-- admin accounts (admin@/od@/test@ebright.my) that NextAuth authenticates
-- against. Migrating those to ebright_hrfs."User" is a separate follow-up.
--
-- Idempotent: safe to re-run. Drops only the empty stub tables (verified
-- empty in discovery — DO NOT run if any count > 0).
--
-- Apply via Node + pg (see docs/superpowers/plans/2026-05-13-finish-fdw-hr-tables.md
-- Task 3 Step 4) — psql is not available inside the osc container.
--
-- WARNING: do NOT run `prisma db push` against ebright_crm after applying
-- this. See prisma/sql/README.md.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS postgres_fdw;
CREATE SCHEMA IF NOT EXISTS hrfs_remote;

-- Drop empty stub HR tables from crm.* (NOT crm."User")
DROP TABLE IF EXISTS crm."BranchStaff"      CASCADE;
DROP TABLE IF EXISTS crm."ManpowerSchedule" CASCADE;
DROP TABLE IF EXISTS crm."AttendanceLog"    CASCADE;
DROP TABLE IF EXISTS crm."AttendanceLogST"  CASCADE;
DROP TABLE IF EXISTS crm."MedicalLeave"     CASCADE;
DROP TABLE IF EXISTS crm."LeaveTransaction" CASCADE;
DROP TABLE IF EXISTS crm."Employee"         CASCADE;

-- Views in crm.* with the same names (if a previous attempt got partway through)
DROP VIEW IF EXISTS crm."BranchStaff"      CASCADE;
DROP VIEW IF EXISTS crm."ManpowerSchedule" CASCADE;
DROP VIEW IF EXISTS crm."AttendanceLog"    CASCADE;
DROP VIEW IF EXISTS crm."AttendanceLogST"  CASCADE;
DROP VIEW IF EXISTS crm."MedicalLeave"     CASCADE;
DROP VIEW IF EXISTS crm."LeaveTransaction" CASCADE;
DROP VIEW IF EXISTS crm."Employee"         CASCADE;

-- Foreign tables in hrfs_remote.* (if a previous attempt got partway through)
DROP FOREIGN TABLE IF EXISTS hrfs_remote."BranchStaff"      CASCADE;
DROP FOREIGN TABLE IF EXISTS hrfs_remote."ManpowerSchedule" CASCADE;
DROP FOREIGN TABLE IF EXISTS hrfs_remote."AttendanceLog"    CASCADE;
DROP FOREIGN TABLE IF EXISTS hrfs_remote."AttendanceLogST"  CASCADE;
DROP FOREIGN TABLE IF EXISTS hrfs_remote."MedicalLeave"     CASCADE;
DROP FOREIGN TABLE IF EXISTS hrfs_remote."LeaveTransaction" CASCADE;
DROP FOREIGN TABLE IF EXISTS hrfs_remote."Employee"         CASCADE;

-- Import 7 HR tables from ebright_hrfs.public into hrfs_remote.*
IMPORT FOREIGN SCHEMA public
  LIMIT TO (
    "BranchStaff",
    "ManpowerSchedule",
    "AttendanceLog",
    "AttendanceLogST",
    "MedicalLeave",
    "LeaveTransaction",
    "Employee"
  )
  FROM SERVER hrfs_srv
  INTO hrfs_remote;

-- Create matching views in crm.* (Prisma queries resolve here via ?schema=crm)
CREATE VIEW crm."BranchStaff"      AS SELECT * FROM hrfs_remote."BranchStaff";
CREATE VIEW crm."ManpowerSchedule" AS SELECT * FROM hrfs_remote."ManpowerSchedule";
CREATE VIEW crm."AttendanceLog"    AS SELECT * FROM hrfs_remote."AttendanceLog";
CREATE VIEW crm."AttendanceLogST"  AS SELECT * FROM hrfs_remote."AttendanceLogST";
CREATE VIEW crm."MedicalLeave"     AS SELECT * FROM hrfs_remote."MedicalLeave";
CREATE VIEW crm."LeaveTransaction" AS SELECT * FROM hrfs_remote."LeaveTransaction";
CREATE VIEW crm."Employee"         AS SELECT * FROM hrfs_remote."Employee";

-- Role-level search_path so non-Prisma pg.Pool connections also find these
-- (app/api/hr-dashboard/route.ts and app/api/sync-medical-leave/route.ts).
-- Existing connections won't see this until the container is restarted.
ALTER ROLE optidept SET search_path = crm, public;

-- Verify counts (must match ebright_hrfs.public.* — e.g. BranchStaff ~272)
DO $$
DECLARE
  v_count bigint;
  v_msg   text;
BEGIN
  FOREACH v_msg IN ARRAY ARRAY[
    'BranchStaff', 'ManpowerSchedule', 'AttendanceLog', 'AttendanceLogST',
    'MedicalLeave', 'LeaveTransaction', 'Employee'
  ]
  LOOP
    EXECUTE format('SELECT count(*) FROM crm.%I', v_msg) INTO v_count;
    RAISE NOTICE 'crm.% has % rows', v_msg, v_count;
  END LOOP;
END $$;

COMMIT;
