// One-off migration: add target_grade column to fa_invitations.
// Run with: node scripts/fa-add-target-grade.mjs
import "dotenv/config";
import pg from "pg";

const url = process.env.FA_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("FA_DATABASE_URL (or DATABASE_URL) not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });
try {
  const res = await pool.query(
    "ALTER TABLE fa_invitations ADD COLUMN IF NOT EXISTS target_grade INT"
  );
  console.log("OK:", res.command);
} catch (err) {
  console.error("Failed:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
