// Update a single BranchStaff row's `branch` field, after printing the
// before/after for visibility. Pass the employeeId and the new branch code:
//
//   node scripts/fix-branch.mjs --id 55020065 --branch ST
//   node scripts/fix-branch.mjs --id 55020065 --branch ST --dry
//
// --dry prints the change without applying it.

import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
}

const id = arg("id");
const newBranch = arg("branch");
const dry = args.includes("--dry");

if (!id || !newBranch) {
  console.error("Usage: node scripts/fix-branch.mjs --id <employeeId> --branch <CODE> [--dry]");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const pool = new Pool({ connectionString: url });

try {
  const { rows: before } = await pool.query(
    `SELECT id, name, "employeeId", branch, location, role, status
       FROM "BranchStaff"
      WHERE "employeeId" = $1`,
    [id]
  );
  if (before.length === 0) {
    console.error(`No BranchStaff row for employeeId=${id}`);
    process.exit(1);
  }
  if (before.length > 1) {
    console.error(`⚠ ${before.length} rows match employeeId=${id} — refusing to update without disambiguation:`);
    for (const r of before) console.error(`   id=${r.id} name="${r.name}" branch=${r.branch}`);
    process.exit(1);
  }
  console.log(`BEFORE: ${before[0].name} | branch=${before[0].branch} | loc=${before[0].location}`);
  if (dry) {
    console.log(`(dry run) would set branch=${newBranch}`);
    process.exit(0);
  }
  await pool.query(
    `UPDATE "BranchStaff" SET branch = $1 WHERE "employeeId" = $2`,
    [newBranch, id]
  );
  const { rows: after } = await pool.query(
    `SELECT branch FROM "BranchStaff" WHERE "employeeId" = $1`,
    [id]
  );
  console.log(`AFTER:  branch=${after[0].branch}`);
} catch (err) {
  console.error("Failed:", err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
