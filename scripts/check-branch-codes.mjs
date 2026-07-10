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

const FA_BRANCHES = [
  { code: "ONL", name: "Online" },
  { code: "ST",  name: "Subang Taipan" },
  { code: "SA",  name: "Setia Alam" },
  { code: "SP",  name: "Sri Petaling" },
  { code: "KD",  name: "Kota Damansara" },
  { code: "PJY", name: "Putrajaya" },
  { code: "AMP", name: "Ampang" },
  { code: "CJY", name: "Cyberjaya" },
  { code: "KLG", name: "Klang" },
  { code: "DA",  name: "Denai Alam" },
  { code: "BBB", name: "Bandar Baru Bangi" },
  { code: "DK",  name: "Danau Kota" },
  { code: "SHA", name: "Shah Alam" },
  { code: "BTHO",name: "Bandar Tun Hussein Onn" },
  { code: "EGR", name: "Eco Grandeur" },
  { code: "BSP", name: "Bandar Seri Putra" },
  { code: "RBY", name: "Bandar Rimbayu" },
  { code: "TSG", name: "Taman Sri Gombak" },
  { code: "KW",  name: "Kota Warisan" },
  { code: "KTG", name: "Kajang TTDI" },
];

const faCodes = new Set(FA_BRANCHES.map(b => b.code));

const faClient = new pg.Client({ connectionString: process.env.FA_DATABASE_URL || process.env.LEADS_DB_URL });
await faClient.connect();
const sr = await faClient.query(`SELECT branch, COUNT(*)::int AS c FROM studentrecords GROUP BY branch ORDER BY c DESC`);
console.log("studentrecords.branch distinct values (live DB):");
let mismatch = 0;
for (const row of sr.rows) {
  const code = (row.branch ?? "").trim().toUpperCase();
  const ok = faCodes.has(code);
  if (!ok) mismatch += row.c;
  console.log(`  ${ok ? "✓" : "✗"}  branch="${row.branch ?? "(null)"}"  → ${row.c} students`);
}
console.log(`\nTotal students in unmatched branches: ${mismatch}`);

console.log("\nFA branches NOT seen in studentrecords:");
const usedCodes = new Set(sr.rows.map(r => (r.branch ?? "").trim().toUpperCase()));
for (const b of FA_BRANCHES) {
  if (!usedCodes.has(b.code)) console.log(`  - ${b.code} (${b.name})`);
}
await faClient.end();
