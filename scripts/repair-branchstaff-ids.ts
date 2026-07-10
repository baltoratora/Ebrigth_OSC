// Run dry-run:  npx tsx scripts/repair-branchstaff-ids.ts
// Run apply:    npx tsx scripts/repair-branchstaff-ids.ts --apply
//
// Bulk-repairs BranchStaff.employeeId by combining two evidence sources:
//   A) Historical empName values in AttendanceLog
//   B) CSV-derived scannerRef from public/employees.csv (if present)
//
// Only HIGH-confidence proposals (exact name/nickname or multi-source agreement)
// are committed when --apply is passed. Conflicts and weak matches are skipped.

import { prisma } from "../lib/prisma";
import * as fs from "fs";
import * as path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

type Confidence =
  | "MULTIPLE_SOURCES_AGREE"
  | "EXACT_NICKNAME"
  | "EXACT_NAME"
  | "FIRST_TOKEN"
  | "CSV";

const HIGH_CONFIDENCE: Confidence[] = ["MULTIPLE_SOURCES_AGREE", "EXACT_NICKNAME", "EXACT_NAME"];

interface Staff {
  id: number;
  name: string | null;
  nickname: string | null;
  employeeId: string | null;
  location: string | null;
}

interface Evidence {
  empNo: string;
  confidence: Confidence;
  source: "log" | "csv";
  detail: string;
}

