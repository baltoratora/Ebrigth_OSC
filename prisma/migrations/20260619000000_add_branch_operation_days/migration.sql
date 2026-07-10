-- CreateTable: branch_operation_days
-- Stores per-branch operating day flags (Wed–Sun).
-- Seeded from the BRANCH_WORKING_DAYS constant in manpowerUtils.ts.

CREATE TABLE IF NOT EXISTS "branch_operation_days" (
  "id"        SERIAL PRIMARY KEY,
  "branch"    TEXT NOT NULL,
  "wed"       BOOLEAN NOT NULL DEFAULT true,
  "thu"       BOOLEAN NOT NULL DEFAULT true,
  "fri"       BOOLEAN NOT NULL DEFAULT true,
  "sat"       BOOLEAN NOT NULL DEFAULT true,
  "sun"       BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "branch_operation_days_branch_key" ON "branch_operation_days"("branch");

-- Seed: branches with non-default operating days (from manpowerUtils.ts BRANCH_WORKING_DAYS)
INSERT INTO "branch_operation_days" ("branch", "wed", "thu", "fri", "sat", "sun", "updatedAt")
VALUES
  ('Ampang',              false, true,  true,  true,  true,  now()),
  ('Bandar Seri Putra',   false, true,  true,  true,  true,  now()),
  ('Klang',               false, true,  true,  true,  true,  now()),
  ('Rimbayu',             false, false, false, true,  true,  now()),
  ('Kota Warisan',        false, false, true,  true,  true,  now()),
  ('Tropicana Sungai Buloh', false, false, false, true, true, now()),
  ('Setia Alam',          false, true,  true,  true,  true,  now())
ON CONFLICT ("branch") DO NOTHING;
