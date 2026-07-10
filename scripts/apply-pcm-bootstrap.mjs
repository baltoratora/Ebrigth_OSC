// One-shot bootstrap of pcm_* tables for the PCM System.
// Idempotent; safe to re-run.
//
// Usage: node scripts/apply-pcm-bootstrap.mjs

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
  console.error("✗ No FA_DATABASE_URL / LEADS_DB_URL / DATABASE_URL set");
  process.exit(1);
}

const sqlPath = resolve(__dirname, "..", "prisma", "sql", "2026-05-19-pcm-system-bootstrap.sql");
const sql = readFileSync(sqlPath, "utf8");

const pool = new Pool({ connectionString: url, max: 1 });

try {
  console.log("→ Applying PCM bootstrap:", sqlPath);
  await pool.query(sql);
  console.log("✓ PCM tables ready: pcm_events, pcm_sessions, pcm_session_quotas, pcm_invitations, pcm_event_branch_overrides");
} catch (err) {
  console.error("✗ Failed:", err.message);
  process.exit(1);
} finally {
  await pool.end();
}
