import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "pg";

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const url = process.env.FA_DATABASE_URL || process.env.LEADS_DB_URL || process.env.DATABASE_URL;
if (!url) { console.error("✗ no DB URL"); process.exit(1); }

const sqlPath = resolve(__dirname, "..", "prisma", "sql", "2026-05-23-fa-assessment-reports.sql");
const sql = readFileSync(sqlPath, "utf8");
const pool = new Pool({ connectionString: url, max: 1 });
try {
  console.log("→ Applying:", sqlPath);
  await pool.query(sql);
  console.log("✓ fa_assessment_reports table ready");
} catch (err) {
  console.error("✗ Failed:", err.message);
  process.exit(1);
} finally {
  await pool.end();
}
