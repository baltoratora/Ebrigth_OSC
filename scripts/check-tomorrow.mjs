import { Pool } from "pg";
const pool = new Pool({
  connectionString: "postgresql://optidept:ebrightoptidept2025@103.209.156.174:5433/ebrightleads_db",
  max: 2,
});

// Students whose expiry is tomorrow (2026-05-20) — what's their package_status?
const { rows: tomorrow } = await pool.query(`
  SELECT name, branch, TO_CHAR(credit_expiry_date, 'YYYY-MM-DD') AS expiry, package_status
    FROM studentrecords
   WHERE credit_expiry_date = DATE '2026-05-20'
   ORDER BY package_status, name
`);
console.log("=== Students expiring 2026-05-20 ===");
console.log("Count: " + tomorrow.length);
const groups = {};
for (const r of tomorrow) (groups[r.package_status ?? "(null)"] ??= 0, groups[r.package_status ?? "(null)"]++);
console.log("By package_status: " + JSON.stringify(groups));
console.log();
for (const r of tomorrow.slice(0, 10)) console.log(`  ${r.expiry} ${r.package_status?.padEnd(10)} ${r.branch?.padEnd(5)} ${r.name}`);
if (tomorrow.length > 10) console.log(`  ... +${tomorrow.length - 10} more`);

console.log();

// What's the relationship in general? Past expiry rows: what's their status?
const { rows: pastDist } = await pool.query(`
  SELECT package_status, COUNT(*) AS n
    FROM studentrecords
   WHERE credit_expiry_date < DATE '2026-05-19'
     AND credit_expiry_date IS NOT NULL
   GROUP BY package_status
   ORDER BY n DESC
`);
console.log("=== Status distribution for rows where expiry < today (2026-05-19) ===");
for (const r of pastDist) console.log(`  ${r.package_status?.padEnd(12)} ${r.n}`);

console.log();

// Future expiry rows distribution
const { rows: futureDist } = await pool.query(`
  SELECT package_status, COUNT(*) AS n
    FROM studentrecords
   WHERE credit_expiry_date > DATE '2026-05-19'
     AND credit_expiry_date IS NOT NULL
   GROUP BY package_status
   ORDER BY n DESC
`);
console.log("=== Status distribution for rows where expiry > today (future) ===");
for (const r of futureDist) console.log(`  ${r.package_status?.padEnd(12)} ${r.n}`);

await pool.end();
