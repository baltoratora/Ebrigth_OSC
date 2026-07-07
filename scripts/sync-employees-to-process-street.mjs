// Sync active HRMS employees (BranchStaff.status = 'Active' in ebright_hrfs)
// into a Process Street Data Set named "HRMS Employees". Reconciles fully:
// create new, update changed, DELETE rows whose employee is no longer active.
//
//   # DRY RUN (default) — reports what it WOULD do, writes nothing to PS:
//   docker exec -e PROCESS_STREET_API_KEY=api_xxx -i ebright-osc-osc-1 \
//     node < scripts/sync-employees-to-process-street.mjs
//   # (or paste via heredoc). APPLY:
//   docker exec -e PROCESS_STREET_API_KEY=api_xxx -e PS_APPLY=1 -i ebright-osc-osc-1 \
//     node < scripts/sync-employees-to-process-street.mjs
//
// Env:
//   PROCESS_STREET_API_KEY   Process Street API key (X-API-KEY)
//   PS_APPLY=1               actually write to Process Street (else dry run)
//   HRFS_DATABASE_URL / CRM_DATABASE_URL   DB creds (BranchStaff is in ebright_hrfs)
//
// Node 18+ (global fetch) + the `pg` driver (bundled in the app image).

import { Client } from "pg";

const API_KEY = process.env.PROCESS_STREET_API_KEY;
const APPLY = process.env.PS_APPLY === "1" || process.argv.includes("--apply");
const BASE = "https://public-api.process.st/api/v1.1";
const DATA_SET_NAME = "HRMS Employees";

// Data Set columns → BranchStaff column. "HRMS ID" (BranchStaff.id) is the
// stable match key used to find a row for update/delete.
const COLUMNS = [
  ["HRMS ID", "id"],
  ["Employee ID", "employeeId"],
  ["Name", "name"],
  ["Email", "email"],
  ["Phone", "phone"],
  ["Branch", "branch"],
  ["Department", "department"],
  ["Position", "position"],
  ["Role", "role"],
  ["Employment Type", "employment_type"],
  ["Start Date", "start_date"],
];

if (!API_KEY) { console.error("✗ PROCESS_STREET_API_KEY not set"); process.exit(1); }
const dbUrl = process.env.HRFS_DATABASE_URL || process.env.CRM_DATABASE_URL;
if (!dbUrl) { console.error("✗ HRFS_DATABASE_URL / CRM_DATABASE_URL not set"); process.exit(1); }
// BranchStaff lives in ebright_hrfs.public — force that db regardless of which url we got.
const conn = (() => { const u = new URL(dbUrl); u.pathname = "/ebright_hrfs"; u.searchParams.set("schema", "public"); return u.toString(); })();

async function ps(path, init) {
  const res = await fetch(path.startsWith("http") ? path : `${BASE}${path}`, {
    ...init,
    headers: { "X-API-KEY": API_KEY, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`PS ${init?.method || "GET"} ${path} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : undefined;
}

async function listDataSets() { return (await ps("/data-sets")).dataSets || []; }
async function createDataSet(name, fieldNames) {
  return ps("/data-sets", { method: "POST", body: JSON.stringify({ name, fields: fieldNames.map((n) => ({ name: n, fieldType: "Text" })) }) });
}
async function listAllRecords(dsId) {
  const out = []; let path = `/data-sets/${dsId}/records`;
  while (path) {
    const data = await ps(path);
    out.push(...(data.records || []));
    const next = (data.links || []).find((l) => l.name === "next");
    path = next ? next.href : null;
  }
  return out;
}
const createRecord = (dsId, cells) => ps(`/data-sets/${dsId}/records`, { method: "POST", body: JSON.stringify({ cells }) });
const updateRecord = (dsId, id, cells) => ps(`/data-sets/${dsId}/records/${id}`, { method: "PUT", body: JSON.stringify({ cells }) });
const deleteRecord = (dsId, id) => ps(`/data-sets/${dsId}/records/${id}`, { method: "DELETE" });

async function ensureDataSet() {
  const sets = await listDataSets();
  let ds = sets.find((d) => (d.name || "").trim() === DATA_SET_NAME);
  if (!ds) {
    console.log(`data set "${DATA_SET_NAME}" not found — ${APPLY ? "creating" : "would create"} it`);
    if (APPLY) ds = await createDataSet(DATA_SET_NAME, COLUMNS.map(([n]) => n));
    else return null; // dry run: can't map fields without a real data set
  }
  const fieldIdByName = {};
  for (const f of ds.fields || []) fieldIdByName[(f.name || "").trim()] = f.id;
  return { id: ds.id, fieldIdByName };
}

function cellsFor(emp, fieldIdByName) {
  const cells = [];
  for (const [col, src] of COLUMNS) {
    const fid = fieldIdByName[col];
    if (!fid) continue;
    const v = emp[src];
    cells.push({ fieldId: fid, value: v == null ? "" : String(v) });
  }
  return cells;
}
function differ(record, desired) {
  const cur = new Map((record.cells || []).map((c) => [c.fieldId, c.value ?? ""]));
  return desired.some((c) => (cur.get(c.fieldId) ?? "") !== (c.value ?? ""));
}

async function main() {
  console.log(`\n=== HRMS → Process Street sync ${APPLY ? "(APPLY — WILL WRITE)" : "(dry run)"} ===`);

  const db = new Client({ connectionString: conn });
  await db.connect();
  const { rows: employees } = await db.query(
    `SELECT id, "employeeId", name, email, phone, branch, department, position, role, employment_type, start_date
       FROM public."BranchStaff" WHERE status = 'Active' ORDER BY id`,
  );
  await db.end();
  console.log(`active employees (status='Active'): ${employees.length}`);

  const ds = await ensureDataSet();
  if (!ds) { console.log(`\nDRY RUN — would create the data set + ${employees.length} rows. Re-run with PS_APPLY=1.\n`); return; }
  const hrmsField = ds.fieldIdByName["HRMS ID"];
  if (!hrmsField) throw new Error('"HRMS ID" column missing on the data set');

  const records = await listAllRecords(ds.id); // list even in dry-run for accurate counts
  const recByHrmsId = new Map();
  for (const r of records) {
    const cell = (r.cells || []).find((c) => c.fieldId === hrmsField);
    if (cell?.value) recByHrmsId.set(cell.value, r);
  }
  console.log(`existing PS records: ${records.length}`);

  let created = 0, updated = 0, deleted = 0, unchanged = 0;
  const activeKeys = new Set();
  for (const e of employees) {
    const key = String(e.id); activeKeys.add(key);
    const cells = cellsFor(e, ds.fieldIdByName);
    const existing = recByHrmsId.get(key);
    if (!existing) { if (APPLY) await createRecord(ds.id, cells); created++; }
    else if (differ(existing, cells)) { if (APPLY) await updateRecord(ds.id, existing.id, cells); updated++; }
    else unchanged++;
  }
  for (const [key, rec] of recByHrmsId) {
    if (!activeKeys.has(key)) { if (APPLY) await deleteRecord(ds.id, rec.id); deleted++; }
  }

  console.log(`\n${APPLY ? "APPLIED" : "WOULD"} — create ${created}, update ${updated}, delete ${deleted}, unchanged ${unchanged}`);
  if (!APPLY) console.log("Re-run with PS_APPLY=1 to write to Process Street.\n");
  else console.log("Done.\n");
}

main().catch((e) => { console.error("[ps-sync] failed:", e.message); process.exitCode = 1; });
