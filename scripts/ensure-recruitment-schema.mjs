// Set up the Recruitment module in ebright_hrfs and migrate existing data from
// ebright_crm.crm. Idempotent — safe to run on every deploy:
//
//   docker exec ebright-osc-worker-1 node scripts/ensure-recruitment-schema.mjs
//
// 1. Ensures rec_stage / rec_recruit / rec_stage_history / rec_interview /
//    rec_resume exist (and are up to date) in WHICHEVER database the runtime
//    hrfsPrisma client actually connects to. That client uses
//    HRFS_DATABASE_URL, falling back to DATABASE_URL when the secret isn't set
//    (see lib/hrfs.ts) — so this script mirrors that exact resolution. That
//    guarantees the tables the app queries always exist, regardless of which
//    DB the environment is wired to.
// 2. CREATE TABLE IF NOT EXISTS for first-time setup, PLUS
//    ALTER TABLE ... ADD COLUMN IF NOT EXISTS so a table created by an earlier
//    (pre-applicationId) build gets upgraded in place rather than silently
//    missing the column — the failure mode that 500'd the dashboard.
// 3. One-time copy of stages + recruits + history (+ interviews/resumes) from
//    crm.rec_* into the destination, preserving ids and FKs, ON CONFLICT (id)
//    DO NOTHING. Only runs when the destination is a DIFFERENT database from
//    the crm source (i.e. HRFS_DATABASE_URL is set and distinct); when the app
//    falls back to the crm DB the rec_* tables are already there in place.
//
// No pgcrypto / gen_random_uuid dependency: Prisma (and the copy below) always
// supply the id, so the id columns need no DB-side default.

import { Pool } from "pg";

const hrfsUrl = process.env.HRFS_DATABASE_URL;
const crmUrl = process.env.DATABASE_URL;
// Mirror lib/hrfs.ts: the app reads/writes rec_* through whichever of these
// resolves first. Provision THAT database so the schema can never drift from
// what the runtime queries.
const destUrl = hrfsUrl || crmUrl;
if (!destUrl) {
  console.error("[rec-hrfs] neither HRFS_DATABASE_URL nor DATABASE_URL is set — aborting");
  process.exit(1);
}

/** Schema from a `?schema=` connection-string param (default 'public'). */
function schemaOf(url, fallback) {
  try {
    return new URL(url).searchParams.get("schema") || fallback;
  } catch {
    return fallback;
  }
}
const destSchema = schemaOf(destUrl, "public");
const crmSchema = crmUrl ? schemaOf(crmUrl, "crm") : "crm";
const S = `"${destSchema}"`; // quoted, schema-qualified prefix for the destination

// Copy crm.rec_* across only when the destination is a genuinely different DB.
const doCopy = !!hrfsUrl && hrfsUrl !== crmUrl;

const dest = new Pool({ connectionString: destUrl, max: 2 });
const crm = doCopy && crmUrl ? new Pool({ connectionString: crmUrl, max: 2 }) : null;

// First-time table creation. No id DEFAULT (callers always supply it).
const DDL = `
CREATE TABLE IF NOT EXISTS ${S}.rec_stage (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  "shortCode" text NOT NULL,
  "order"     integer NOT NULL,
  color       text NOT NULL DEFAULT 'slate',
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ${S}.rec_recruit (
  id                 text PRIMARY KEY,
  name               text NOT NULL,
  email              text,
  phone              text,
  source             text,
  position           text,
  branch             text,
  "stageId"          text NOT NULL,
  hired              boolean NOT NULL DEFAULT false,
  "branchStaffId"    integer,
  "ghlOpportunityId" text,
  "ghlContactId"     text,
  "ghlCreatedAt"     timestamp(3),
  "applicationId"    integer,
  "deletedAt"        timestamp(3),
  "createdAt"        timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"        timestamp(3) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ${S}.rec_stage_history (
  id            text PRIMARY KEY,
  "recruitId"   text NOT NULL,
  "fromStageId" text,
  "toStageId"   text NOT NULL,
  "changedBy"   text,
  note          text,
  "changedAt"   timestamp(3) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ${S}.rec_interview (
  id            text PRIMARY KEY,
  "recruitId"   text NOT NULL,
  "scheduledAt" timestamp(3) NOT NULL,
  location      text,
  note          text,
  "createdBy"   text,
  "createdAt"   timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"   timestamp(3) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ${S}.rec_resume (
  id           text PRIMARY KEY,
  "recruitId"  text NOT NULL,
  "fileName"   text NOT NULL,
  "mimeType"   text NOT NULL DEFAULT 'application/octet-stream',
  "sizeBytes"  integer NOT NULL DEFAULT 0,
  data         bytea NOT NULL,
  "uploadedBy" text,
  "uploadedAt" timestamp(3) NOT NULL DEFAULT now()
);
`;

