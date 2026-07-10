import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const raw = readFileSync(resolve(__dirname, "..", ".env"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
} catch {}

// Auth/users live in ebright_hrfs (OSC main DB), not in ebrightleads_db.
const url = process.env.DATABASE_URL;
const client = new pg.Client({ connectionString: url });
await client.connect();

console.log("Connected to:", (await client.query("SELECT current_database()")).rows[0]);
console.log("");

// Try to find the User table — naming might be "User", "users", "user_account", etc.
const tables = await client.query(
  `SELECT table_name FROM information_schema.tables
   WHERE table_schema='public' AND (table_name ILIKE 'user%' OR table_name ILIKE '%account%' OR table_name ILIKE '%auth%')
   ORDER BY table_name`
);
console.log("Auth-related tables:");
for (const t of tables.rows) console.log("  -", t.table_name);
console.log("");

// Distinct role values
for (const tbl of ["User", "users", "auth_user", "account"]) {
  try {
    const r = await client.query(`SELECT DISTINCT role, COUNT(*)::int AS c FROM "${tbl}" GROUP BY role ORDER BY c DESC`);
    if (r.rows.length > 0) {
      console.log(`Distinct roles in "${tbl}":`);
      for (const x of r.rows) console.log(`  ${x.role}: ${x.c} users`);
      console.log("");
      // Sample marketing-ish users
      const sample = await client.query(`SELECT email, role, "branchName" FROM "${tbl}" WHERE role ILIKE '%marketing%' OR role ILIKE '%mkt%' OR email ILIKE '%marketing%' LIMIT 10`);
      if (sample.rows.length > 0) {
        console.log(`Marketing-ish users in "${tbl}":`);
        for (const u of sample.rows) console.log(`  ${u.email}  role="${u.role}"  branch="${u.branchName ?? ""}"`);
      }
      break;
    }
  } catch { /* table doesn't exist with that name, try next */ }
}

await client.end();
