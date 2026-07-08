import "server-only";
import { hrfsPrisma } from "@/lib/hrfs";
import {
  isProcessStreetConfigured, listDataSets, createDataSet, listAllRecords,
  createRecord, updateRecord, deleteRecord, type PsCell, type PsRecord,
} from "@/lib/process-street";

// Sync active employees (BranchStaff.status = 'Active' in ebright_hrfs) into a
// Process Street Data Set named "HRMS Employees". Keyed on HRMS ID
// (=BranchStaff.id). Mirrors scripts/sync-employees-to-process-street.mjs.

const DATA_SET_NAME = "HRMS Employees";

const clean = (v: unknown): string => (v == null ? "" : String(v).replace(/\s+/g, " ").trim());
const fmtTs = (v: unknown): string => (v ? new Date(v as string | Date).toISOString().slice(0, 19).replace("T", " ") : "");
const asJson = (v: unknown): string => (v == null ? "" : typeof v === "string" ? v : JSON.stringify(v));
function normEmployment(v: unknown): string {
  const s = clean(v).toLowerCase();
  if (!s) return "";
  if (s.includes("intern") || s.includes("protege")) return "Internship";
  if (s.includes("full")) return "Full Time";
  if (s.includes("part")) return "Part Time";
  if (s.includes("service") || s.includes("3rd party") || s.includes("third party")) return "3rd Party Service";
  if (s.includes("contract")) return "Contract";
  if (s.includes("dtype") || s.includes("nan")) return "";
  return clean(v);
}
function normGender(v: unknown): string {
  const s = clean(v).toLowerCase();
  if (s === "male" || s === "m") return "Male";
  if (s === "female" || s === "f") return "Female";
  return clean(v);
}

type Row = Record<string, unknown>;
type Transform = (v: unknown) => string;

// [Data Set column, BranchStaff column, transform?]. `role` + `biometricTemplate`
// intentionally excluded. "HRMS ID" is the stable match key.
const COLUMNS: [string, string, Transform?][] = [
  ["HRMS ID", "id"], ["Employee ID", "employeeId"], ["Name", "name"], ["Nickname", "nickname"],
  ["Email", "email"], ["Phone", "phone"], ["Gender", "gender", normGender], ["DOB", "dob"],
  ["Age", "age"], ["Nationality", "nationality"], ["NRIC", "nric"], ["Home Address", "home_address"],
  ["Residential", "residential"], ["Emergency Name", "emergency_name"], ["Emergency Phone", "emergency_phone"],
  ["Emergency Relation", "emergency_relation"], ["Branch", "branch"], ["Department", "department"],
  ["Position", "position"], ["Location", "location"], ["Employment Type", "employment_type", normEmployment],
  ["Status", "status"], ["Access Status", "accessStatus"], ["Contract", "contract"], ["Probation", "probation"],
  ["Rate", "rate"], ["University", "university"], ["Bank", "bank"], ["Bank Name", "bank_name"],
  ["Bank Account", "bank_account"], ["Signed Date", "signed_date"], ["Start Date", "start_date"],
  ["End Date", "endDate"], ["Training Start Date", "trainingStartDate"], ["Training End Date", "trainingEndDate"],
  ["Created At", "createdAt", fmtTs], ["Updated At", "updatedAt", fmtTs], ["Working Hours", "workingHours", asJson],
];

const SELECT = Object.fromEntries([...new Set(COLUMNS.map(([, src]) => src))].map((c) => [c, true]));

function cellsFor(emp: Row, fieldIdByName: Record<string, string>): PsCell[] {
  const cells: PsCell[] = [];
  for (const [col, src, transform] of COLUMNS) {
    const fid = fieldIdByName[col];
    if (!fid) continue;
    cells.push({ fieldId: fid, value: (transform || clean)(emp[src]) });
  }
  return cells;
}
function differ(record: PsRecord, desired: PsCell[]): boolean {
  const cur = new Map((record.cells || []).map((c) => [c.fieldId, c.value ?? ""]));
  return desired.some((c) => (cur.get(c.fieldId) ?? "") !== (c.value ?? ""));
}

