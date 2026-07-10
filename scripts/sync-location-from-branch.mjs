// For every active BranchStaff row, derive `location` from `branch` using the
// canonical mapping in lib/constants.ts. Department codes (OD, HR, MKT, FNC,
// ACD, IOP) map to "HQ" since those teams sit at HQ. Run with --dry to
// preview, then re-run with --apply to write.
//
//   node scripts/sync-location-from-branch.mjs --dry
//   node scripts/sync-location-from-branch.mjs --apply

import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  try {
    const text = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/i);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}
loadEnv();

const args = process.argv.slice(2);
const dryRun = args.includes("--dry") || !args.includes("--apply");

// branch code → canonical location name (matches lib/constants.ts)
const BRANCH_TO_LOCATION = {
  // Physical branches
  HQ:   "HQ",
  ONL:  "Online",
  ST:   "Subang Taipan",
  SP:   "Sri Petaling",
  SA:   "Setia Alam",
  KD:   "Kota Damansara",
  PJY:  "Putrajaya",
  AMP:  "Ampang",
  CJY:  "Cyberjaya",
  KLG:  "Klang",
  DA:   "Denai Alam",
  BBB:  "Bandar Baru Bangi",
  DK:   "Danau Kota",
  SHA:  "Shah Alam",
  BTHO: "Bandar Tun Hussein Onn",
  EGR:  "Eco Grandeur",
  BSP:  "Bandar Seri Putra",
  RBY:  "Bandar Rimbayu",
  TSG:  "Taman Sri Gombak",
  KW:   "Kota Warisan",
  KTG:  "Kajang",
  // Department codes — staff in these depts work out of HQ
  OD:   "HQ",
  MKT:  "HQ",
  ACD:  "HQ",
  IOP:  "HQ",
  FNC:  "HQ",
  HR:   "HQ",
};

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const pool = new Pool({ connectionString: url });

try {
  const { rows } = await pool.query(
    `SELECT id, name, "employeeId", branch, location, status
       FROM "BranchStaff"
      WHERE status = 'Active'
      ORDER BY name`
  );

  const updates = [];   // rows that will change
  const skipped = [];   // unmapped branch codes
  const noChange = [];  // location already correct

  for (const r of rows) {
    if (!r.branch) {
      skipped.push({ ...r, reason: "branch is null" });
      continue;
    }
    const target = BRANCH_TO_LOCATION[r.branch];
    if (!target) {
      skipped.push({ ...r, reason: `no mapping for branch=${r.branch}` });
      continue;
    }
    if (r.location === target) {
      noChange.push(r);
      continue;
    }
    updates.push({ ...r, newLocation: target });
  }

  console.log(`\nMode: ${dryRun ? "DRY-RUN (use --apply to write)" : "APPLY"}\n`);
  console.log(`Active rows scanned: ${rows.length}`);
  console.log(`  · would change:   ${updates.length}`);
  console.log(`  · already correct:${noChange.length}`);
  console.log(`  · skipped:        ${skipped.length}`);

  if (updates.length > 0) {
    console.log(`\n--- Changes ---`);
    for (const u of updates) {
      console.log(`  ${u.employeeId ?? `id=${u.id}`}  ${u.name?.padEnd(45)?.slice(0, 45)} | branch=${u.branch?.padEnd(5)} | "${u.location ?? "—"}" → "${u.newLocation}"`);
    }
  }

  if (skipped.length > 0) {
    console.log(`\n--- Skipped ---`);
    for (const s of skipped) {
      console.log(`  ${s.employeeId ?? `id=${s.id}`}  ${s.name?.padEnd(45)?.slice(0, 45)} | ${s.reason}`);
    }
  }

  if (dryRun) {
    console.log(`\n(dry run — no changes written. Re-run with --apply to write.)\n`);
  } else {
    let applied = 0;
    for (const u of updates) {
      await pool.query(
        `UPDATE "BranchStaff" SET location = $1 WHERE id = $2`,
        [u.newLocation, u.id]
      );
      applied++;
    }
    console.log(`\n✓ Applied ${applied} updates.\n`);
  }
} catch (err) {
  console.error("Failed:", err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
