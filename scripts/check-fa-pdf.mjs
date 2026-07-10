// One-off cross-check: compare the FA registration tracklist PDF
// (event 17/05/2026 @ Quayside Mall) against studentrecords in
// ebrightleads_db. Prints a matched / near-match / missing report.
//
//   node scripts/check-fa-pdf.mjs
//
// Loads FA_DATABASE_URL (or DATABASE_URL) from .env automatically.

import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- naive .env loader (just enough for our two keys) ----------------------
const envPath = resolve(__dirname, "..", ".env");
try {
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (!m) continue;
    const [, k, rawVal] = m;
    if (process.env[k]) continue;
    const v = rawVal.replace(/^"(.*)"$/, "$1");
    process.env[k] = v;
  }
} catch {
  /* .env optional */
}

const url = process.env.FA_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Missing FA_DATABASE_URL / DATABASE_URL in .env");
  process.exit(1);
}

// --- name normalisation (mirrors the in-app RegistrationCrossCheck) --------
const STOP_WORDS = new Set([
  "bin", "binti", "bt", "bte", "b", "binte",
  "a/p", "a/l", "d/o", "s/o", "ap", "al", "do", "so",
]);
function normalise(name) {
  return String(name ?? "")
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s/]/g, " ")
    .split(/\s+/).filter(w => w && !STOP_WORDS.has(w))
    .join(" ").trim();
}
function similarity(a, b) {
  const ta = new Set(normalise(a).split(" ").filter(Boolean));
  const tb = new Set(normalise(b).split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  ta.forEach(t => { if (tb.has(t)) inter++; });
  return inter / Math.max(ta.size, tb.size);
}

// --- PDF roster (transcribed from "Branch's FA Registration Form Tracklist
//     (20250614) - 5A D2 (17_05_2026) (2).pdf") -----------------------------
// branchHint = the branch column from the sheet ("SA to ST" → kept as SA;
// the receiving branch only matters for the cert, not for matching).
const ROSTER = [
  // Session 1: 10.30am – 12pm
  ["ST", "Muhammad Izz Idris", "SNR G1"],
  ["ST", "Sarah Elena binti Mohd Sharin", "JNR G1"],
  ["ST", "Leong Cassius", "JNR G3"],
  ["ST", "Dhia Arissa Binti Muhammad Asyraf", "SNR G6"],
  ["ST", "Manvir Ravindran", "JNR G2"],
  ["ST", "Maryam Sharleez Binti Indera Shaiful", "JNR G2"],
  ["ST", "Maryam Sharmeen Binti Indera Shaiful", "JNR G2"],
  ["ST", "Chan Ling Ni", "MDR G1"],
  ["SA", "Nehaal Nithin", "MDR G2"],
  ["SA", "Caleb Tee Li Jung", "JNR G2"],
  ["SA", "AKIL HARITH BIN MOHD RAIHAN", "JNR G1"],
  ["SA", "ADWAY ANSHUMAN BEHERA", "MDR G1"],
  ["SA", "SEYASH SESVIN", "JNR G2"],
  ["SA", "Kairav Arvind Jagwani", "JNR G1"],
  ["SA", "Rayirth Tehan Arvind Jagwani", ""],
  ["SP", "Nur Arriana binti Zulkifli", "MDR G1"],
  ["SP", "MIKAYLA AMANDA BINTI NOR HAFIZAN", "JNR G2"],
  ["KLG", "DAKSYANAA ARAVIND", "JNR G1"],
  ["ST", "Ashvinnah Mathan Naidu", "MDR G4"],
  // Session 2
  ["KD", "AYDINA BINTI FARHAN", "MDR G2"],
  ["KD", "AYSAR BIN FARHAN", "MDR G2"],
  ["KD", "AYDAN BIN FARHAN", "MDR G2"],
  ["KD", "AYYASH BIN FARHAN", "JNR G2"],
  ["KD", "Iman Arissa binti Mohd Azril", "SNR G4"],
  ["KD", "Muhammad Ramadhan I'lmie bin Ashiran Asba", "JNR G2"],
  ["KD", "Maya Suria I'lmie binti Ashiran Asba", "JNR G2"],
  ["RBY", "Lee Kai Yang", "JNR G1"],
  ["RBY", "Kushie Vaani Thirumeni", "JNR G1"],
  ["RBY", "Ruthra Shreya Thirumeni", "JNR G1"],
  ["RBY", "Hirrhanya D/O Raja Sargunan", "MDR G1"],
  // Session 3
  ["SHA", "ABRAR ABDULHADI", "SNR G1"],
  ["SHA", "Basil Abdulhadi", "SNR G1"],
  ["SHA", "Asiel Abdulhadi", "MDR G1"],
  ["SHA", "VICTORIA ALYSSA CHIN", "JNR G1"],
  ["SHA", "Muhammad Adam Wafiy bin Mohd Izni Zuhdi", "MDR G1"],
  ["SHA", "Ahmad Aisy Mateen Bin Fadzil Bahri", "MDR G1"],
  ["SHA", "Muhammad Aqil Wajdi", "JNR G1"],
  ["EGR", "IRIS MARISSA BINTI MOHD PAIRAY", "MDR G1"],
  ["EGR", "Mikayla Sophia Binti Mohd Nornazri", "JNR G1"],
  ["EGR", "Madeena Bte Mohd Akmal", "MDR G1"],
  // Session 4
  ["EGR", "MUHAMAD ARHAM AKMAL BIN MOHD SYUKRI", "SNR G1"],
  ["EGR", "MUHAMMAD AYDEN BIN AFIQ AIZUDDIN", "JNR G1"],
  ["CJY", "SOFEA AZALEIA BINTI MOHD ARHAM", "MDR G3"],
  ["CJY", "SOFEA JASMINE BINTI MOHD ARHAM", "JNR G2"],
  ["CJY", "Arfa Muhammad Talha Bin Shahril Redza", "MDR G2"],
  ["CJY", "Arfa Khadija Binti Shahril Redza", "MDR G1"],
  ["CJY", "Nur Zafirah Amni Binti Zul Azmi", ""],
  ["CJY", "IZZ AQIL BIN MUHAMAD FAHMI", ""],
  ["CJY", "Maryam Elana", "MDR G2"],
  ["CJY", "Muhammad Iffat Bin Muhammad Shafiq", "MDR G2"],
  ["CJY", "Mohamad Hariz Bin Mohamad Faiz", ""],
  ["CJY", "Sharifah Arissa Sofea binti Syed Mohamad Syathir", "MDR G2"],
  ["CJY", "Syed Izz Harraz bin Syed Mohamad Syathir", "JNR G1"],
  ["CJY", "Qayla Atiya Mohamad Razaleigh", "JNR G2"],
  ["CJY", "Muhammad Akmal Hakim bin Mohd Sharif", ""],
  ["CJY", "A'ariz Irfan Mukhtarah Bin Nurwaqiyuddin Mukhtarah", "MDR G1"],
  ["BTHO", "Areej Sophia Binti Mohamad Aminuddin Khamis", "JNR G1"],
  ["BTHO", "Wan Umar bin Wan Junaidid", "JNR G1"],
  ["BTHO", "Tan Jun Xian", ""],
  ["BTHO", "Lohinthra Ganesh", "JNR G4"],
  ["KD", "Joanna Foo Su Na", "JNR G1"],
  // Session 5
  ["KLG", "Ali Rahman Mohamad Kamil", "JNR G2"],
  ["KLG", "Aireel Asyraf Bin Azril", "MDR G1"],
  ["KLG", "KAYSA AMEENA BINTI AMIRUDIN HAFIZ", "MDR G2"],
  ["KLG", "VISSHAN PACKIANATHAN", "JNR G1"],
  ["KLG", "Ian Lai Yik En", "MDR G5"],
  ["KLG", "MUHAMMAD DARWISY BIN MUHAMMAD AMINUDDIN", "JNR G2"],
  ["DA", "MUHAMMAD ARIF BIN MOHAMAD ANAS", "MDR G2"],
  ["DA", "Qaayed Basyeer bin Muhammad Zulqisti Basyeer", "JNR G5"],
  ["DA", "AILEEN AKMA BINTI MOHAMAD ANAS", "JNR G2"],
  ["DA", "Musab Said", "SNR G2"],
  ["BBB", "ADAM LUTFI BIN AHMAD LUTFI", "JNR G3"],
  ["BBB", "Ali Imran bin Aeriesha", "JNR G2"],
  ["BBB", "Dahlia Binti Rohaizal Husaini", "SNR G2"],
  ["BBB", "Nahidh Bin Abdul Hadi", "JNR G1"],
  ["BBB", "Dhuhaa Abdul Hadi", "JNR G1"],
  ["BBB", "Talhah Bin Abdul Hadi", "SNR G1"],
  ["BBB", "Suhayb Abdul Hadi", "SNR G1"],
  ["BBB", "Aileen Imanina Binti Muhd Izzat", "JNR G1"],
  ["BBB", "SITI AINUL MARDHIYAH BINTI NOORAZALAN", "SNR G1"],
  ["KLG", "Emily Ng Yenn Yenn", "JNR G3"],
  ["KLG", "Rizq Hana", "JNR G2"],
  ["BBB", "ADLAN", ""],
  ["BBB", "DIYANA", ""],
  ["BBB", "nik aydeen bin Nik Faiz Uzair", ""],
  ["KTG", "Aimee Tang Ee", "MDR G2"],
  // Session 6
  ["AMP", "Zara Hani Zainal Zol", "SNR G4"],
  ["AMP", "Muhammad Hadif Khalish bin Hillalluddin", "MDR G7"],
  ["AMP", "Nur Manessa binti Mohd Yusuf", "JNR G2"],
  ["KD", "ANAS NADEEM BIN MUHAMMAD IRSYAD", "JNR G4"],
  ["AMP", "Moch Farhat Rafiqi bin Moch Fathan Qorib", "JNR G1"],
  ["AMP", "Moch Fayyadh Rizq bin Moch Fathan Qorib", "MDR G1"],
  ["TSG", "ANAS MIRQAAL BIN AHMAD SUHAIL", "MDR G1"],
  ["TSG", "AQIL NIQREES BIN AHMAD SUHAIL", "MDR G1"],
  ["BSP", "Muhammad Mikail Bin Abdul Malik", "JNR G2"],
  ["BSP", "Maya Khaleesa Binti Mohd Fadzly", "MDR G2"],
  ["BSP", "Thasnim Armany binti Zainuddin", "SNR G1"],
  ["BSP", "Waiz Isaac bin Zainuddin", "SNR G1"],
  ["BSP", "UMAR BIN MOHAMMAD AZIM RIDHWAN", "SNR G2"],
  ["ONL", "RAISHA MIKAYLA BINTI MUHAMAD RIZZUAN", "JNR G1"],
  ["KLG", "Khalif Hakim Bin Mohd Khair", "JNR G5"],
  ["ONL", "Hafni Widaad bt Mohd Dasuki", ""],
  ["ONL", "Alessandra Moe Pei Shan", ""],
  ["ONL", "Tan Yanxin", ""],
  ["ONL", "Cassidy Chong Zi Hui", ""],
  // Session 7
  ["TSG", "Adrian Danish Bin Amirul Hadi", "MDR G1"],
  ["KW", "Awatif binti mohd firdaus", "JNR G1"],
  ["KW", "Ammara Dhuha binti mohd firdaus", "JNR G1"],
  ["KW", "ABDUL KHALEQ BIN ABDUL QAYYUM", "JNR G1"],
  ["KW", "SITI FATIMAH BINTI ABDUL QAYYUM", "JNR G1"],
  ["DK", "Nailah Muhd Taufiq", ""],
  ["DK", "Safiyyah Muhd Taufiq", ""],
  ["KW", "MUHAMMAD KAUSAR BIN MOHD ZUL HUSNI", "SNR G1"],
  ["DK", "Naurah Surfina Binti Ahmad Syamim", ""],
  ["DK", "Alana Haylesya binti Amir Hazeem", "JNR G2"],
  ["DK", "Tiaz Zahra Johor Binti Muhammad Zharif Johor", "SNR G2"],
  ["DK", "Anya Hayzeleia binti Amir Hazeem", "MDR G2"],
  ["DK", "Ammar Haziq Bin Mohd Ridzuan", ""],
  ["PJY", "PUTRI AISYAH FATHIA BINTI MEGAT MOHD IZHAR", "MDR G1"],
  ["PJY", "HELENA BINTI MUHSIN", "JNR G3"],
  ["PJY", "WAN MYRA AMEENA BINTI WAN QUORIS SHAH", ""],
  ["PJY", "Mohamad Qarl Hassim b. Mohamad", "MDR G1"],
  ["CJY", "Bona Kim", "SNR G7"],
  ["PJY", "Yena Kim", "MDR G6"],
];

// --- query DB --------------------------------------------------------------
const client = new pg.Client({ connectionString: url });
await client.connect();
const { rows: dbRows } = await client.query(
  `SELECT id, name, branch, grade_chapter, status FROM studentrecords`
);
await client.end();

console.log(`Pulled ${dbRows.length} rows from studentrecords.\n`);

const dbByName = new Map();
for (const r of dbRows) dbByName.set(normalise(r.name), r);

const matched = [];
const branchMismatch = [];
const inactive = [];
const near = [];
const missing = [];

for (const [branchHint, name] of ROSTER) {
  if (!name || !name.trim()) continue;
  const exact = dbByName.get(normalise(name));
  if (exact) {
    const dbBranch = String(exact.branch ?? "").trim().toUpperCase();
    const wantBranch = branchHint.trim().toUpperCase();
    const isInactive = String(exact.status ?? "").toLowerCase() !== "active";
    if (isInactive) inactive.push({ name, branchHint, db: exact });
    if (dbBranch && wantBranch && dbBranch !== wantBranch) {
      branchMismatch.push({ name, branchHint, db: exact });
    }
    matched.push({ name, branchHint, db: exact });
  } else {
    const candidates = dbRows
      .map(r => ({ r, score: similarity(r.name, name) }))
      .filter(x => x.score >= 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(x => x.r);
    if (candidates.length) near.push({ name, branchHint, candidates });
    else missing.push({ name, branchHint });
  }
}

// --- report ----------------------------------------------------------------
const total = ROSTER.filter(([, n]) => n && n.trim()).length;
console.log(`PDF roster (with a name filled): ${total}`);
console.log(`  ✓ Matched in studentrecords:        ${matched.length}`);
console.log(`  ~ No exact, but a near-match exists: ${near.length}`);
console.log(`  ✗ Not found at all:                  ${missing.length}`);
console.log("");

if (branchMismatch.length) {
  console.log(`⚠  ${branchMismatch.length} matched students belong to a DIFFERENT branch in Heidi:`);
  for (const r of branchMismatch) {
    console.log(`   - ${r.name}  (list: ${r.branchHint}, Heidi: ${r.db.branch})  #${r.db.id}`);
  }
  console.log("");
}
if (inactive.length) {
  console.log(`⚠  ${inactive.length} matched students are INACTIVE in Heidi:`);
  for (const r of inactive) {
    console.log(`   - ${r.name}  (#${r.db.id}, status: ${r.db.status})`);
  }
  console.log("");
}
if (near.length) {
  console.log("~ NEAR-MATCHES (typo? alternate spelling? confirm in Heidi):");
  for (const r of near) {
    console.log(`   - "${r.name}"  (list branch: ${r.branchHint})`);
    for (const c of r.candidates) {
      console.log(`       ↳ "${c.name}"  (#${c.id}, branch: ${c.branch}, ${c.grade_chapter}, ${c.status})`);
    }
  }
  console.log("");
}
if (missing.length) {
  console.log(`✗ MISSING from studentrecords:`);
  for (const r of missing) {
    console.log(`   - ${r.name}  (list branch: ${r.branchHint})`);
  }
  console.log("");
}
console.log("Done.");
