import { Pool } from "pg";
const pool = new Pool({
  connectionString: "postgresql://optidept:ebrightoptidept2025@103.209.156.174:5433/ebrightleads_db",
  max: 2,
});

// Distinct status values
const { rows: statuses } = await pool.query(`
  SELECT status, COUNT(*) AS n
    FROM studentrecords
   GROUP BY status
   ORDER BY n DESC
`);
console.log("=== distinct status values ===");
for (const r of statuses) console.log("  " + (r.status ?? "(null)").padEnd(14) + r.n);

console.log();

// Cross-tab status vs package_status for Expired rows
const { rows: cross } = await pool.query(`
  SELECT status, COUNT(*) AS n
    FROM studentrecords
   WHERE package_status = 'Expired'
     AND credit_expiry_date IS NOT NULL
     AND TRIM(name) <> ''
   GROUP BY status
   ORDER BY n DESC
`);
console.log("=== status values among package_status='Expired' rows ===");
for (const r of cross) console.log("  " + (r.status ?? "(null)").padEnd(14) + r.n);

await pool.end();
