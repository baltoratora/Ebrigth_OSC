-- Adds crm.crm_lead_transfer so branches can transfer a lead between branches.
-- Each lead is capped at 3 transfers; the count + history is read from this table.
--
-- Run against ebright_crm (the only DB this PR touches).
-- Idempotent: re-running is a no-op (IF NOT EXISTS on every object).

SET search_path TO crm, public;

CREATE TABLE IF NOT EXISTS crm.crm_lead_transfer (
  id                    TEXT        PRIMARY KEY,
  "tenantId"            TEXT        NOT NULL,
  "opportunityId"       TEXT        NOT NULL,
  "fromBranchId"        TEXT        NOT NULL,
  "toBranchId"          TEXT        NOT NULL,
  "fromPipelineId"      TEXT        NOT NULL,
  "toPipelineId"        TEXT        NOT NULL,
  "fromStageId"         TEXT        NOT NULL,
  "toStageId"           TEXT        NOT NULL,
  "transferredByUserId" TEXT,
  reason                TEXT        NOT NULL,
  "transferredAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT crm_lead_transfer_opp_fk
    FOREIGN KEY ("opportunityId") REFERENCES crm.crm_opportunity(id) ON DELETE CASCADE,
  CONSTRAINT crm_lead_transfer_from_branch_fk
    FOREIGN KEY ("fromBranchId") REFERENCES crm.crm_branch(id),
  CONSTRAINT crm_lead_transfer_to_branch_fk
    FOREIGN KEY ("toBranchId")   REFERENCES crm.crm_branch(id),
  CONSTRAINT crm_lead_transfer_user_fk
    FOREIGN KEY ("transferredByUserId") REFERENCES crm.crm_auth_user(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS crm_lead_transfer_tenant_opp_idx
  ON crm.crm_lead_transfer("tenantId", "opportunityId");

-- Sanity (read-only):
-- SELECT count(*) FROM crm.crm_lead_transfer;