// Idempotent upgrades for tables an earlier build may have created without the
// newer (all nullable, so safe to add even when rows already exist) columns.
const ALTERS = [
  `ALTER TABLE ${S}.rec_recruit ADD COLUMN IF NOT EXISTS "applicationId" integer`,
  `ALTER TABLE ${S}.rec_recruit ADD COLUMN IF NOT EXISTS "deletedAt" timestamp(3)`,
  `ALTER TABLE ${S}.rec_recruit ADD COLUMN IF NOT EXISTS "ghlCreatedAt" timestamp(3)`,
  `ALTER TABLE ${S}.rec_recruit ADD COLUMN IF NOT EXISTS "ghlContactId" text`,
  `ALTER TABLE ${S}.rec_recruit ADD COLUMN IF NOT EXISTS "branchStaffId" integer`,
];

// Constraints / indexes created separately so they apply to pre-existing tables
// too. Unique constraints are expressed as partial unique indexes (skip NULLs).
const INDEXES = [
  `CREATE UNIQUE INDEX IF NOT EXISTS rec_stage_shortcode_uniq ON ${S}.rec_stage ("shortCode")`,
  `CREATE INDEX IF NOT EXISTS rec_stage_order_idx ON ${S}.rec_stage ("order")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS rec_recruit_ghlopp_uniq ON ${S}.rec_recruit ("ghlOpportunityId") WHERE "ghlOpportunityId" IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS rec_recruit_application_uniq ON ${S}.rec_recruit ("applicationId") WHERE "applicationId" IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS rec_recruit_stage_idx ON ${S}.rec_recruit ("stageId")`,
  `CREATE INDEX IF NOT EXISTS rec_recruit_hired_idx ON ${S}.rec_recruit (hired)`,
  `CREATE INDEX IF NOT EXISTS rec_stage_history_recruit_idx ON ${S}.rec_stage_history ("recruitId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS rec_interview_recruit_uniq ON ${S}.rec_interview ("recruitId")`,
  `CREATE INDEX IF NOT EXISTS rec_interview_when_idx ON ${S}.rec_interview ("scheduledAt")`,
  `CREATE INDEX IF NOT EXISTS rec_resume_recruit_idx ON ${S}.rec_resume ("recruitId")`,
  `CREATE INDEX IF NOT EXISTS rec_resume_uploaded_idx ON ${S}.rec_resume ("uploadedAt")`,
];

/** Copy every row of crm.<table> into <destSchema>.<table>, id-preserving. */
async function copy(table) {
  if (!crm) return;
  let rows;
  try {
    ({ rows } = await crm.query(`SELECT * FROM "${crmSchema}".${table}`));
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
    const res = await dest.query(
      `INSERT INTO ${S}.${table} (${colList}) VALUES (${ph}) ON CONFLICT (id) DO NOTHING`,
      vals,
    );
    copied += res.rowCount;
  }
  console.log(`[rec-hrfs] ${table}: copied ${copied} new row(s) (of ${rows.length})`);
}

async function main() {
  console.log(
    `[rec-hrfs] destination = ${hrfsUrl ? "HRFS_DATABASE_URL" : "DATABASE_URL (fallback)"} schema "${destSchema}"; copy from crm = ${doCopy}`,
  );
  await dest.query(DDL);
  for (const sql of ALTERS) await dest.query(sql);
  for (const sql of INDEXES) await dest.query(sql);
  console.log("[rec-hrfs] tables ensured + upgraded");

  if (doCopy) {
    // FK order: stage -> recruit -> history -> interview -> resume.
    await copy("rec_stage");
    await copy("rec_recruit");
    await copy("rec_stage_history");
    await copy("rec_interview");
    await copy("rec_resume");
  } else {
    console.log("[rec-hrfs] destination is the crm DB itself — skipping copy (tables already in place)");
  }
}

main()
  .catch((e) => {
    console.error("[rec-hrfs] failed:", e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await dest.end();
    if (crm) await crm.end();
  });
