import { Pool } from "pg";
import fs from "node:fs";

const url = "postgresql://optidept:ebrightoptidept2025@103.209.156.174:5433/ebrightleads_db";
const pool = new Pool({ connectionString: url, max: 2 });

const { rows } = await pool.query(
  `SELECT id::text AS id,
          name,
          branch,
          TO_CHAR(credit_expiry_date, 'YYYY-MM-DD') AS expiry,
          package_status
     FROM studentrecords
    WHERE package_status = 'Expired'
      AND name IS NOT NULL
      AND TRIM(name) <> ''
      AND credit_expiry_date IS NOT NULL
    ORDER BY branch, credit_expiry_date DESC, name`,
);

const byBranch = {};
for (const r of rows) {
  (byBranch[r.branch ?? "(null)"] ??= []).push(r);
}

console.log("=== TRUTH from DB ===");
console.log("Total expired students with names: " + rows.length);
console.log("Branches with expired students: " + Object.keys(byBranch).length);
console.log();

// Top 3 most-recent per branch + count
const branches = Object.keys(byBranch).sort();
for (const b of branches) {
  const list = byBranch[b];
  console.log(`${b}: ${list.length} student(s)`);
  for (const r of list.slice(0, 3)) console.log(`   ${r.expiry}  ${r.name}  [id=${r.id}]`);
  if (list.length > 3) console.log(`   ... +${list.length - 3} more`);
}

// Compare with API
console.log();
console.log("=== API check ===");
const api = JSON.parse(fs.readFileSync("C:/Users/HP/AppData/Local/Temp/api.json", "utf8"));
const apiByBranch = {};
for (const r of api.rows) (apiByBranch[r.branch] ??= []).push(r);
const apiBranches = Object.keys(apiByBranch).sort();

console.log("API total: " + api.rows.length + (api.rows.length === rows.length ? " ✓ matches DB" : " ✗ DIFFERS from DB"));
console.log("API branches: " + apiBranches.length + (apiBranches.length === branches.length ? " ✓" : " ✗"));

// Per-branch diff
for (const b of branches) {
  const dbN = byBranch[b].length;
  const apiN = apiByBranch[b]?.length ?? 0;
  const mark = dbN === apiN ? "✓" : "✗";
  console.log(`  ${mark} ${b}: db=${dbN} api=${apiN}`);
  if (dbN !== apiN) {
    const dbIds = new Set(byBranch[b].map((r) => r.id));
    const apiIds = new Set((apiByBranch[b] ?? []).map((r) => r.id));
    const missing = [...dbIds].filter((i) => !apiIds.has(i));
    const extra = [...apiIds].filter((i) => !dbIds.has(i));
    if (missing.length) console.log("    missing from API:", missing.join(","));
    if (extra.length) console.log("    extra in API:", extra.join(","));
  }
  // Also check the dates match per ID
  if (apiByBranch[b]) {
    const apiMap = new Map(apiByBranch[b].map((r) => [r.id, r.expiry]));
    const mismatches = byBranch[b]
      .map((r) => ({ id: r.id, name: r.name, db: r.expiry, api: apiMap.get(r.id) }))
      .filter((r) => r.api && r.db !== r.api);
    if (mismatches.length) {
      console.log("    date mismatches:");
      for (const m of mismatches) console.log(`      ${m.id} ${m.name}: db=${m.db} api=${m.api}`);
    }
  }
}

await pool.end();
