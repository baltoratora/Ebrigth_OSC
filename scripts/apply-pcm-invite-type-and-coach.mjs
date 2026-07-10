import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "pg";

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));

const url = process.env.FA_DATABASE_URL || process.env.LEADS_DB_URL || process.env.DATABASE_URL;
if (!url) { console.error("✗ no DB URL"); process.exit(1); }

const sqlPath = resolve(__dirname, "..", "prisma", "sql", "2026-05-19-pcm-invite-type-and-coach.sql");
const sql = readFileSync(sqlPath, "utf8");

const pool = new Pool({ connectionString: url, max: 1 });
try {
  console.log("→ Applying:", sqlPath);
  await pool.query(sql);
  console.log("✓ Done — invite_type + coach_id + coach_name on pcm_invitations");
} catch (err) {
  console.error("✗ Failed:", err.message);
  process.exit(1);
} finally {
  await pool.end();
}
