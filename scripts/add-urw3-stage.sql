-- Add UR_W3 (Unresponsive Week 3) stage to every existing lead pipeline.
--
-- Why: the auto-progression FU3 → UR_W1 → UR_W2 → UR_W3 → Cold Lead requires
-- the URW3 stage to exist in every branch's pipeline. New branches created
-- after this migration get URW3 automatically via createBranch() and the seed
-- files. This script handles all PRE-EXISTING branches.
--
-- Idempotent: skips pipelines that already have UR_W3.
-- Ordering: inserts UR_W3 right after UR_W2, before FU3M, and shifts the
-- remaining stages' order to keep them in sequence.
--
-- Run via: psql "$DATABASE_URL" -f scripts/add-urw3-stage.sql
-- Or via:  npx prisma db execute --file scripts/add-urw3-stage.sql --schema prisma/schema.prisma

BEGIN;

-- Shift every stage that currently sits AT OR AFTER FU3M's position by +1
-- so we open up a slot for UR_W3 between UR_W2 and FU3M.
WITH fu3m_positions AS (
  SELECT "pipelineId", "order" AS fu3m_order
  FROM crm_stage
  WHERE "shortCode" = 'FU3M'
)
UPDATE crm_stage s
SET    "order" = s."order" + 1
FROM   fu3m_positions f
WHERE  s."pipelineId" = f."pipelineId"
  AND  s."order" >= f.fu3m_order
  AND  NOT EXISTS (
    -- skip if URW3 already present (idempotent guard)
    SELECT 1 FROM crm_stage x
    WHERE x."pipelineId" = s."pipelineId"
      AND x."shortCode" = 'UR_W3'
  );

-- Insert UR_W3 into every pipeline that has UR_W2 but not yet UR_W3.
INSERT INTO crm_stage (id, "tenantId", "pipelineId", name, "shortCode", "order", color, "stuckHoursYellow", "stuckHoursRed", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  urw2."tenantId",
  urw2."pipelineId",
  'Unresponsive Week 3',
  'UR_W3',
  urw2."order" + 1,
  'slate',
  24,
  48,
  NOW(),
  NOW()
FROM crm_stage urw2
WHERE urw2."shortCode" = 'UR_W2'
  AND NOT EXISTS (
    SELECT 1 FROM crm_stage x
    WHERE x."pipelineId" = urw2."pipelineId"
      AND x."shortCode" = 'UR_W3'
  );

COMMIT;

-- Sanity check after the migration: every pipeline that has UR_W2 should also have UR_W3.
-- Run this manually to verify:
--
--   SELECT p.id AS pipeline_id, p.name,
--          MAX(CASE WHEN s."shortCode" = 'UR_W2' THEN s."order" END) AS urw2_order,
--          MAX(CASE WHEN s."shortCode" = 'UR_W3' THEN s."order" END) AS urw3_order,
--          MAX(CASE WHEN s."shortCode" = 'FU3M'  THEN s."order" END) AS fu3m_order
--   FROM crm_pipeline p
--   JOIN crm_stage s ON s."pipelineId" = p.id
--   WHERE s."shortCode" IN ('UR_W2', 'UR_W3', 'FU3M')
--   GROUP BY p.id, p.name
--   ORDER BY p.name;
