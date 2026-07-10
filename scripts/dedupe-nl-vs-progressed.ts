/**
 * Removes New-Lead-stage kanban cards that are a duplicate (same phone
 * and/or email) of a card for the SAME person that has already moved to any
 * other stage. Scope: only the New Lead card is ever a deletion candidate —
 * a duplicate entirely among non-New-Lead stages (e.g. two Cold Lead cards,
 * or Cold Lead + Enrolled) is left alone; that is a different problem from
 * "an unworked card cluttering the board next to the real, worked one".
 *
 *   # DRY RUN (default) — reports what it WOULD do, writes nothing:
 *   docker exec -i ebright-osc-osc-1 npx tsx scripts/dedupe-nl-vs-progressed.ts
 *
 *   # APPLY:
 *   docker exec -i ebright-osc-osc-1 npx tsx scripts/dedupe-nl-vs-progressed.ts --apply
 *
 * Flags:
 *   --apply       Actually write (set deletedAt). Omitted = dry run.
 *   --verbose     Print every group, not just a sample.
 *   --branch=<id> Restrict to one branch id.
 *
 * MATCHING: two contacts are the "same person cluster" if they share a
 * normalised phone OR a normalised email (union-find, transitive), scoped to
 * the same tenant + branch. Cross-branch matches are deliberately NOT
 * merged — a person can legitimately inquire at two different branches, and
 * that's not the bug this script targets.
 *
 * SIBLING SAFETY: within a phone/email cluster, contacts are further split
 * by normalised name (lowercased, trimmed, " | (...)"-suffix and punctuation
 * stripped — this catches formatting noise like "Ibrahim Macalin Suleiman |
 * ()" vs "Ibrahim Macalin Suleiman" without conflating actually different
 * children). Only contacts whose normalised name matches are treated as the
 * same real lead. A New Lead card is deleted only when a name-matched
 * sibling-safe duplicate exists in a different, non-New-Lead stage.
 *
 * AUDIT: for every deletion candidate, the script looks up the originating
 * master_lead row (via externalSourceId → source_pk) in ebrightleads_db and
 * prints children_count / children_details so a human can eyeball that a
 * true multi-child submission isn't being collapsed.
 */

import { PrismaClient } from "@prisma/client";
import { Client as PgClient } from "pg";

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const VERBOSE = process.argv.includes("--verbose");
const BRANCH = process.argv.find((a) => a.startsWith("--branch="))?.split("=")[1] ?? null;

const LEADS_DB_URL = process.env.LEADS_DB_URL;

function phoneKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const core = String(raw).replace(/[^0-9]/g, "").replace(/^(60)?0*/, "");
  return core || null;
}
function emailKey(raw: string | null | undefined): string | null {
  const e = raw?.trim().toLowerCase();
  return e || null;
}
/** Strip " | (...)" trailing artifacts and punctuation noise so formatting
 * differences don't hide a true duplicate, without touching real name text. */
