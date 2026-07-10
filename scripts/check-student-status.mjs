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

const client = new pg.Client({
  connectionString: process.env.FA_DATABASE_URL || process.env.LEADS_DB_URL || process.env.DATABASE_URL,
});
await client.connect();

const r = await client.query(
  `SELECT status, COUNT(*)::int AS c FROM studentrecords GROUP BY status ORDER BY c DESC`
);
console.log("studentrecords status counts:");
for (const row of r.rows) console.log(`  status="${row.status ?? "(null)"}" → ${row.c} rows`);

const total = await client.query(`SELECT COUNT(*)::int AS c FROM studentrecords`);
console.log(`\nTotal rows in studentrecords: ${total.rows[0].c}`);

await client.end();
