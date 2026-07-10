// Ensure burnlist_week + burnlist_entry exist in BOTH the `crm` and `public`
// schemas, idempotently. Designed to be run inside the deployed container
// where DATABASE_URL is already set in the environment.
//
//   docker exec ebright-osc-worker-1 node scripts/ensure-burnlist-tables.mjs
//
// No data copy — just schema. The app's own snapshot logic will fill the
// tables on next Wednesday rollover (or first page visit on Wednesday).

import { Pool } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
const pool = new Pool({ connectionString: url, max: 2 });

const ddl = `
-- Ensure crm schema exists (it's used by Prisma in deployed envs).
CREATE SCHEMA IF NOT EXISTS crm;

-- crm.burnlist_week ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm.burnlist_week (
  id          TEXT PRIMARY KEY,
  "weekKey"   TEXT UNIQUE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- crm.burnlist_entry --------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm.burnlist_entry (
  id                TEXT PRIMARY KEY,
  "weekId"          TEXT NOT NULL,
  "studentRecordId" TEXT NOT NULL,
  "studentName"     TEXT NOT NULL,
  branch            TEXT NOT NULL,
  "expiryDate"      TEXT NOT NULL,
  cta               TEXT NOT NULL DEFAULT '',
  remarks           TEXT NOT NULL DEFAULT '',
  done              BOOLEAN NOT NULL DEFAULT FALSE,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'crm_burnlist_entry_weekId_fkey'
       AND connamespace = 'crm'::regnamespace
  ) THEN
    ALTER TABLE crm.burnlist_entry
      ADD CONSTRAINT "crm_burnlist_entry_weekId_fkey"
      FOREIGN KEY ("weekId") REFERENCES crm.burnlist_week(id)
        ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'crm_burnlist_entry_weekId_studentRecordId_key'
       AND connamespace = 'crm'::regnamespace
  ) THEN
    ALTER TABLE crm.burnlist_entry
      ADD CONSTRAINT "crm_burnlist_entry_weekId_studentRecordId_key"
      UNIQUE ("weekId", "studentRecordId");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "crm_burnlist_entry_weekId_idx"
  ON crm.burnlist_entry("weekId");

-- Also create in public, in case the deployed Prisma falls back there.
CREATE TABLE IF NOT EXISTS public.burnlist_week (
  id          TEXT PRIMARY KEY,
  "weekKey"   TEXT UNIQUE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.burnlist_entry (
  id                TEXT PRIMARY KEY,
  "weekId"          TEXT NOT NULL,
  "studentRecordId" TEXT NOT NULL,
  "studentName"     TEXT NOT NULL,
  branch            TEXT NOT NULL,
  "expiryDate"      TEXT NOT NULL,
  cta               TEXT NOT NULL DEFAULT '',
  remarks           TEXT NOT NULL DEFAULT '',
  done              BOOLEAN NOT NULL DEFAULT FALSE,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'burnlist_entry_weekId_fkey'
       AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE public.burnlist_entry
      ADD CONSTRAINT "burnlist_entry_weekId_fkey"
      FOREIGN KEY ("weekId") REFERENCES public.burnlist_week(id)
        ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'burnlist_entry_weekId_studentRecordId_key'
       AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE public.burnlist_entry
      ADD CONSTRAINT "burnlist_entry_weekId_studentRecordId_key"
      UNIQUE ("weekId", "studentRecordId");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "burnlist_entry_weekId_idx"
  ON public.burnlist_entry("weekId");
`;

try {
  await pool.query(ddl);
  const { rows } = await pool.query(`
    SELECT table_schema || '.' || table_name AS table_full
      FROM information_schema.tables
     WHERE table_name LIKE 'burnlist%'
     ORDER BY 1
  `);
  console.log("✓ burnlist tables ensured. Present:");
  for (const r of rows) console.log("  " + r.table_full);
} catch (e) {
  console.error("✗ Failed:", e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
