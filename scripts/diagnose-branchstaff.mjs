// Read-only diagnostic — find duplicate / incomplete BranchStaff rows that
// explain why the attendance page shows different role/dept than HR Employee
// Management for the same employeeId. Uses HRMS DATABASE_URL.

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

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const pool = new Pool({ connectionString: url });

const probeIds = ["55020064", "44070028", "44040074", "44040050", "44080014"];

try {
  console.log("=== Duplicate employeeId check ===");
  const dup = await pool.query(`
    SELECT "employeeId", COUNT(*) AS n
      FROM "BranchStaff"
     WHERE "employeeId" IS NOT NULL
     GROUP BY "employeeId"
    HAVING COUNT(*) > 1
     ORDER BY n DESC
     LIMIT 20
  `);
  if (dup.rows.length === 0) {
    console.log("  (none — every employeeId is unique)");
  } else {
    for (const r of dup.rows) console.log(`  ${r.employeeId}: ${r.n} rows`);
  }

  console.log("\n=== NUREEN search (any row containing 'NUREEN') ===");
  const nureen = await pool.query(`
    SELECT id, name, "employeeId", branch, location, department, role, status
      FROM "BranchStaff"
     WHERE UPPER(name) LIKE '%NUREEN%'
     ORDER BY id
  `);
  if (nureen.rows.length === 0) {
    console.log("  (no rows match 'NUREEN')");
  } else {
    for (const r of nureen.rows) {
      console.log(`  id=${r.id} | empId=${r.employeeId} | name="${r.name}" | branch=${r.branch} | loc=${r.location} | dept=${r.department} | role=${r.role} | status=${r.status}`);
    }
  }

  console.log("\n=== Per-empId rows for the IDs visible in the screenshot ===");
  for (const id of probeIds) {
    const { rows } = await pool.query(
      `SELECT id, name, "employeeId", branch, location, department, role, status
         FROM "BranchStaff"
        WHERE "employeeId" = $1
        ORDER BY id`,
      [id]
    );
    console.log(`\nemployeeId=${id} → ${rows.length} row(s):`);
    if (rows.length === 0) {
      console.log(`  (no BranchStaff row — that's why this employee shows '—' for dept/role)`);
    } else {
      for (const r of rows) {
        console.log(`  id=${r.id} | name="${r.name}" | branch=${r.branch} | loc=${r.location} | dept=${r.department} | role=${r.role} | status=${r.status}`);
      }
    }
  }
} catch (err) {
  console.error("Diagnostic failed:", err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
