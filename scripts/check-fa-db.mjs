// One-off DB probe: shows what FA tables / tenants / row counts exist in
// the database the local .env points at. If staging and prod share this
// DB, the same data should be visible on both.
//
//   node scripts/check-fa-db.mjs

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

const url = process.env.FA_DATABASE_URL || process.env.DATABASE_URL;
if (!url) { console.error("Missing FA_DATABASE_URL"); process.exit(1); }

const client = new pg.Client({ connectionString: url });
await client.connect();

const dbInfo = await client.query(`SELECT current_database() AS db, current_user AS u, inet_server_addr()::text AS host, inet_server_port() AS port`);
console.log("Connected to:", dbInfo.rows[0]);
console.log("");

const tables = await client.query(
  `SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name LIKE 'fa_%'
   ORDER BY table_name`
);
console.log("FA tables in DB:");
for (const t of tables.rows) console.log("  -", t.table_name);
console.log("");

for (const tbl of ["fa_events", "fa_sessions", "fa_session_quotas", "fa_invitations"]) {
  try {
    const total = await client.query(`SELECT COUNT(*)::int AS c FROM ${tbl}`);
    const byTenant = await client.query(`SELECT tenant_id, COUNT(*)::int AS c FROM ${tbl} GROUP BY tenant_id ORDER BY c DESC`);
    console.log(`${tbl}: ${total.rows[0].c} rows total`);
    for (const r of byTenant.rows) {
      console.log(`   tenant_id="${r.tenant_id}" → ${r.c} rows`);
    }
  } catch (err) {
    console.log(`${tbl}: ERROR — ${err.message}`);
  }
}
console.log("");

console.log("Sample fa_events rows (any tenant):");
try {
  const sample = await client.query(`SELECT id, tenant_id, name, year, month, status, venue FROM fa_events ORDER BY year DESC, month DESC LIMIT 10`);
  if (sample.rows.length === 0) console.log("  (no rows)");
  for (const r of sample.rows) {
    console.log(`  - [${r.tenant_id}] ${r.name}  (${r.year}-${String(r.month).padStart(2,"0")}, ${r.status}, ${r.venue})`);
  }
} catch (err) {
  console.log("  ERROR —", err.message);
}

await client.end();
