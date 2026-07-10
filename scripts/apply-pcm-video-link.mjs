// One-shot migration runner for pcm_invitations.video_link.
// Usage: node scripts/apply-pcm-video-link.mjs
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "pg";

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const url = process.env.FA_DATABASE_URL || process.env.LEADS_DB_URL || process.env.DATABASE_URL;
if (!url) { console.error("✗ No FA_DATABASE_URL / LEADS_DB_URL / DATABASE_URL set"); process.exit(1); }

const sqlPath = resolve(__dirname, "..", "prisma", "sql", "2026-06-09-pcm-video-link.sql");
const pool = new Pool({ connectionString: url, max: 1 });
try {
  await pool.query(readFileSync(sqlPath, "utf8"));
  console.log("✓ Migration applied — pcm_invitations.video_link added");
} catch (err) {
  console.error("✗ Migration failed:", err.message);
  process.exit(1);
} finally {
  await pool.end();
}
