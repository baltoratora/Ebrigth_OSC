-- Kanban performance indexes.
-- Speeds up the Opportunities board: per-stage card fetch + createdAt ordering,
-- and the per-card "latest Trial Class appointment" lookup. Pure read-path
-- optimisation — no schema/behaviour change. Tables resolve via the connection
-- search_path (crm), matching the rest of the CRM migrations. Idempotent.

-- CreateIndex
CREATE INDEX IF NOT EXISTS "crm_opportunity_tenantId_stageId_createdAt_idx"
  ON "crm_opportunity" ("tenantId", "stageId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "crm_appointment_contactId_title_startAt_idx"
  ON "crm_appointment" ("contactId", "title", "startAt");
