-- Add REGIONAL_MANAGER to the CrmUserRole enum.
--
-- Why: a new "Region" page (/crm/region) shows regional performance and a new
-- REGIONAL_MANAGER role gets a scoped view of their region only (super-admins
-- see all regions). The role is assigned via crm_user_branch.role just like
-- BRANCH_MANAGER — one row per branch in the region.
--
-- Idempotent: re-running is a no-op (IF NOT EXISTS guards the ADD VALUE).
--
-- Order in the enum: placed BEFORE BRANCH_MANAGER so the natural hierarchy
-- (SUPER → AGENCY → REGIONAL → BRANCH_MANAGER → BRANCH_STAFF) reads
-- correctly. Position only affects display order in tooling — application
-- code doesn't depend on it.

ALTER TYPE "CrmUserRole" ADD VALUE IF NOT EXISTS 'REGIONAL_MANAGER' BEFORE 'BRANCH_MANAGER';

-- Sanity check (read-only): list all enum values in order.
-- SELECT enumlabel
-- FROM   pg_enum
-- WHERE  enumtypid = '"CrmUserRole"'::regtype
-- ORDER  BY enumsortorder;
