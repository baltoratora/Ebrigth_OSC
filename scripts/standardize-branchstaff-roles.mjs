// One-off migration: standardise BranchStaff.role naming.
//
// Targets the HRFS database (where BranchStaff physically lives) — the crm
// FDW view reflects the change live. Dry-run by default; pass --apply to write.
//
//   node scripts/standardize-branchstaff-roles.mjs           # preview only
//   node scripts/standardize-branchstaff-roles.mjs --apply   # perform updates
//
// Mapping (decided with HR):
//   "PT - Coach"      -> "PT Coach"
//   "FT - Coach"      -> "FT Coach"
//   "Part Time"       -> "PT Coach"
//   "Executive/Coach" -> "FT EXEC"
// Everything else (CEO, FT HOD, FT EXEC, BM, INT) is already canonical.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";

const url = process.env.HRFS_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("No HRFS_DATABASE_URL / DATABASE_URL set.");
  process.exit(1);
}
const prisma = new PrismaClient({ datasourceUrl: url });

const RENAMES = [
  { from: "PT - Coach", to: "PT Coach" },
  { from: "FT - Coach", to: "FT Coach" },
  { from: "Part Time", to: "PT Coach" },
  { from: "Executive/Coach", to: "FT EXEC" },
];

const apply = process.argv.includes("--apply");

async function snapshot() {
  const rows = await prisma.branchStaff.groupBy({ by: ["role"], _count: { _all: true } });
  rows.sort((a, b) => b._count._all - a._count._all);
  return rows;
}

console.log(`Connected to: ${url.split("@")[1]}`);
console.log(apply ? "\n*** APPLY MODE — rows will be updated ***\n" : "\n--- DRY RUN (no changes) — pass --apply to write ---\n");

console.log("BEFORE:");
for (const r of await snapshot()) console.log(`  ${String(r._count._all).padStart(4)}  ${JSON.stringify(r.role)}`);

console.log("\nPlanned changes:");
let total = 0;
for (const { from, to } of RENAMES) {
  const n = await prisma.branchStaff.count({ where: { role: from } });
  total += n;
  console.log(`  ${String(n).padStart(4)}  ${JSON.stringify(from)} -> ${JSON.stringify(to)}`);
}
console.log(`  ${String(total).padStart(4)}  total rows affected`);

if (apply && total > 0) {
  await prisma.$transaction(RENAMES.map(({ from, to }) =>
    prisma.branchStaff.updateMany({ where: { role: from }, data: { role: to } }),
  ));
  console.log("\nAFTER:");
  for (const r of await snapshot()) console.log(`  ${String(r._count._all).padStart(4)}  ${JSON.stringify(r.role)}`);
  console.log("\nDone.");
} else if (!apply) {
  console.log("\nNothing written. Re-run with --apply to perform the migration.");
}

await prisma.$disconnect();
