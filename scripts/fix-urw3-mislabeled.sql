-- Fix pipelines whose UR_W3 stage row was accidentally renamed to
-- "Follow-Up 3 Months" / shortCode "FU3M" via the manage-stages UI.
--
-- Symptom (user-reported, 2026-06-03): the kanban column that should be
-- "Unresponsive Week 3" / UR_W3 shows "Follow-Up 3 Months" / FU3M instead.
-- The board therefore appears to skip UR_W3 (you see UR_W1, UR_W2, then a
-- column labelled FU3M sitting in UR_W3's slot).
--
-- Cause: the stage's name + shortCode were edited manually. The row itself
-- is still in the correct ORDER position (right after UR_W2); only its
-- labels are wrong.
--
-- Strategy: for every pipeline that has UR_W2 but no row with shortCode
-- "UR_W3", find the stage whose `order` is exactly UR_W2.order + 1 and,
-- IF its current shortCode is "FU3M", rename it back to UR_W3 with the
-- canonical name. This is deliberately narrow — we only touch rows that
-- exactly match the symptom, never blind-update.
--
-- Idempotent: re-running this script after the fix is applied is a no-op
-- (the pipeline now has a UR_W3 row, so it's skipped by the WHERE clause).
--
-- =====================================================================
-- STEP 1 — DIAGNOSTIC (read-only). Run this first to see what will change.
-- =====================================================================
--
-- This SELECT lists, for every affected pipeline:
--   - the pipeline id + name + branch
--   - the UR_W2 row (for reference)
--   - the candidate row at UR_W2.order + 1 (the one we'd rename)
-- Review the output before running STEP 2.

WITH affected AS (
  SELECT
    p.id            AS pipeline_id,
    p.name          AS pipeline_name,
    b."name"        AS branch_name,
    urw2.id         AS urw2_id,
    urw2."order"    AS urw2_order,
    cand.id         AS candidate_id,
    cand."order"    AS candidate_order,
    cand.name       AS candidate_name,
    cand."shortCode" AS candidate_shortcode
  FROM crm.crm_pipeline p
  JOIN crm.crm_branch  b   ON b.id = p."branchId"
  JOIN crm.crm_stage   urw2 ON urw2."pipelineId" = p.id AND urw2."shortCode" = 'UR_W2'
  LEFT JOIN crm.crm_stage urw3 ON urw3."pipelineId" = p.id AND urw3."shortCode" = 'UR_W3'
  LEFT JOIN crm.crm_stage cand ON cand."pipelineId" = p.id AND cand."order" = urw2."order" + 1
  WHERE urw3.id IS NULL  -- pipeline lacks a UR_W3 row
)
SELECT *
FROM affected
ORDER BY branch_name, pipeline_name;

-- Expected: rows where candidate_shortcode = 'FU3M' and candidate_name =
-- 'Follow-Up 3 Months'. Those are the rows STEP 2 will rename.
--
-- If you see candidate_shortcode IS NULL it means the pipeline has UR_W2
-- as its very last stage with no row after it — STEP 2 won't touch those.
-- If you see candidate_shortcode = something other than 'FU3M', stop and
-- investigate before running STEP 2 (the slot was renamed to something
-- unexpected and the safe heuristic doesn't apply).


-- =====================================================================
-- STEP 2 — FIX (writes). Wrap in a transaction; review STEP 1 output first.
-- =====================================================================
-- Uncomment the block below and execute. The transaction lets you ROLLBACK
-- if the row count doesn't match what STEP 1 told you to expect.

-- BEGIN;
--
-- UPDATE crm.crm_stage AS s
-- SET    name        = 'Unresponsive Week 3',
--        "shortCode" = 'UR_W3',
--        "updatedAt" = now()
-- FROM   crm.crm_pipeline p
-- JOIN   crm.crm_stage    urw2 ON urw2."pipelineId" = p.id AND urw2."shortCode" = 'UR_W2'
-- LEFT JOIN crm.crm_stage urw3 ON urw3."pipelineId" = p.id AND urw3."shortCode" = 'UR_W3'
-- WHERE  s."pipelineId" = p.id
--   AND  s."order"      = urw2."order" + 1
--   AND  s."shortCode"  = 'FU3M'           -- safety: only rename FU3M-labelled rows
--   AND  s.name         = 'Follow-Up 3 Months'  -- safety: belt-and-braces
--   AND  urw3.id IS NULL;                  -- safety: only touch pipelines missing UR_W3
--
-- -- Sanity check: every affected pipeline now has both UR_W3 and FU3M slots
-- -- in the right order (UR_W2 < UR_W3 < FU3M).
-- SELECT
--   p.id AS pipeline_id, p.name,
--   MAX(CASE WHEN s."shortCode" = 'UR_W2' THEN s."order" END) AS urw2_order,
--   MAX(CASE WHEN s."shortCode" = 'UR_W3' THEN s."order" END) AS urw3_order,
--   MAX(CASE WHEN s."shortCode" = 'FU3M'  THEN s."order" END) AS fu3m_order
-- FROM crm.crm_pipeline p
-- JOIN crm.crm_stage    s ON s."pipelineId" = p.id
-- WHERE s."shortCode" IN ('UR_W2','UR_W3','FU3M')
-- GROUP BY p.id, p.name
-- ORDER BY p.name;
--
-- -- If the sanity check shows urw3_order > urw2_order and (fu3m_order IS NULL
-- -- OR fu3m_order > urw3_order), it worked. COMMIT. Otherwise ROLLBACK and
-- -- ping me before retrying.
--
-- COMMIT;


-- =====================================================================
-- AFTERMATH — does the pipeline also need a "real" FU3M added?
-- =====================================================================
-- If STEP 2 renamed the only FU3M row in a pipeline, that pipeline no longer
-- has an FU3M stage. The auto-progression rule URW2 → FU3M needs FU3M to
-- exist, so re-add it (right after UR_W3) for any pipeline that's now missing
-- it. Run this AFTER STEP 2:
--
-- WITH missing AS (
--   SELECT p.id AS pipeline_id, p."tenantId" AS tenant_id,
--          MAX(CASE WHEN s."shortCode" = 'UR_W3' THEN s."order" END) AS urw3_order
--   FROM crm.crm_pipeline p
--   JOIN crm.crm_stage    s ON s."pipelineId" = p.id
--   GROUP BY p.id, p."tenantId"
--   HAVING NOT bool_or(s."shortCode" = 'FU3M')
--      AND     bool_or(s."shortCode" = 'UR_W3')
-- )
-- -- Open a slot at urw3_order + 1 by shifting later stages down by 1
-- , shifted AS (
--   UPDATE crm.crm_stage s
--   SET    "order" = s."order" + 1, "updatedAt" = now()
--   FROM   missing m
--   WHERE  s."pipelineId" = m.pipeline_id
--     AND  s."order"      > m.urw3_order
--   RETURNING 1
-- )
-- INSERT INTO crm.crm_stage (
--   id, "tenantId", "pipelineId", name, "shortCode", "order",
--   color, "stuckHoursYellow", "stuckHoursRed", "createdAt", "updatedAt"
-- )
-- SELECT gen_random_uuid()::text, m.tenant_id, m.pipeline_id,
--        'Follow-Up 3 Months', 'FU3M', m.urw3_order + 1,
--        'slate', 24, 48, now(), now()
-- FROM   missing m;
