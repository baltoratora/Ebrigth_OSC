// One-shot DDL to create the burnlist_week + burnlist_entry tables in
// ebright_hrfs. Idempotent — safe to run multiple times.
import { Pool } from "pg";
import "dotenv/config";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

const pool = new Pool({ connectionString: url, max: 2 });

// Drop any rogue copies created in non-public schemas first (one-time fix
// — earlier run accidentally landed them in the `crm` schema).
const cleanup = `
DROP TABLE IF EXISTS crm.burnlist_entry CASCADE;
DROP TABLE IF EXISTS crm.burnlist_week  CASCADE;
`;

const ddl = `
SET search_path TO public;

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
      FOREIGN KEY ("weekId") REFERENCES public.burnlist_week(id) ON DELETE CASCADE ON UPDATE CASCADE;
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

CREATE INDEX IF NOT EXISTS "burnlist_entry_weekId_idx" ON public.burnlist_entry("weekId");
`;

try {
  await pool.query(cleanup);
  await pool.query(ddl);
  console.log("✓ burnlist_week and burnlist_entry tables ready in public schema");

  const { rows } = await pool.query(`
    SELECT table_schema || '.' || table_name AS tbl
      FROM information_schema.tables
     WHERE table_name ILIKE 'burnlist%'
     ORDER BY table_schema, table_name
  `);
  console.log("Tables present:", rows.map((r) => r.tbl).join(", "));
} catch (e) {
  console.error("✗ Failed:", e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
