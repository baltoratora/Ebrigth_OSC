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

const client = new pg.Client({ connectionString: process.env.FA_DATABASE_URL || process.env.DATABASE_URL });
await client.connect();

for (const tbl of ["fa_events", "fa_sessions", "fa_session_quotas", "fa_invitations"]) {
  const cols = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1
     ORDER BY ordinal_position`,
    [tbl]
  );
  console.log(`${tbl}:`);
  for (const c of cols.rows) console.log(`  - ${c.column_name}  (${c.data_type})`);
  console.log("");
}

// Check ade_group too
console.log("ade_group:");
const ag = await client.query(
  `SELECT column_name, data_type FROM information_schema.columns
   WHERE table_schema='public' AND table_name='ade_group'
   ORDER BY ordinal_position`
);
if (ag.rows.length === 0) console.log("  (table does not exist)");
for (const c of ag.rows) console.log(`  - ${c.column_name}  (${c.data_type})`);

await client.end();
