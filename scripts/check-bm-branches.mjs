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

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

console.log("BRANCH_MANAGER accounts and their branchName:\n");
const r = await client.query(
  `SELECT email, "branchName", status FROM "User" WHERE role = 'BRANCH_MANAGER' ORDER BY "branchName"`
);
for (const row of r.rows) {
  console.log(`  email=${row.email}  branchName="${row.branchName ?? "(null)"}"  status=${row.status}`);
}

console.log("\nDistinct branchName values for BMs:");
const d = await client.query(
  `SELECT "branchName", COUNT(*)::int AS c FROM "User" WHERE role = 'BRANCH_MANAGER' GROUP BY "branchName" ORDER BY "branchName"`
);
for (const row of d.rows) console.log(`  "${row.branchName ?? "(null)"}" → ${row.c}`);

await client.end();
