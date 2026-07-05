// Raw-`pg` de-dup for CRM leads — a container-safe twin of
// scripts/dedupe-crm-leads.ts.
//
// WHY A SEPARATE SCRIPT: the deployed `ebright-osc-v2` container's Prisma
// client is the driver-adapter engine (Prisma 7 "client"), which rejects both
// `new PrismaClient()` and `{ datasourceUrl }`, and a `docker exec` process
// doesn't inherit the app's DATABASE_URL mapping. Only the raw `pg` driver
// (already bundled as the adapter's dependency) connects cleanly, via
// CRM_DATABASE_URL. This script therefore uses `pg` directly.
//
//   # DRY RUN (default) — reports what it WOULD do, writes nothing:
//   docker exec -i ebright-osc-v2 node scripts/dedupe-crm-leads-pg.mjs
//
//   # APPLY — soft-deletes the redundant leads (reversible: clears via deletedAt):
//   docker exec -i ebright-osc-v2 node scripts/dedupe-crm-leads-pg.mjs --apply
//
// Flags:
//   --apply           Actually write (set deletedAt). Omitted = dry run.
//   --verbose         Print every duplicate group, not just a sample.
//   --all-sources     Consider ALL leads, not only the ingest/CNS-sourced ones.
//   --branch=<id>     Restrict to one branch id.
//
// GROUPING: same person = tenant + branch + normalised phone (email fallback) +
// normalised name. Siblings differ by child name → different groups → never
// merged. SURVIVOR kept per group: most-advanced stage → most stage-history →
// earliest created. Every other member is SOFT-deleted (opportunity + contact).

import { Client } from "pg";

const APPLY = process.argv.includes("--apply");
const VERBOSE = process.argv.includes("--verbose");
const ALL_SOURCES = process.argv.includes("--all-sources");
const BRANCH = process.argv.find((a) => a.startsWith("--branch="))?.split("=")[1] ?? null;

const AFFECTED_SOURCES = [
  "meta_leads",
  "social_posts",
  "raw_wix_leads",
  "new_website_form",
  "trial_form",
];

const url = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("[dedupe-pg] CRM_DATABASE_URL / DATABASE_URL not set — aborting");
  process.exit(1);
}

/** Same phone normalisation the app uses (strip non-digits, drop 60 / leading 0s). */
function phoneKey(raw) {
  if (!raw) return null;
  const core = String(raw).replace(/[^0-9]/g, "").replace(/^(60)?0*/, "");
  return core || null;
}
function personKey(c) {
  const contact = phoneKey(c.phone) ?? (c.email ? c.email.trim().toLowerCase() : null);
  if (!contact) return null; // no way to identify the person — leave it alone
  const name = `${c.firstName} ${c.lastName ?? ""}`.trim().toLowerCase().replace(/\s+/g, " ");
  return `${c.tenantId}|${c.branchId}|${contact}|${name}`;
}

