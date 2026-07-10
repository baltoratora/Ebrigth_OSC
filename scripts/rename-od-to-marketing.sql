-- Rename the "00 Ebright OD" stress-test branch to "Ebright Marketing" and
-- delete any opportunities still attached to it. The pipeline NAME stays as
-- "00 Ebright OD" per request.
--
-- The renamed branch will receive every lead that lands in CRM with no
-- resolvable branch (the leadIngestWorker fallback added in this same PR).
-- It also gains the "Branch Manager" privileges that the existing
-- test@ebright.my user already holds via crm_user_branch.
--
-- Run against ebright_crm only. Idempotent.

SET search_path TO crm, public;

DO $$
DECLARE
  od_branch_id text;
BEGIN
  SELECT id INTO od_branch_id
  FROM   crm.crm_branch
  WHERE  name = '00 Ebright OD'
  LIMIT  1;

  IF od_branch_id IS NULL THEN
    RAISE NOTICE 'No branch named "00 Ebright OD" found — nothing to rename.';
    RETURN;
  END IF;

  -- Cascade through dependents in the right order. crm_stage_history and
  -- crm_lead_transfer both ON DELETE CASCADE off crm_opportunity, so
  -- deleting the opportunities removes their history rows too.
  DELETE FROM crm.crm_opportunity
  WHERE  "branchId" = od_branch_id;

  -- Rename the branch in place — preserves branch.id so any unrelated
  -- references (user-branch links, audit log entries) stay valid.
  UPDATE crm.crm_branch
  SET    name = 'Ebright Marketing'
  WHERE  id   = od_branch_id;

  RAISE NOTICE 'Renamed branch % (%): OD opportunities removed, pipeline name preserved.',
               od_branch_id, 'Ebright Marketing';
END $$;

-- Sanity check:
-- SELECT id, name FROM crm.crm_branch WHERE name IN ('00 Ebright OD', 'Ebright Marketing');
