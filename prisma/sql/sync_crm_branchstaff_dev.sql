-- Run against: ebright_hrfs (dev DATABASE_URL)
--
-- Creates a thin alias `crm."BranchStaff"` over `public."BranchStaff"` so the
-- app code can use a single qualified name (`crm."BranchStaff"`) regardless
-- of whether DATABASE_URL points at ebright_hrfs (dev) or ebright_crm
-- (staging/prod, where crm."BranchStaff" is an FDW foreign table).
--
-- Auto-updatable: this view is a simple SELECT * with no joins / aggregates,
-- so INSERT/UPDATE/DELETE through `crm."BranchStaff"` propagate to
-- `public."BranchStaff"` automatically (PostgreSQL "updatable views" rule).

CREATE SCHEMA IF NOT EXISTS crm;

CREATE OR REPLACE VIEW crm."BranchStaff" AS
  SELECT * FROM public."BranchStaff";
