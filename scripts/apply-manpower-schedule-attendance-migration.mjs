// One-shot migration runner for the Manpower Schedule Attendance table.
//
// Reads prisma/sql/2026-07-08-manpower-schedule-attendance.sql and applies it
// to ebright_hrfs (HRFS_DATABASE_URL). The app also self-provisions this table
// lazily on first use (see ensureAttendanceTable in app/api/schedules/route.ts),
// so this script just lets you create it up front instead of waiting for that
// first request. The SQL is idempotent so re-running is harmless.
//
// Usage: node scripts/apply-manpower-schedule-attendance-migration.mjs

import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "pg";

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));

const url = process.env.HRFS_DATABASE_URL || process.env.DATABASE_URL;

if (!url) {
  console.error("✗ No HRFS_DATABASE_URL / DATABASE_URL set in .env");
  process.exit(1);
}

const sqlPath = resolve(__dirname, "..", "prisma", "sql", "2026-07-08-manpower-schedule-attendance.sql");
const sql = readFileSync(sqlPath, "utf8");

const pool = new Pool({ connectionString: url, max: 1 });

try {
  console.log("→ Applying migration:", sqlPath);
  console.log("→ Target:", url.replace(/:[^:@]+@/, ":****@"));
  await pool.query(sql);
  console.log('✓ Migration applied successfully — "ManpowerScheduleAttendance" now exists in ebright_hrfs');
} catch (err) {
  console.error("✗ Migration failed:", err.message);
  process.exit(1);
} finally {
  await pool.end();
}
