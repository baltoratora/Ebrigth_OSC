// Set branch-manager working hours from the BM rotation + branch working-hours.
//
//   Dry-run (default):  npx tsx scripts/seed-bm-working-hours.ts
//   Commit changes:     npx tsx scripts/seed-bm-working-hours.ts --commit
//
// Each BM works Wed–Sun (Mon/Tue off). ROTATION maps each weekday to a location:
//   "HQ"        → they travel to HQ that day → HQ_HOURS (11:30–20:30, confirmed)
//   branch code → BRANCH_HOURS[code][weekday] (from "working hours.pdf")
// The resulting { Mon..Sun } schedule is written to BranchStaff.workingHours,
// which drives the Late / Clocked-Out indicators on the attendance pages.
//
// Times below are the 24-hour reading of the 12-hour PDF (weekday = evening
// classes, weekend = day shift). If a rostered branch has no hours for that day
// (the branch isn't operating), the BM goes to HQ instead → HQ_HOURS.
import { prisma } from "@/lib/prisma";

type Slot = { start: string; end: string };
type DayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

// HQ shift — confirmed 11:30am to 8:30pm.
const HQ_HOURS: Slot = { start: "11:30", end: "20:30" };

// 24-hour reading of working hours.pdf, per branch per weekday.
const BRANCH_HOURS: Record<string, Partial<Record<DayKey, Slot>>> = {
  ST:  { Wed: s("17:00", "22:00"), Thu: s("16:15", "22:00"), Fri: s("16:15", "22:00"), Sat: s("08:45", "20:30"), Sun: s("08:45", "21:15") },
  KD:  { Thu: s("17:00", "22:15"), Fri: s("17:00", "22:15"), Sat: s("08:45", "19:15"), Sun: s("08:45", "19:15") },
  SP:  { Fri: s("17:00", "22:00"), Sat: s("08:45", "19:15"), Sun: s("08:45", "19:15") },
  SA:  { Thu: s("17:00", "22:00"), Fri: s("17:00", "22:00"), Sat: s("08:45", "19:15"), Sun: s("08:45", "19:15") },
  AMP: { Thu: s("17:00", "22:00"), Fri: s("17:00", "22:00"), Sat: s("08:45", "19:15"), Sun: s("08:45", "19:15") },
  CJY: { Thu: s("17:00", "22:00"), Fri: s("17:00", "22:00"), Sat: s("08:45", "19:15"), Sun: s("08:45", "19:15") },
  BBB: { Thu: s("17:00", "22:00"), Fri: s("17:00", "22:00"), Sat: s("08:45", "19:15"), Sun: s("08:45", "19:15") },
  SHA: { Thu: s("17:00", "22:00"), Fri: s("17:00", "22:00"), Sat: s("08:45", "19:15"), Sun: s("08:45", "19:15") },
  DA:  { Fri: s("17:00", "22:15"), Sat: s("08:45", "19:15"), Sun: s("08:45", "19:15") }, // Thu blank in PDF
  KTG: { Thu: s("17:00", "22:00"), Fri: s("17:00", "22:00"), Sat: s("08:45", "19:15"), Sun: s("08:45", "19:15") },
  RBY: { Sat: s("08:45", "19:15"), Sun: s("08:45", "19:15") },
  TSG: { Wed: s("16:30", "18:30"), Thu: s("17:00", "22:15"), Fri: s("17:00", "22:15"), Sat: s("08:45", "19:15"), Sun: s("08:45", "19:15") },
  KW:  { Fri: s("17:00", "22:00"), Sat: s("08:45", "19:15"), Sun: s("08:45", "19:15") },
  PJY: { Sat: s("09:00", "19:00"), Sun: s("09:00", "17:00") }, // Thu/Fri blank in PDF
  KLG: { Thu: s("17:00", "22:00"), Fri: s("17:00", "22:00"), Sat: s("08:45", "19:15"), Sun: s("08:45", "19:15") },
  BSP: { Thu: s("17:00", "22:00"), Fri: s("17:00", "22:00"), Sat: s("08:45", "19:15"), Sun: s("08:45", "19:15") },
  EGR: { Thu: s("17:00", "22:15"), Fri: s("17:00", "22:15"), Sat: s("08:45", "19:15"), Sun: s("08:45", "19:15") },
  DK:  {}, // blank in PDF — no hours
};