async function ensureDataSet(): Promise<{ id: string; fieldIdByName: Record<string, string> } | null> {
  let sets = await listDataSets();
  let ds = sets.find((d) => (d.name || "").trim() === DATA_SET_NAME);
  if (!ds) {
    await createDataSet(DATA_SET_NAME, COLUMNS.map(([n]) => n));
    sets = await listDataSets();
    ds = sets.find((d) => (d.name || "").trim() === DATA_SET_NAME);
    if (!ds) return null;
  }
  const fieldIdByName: Record<string, string> = {};
  for (const f of ds.fields || []) fieldIdByName[(f.name || "").trim()] = f.id;
  return { id: ds.id, fieldIdByName };
}

/** Full reconcile: the data set == active employees. Add/update/delete. */
export async function reconcileEmployeeDataSet(): Promise<{ created: number; updated: number; deleted: number }> {
  if (!isProcessStreetConfigured()) return { created: 0, updated: 0, deleted: 0 };
  const ds = await ensureDataSet();
  if (!ds) throw new Error("Could not ensure the HRMS Employees data set");
  const hrmsField = ds.fieldIdByName["HRMS ID"];
  if (!hrmsField) throw new Error('"HRMS ID" column missing on the data set');

  const employees = (await hrfsPrisma.branchStaff.findMany({ where: { status: "Active" }, select: SELECT })) as Row[];
  const records = await listAllRecords(ds.id);
  const recByHrmsId = new Map<string, PsRecord>();
  for (const r of records) {
    const cell = r.cells.find((c) => c.fieldId === hrmsField);
    if (cell?.value) recByHrmsId.set(cell.value, r);
  }

  let created = 0, updated = 0, deleted = 0;
  const activeKeys = new Set<string>();
  for (const e of employees) {
    const key = String(e.id); activeKeys.add(key);
    const cells = cellsFor(e, ds.fieldIdByName);
    const existing = recByHrmsId.get(key);
    if (!existing) { await createRecord(ds.id, cells); created++; }
    else if (differ(existing, cells)) { await updateRecord(ds.id, existing.id, cells); updated++; }
  }
  for (const [key, rec] of recByHrmsId) {
    if (!activeKeys.has(key)) { await deleteRecord(ds.id, rec.id); deleted++; }
  }
  return { created, updated, deleted };
}

/**
 * Real-time single-employee sync. Upsert if active, delete if inactive/gone.
 * Best-effort: swallows errors + no-ops when PS isn't configured, so it can be
 * fire-and-forgotten from the employees API without ever breaking that request.
 */
export async function syncEmployeeToDataSet(branchStaffId: number): Promise<void> {
  if (!isProcessStreetConfigured()) return;
  try {
    const ds = await ensureDataSet();
    if (!ds) return;
    const hrmsField = ds.fieldIdByName["HRMS ID"];
    if (!hrmsField) return;

    const emp = (await hrfsPrisma.branchStaff.findUnique({
      where: { id: branchStaffId },
      select: { ...SELECT, status: true },
    })) as (Row & { status?: string }) | null;

    const records = await listAllRecords(ds.id);
    const existing = records.find((r) => r.cells.some((c) => c.fieldId === hrmsField && c.value === String(branchStaffId)));

    const active = emp && emp.status === "Active";
    if (!active) { if (existing) await deleteRecord(ds.id, existing.id); return; }

    const cells = cellsFor(emp, ds.fieldIdByName);
    if (existing) await updateRecord(ds.id, existing.id, cells);
    else await createRecord(ds.id, cells);
  } catch (e) {
    console.warn("[ps-sync] syncEmployeeToDataSet failed:", (e as Error).message);
  }
}
