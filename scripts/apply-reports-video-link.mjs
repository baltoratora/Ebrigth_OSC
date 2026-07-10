import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "pg";

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const url = process.env.FA_DATABASE_URL || process.env.LEADS_DB_URL || process.env.DATABASE_URL;
if (!url) { console.error("✗ no DB URL"); process.exit(1); }

const sqlPath = resolve(__dirname, "..", "prisma", "sql", "2026-06-04-reports-video-link.sql");
const sql = readFileSync(sqlPath, "utf8");
const pool = new Pool({ connectionString: url, max: 1 });
try {
  console.log("→ Applying:", sqlPath);
  await pool.query(sql);
  console.log("✓ video_link column added to pcm_assessment_reports + fa_assessment_reports");
} catch (err) {
  console.error("✗ Failed:", err.message);
  process.exit(1);
} finally {
  await pool.end();
}
