// One-shot migration runner for fa/multi-grade-invites.
//
// Reads prisma/sql/2026-05-17-fa-multi-grade-invites.sql and applies it
// to the FA database pointed to by FA_DATABASE_URL / LEADS_DB_URL.
// The SQL is idempotent so re-running is harmless.
//
// Usage: node scripts/apply-fa-multi-grade-migration.mjs

import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "pg";

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));

const url =
  process.env.FA_DATABASE_URL ||
  process.env.LEADS_DB_URL ||
  process.env.DATABASE_URL;

if (!url) {
  console.error("✗ No FA_DATABASE_URL / LEADS_DB_URL / DATABASE_URL set in .env");
  process.exit(1);
}

const sqlPath = resolve(__dirname, "..", "prisma", "sql", "2026-05-17-fa-multi-grade-invites.sql");
const sql = readFileSync(sqlPath, "utf8");

const pool = new Pool({ connectionString: url, max: 1 });

try {
  console.log("→ Applying migration:", sqlPath);
  await pool.query(sql);
  console.log("✓ Migration applied successfully");
  console.log("  - fa_invitations unique key now (event, student, target_grade)");
  console.log("  - fa_event_branch_overrides table created");
} catch (err) {
  console.error("✗ Migration failed:", err.message);
  process.exit(1);
} finally {
  await pool.end();
}
