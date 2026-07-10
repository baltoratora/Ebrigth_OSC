/**
 * One-off cleanup for the duplicate leads created by the non-deterministic
 * ingest key (lib/crm/leads-import.ts) and the non-idempotent CNS trial form
 * (app/api/crm/forms/trial-submit). Both are fixed at the source; this removes
 * the duplicates already sitting on the board.
 *
 *   # DRY RUN (default) — reports what it WOULD do, writes nothing:
 *   docker exec -i ebright-osc-osc-1 npx tsx scripts/dedupe-crm-leads.ts
 *
 *   # APPLY — soft-deletes the redundant leads:
 *   docker exec -i ebright-osc-osc-1 npx tsx scripts/dedupe-crm-leads.ts --apply
 *
 * Flags:
 *   --apply           Actually write (set deletedAt). Omitted = dry run.
 *   --verbose         Print every duplicate group, not just a sample.
 *   --all-sources     Also consider manually-created / other leads (default:
 *                     only ingest + trial_form sourced leads, which is where
 *                     the bug produced dupes — safest scope).
 *   --branch=<id>     Restrict to one branch id.
 *
 * GROUPING: leads are the same person when they share tenant + branch +
 * normalised phone (email fallback) + normalised name. Siblings differ by child
 * name, so they land in different groups and are never merged.
 *
 * SURVIVOR (kept): the most-advanced stage → then the most stage-history
 * (most-worked) → then the earliest created (the original). Every other member
 * of the group is a candidate loser, but only the ones actually still sitting
 * in New Lead or Cold Lead get SOFT-deleted (deletedAt on both the
 * opportunity and its contact — reversible). A "loser" that has been moved to
 * any other stage (Follow-Up, Trial, Enrolled, Unresponsive, Do Not Disturb,
 * etc.) is LEFT ALONE even though it lost the group comparison — someone
 * worked that card, and an untouched-but-duplicate lead is a much smaller
 * problem than silently disappearing a lead a staff member progressed. Those
 * skipped duplicates are reported separately so a human can reconcile them.
 * Nothing is hard-deleted; survivors are never touched.
 *
 * CAVEAT: notes / appointments / history attached to a soft-deleted loser are
 * NOT merged onto the survivor. The survivor rule keeps the most-worked card to
 * minimise lost context; the count of losers that still carried history is
 * reported so you can eyeball it before --apply.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const VERBOSE = process.argv.includes("--verbose");
const ALL_SOURCES = process.argv.includes("--all-sources");
const BRANCH = process.argv.find((a) => a.startsWith("--branch="))?.split("=")[1] ?? null;

// Tables whose leads the two bugs could duplicate. `new_website_form` is the
// roadshow/website intake surfaced by master_leads_unified — it produces the
// bulk of the same-person dupes (upstream emits several rows per submission),
// so it MUST be in scope or the default run silently misses them.
const AFFECTED_SOURCES = [
  "meta_leads",
  "social_posts",
  "raw_wix_leads",
  "new_website_form",
  "trial_form",
];

// Only a duplicate sitting in one of these stages is safe to auto-remove — it
// was never worked (New Lead) or was abandoned (Cold Lead). Anything else
// means a human touched it; deleting it risks losing real progress.
const DELETABLE_STAGE_NAMES = new Set(["New Lead", "Cold Lead"]);

/** Same phone normalisation the app uses (strip non-digits, drop 60 / leading 0s). */
function phoneKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const core = String(raw).replace(/[^0-9]/g, "").replace(/^(60)?0*/, "");
  return core || null;
}
function personKey(c: {
  tenantId: string; branchId: string; phone: string | null; email: string | null;
  firstName: string; lastName: string | null;
}): string | null {
  const contact = phoneKey(c.phone) ?? c.email?.trim().toLowerCase() ?? null;
  if (!contact) return null; // no way to identify the person — leave it alone
  const name = `${c.firstName} ${c.lastName ?? ""}`.trim().toLowerCase().replace(/\s+/g, " ");
  return `${c.tenantId}|${c.branchId}|${contact}|${name}`;
}

interface Member {
  oppId: string;
  contactId: string;
  stageOrder: number;
  historyCount: number;
  createdAt: Date;
  name: string;
  stageId: string;
}

