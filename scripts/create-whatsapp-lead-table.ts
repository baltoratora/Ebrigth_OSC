/**
 * WhatsApp leads — live CRM DB migration.
 *
 * Additive-only, idempotent. Two parts, both safe to re-run:
 *   1. crm_whatsapp_lead table + indexes + FK (the WhatsApp inbox).
 *   2. WHATSAPP_LEAD value on the AutomationTriggerType enum (so the
 *      Automations visual builder can use the WhatsApp Lead trigger).
 *
 * Run together with a deploy shipping the matching Prisma client
 * (`npx prisma generate`).
 *
 *   npx tsx scripts/create-whatsapp-lead-table.ts            # dry-run (prints SQL)
 *   npx tsx scripts/create-whatsapp-lead-table.ts --apply    # execute
 */
import { prisma } from '@/lib/crm/db'

const APPLY = process.argv.includes('--apply')

// ALTER TYPE ... ADD VALUE cannot run inside a transaction, so it's executed as
// its own statement (separate from the table DDL block).
const ENUM_SQL = `ALTER TYPE "AutomationTriggerType" ADD VALUE IF NOT EXISTS 'WHATSAPP_LEAD';`

const SQL = `
CREATE TABLE IF NOT EXISTS "crm_whatsapp_lead" (
  "id"                TEXT PRIMARY KEY,
  "tenantId"          TEXT NOT NULL,
  "branchId"          TEXT NOT NULL,
  "wsLeadId"          TEXT NOT NULL,
  "source"            TEXT NOT NULL DEFAULT 'auto',
  "status"            TEXT NOT NULL DEFAULT 'PENDING',
  "rawBranch"         TEXT,
  "locationKey"       TEXT,
  "fullName"          TEXT,
  "phone"             TEXT,
  "campaignName"      TEXT,
  "submittedAt"       TIMESTAMP(3),
  "contactId"         TEXT,
  "completedByUserId" TEXT,
  "completedAt"       TIMESTAMP(3),
  "deletedByUserId"   TEXT,
  "deletedAt"         TIMESTAMP(3),
  "deleteReason"      TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_whatsapp_lead_wsid"
  ON "crm_whatsapp_lead" ("tenantId", "wsLeadId");

CREATE INDEX IF NOT EXISTS "crm_whatsapp_lead_tenant_branch_status_idx"
  ON "crm_whatsapp_lead" ("tenantId", "branchId", "status");

DO $$ BEGIN
  ALTER TABLE "crm_whatsapp_lead"
    ADD CONSTRAINT "crm_whatsapp_lead_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "crm_branch"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
`

async function main() {
  if (!APPLY) {
    console.log('Dry-run. SQL that would be executed:\n')
    console.log(SQL)
    console.log(ENUM_SQL)
    console.log('\nRe-run with --apply to execute.')
    return
  }
  await prisma.$executeRawUnsafe(SQL)
  console.log('✓ crm_whatsapp_lead table created (or already present).')
  await prisma.$executeRawUnsafe(ENUM_SQL)
  console.log("✓ AutomationTriggerType now includes 'WHATSAPP_LEAD'.")
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