async function main() {
  console.log(`\n=== CRM lead de-dup (pg) ${APPLY ? "(APPLY — WILL WRITE)" : "(dry run)"} ===`);
  console.log(`scope: ${ALL_SOURCES ? "ALL sources" : AFFECTED_SOURCES.join(", ")}${BRANCH ? ` · branch ${BRANCH}` : ""}\n`);

  const c = new Client({ connectionString: url });
  await c.connect();

  const params = [];
  const where = [`o."deletedAt" IS NULL`, `ct."deletedAt" IS NULL`];
  if (!ALL_SOURCES) {
    params.push(AFFECTED_SOURCES);
    where.push(`ct."externalSourceTable" = ANY($${params.length})`);
  }
  if (BRANCH) {
    params.push(BRANCH);
    where.push(`o."branchId" = $${params.length}`);
  }

  const { rows } = await c.query(
    `SELECT o.id AS opp_id, o."contactId", o."createdAt",
            coalesce(s."order", -1)::int  AS stage_order,
            coalesce(h.cnt, 0)::int       AS history_count,
            ct."tenantId", ct."branchId", ct.phone, ct.email,
            ct."firstName", ct."lastName"
       FROM crm.crm_opportunity o
       JOIN crm.crm_contact ct ON ct.id = o."contactId"
       LEFT JOIN crm.crm_stage s ON s.id = o."stageId"
       LEFT JOIN (
         SELECT "opportunityId", count(*) AS cnt
           FROM crm.crm_stage_history GROUP BY "opportunityId"
       ) h ON h."opportunityId" = o.id
      WHERE ${where.join(" AND ")}`,
    params,
  );

  // Group by person.
  const groups = new Map();
  let skippedNoKey = 0;
  for (const o of rows) {
    const key = personKey(o);
    if (!key) { skippedNoKey++; continue; }
    const m = {
      oppId: o.opp_id,
      contactId: o.contactId,
      stageOrder: o.stage_order,
      historyCount: o.history_count,
      createdAt: new Date(o.createdAt),
      name: `${o.firstName} ${o.lastName ?? ""}`.trim(),
    };
    const arr = groups.get(key);
    if (arr) arr.push(m); else groups.set(key, [m]);
  }

  const loserOppIds = [];
  const loserContactIds = [];
  let dupGroups = 0, losersWithHistory = 0;
  const samples = [];

  for (const members of groups.values()) {
    if (members.length < 2) continue;
    dupGroups++;
    const sorted = [...members].sort((a, b) => {
      if (b.stageOrder !== a.stageOrder) return b.stageOrder - a.stageOrder;
      if (b.historyCount !== a.historyCount) return b.historyCount - a.historyCount;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    const survivor = sorted[0];
    const losers = sorted.slice(1);
    for (const l of losers) {
      loserOppIds.push(l.oppId);
      loserContactIds.push(l.contactId);
      if (l.historyCount > 0) losersWithHistory++;
    }
    if (VERBOSE || samples.length < 15) {
      samples.push(
        `  "${survivor.name}" — keep opp ${survivor.oppId.slice(0, 8)} ` +
        `(stageOrder ${survivor.stageOrder}, ${survivor.historyCount} moves) · ` +
        `drop ${losers.length}: ${losers.map((l) => l.oppId.slice(0, 8)).join(", ")}`,
      );
    }
  }

  console.log(`opportunities scanned : ${rows.length}`);
  console.log(`people (groups)       : ${groups.size}`);
  console.log(`skipped (no phone/email): ${skippedNoKey}`);
  console.log(`duplicate groups      : ${dupGroups}`);
  console.log(`leads to soft-delete  : ${loserOppIds.length} (of which ${losersWithHistory} have stage history)`);
  console.log("");
  if (samples.length) {
    console.log(VERBOSE ? "all duplicate groups:" : `sample (first ${samples.length}):`);
    console.log(samples.join("\n"));
    console.log("");
  }

  if (!APPLY) {
    console.log("DRY RUN — nothing written. Re-run with --apply to soft-delete the listed leads.\n");
    await c.end();
    return;
  }
  if (loserOppIds.length === 0) {
    console.log("Nothing to do.\n");
    await c.end();
    return;
  }

  const now = new Date();
  const oppRes = await c.query(
    `UPDATE crm.crm_opportunity SET "deletedAt" = $1 WHERE id = ANY($2) AND "deletedAt" IS NULL`,
    [now, loserOppIds],
  );
  const contactRes = await c.query(
    `UPDATE crm.crm_contact SET "deletedAt" = $1 WHERE id = ANY($2) AND "deletedAt" IS NULL`,
    [now, loserContactIds],
  );
  console.log(`APPLIED — soft-deleted ${oppRes.rowCount} opportunities and ${contactRes.rowCount} contacts.`);
  console.log(`Reversible: clear deletedAt (= '${now.toISOString()}') to restore.\n`);
  await c.end();
}

main().catch((e) => { console.error("[dedupe-pg] failed:", e); process.exitCode = 1; });
