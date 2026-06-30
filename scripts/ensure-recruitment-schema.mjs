// Set up the Recruitment module in ebright_hrfs and migrate existing data from
// ebright_crm.crm. Idempotent — safe to run on every deploy:
//
//   docker exec ebright-osc-worker-1 node scripts/ensure-recruitment-schema.mjs
//
// 1. Creates rec_stage / rec_recruit / rec_stage_history / rec_interview /
//    rec_resume in ebright_hrfs (public schema), matching the Prisma models.
// 2. One-time copy of stages + recruits + history (+ interviews/resumes) from
//    crm.rec_* into hrfs, preserving ids and FKs. ON CONFLICT (id) DO NOTHING,
//    so rows the HR team has since changed in hrfs are never overwritten and
//    re-runs are no-ops.
//
// Needs DATABASE_URL (crm source) + HRFS_DATABASE_URL (hrfs destination); both
// are present in the deployed container.

import { Pool } from "pg";

const hrfsUrl = process.env.HRFS_DATABASE_URL;
const crmUrl = process.env.DATABASE_URL;
if (!hrfsUrl) {
  console.error("[rec-hrfs] HRFS_DATABASE_URL not set — recruitment now lives in ebright_hrfs; aborting");
  process.exit(1);
}
const hrfs = new Pool({ connectionString: hrfsUrl, max: 2 });
const crm = crmUrl ? new Pool({ connectionString: crmUrl, max: 2 }) : null;

const DDL = `
CREATE TABLE IF NOT EXISTS rec_stage (
  id          text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  name        text NOT NULL,
  "shortCode" text NOT NULL UNIQUE,
  "order"     integer NOT NULL,
  color       text NOT NULL DEFAULT 'slate',
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rec_stage_order_idx ON rec_stage ("order");

CREATE TABLE IF NOT EXISTS rec_recruit (
  id                 text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  name               text NOT NULL,
  email              text,
  phone              text,
  source             text,
  position           text,
  branch             text,
  "stageId"          text NOT NULL REFERENCES rec_stage(id),
  hired              boolean NOT NULL DEFAULT false,
  "branchStaffId"    integer,
  "ghlOpportunityId" text UNIQUE,
  "ghlContactId"     text,
  "ghlCreatedAt"     timestamp(3),
  "applicationId"    integer,
  "deletedAt"        timestamp(3),
  "createdAt"        timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"        timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rec_recruit_stage_idx ON rec_recruit ("stageId");
CREATE INDEX IF NOT EXISTS rec_recruit_hired_idx ON rec_recruit (hired);
CREATE UNIQUE INDEX IF NOT EXISTS rec_recruit_application_uniq ON rec_recruit ("applicationId") WHERE "applicationId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS rec_stage_history (
  id            text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  "recruitId"   text NOT NULL REFERENCES rec_recruit(id) ON DELETE CASCADE,
  "fromStageId" text REFERENCES rec_stage(id),
  "toStageId"   text NOT NULL REFERENCES rec_stage(id),
  "changedBy"   text,
  note          text,
  "changedAt"   timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rec_stage_history_recruit_idx ON rec_stage_history ("recruitId");

CREATE TABLE IF NOT EXISTS rec_interview (
  id            text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  "recruitId"   text NOT NULL REFERENCES rec_recruit(id) ON DELETE CASCADE,
  "scheduledAt" timestamp(3) NOT NULL,
  location      text,
  note          text,
  "createdBy"   text,
  "createdAt"   timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"   timestamp(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS rec_interview_recruit_uniq ON rec_interview ("recruitId");
CREATE INDEX IF NOT EXISTS rec_interview_when_idx ON rec_interview ("scheduledAt");

CREATE TABLE IF NOT EXISTS rec_resume (
  id           text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  "recruitId"  text NOT NULL REFERENCES rec_recruit(id) ON DELETE CASCADE,
  "fileName"   text NOT NULL,
  "mimeType"   text NOT NULL DEFAULT 'application/octet-stream',
  "sizeBytes"  integer NOT NULL DEFAULT 0,
  data         bytea NOT NULL,
  "uploadedBy" text,
  "uploadedAt" timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rec_resume_recruit_idx ON rec_resume ("recruitId");
CREATE INDEX IF NOT EXISTS rec_resume_uploaded_idx ON rec_resume ("uploadedAt");
`;

/** Copy every row of crm.<table> into public.<table> in hrfs, id-preserving. */
async function copy(table) {
  if (!crm) return;
  let rows;
  try {
    ({ rows } = await crm.query(`SELECT * FROM crm.${table}`));
  } catch (e) {
    console.log(`[rec-hrfs] skip ${table} (source missing): ${e.message}`);
    return;
  }
  if (!rows.length) {
    console.log(`[rec-hrfs] ${table}: nothing to copy`);
    return;
  }
  const cols = Object.keys(rows[0]);
  const colList = cols.map((c) => `"${c}"`).join(", ");
  let copied = 0;
  for (const r of rows) {
    const ph = cols.map((_, i) => `$${i + 1}`).join(", ");
    const vals = cols.map((c) => r[c]);
    const res = await hrfs.query(
      `INSERT INTO ${table} (${colList}) VALUES (${ph}) ON CONFLICT (id) DO NOTHING`,
      vals,
    );
    copied += res.rowCount;
  }
  console.log(`[rec-hrfs] ${table}: copied ${copied} new row(s) (of ${rows.length})`);
}

async function main() {
  await hrfs.query(DDL);
  console.log("[rec-hrfs] tables ensured in ebright_hrfs");
  // FK order: stage -> recruit -> history -> interview -> resume.
  await copy("rec_stage");
  await copy("rec_recruit");
  await copy("rec_stage_history");
  await copy("rec_interview");
  await copy("rec_resume");
}

main()
  .catch((e) => {
    console.error("[rec-hrfs] failed:", e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await hrfs.end();
    if (crm) await crm.end();
  });