function nameKey(first: string, last: string | null): string {
  const full = `${first} ${last ?? ""}`;
  const noPipeSuffix = full.split("|")[0];
  return noPipeSuffix
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface Contact {
  id: string;
  branchId: string;
  tenantId: string;
  phone: string | null;
  email: string | null;
  firstName: string;
  lastName: string | null;
  externalSourceTable: string | null;
  externalSourceId: string | null;
  opp: { id: string; stageId: string; stageName: string; stageOrder: number } | null;
}

class DSU {
  parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    let cur = x;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  union(a: string, b: string) {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

async function main() {
  console.log(`\n=== NL-vs-progressed dedupe ${APPLY ? "(APPLY — WILL WRITE)" : "(dry run)"} ===`);
  console.log(`scope: all sources${BRANCH ? ` · branch ${BRANCH}` : ""}\n`);

  const stages = await prisma.crm_stage.findMany({ select: { id: true, name: true, order: true } });
  const stageById = new Map(stages.map((s) => [s.id, s]));

  const opps = await prisma.crm_opportunity.findMany({
    where: {
      deletedAt: null,
      ...(BRANCH ? { branchId: BRANCH } : {}),
      contact: { deletedAt: null },
    },
    select: {
      id: true, stageId: true, contactId: true,
      contact: {
        select: {
          id: true, tenantId: true, branchId: true, phone: true, email: true,
          firstName: true, lastName: true, externalSourceTable: true, externalSourceId: true,
        },
      },
    },
  });

  const contacts: Contact[] = opps.map((o) => {
    const st = stageById.get(o.stageId)!;
    return {
      id: o.contact.id,
      branchId: o.contact.branchId,
      tenantId: o.contact.tenantId,
      phone: o.contact.phone,
      email: o.contact.email,
      firstName: o.contact.firstName,
      lastName: o.contact.lastName,
      externalSourceTable: o.contact.externalSourceTable,
      externalSourceId: o.contact.externalSourceId,
      opp: { id: o.id, stageId: o.stageId, stageName: st.name, stageOrder: st.order },
    };
  });

  // Union-find by phone-or-email, scoped to tenant+branch.
  const dsu = new DSU();
  const byPhone = new Map<string, string[]>(); // scope key -> contact ids
  const byEmail = new Map<string, string[]>();
  for (const c of contacts) {
    dsu.find(c.id);
    const scope = `${c.tenantId}|${c.branchId}`;
    const pk = phoneKey(c.phone);
    if (pk) {
      const key = `${scope}|p|${pk}`;
      const arr = byPhone.get(key) ?? [];
      for (const other of arr) dsu.union(c.id, other);
      arr.push(c.id);
      byPhone.set(key, arr);
    }
    const ek = emailKey(c.email);
    if (ek) {
      const key = `${scope}|e|${ek}`;
      const arr = byEmail.get(key) ?? [];
      for (const other of arr) dsu.union(c.id, other);
      arr.push(c.id);
      byEmail.set(key, arr);
    }
  }

  const byId = new Map(contacts.map((c) => [c.id, c]));
  const clusters = new Map<string, string[]>();
  for (const c of contacts) {
    const root = dsu.find(c.id);
    (clusters.get(root) ?? clusters.set(root, []).get(root)!).push(c.id);
  }

  // Within each phone/email cluster, sub-group by normalised name.
  const loserOppIds: string[] = [];
  const loserContactIds: string[] = [];
  const auditLines: string[] = [];
  let nameGroupsConsidered = 0;
  let nameGroupsWithDeletion = 0;

  for (const [, ids] of clusters) {
    if (ids.length < 2) continue; // no phone/email match at all — nothing to do
    const members = ids.map((id) => byId.get(id)!);
    const byName = new Map<string, Contact[]>();
    for (const m of members) {
      const nk = nameKey(m.firstName, m.lastName);
      (byName.get(nk) ?? byName.set(nk, []).get(nk)!).push(m);
    }
    for (const [nk, group] of byName) {
      if (group.length < 2) continue; // this named person only has one card — untouched
      nameGroupsConsidered++;
      const nlMembers = group.filter((g) => g.opp!.stageName === "New Lead");
      const otherMembers = group.filter((g) => g.opp!.stageName !== "New Lead");
      if (nlMembers.length === 0 || otherMembers.length === 0) continue; // no NL-vs-worked pair
      nameGroupsWithDeletion++;
      for (const l of nlMembers) {
        loserOppIds.push(l.opp!.id);
        loserContactIds.push(l.id);
      }
      if (VERBOSE || auditLines.length < 300) {
        const survivorDesc = otherMembers.map((o) => `${o.opp!.stageName} (opp ${o.opp!.id.slice(0, 8)})`).join(", ");
        const dropDesc = nlMembers.map((o) => o.opp!.id.slice(0, 8)).join(", ");
        auditLines.push(
          `  "${nk}" [phone=${group[0].phone ?? "-"} email=${group[0].email ?? "-"}] ` +
          `— keep: ${survivorDesc} · drop NL: ${dropDesc}`,
        );
      }
    }
  }

  console.log(`opportunities scanned      : ${opps.length}`);
  console.log(`phone/email clusters (2+)  : ${[...clusters.values()].filter((v) => v.length > 1).length}`);
  console.log(`name-groups considered     : ${nameGroupsConsidered}`);
  console.log(`name-groups w/ NL+other    : ${nameGroupsWithDeletion}`);
  console.log(`New Lead cards to delete   : ${loserOppIds.length}`);
  console.log("");
  if (auditLines.length) {
    console.log(VERBOSE ? "all groups:" : `sample (first ${auditLines.length}):`);
    console.log(auditLines.join("\n"));
    console.log("");
  }

  // Cross-check against master_lead children_count/children_details for a
  // sample of the deletions, so a human can confirm multi-child submissions
  // aren't being collapsed.
  if (LEADS_DB_URL && loserContactIds.length) {
    const pg = new PgClient({ connectionString: LEADS_DB_URL });
    await pg.connect();
    console.log(`--- master_lead cross-check for ALL ${loserContactIds.length} deletions (only printing children_count > 1, i.e. real risk cases) ---`);
    let checked = 0, flagged = 0, noRow = 0;
    for (const cid of loserContactIds) {
      const c = byId.get(cid)!;
      const m = c.externalSourceId?.match(/^(.*)-(\d+)-(\d+)$/);
      if (!m) continue;
      const sourcePk = m[1];
      const res = await pg.query(
        `select children_count, children_details from public.master_lead where source_pk = $1 and source_table = $2 limit 1`,
        [sourcePk, c.externalSourceTable],
      );
      checked++;
      if (res.rows.length === 0) { noRow++; continue; }
      if (res.rows[0].children_count > 1) {
        flagged++;
        console.log(`  ${cid.slice(0, 8)} (${c.firstName} ${c.lastName ?? ""}) — children_count=${res.rows[0].children_count} children_details=${JSON.stringify(res.rows[0].children_details)}`);
      }
    }
    console.log(`checked=${checked} noMasterLeadRow=${noRow} childrenCountGT1=${flagged}`);
    await pg.end();
    console.log("");
  }

  if (!APPLY) {
    console.log("DRY RUN — nothing written. Re-run with --apply to soft-delete the listed New Lead cards.\n");
    return;
  }
  if (loserOppIds.length === 0) {
    console.log("Nothing to do.\n");
    return;
  }

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
  .catch((e) => { console.error("[dedupe-nl-vs-progressed] failed:", e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
