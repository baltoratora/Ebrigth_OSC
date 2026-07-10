-- Run against: ebright_crm  (staging + prod DATABASE_URL)
--
-- Pre-conditions assumed (already true per the team):
--   * postgres_fdw extension is enabled.
--   * Foreign server pointing at ebright_hrfs already exists (same one used
--     by crm.hrfs_users).
--   * crm."BranchStaff" is already a FOREIGN TABLE over
--     ebright_hrfs.public."BranchStaff".
--
-- What this script does:
--   Teaches the existing foreign table about the new `workingHours` jsonb
--   column we added to ebright_hrfs.public."BranchStaff". Foreign tables in
--   postgres_fdw don't auto-discover new columns on the remote side — they
--   need to be declared locally to be selectable / writable.
--
-- Idempotent: the DO block skips the ALTER if the column was already added
-- in a previous run, so it's safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'crm'
      AND table_name   = 'BranchStaff'
      AND column_name  = 'workingHours'
  ) THEN
    ALTER FOREIGN TABLE crm."BranchStaff"
      ADD COLUMN "workingHours" jsonb;
  END IF;
END $$;

-- Sanity check — uncomment to verify after running:
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'crm' AND table_name = 'BranchStaff'
-- ORDER BY ordinal_position;
