// One-shot migration runner for the FA System schema additions.
// Run with: node scripts/fa-migrate.mjs
// Reads FA_DATABASE_URL (or LEADS_DB_URL) from process.env / .env.

import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Tiny .env parser so this works without dotenv as a dependency.
function loadEnv() {
  try {
    const text = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/i);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}

loadEnv();

const url = process.env.FA_DATABASE_URL || process.env.LEADS_DB_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("No FA_DATABASE_URL / LEADS_DB_URL / DATABASE_URL set.");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });

const statements = [
  `ALTER TABLE fa_events       ADD COLUMN IF NOT EXISTS created_by TEXT`,
  `ALTER TABLE fa_invitations  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ NOT NULL DEFAULT now()`,
  `ALTER TABLE fa_invitations  ADD COLUMN IF NOT EXISTS attendance_marked_at TIMESTAMPTZ`,
  `ALTER TABLE fa_invitations  ADD COLUMN IF NOT EXISTS attendance_marked_by TEXT`,
  `ALTER TABLE fa_invitations  ADD COLUMN IF NOT EXISTS notes TEXT`,
  `ALTER TABLE fa_invitations  DROP CONSTRAINT IF EXISTS fa_invitations_student_id_fkey`,
];

try {
  for (const sql of statements) {
    process.stdout.write(`> ${sql} ... `);
    await pool.query(sql);
    console.log("OK");
  }
  // Quick verification
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'fa_events' AND column_name = 'created_by'`
  );
  console.log(rows.length > 0 ? "\n✓ fa_events.created_by present" : "\n✗ fa_events.created_by missing");
} catch (err) {
  console.error("Migration failed:", err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
