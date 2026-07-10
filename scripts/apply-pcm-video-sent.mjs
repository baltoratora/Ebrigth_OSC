// One-shot migration runner for the PCM video_sent_to_parent column.
//
// Reads prisma/sql/2026-06-08-pcm-video-sent-to-parent.sql and applies it to
// the PCM database (FA_DATABASE_URL / LEADS_DB_URL). Idempotent.
//
// Usage: node scripts/apply-pcm-video-sent.mjs

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

const sqlPath = resolve(__dirname, "..", "prisma", "sql", "2026-06-08-pcm-video-sent-to-parent.sql");
const sql = readFileSync(sqlPath, "utf8");

const pool = new Pool({ connectionString: url, max: 1 });

try {
  console.log("→ Applying migration:", sqlPath);
  await pool.query(sql);
  console.log("✓ Migration applied — pcm_invitations.video_sent_to_parent added (default false)");
} catch (err) {
  console.error("✗ Migration failed:", err.message);
  process.exit(1);
} finally {
  await pool.end();
}