interface Proposal {
  staff: Staff;
  empNo: string;
  confidence: Confidence;
  detail: string;
  hasCollision: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ci = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const firstToken = (s: string | null | undefined) =>
  ci(s).split(/[\s/]+/).filter(Boolean)[0] ?? "";

function isValidEmpNo(empNo: string): boolean {
  return /^\d{6,10}$/.test(empNo);
}

function parseCSVLine(line: string): string[] {
  const cols: string[] = [];
  let cur = "";
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === "," && !q) { cols.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  cols.push(cur.trim());
  return cols.map(c => c.replace(/^"|"$/g, ""));
}

function loadCSV(): Map<string, string> {
  const csvPath = path.join(process.cwd(), "public", "employees.csv");
  if (!fs.existsSync(csvPath)) return new Map();
  const text = fs.readFileSync(csvPath, "utf-8");
  const map = new Map<string, string>();
  for (const line of text.trim().split("\n").slice(2)) {
    const cols = parseCSVLine(line);
    if (cols.length < 4) continue;
    const name = (cols[0] ?? "").trim();
    const eid  = (cols[8] ?? "").trim();
    const parts = eid.split(" ");
    if (parts.length !== 3) continue;
    const scannerRef = parts[1] + parts[0].substring(0, 2) + parts[2];
    if (!isValidEmpNo(scannerRef) || !name) continue;
    map.set(scannerRef, name);
  }
  return map;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const apply = process.argv.includes("--apply");

  // ── Load data ────────────────────────────────────────────────────────────
  const staff: Staff[] = await prisma.branchStaff.findMany({
    where: { status: "Active" },
    select: { id: true, name: true, nickname: true, employeeId: true, location: true },
    orderBy: { name: "asc" },
  });

  const logRows = await prisma.attendanceLog.findMany({
    select: { empNo: true, empName: true },
  });

  // distinct (empNo, empName) where empName is non-empty and != empNo
  const pairKey = (e: string, n: string) => `${e}|${n}`;
  const pairCounts = new Map<string, number>();
  for (const r of logRows) {
    if (!r.empName || r.empName === r.empNo) continue;
    const k = pairKey(r.empNo, r.empName);
    pairCounts.set(k, (pairCounts.get(k) ?? 0) + 1);
  }
  const logPairs = Array.from(pairCounts.entries()).map(([k, count]) => {
    const [empNo, empName] = k.split("|");
    return { empNo, empName, count };
  });

  // distinct scanner IDs ever seen
  const scannerIds = new Set(logRows.map(r => r.empNo));

  const csvMap = loadCSV();

  // Currently-correct mappings (don't touch these, and they reserve empNos)
  const reservedEmpNos = new Set<string>();
  for (const s of staff) {
    if (s.employeeId && scannerIds.has(s.employeeId)) reservedEmpNos.add(s.employeeId);
  }

  const broken = staff.filter(s => !s.employeeId || !scannerIds.has(s.employeeId));
  const goodCount = staff.length - broken.length;

  // ── Build evidence per broken staff ──────────────────────────────────────
  const proposals: Proposal[]     = [];
  const conflicts: { staff: Staff; evidence: Evidence[] }[] = [];
  const unresolved: Staff[]       = [];

  for (const s of broken) {
    const evidence: Evidence[] = [];

    // Evidence A — AttendanceLog empName matching
    for (const { empNo, empName, count } of logPairs) {
      if (!isValidEmpNo(empNo)) continue;
      // Skip empNos already correctly assigned to *another* staff record
      if (reservedEmpNos.has(empNo)) continue;

      if (s.nickname && ci(s.nickname) === ci(empName)) {
        evidence.push({ empNo, confidence: "EXACT_NICKNAME", source: "log",
          detail: `Nickname '${s.nickname}' in AttendanceLog rows (${count} occurrences, empNo=${empNo})` });
      } else if (s.name && ci(s.name) === ci(empName)) {
        evidence.push({ empNo, confidence: "EXACT_NAME", source: "log",
          detail: `Name '${s.name}' in AttendanceLog rows (${count} occurrences, empNo=${empNo})` });
      } else if (s.name && firstToken(s.name) && firstToken(s.name) === firstToken(empName)) {
        evidence.push({ empNo, confidence: "FIRST_TOKEN", source: "log",
          detail: `First token '${firstToken(s.name)}' matches AttendanceLog empName '${empName}' (${count} occurrences, empNo=${empNo})` });
      }
    }

    // Evidence B — CSV scannerRef matching
    if (s.name) {
      const sName = ci(s.name);
      for (const [empNo, csvName] of csvMap) {
        if (!isValidEmpNo(empNo)) continue;
        if (reservedEmpNos.has(empNo)) continue;
        const cName = ci(csvName);
        if (sName.includes(cName) || cName.includes(sName)) {
          evidence.push({ empNo, confidence: "CSV", source: "csv",
            detail: `CSV name '${csvName}' matches BranchStaff name '${s.name}' (empNo=${empNo})` });
        }
      }
    }

    if (evidence.length === 0) {
      unresolved.push(s);
      continue;
    }

    // Group by empNo
    const byEmpNo = new Map<string, Evidence[]>();
    for (const e of evidence) {
      if (!byEmpNo.has(e.empNo)) byEmpNo.set(e.empNo, []);
      byEmpNo.get(e.empNo)!.push(e);
    }

    if (byEmpNo.size > 1) {
      conflicts.push({ staff: s, evidence });
      continue;
    }

    // Single empNo target — pick the strongest confidence among its evidence
    const [empNo, evList] = [...byEmpNo.entries()][0];
    const order: Confidence[] = ["EXACT_NICKNAME", "EXACT_NAME", "FIRST_TOKEN", "CSV"];
    const best = evList.reduce((a, b) => (order.indexOf(a.confidence) <= order.indexOf(b.confidence) ? a : b));
    const sources = new Set(evList.map(e => e.source));
    const finalConfidence: Confidence = sources.size > 1 ? "MULTIPLE_SOURCES_AGREE" : best.confidence;
    const detail = sources.size > 1
      ? `Both AttendanceLog and CSV agree → empNo=${empNo}`
      : best.detail;

    proposals.push({
      staff: s,
      empNo,
      confidence: finalConfidence,
      detail,
      hasCollision: reservedEmpNos.has(empNo),
    });
  }

  // ── Print Stage 1 ────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("   BranchStaff ID Repair — Stage 1: Audit & Propose");
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("");
  console.log("📊 Audit Summary:");
  console.log(`   Active BranchStaff:              ${staff.length}`);
  console.log(`   Distinct scanner IDs in logs:    ${scannerIds.size}`);
  console.log(`   Already correct (valid matches): ${goodCount}`);
  console.log(`   Need fixing:                     ${broken.length}`);
  console.log(`   CSV evidence available:          ${csvMap.size > 0 ? "Yes" : "No (file not found)"}`);
  console.log("");

  const isHigh = (c: Confidence) => HIGH_CONFIDENCE.includes(c);
  const high = proposals.filter(p => isHigh(p.confidence));
  const medium = proposals.filter(p => !isHigh(p.confidence));

  const printRow = (p: Proposal) => {
    const name = (p.staff.name ?? "—").padEnd(45);
    const cur  = (p.staff.employeeId ?? "—").padEnd(12);
    const prop = p.empNo.padEnd(12);
    const conf = p.confidence.padEnd(22);
    const col  = p.hasCollision ? "⚠ COLLISION" : "✓";
    console.log(`${name} ${cur} → ${prop} ${conf} ${col}`);
    console.log(`  └─ ${p.detail}`);
  };

  console.log("📋 Proposals by Confidence:");
  console.log("");
  console.log("HIGH CONFIDENCE (will be applied with --apply):");
  console.log("");
  if (high.length === 0) console.log("  (none)");
  else {
    console.log(`${"Name".padEnd(45)} ${"Current".padEnd(12)}   ${"Proposed".padEnd(12)} ${"Confidence".padEnd(22)} Status`);
    console.log("─".repeat(105));
    for (const p of high) printRow(p);
  }
  console.log("");

  console.log("MEDIUM CONFIDENCE (review before applying):");
  console.log("");
  if (medium.length === 0) console.log("  (none)");
  else {
    console.log(`${"Name".padEnd(45)} ${"Current".padEnd(12)}   ${"Proposed".padEnd(12)} ${"Confidence".padEnd(22)} Status`);
    console.log("─".repeat(105));
    for (const p of medium) printRow(p);
  }
  console.log("");

  console.log(`⚠️  CONFLICTS (${conflicts.length}): Multiple sources disagree — SKIPPED (manual review needed):`);
  console.log("");
  for (const c of conflicts) {
    console.log(`  ${c.staff.name ?? "—"} (current ID: ${c.staff.employeeId ?? "—"})`);
    const bySource = new Map<string, Set<string>>();
    for (const ev of c.evidence) {
      if (!bySource.has(ev.source)) bySource.set(ev.source, new Set());
      bySource.get(ev.source)!.add(ev.empNo);
    }
    for (const [src, set] of bySource) {
      const label = src === "log" ? "AttendanceLog" : "CSV";
      console.log(`    Source ${label === "AttendanceLog" ? "A" : "B"} (${label}): proposes empNo=${[...set].join(", ")}`);
    }
  }
  console.log("");

  console.log(`❓ UNRESOLVED (${unresolved.length}): No evidence found — SKIPPED:`);
  console.log("");
  for (const s of unresolved) {
    console.log(`  ${s.name ?? "—"} (current ID: ${s.employeeId ?? "—"}) - Location: ${s.location ?? "—"}`);
  }
  console.log("");

  console.log("✅ Summary:");
  console.log(`   High-Confidence Ready:    ${high.length}`);
  console.log(`   Medium-Confidence Ready:  ${medium.length}`);
  console.log(`   Conflicts (need manual):  ${conflicts.length}`);
  console.log(`   Unresolved (no evidence): ${unresolved.length}`);
  console.log("");

  if (!apply) {
    console.log("💡 Next Step:");
    console.log("   Review the proposals above. If satisfied, run:");
    console.log("      npx tsx scripts/repair-branchstaff-ids.ts --apply");
    console.log("");
    console.log("   This will apply ONLY high-confidence proposals (EXACT_NICKNAME, EXACT_NAME, MULTIPLE_SOURCES_AGREE).");
    console.log("   Medium-confidence proposals will be skipped. Resolve conflicts manually and re-run.");
    return;
  }

  // ── Stage 2 — Apply ──────────────────────────────────────────────────────
  const safe = high.filter(p => !p.hasCollision && isValidEmpNo(p.empNo));
  const collisionCount = high.length - safe.length;
  const skippedCount   = medium.length;

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const snapPath = path.join("scripts", `branchstaff-snapshot-${ts}.json`);
  const snapshot = safe.map(p => ({
    id: p.staff.id,
    name: p.staff.name,
    currentEmployeeId: p.staff.employeeId,
  }));
  fs.writeFileSync(snapPath, JSON.stringify(snapshot, null, 2));

  console.log(`🚀 APPLY MODE: Committing ${safe.length} high-confidence updates...`);
  console.log("");
  console.log(`📸 Snapshot: ${snapPath}`);
  console.log("");

  try {
    await prisma.$transaction(async tx => {
      for (const p of safe) {
        await tx.branchStaff.update({
          where: { id: p.staff.id },
          data:  { employeeId: p.empNo },
        });
        console.log(`✓ ${p.staff.name ?? "—"}: ${p.staff.employeeId ?? "—"} → ${p.empNo}`);
      }
    });
  } catch (err) {
    console.error("");
    console.error("✗ Transaction failed — no changes were committed.");
    console.error(`  Error: ${err instanceof Error ? err.message : String(err)}`);
    console.error(`  Snapshot preserved at: ${snapPath}`);
    process.exit(1);
  }

  console.log("");
  console.log(`✅ Applied: ${safe.length} | ⏭️  Skipped (medium-confidence): ${skippedCount} | ⚠️  Collision: ${collisionCount}`);
  console.log("");
  console.log(`💾 Rollback available: ${snapPath}`);
}

main().finally(() => prisma.$disconnect());