function s(start: string, end: string): Slot { return { start, end }; }

// Rotation straight from BM LIST.pdf — weekday → location code.
// A cell is a location code (HQ / branch) or explicit hours for a one-off shift.
type Cell = string | { loc: string; start: string; end: string };
const ROTATION: { name: string; Wed: Cell; Thu: Cell; Fri: Cell; Sat: Cell; Sun: Cell }[] = [
  { name: "NIKI ELIESHYA BINTI ZAILAN",              Wed: "HQ", Thu: "KLG", Fri: "KLG", Sat: "KLG", Sun: "KLG" },
  { name: "KIRTIKHA A/P NARAYANAN",                  Wed: "HQ", Thu: "HQ",  Fri: "HQ",  Sat: "DK",  Sun: "DK"  },
  { name: "EZRY EZWAN SHAH BIN AZIZAN",              Wed: "HQ", Thu: "DK",  Fri: "DK",  Sat: "TSG", Sun: "TSG" },
  { name: "SURAJ RAVI A/L RAVICHANDER",              Wed: "HQ", Thu: "KD",  Fri: "KD",  Sat: "KD",  Sun: "KD"  },
  { name: "MUHAMMAD AMIRUL RAFIQ BIN KADIR",         Wed: "HQ", Thu: "PJY", Fri: "PJY", Sat: "PJY", Sun: "PJY" },
  { name: "HANNAH JANE A/P JAYANATHAN",              Wed: "HQ", Thu: "CJY", Fri: "CJY", Sat: "CJY", Sun: "CJY" },
  { name: "KISHANTINI A/P RAJU",                     Wed: "HQ", Thu: "BBB", Fri: "BBB", Sat: "BBB", Sun: "BBB" },
  { name: "JANANI A/P SUBRAMANIAM",                  Wed: "HQ", Thu: "HQ",  Fri: "SP",  Sat: "SP",  Sun: "SP"  },
  { name: "QISTINA AISYAH BINTI MOHMAD NOR",         Wed: "HQ", Thu: "ST",  Fri: "ST",  Sat: "ST",  Sun: "ST"  },
  { name: "NUR AIN ZULAIKHA BINTI SHAHROM",          Wed: "HQ", Thu: "SA",  Fri: "SA",  Sat: "SA",  Sun: "SA"  },
  { name: "MUHAMMAD IRFAN HAIRIE BIN SORNADI",       Wed: "HQ", Thu: "HQ",  Fri: "HQ",  Sat: "SHA", Sun: "SHA" },
  { name: "ZAHID ZULFIQAR BIN MOHAMAD ZAHID",        Wed: "HQ", Thu: "AMP", Fri: "AMP", Sat: "AMP", Sun: "AMP" },
  { name: "LAILA HAZIQAH BINTI REIN RITHAUDIN",      Wed: "HQ", Thu: "HQ",  Fri: "KW",  Sat: "KW",  Sun: "KW"  },
  { name: "UMMU SYAFIQAH BINTI MAZLAN",              Wed: "HQ", Thu: "ST",  Fri: "ST",  Sat: "ST",  Sun: "ST"  },
  { name: "IZZATI SYAHIRAH BINTI MOHD KAMARULNIZAM", Wed: "HQ", Thu: "HQ",  Fri: "BSP", Sat: "BSP", Sun: "BSP" },
  { name: "NUREEN UMAIRA BINTI ROSLI",               Wed: "HQ", Thu: "HQ",  Fri: "HQ",  Sat: "RBY", Sun: "RBY" },
  { name: "MUHAMMAD ARIF ZIKRY BIN SUHANDI",         Wed: "HQ", Thu: "HQ",  Fri: "EGR", Sat: "EGR", Sun: "EGR" },
  { name: "GUKENDRAN A/L VEELAYUTH",                 Wed: "HQ", Thu: "DA",  Fri: "DA",  Sat: "DA",  Sun: "DA"  },
  // KTG BM — HQ on Wed (09:00–18:00), Thu+Fri (11:30–20:30); KTG on weekends.
  { name: "SITI NURUL HUDA NATASHA BINTI HASRIN",    Wed: { loc: "HQ", start: "09:00", end: "18:00" }, Thu: "HQ", Fri: "HQ", Sat: "KTG", Sun: "KTG" },
];