async function main() {
  console.log(`\n=== CRM lead de-dup ${APPLY ? "(APPLY — WILL WRITE)" : "(dry run)"} ===`);
  console.log(`scope: ${ALL_SOURCES ? "ALL sources" : AFFECTED_SOURCES.join(", ")}${BRANCH ? ` · branch ${BRANCH}` : ""}\n`);

  const stages = await prisma.crm_stage.findMany({ select: { id: true, order: true, name: true } });
  const orderById = new Map(stages.map((s) => [s.id, s.order]));
  const deletableStageIds = new Set(
    stages.filter((s) => DELETABLE_STAGE_NAMES.has(s.name)).map((s) => s.id),
  );

  const opps = await prisma.crm_opportunity.findMany({
    where: {
      deletedAt: null,
      ...(BRANCH ? { branchId: BRANCH } : {}),
      contact: {
        deletedAt: null,
        ...(ALL_SOURCES ? {} : { externalSourceTable: { in: AFFECTED_SOURCES } }),
      },
    },
    select: {
      id: true, stageId: true, createdAt: true, contactId: true,
      contact: {
        select: { id: true, tenantId: true, branchId: true, phone: true, email: true, firstName: true, lastName: true },
      },
      _count: { select: { stageHistory: true } },
    },
  });

  // Group by person.
  const groups = new Map<string, Member[]>();
  let skippedNoKey = 0;
  for (const o of opps) {
    const key = personKey(o.contact);
    if (!key) { skippedNoKey++; continue; }
    const m: Member = {
      oppId: o.id,
      contactId: o.contactId,
      stageOrder: orderById.get(o.stageId) ?? -1,
      historyCount: o._count.stageHistory,
      createdAt: o.createdAt,
      name: `${o.contact.firstName} ${o.contact.lastName ?? ""}`.trim(),
      stageId: o.stageId,
    };
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(m);
  }

  // Pick survivor per group; collect losers.
  const loserOppIds: string[] = [];
  const loserContactIds: string[] = [];
  let dupGroups = 0;
  let losersWithHistory = 0;
  let losersKeptStageProgressed = 0;
  const samples: string[] = [];
  const keptSamples: string[] = [];

  for (const [, members] of groups) {
    if (members.length < 2) continue;
    dupGroups++;
    const sorted = [...members].sort((a, b) => {
      if (b.stageOrder !== a.stageOrder) return b.stageOrder - a.stageOrder; // most advanced
      if (b.historyCount !== a.historyCount) return b.historyCount - a.historyCount; // most worked
      return a.createdAt.getTime() - b.createdAt.getTime(); // earliest original
    });
    const survivor = sorted[0];
    const allLosers = sorted.slice(1);
    // Only actually remove a loser still sitting in New Lead / Cold Lead. A
    // loser that was moved to any other stage was worked by someone — leave
    // it on the board even though it "lost" the group comparison.
    const losers = allLosers.filter((l) => deletableStageIds.has(l.stageId));
    const keptDespiteDuplicate = allLosers.filter((l) => !deletableStageIds.has(l.stageId));
    for (const l of losers) {
      loserOppIds.push(l.oppId);
      loserContactIds.push(l.contactId);
      if (l.historyCount > 0) losersWithHistory++;
    }
    losersKeptStageProgressed += keptDespiteDuplicate.length;
    if (VERBOSE || samples.length < 15) {
      if (losers.length) {
        samples.push(
          `  "${survivor.name}" — keep opp ${survivor.oppId.slice(0, 8)} ` +
          `(stageOrder ${survivor.stageOrder}, ${survivor.historyCount} moves) · ` +
          `drop ${losers.length}: ${losers.map((l) => l.oppId.slice(0, 8)).join(", ")}`,
        );
      }
    }
    if ((VERBOSE || keptSamples.length < 15) && keptDespiteDuplicate.length) {
      keptSamples.push(
        `  "${survivor.name}" — duplicate(s) left in place (progressed stage): ` +
        keptDespiteDuplicate.map((l) => `${l.oppId.slice(0, 8)} (stageOrder ${l.stageOrder})`).join(", "),
      );
    }
  }

  console.log(`opportunities scanned : ${opps.length}`);
  console.log(`people (groups)       : ${groups.size}`);
  console.log(`skipped (no phone/email): ${skippedNoKey}`);
  console.log(`duplicate groups      : ${dupGroups}`);
  console.log(`leads to soft-delete  : ${loserOppIds.length} (of which ${losersWithHistory} have stage history)`);
  console.log(`duplicates LEFT IN PLACE (moved past New Lead/Cold Lead): ${losersKeptStageProgressed}`);
  console.log("");
  if (keptSamples.length) {
    console.log(VERBOSE ? "all duplicates left in place:" : `sample of duplicates left in place (first ${keptSamples.length}):`);
    console.log(keptSamples.join("\n"));
    console.log("");
  }
  if (samples.length) {
    console.log(VERBOSE ? "all duplicate groups:" : `sample (first ${samples.length}):`);
    console.log(samples.join("\n"));
    console.log("");
  }

  if (!APPLY) {
    console.log("DRY RUN — nothing written. Re-run with --apply to soft-delete the listed leads.\n");
    return;
  }
  if (loserOppIds.length === 0) {
    console.log("Nothing to do.\n");
    return;
  }

  // Soft-delete in chunks (both the opportunity and its contact, since board
  // queries filter on either).
  const now = new Date();
  const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
  let doneOpp = 0, doneContact = 0;
  for (const ids of chunk(loserOppIds, 500)) {
    const r = await prisma.crm_opportunity.updateMany({ where: { id: { in: ids }, deletedAt: null }, data: { deletedAt: now } });
    doneOpp += r.count;
  }
  for (const ids of chunk(loserContactIds, 500)) {
    const r = await prisma.crm_contact.updateMany({ where: { id: { in: ids }, deletedAt: null }, data: { deletedAt: now } });
    doneContact += r.count;
  }
  console.log(`APPLIED — soft-deleted ${doneOpp} opportunities and ${doneContact} contacts.`);
  console.log(`Reversible: clear deletedAt (= '${now.toISOString()}') to restore.\n`);
}

main()
  .catch((e) => { console.error("[dedupe-crm-leads] failed:", e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