const WORK_DAYS = ["Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function fmt(slot: Slot | null): string {
  return slot ? `${slot.start}-${slot.end}` : "—";
}

// Returns the slot for a rotation cell. Explicit hours pass through as-is. For a
// location code: HQ → HQ_HOURS; a branch day with no hours in the table means
// the branch isn't operating → the BM reports to HQ instead (HQ_HOURS).
function resolve(cell: Cell, day: DayKey): { slot: Slot | null; toHQ: boolean; label: string } {
  if (typeof cell === "object") return { slot: { start: cell.start, end: cell.end }, toHQ: false, label: cell.loc };
  if (cell === "HQ") return { slot: HQ_HOURS, toHQ: false, label: "HQ" };
  const slot = BRANCH_HOURS[cell]?.[day];
  if (!slot) return { slot: HQ_HOURS, toHQ: true, label: cell }; // branch closed that day → HQ
  return { slot, toHQ: false, label: cell };
}

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

async function main() {
  const commit = process.argv.includes("--commit");
  console.log(commit ? "=== COMMIT MODE — writing changes ===\n" : "=== DRY RUN (pass --commit to write) ===\n");

  const all = await prisma.branchStaff.findMany({
    select: { id: true, name: true },
  });
  const byName = new Map<string, typeof all>();
  for (const st of all) {
    const key = norm(st.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(st);
  }

  let matched = 0;
  const unmatched: string[] = [];
  const hqFallbacks: string[] = [];

  for (const r of ROTATION) {
    const hits = byName.get(norm(r.name)) ?? [];
    if (hits.length === 0) { unmatched.push(r.name); continue; }
    const target = hits[0];

    const schedule: Record<DayKey, Slot | null> = {
      Mon: null, Tue: null, Wed: null, Thu: null, Fri: null, Sat: null, Sun: null,
    };
    const parts: string[] = [];
    for (const day of WORK_DAYS) {
      const { slot, toHQ, label } = resolve(r[day], day);
      schedule[day] = slot;
      parts.push(`${day} ${label}${toHQ ? "→HQ" : ""}=${fmt(slot)}`);
      if (toHQ) hqFallbacks.push(`${r.name}: ${day} @ ${label} (branch closed) → HQ 11:30-20:30`);
    }
    console.log(`${r.name}\n   ${parts.join("  ·  ")}`);

    if (commit) {
      await prisma.$executeRaw`
        UPDATE crm."BranchStaff"
        SET "workingHours" = ${JSON.stringify(schedule)}::jsonb,
            "updatedAt"    = NOW()
        WHERE id = ${target.id}
      `;
    }
    matched++;
  }

  console.log(`\nMatched: ${matched}/${ROTATION.length}`);
  if (unmatched.length) {
    console.log(`\n✗ No BranchStaff match:`);
    unmatched.forEach(n => console.log(`  ${n}`));
  }
  if (hqFallbacks.length) {
    console.log(`\nℹ ${hqFallbacks.length} day(s) sent to HQ (rostered branch not operating):`);
    hqFallbacks.forEach(g => console.log(`  ${g}`));
  }
  if (!commit) console.log(`\nNothing written. Re-run with --commit once this looks right.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
