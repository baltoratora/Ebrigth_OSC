import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/nextauth";
import { prisma } from "@/lib/prisma";
import { hrfsPrisma } from "@/lib/hrfs";
import StaffDirectory, {
  type DirectoryPerson,
  type DirectoryBranch,
  type DirectoryDepartment,
} from "./StaffDirectory";
import ClientShell from "./ClientShell";

export const dynamic = "force-dynamic";

// v1's BranchStaff stores dates as free-text strings — accept the formats we
// see in practice (ISO, DD/MM/YYYY, MM/DD/YYYY, D-MMM-YYYY) and emit a
// normalized YYYY-MM-DD. Returns null when nothing parses, so the UI can fall
// back to "Unknown" / "—".
function parseLooseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  // ISO first: 2024-05-16 or 2024-05-16T...
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // Slash / dash / dot-separated numeric: assume day-first (Malaysian).
  // Disambiguate using value ranges where possible.
  const num = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (num) {
    let [, a, b, y] = num;
    let dd = Number(a);
    let mm = Number(b);
    if (mm > 12 && dd <= 12) [dd, mm] = [mm, dd]; // MM/DD/YYYY input
    if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return null;
    let yyyy = Number(y);
    if (yyyy < 100) yyyy += yyyy >= 70 ? 1900 : 2000;
    return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }

  // Month-name forms like "16 May 2024" or "May 16, 2024".
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = parsed.getMonth() + 1;
    const d = parsed.getDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return null;
}

// Canonical department list (single source of truth for the Department
// dropdown). v1's BranchStaff.department is free-text and the same conceptual
// department can appear with different casing / pluralization across rows —
// normalize each row's raw value into one of these so the filter works
// regardless of how the data is spelled.
const CANONICAL_DEPARTMENTS = [
  { name: "CEO",          code: "ceo" },
  { name: "Marketing",    code: "mkt" },
  { name: "Operation",    code: "ops" },
  { name: "Optimisation", code: "od"  },
  { name: "Finance",      code: "fnc" },
  // HR and IOP are the same team — surfaced as one combined department so the
  // dropdown shows a single "HR/IOP" entry and staff form values of "HR/IOP"
  // (see lib/constants DEPARTMENT_OPTIONS) resolve correctly.
  { name: "HR/IOP",       code: "hr"  },
  { name: "Academy",      code: "acd" },
] as const;

type CanonicalDeptName = (typeof CANONICAL_DEPARTMENTS)[number]["name"];

// Reverse lookup: short code → canonical name. Used when the dept code leaks
// into BranchStaff.branch (e.g. row with branch="od"), or when
// BranchStaff.department itself holds the code instead of the name.
const DEPT_CODE_TO_NAME: Record<string, CanonicalDeptName> = {
  ...Object.fromEntries(
    CANONICAL_DEPARTMENTS.map((d) => [d.code.toLowerCase(), d.name]),
  ),
  // "iop" no longer has its own canonical entry — fold it into HR/IOP.
  iop: "HR/IOP",
  // Real-world code aliases seen in BranchStaff that differ from the canonical
  // codes above: the data uses "op"/"ops" for Operation and "fin" for Finance,
  // while the canonical codes are "ops" and "fnc". Without these, HQ staff
  // whose department is "OP" or "FIN" resolve to no department and vanish from
  // the Department filter.
  op: "Operation",
  fin: "Finance",
} as Record<string, CanonicalDeptName>;

function isDeptCode(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return raw.trim().toLowerCase() in DEPT_CODE_TO_NAME;
}

// Free-text values that appear in BranchStaff.branch but are NOT real branches.
// "HQ" is headquarters — it holds multiple departments rather than being a
// branch in its own right. Treated as no-branch so it's filtered from the
// Branch dropdown and from the "All branches" scope; HQ staff still flow into
// the Department dropdown via BranchStaff.department.
//
// "IOP" is handled via the dept-code path (the "iop" alias in DEPT_CODE_TO_NAME
// folds into the combined "HR/IOP" department), so it doesn't need to be listed
// here — isDeptCode catches it.
const NON_BRANCH_VALUES = new Set(["hq"]);

function isNonBranch(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return NON_BRANCH_VALUES.has(raw.trim().toLowerCase());
}

function normalizeDepartment(raw: string | null | undefined): CanonicalDeptName | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Short-code first (cheapest check, also handles dept codes leaking into
  // the `branch` column like "od" / "mkt").
  const codeHit = DEPT_CODE_TO_NAME[trimmed.toLowerCase()];
  if (codeHit) return codeHit;

  const s = trimmed.toUpperCase();
  // Substring matching on the recognizable stem of each canonical dept.
  // Marketing and Optimisation are separate — if a row mentions both
  // (legacy "Marketing and Optimisation"), prefer Marketing.
  if (s.includes("MARKETING"))                                  return "Marketing";
  if (s.includes("OPTIMISATION") || s.includes("OPTIMIZATION")) return "Optimisation";
  if (s.includes("OPERATION"))                                  return "Operation";
  if (s.includes("ACADEMY") || s.includes("ACADEMIC"))          return "Academy";
  // HR and IOP are one combined team — collapse every spelling into "HR/IOP".
  if (s === "HR" || s === "IOP" || s.replace(/\s+/g, "") === "HR/IOP" || s.includes("HUMAN"))
                                                                return "HR/IOP";
  if (s.includes("FINANCE") || s.includes("ACCOUNT"))           return "Finance";
  if (s.includes("CEO") || s.includes("CHIEF EXECUTIVE"))       return "CEO";
  return null;
}

// BranchStaff.role holds the actual job title in v1 (e.g. "PT - Coach",
// "FT - Coach", "INT"). The chart's tier ranking expects values without the
// separator ("PT COACH", "FT COACH", "INTERN"). Returns a string that may or
// may not match POSITION_RANK — anything unknown falls through and renders as
// the default "Junior" tier, which is fine for display.
function normalizePosition(raw: string | null | undefined): string {
  if (!raw) return "";
  // Drop the dash, collapse repeated spaces, uppercase.
  let s = raw.replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
  if (!s) return "";

  // Common shorthands seen in the data → canonical POSITION_RANK keys.
  if (s === "INT" || s === "INTERN") return "INTERN";
  if (s === "BM" || s.startsWith("BM ")) return "BM";

  // Already-canonical forms pass through.
  const canonical = ["FT CEO", "FT HOD", "FT EXEC", "FT COACH", "PT COACH"];
  if (canonical.includes(s)) return s;

  // Looser matches — handle "FT Coach", "PT Coach", "FT Senior Coach" etc.
  if (s.startsWith("FT") && s.includes("CEO")) return "FT CEO";
  if (s.startsWith("FT") && s.includes("HOD")) return "FT HOD";
  if (s.startsWith("FT") && s.includes("EXEC")) return "FT EXEC";
  if (s.startsWith("FT") && s.includes("COACH")) return "FT COACH";
  if (s.startsWith("PT") && s.includes("COACH")) return "PT COACH";

  return s;
}

interface BranchStaffRow {
  id: number;
  name: string | null;
  nickname: string | null;
  branch: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  employeeId: string | null;
  department: string | null;
  position: string | null;
  location: string | null;
  status: string | null;
  start_date: string | null;
  endDate: string | null;
  workingHours: unknown;
}

export default async function StaffDirectoryPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // Fetch via raw SQL — the Prisma client types may not yet include the new
  // workingHours column until the dev server restarts and re-runs `prisma
  // generate`. Raw queries decouple us from that regeneration.
  // Filter on role (the actual job-title column in v1), not position. Rows
  // with a blank role still load but render at the default tier in the chart.
  //
  // Read BranchStaff via hrfsPrisma. The table name is left UNqualified so it
  // resolves against the connection's search_path: public."BranchStaff" when
  // HRFS_DATABASE_URL is set, or crm."BranchStaff" (the view/FDW) when this
  // client has fallen back to DATABASE_URL. Either way it's the same data.
  const rows = await hrfsPrisma.$queryRaw<BranchStaffRow[]>`
    SELECT id, name, nickname, branch, role, email, phone, "employeeId",
           department, position, location, status, start_date, "endDate",
           "workingHours"
    FROM "BranchStaff"
    WHERE role IS NOT NULL AND TRIM(role) <> ''
  `;

  // Link User → BranchStaff by lowercased email. v1 has no FK; email is the
  // only column they share. Any unmatched staff still render with userId 0
  // (the UI only needs a number for the chart keying).
  const emails = Array.from(
    new Set(
      rows
        .map((r) => r.email?.trim().toLowerCase())
        .filter((e): e is string => Boolean(e)),
    ),
  );
  const users = emails.length
    ? await prisma.user.findMany({
        where: { email: { in: emails } },
        select: { id: true, email: true },
      })
    : [];
  const userIdByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));

  // Synthesize stable integer IDs for branches from the distinct strings
  // (v1 has no Branch lookup table). Dept-code values (e.g. "od", "mkt")
  // sometimes appear in BranchStaff.branch by mistake — exclude them so the
  // Branch dropdown only ever shows real branches.
  const branchNames = Array.from(
    new Set(
      rows
        .map((r) => r.branch?.trim())
        .filter((b): b is string => Boolean(b) && !isDeptCode(b) && !isNonBranch(b)),
    ),
  ).sort((a, b) => a.localeCompare(b));
  const branchIdByName = new Map(branchNames.map((name, i) => [name, i + 1]));

  // Departments come from the fixed canonical list, not from the data — that
  // way the dropdown always shows the same options regardless of typos /
  // casing in BranchStaff.department.
  const departmentIdByName = new Map(
    CANONICAL_DEPARTMENTS.map((d, i) => [d.name, i + 1] as const),
  );

  // Map first occurrence of each branch to a representative "location" — the
  // free-text location field on the same row, useful as a hover/title.
  const branchLocationByName = new Map<string, string | null>();
  for (const r of rows) {
    const b = r.branch?.trim();
    if (!b || branchLocationByName.has(b)) continue;
    branchLocationByName.set(b, r.location?.trim() || null);
  }

  // ISO-formatted "today" for comparison against parsed start dates. Server
  // time — fine for our Malaysia-only deployment; ISO strings compare
  // lexically the same as chronologically.
  const todayISO = new Date().toISOString().slice(0, 10);

  // True when the stored workingHours value actually contains at least one
  // day with a saved slot. Null, empty objects, and objects whose day values
  // are all null all count as "no schedule" so inheritance can kick in.
  const hasAnyWorkingDay = (value: unknown): boolean => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    for (const v of Object.values(value as Record<string, unknown>)) {
      if (v && typeof v === "object") return true;
      if (typeof v === "string" && v.trim()) return true;
    }
    return false;
  };

  // Branch managers are the working-hours source of truth for their branch:
  // every other staff under the same branch inherits the BM's schedule unless
  // they have their own workingHours already saved. Match branches
  // case-insensitively so casing/whitespace drift in the free-text branch
  // column doesn't break the link. First BM encountered per branch wins.
  const bmHoursByBranchKey = new Map<string, unknown>();
  for (const r of rows) {
    if (normalizePosition(r.role) !== "BM") continue;
    const branch = r.branch?.trim();
    if (!branch || isDeptCode(branch) || isNonBranch(branch)) continue;
    if (!hasAnyWorkingDay(r.workingHours)) continue;
    const key = branch.toLowerCase();
    if (bmHoursByBranchKey.has(key)) continue;
    bmHoursByBranchKey.set(key, r.workingHours);
  }

  const people: DirectoryPerson[] = rows.flatMap((r) => {
    const startISO = parseLooseDate(r.start_date);
    // Hide staff whose start_date is still in the future. Once today catches
    // up to the start date they appear automatically (page is force-dynamic).
    if (startISO && startISO > todayISO) return [];
    const endISO = parseLooseDate(r.endDate);
    // If the branch column holds a dept code (e.g. "od"), treat that row as
    // having no branch and route the code into the department instead.
    const rawBranch = r.branch?.trim() || null;
    const branchAsDept = rawBranch ? normalizeDepartment(rawBranch) : null;
    const branchIsActuallyDeptCode = rawBranch !== null && isDeptCode(rawBranch);
    const branchIsNonBranch = rawBranch !== null && isNonBranch(rawBranch);
    const branchName = (branchIsActuallyDeptCode || branchIsNonBranch) ? null : rawBranch;
    // Canonical department drives filtering / chart grouping (must be one of
    // CANONICAL_DEPARTMENTS). The DISPLAY name falls back to the raw
    // BranchStaff.department value when it isn't a recognised canonical dept —
    // otherwise HQ / non-branch staff whose department is free-text (e.g. "IT")
    // would render as "—" even though a department is on file.
    const canonicalDept = normalizeDepartment(r.department) ?? branchAsDept;
    const rawDept = r.department?.trim() || null;
    const deptDisplay = canonicalDept ?? rawDept;
    const emailKey = r.email?.trim().toLowerCase() ?? "";
    const linkedUserId = emailKey ? userIdByEmail.get(emailKey) ?? null : null;

    // Inherit working hours from the branch manager when this row doesn't
    // have a meaningful schedule of its own (null, empty object, or all-null
    // days all count as "no schedule"). The BM is skipped — it's the source.
    // Rows whose branch column holds a dept code have branchName=null and
    // won't inherit. Branch matching is case-insensitive to survive minor
    // casing / whitespace drift in the free-text branch column.
    const isBM = normalizePosition(r.role) === "BM";
    const ownHasSchedule = hasAnyWorkingDay(r.workingHours);
    const inheritedHours = !isBM && !ownHasSchedule && branchName
      ? bmHoursByBranchKey.get(branchName.toLowerCase()) ?? null
      : null;
    const effectiveHours = ownHasSchedule ? r.workingHours : inheritedHours;
    return {
      // BranchStaff.id is the canonical key everywhere — chart, save action.
      id: r.id,
      // Fall back to a stable negative offset so the field stays a number.
      // Negative because real User.id values are positive; avoids collision.
      userId: linkedUserId ?? -r.id,
      employeeId: r.employeeId?.trim() || null,
      name:
        (r.name?.trim() || r.nickname?.trim() || r.email?.split("@")[0] || `Staff #${r.id}`),
      email: r.email?.trim() || "",
      phone: r.phone?.trim() || null,
      position: normalizePosition(r.role),
      branchId: branchName ? branchIdByName.get(branchName) ?? null : null,
      branchName,
      branchCode: null,
      branchLocation: r.location?.trim() || null,
      departmentId: canonicalDept ? departmentIdByName.get(canonicalDept) ?? null : null,
      departmentName: deptDisplay,
      departmentCode: null,
      joinedYear: startISO ? Number(startISO.slice(0, 4)) : null,
      startDate: startISO,
      endDate: endISO,
      isActive: (r.status ?? "").trim().toLowerCase() !== "inactive"
        && (r.status ?? "").trim().toLowerCase() !== "terminated"
        && (r.status ?? "").trim().toLowerCase() !== "resigned",
      workingHoursRaw: effectiveHours,
    };
  });

  const branches: DirectoryBranch[] = branchNames.map((name) => ({
    id: branchIdByName.get(name)!,
    name,
    code: null,
    location: branchLocationByName.get(name) ?? null,
  }));

  const departments: DirectoryDepartment[] = CANONICAL_DEPARTMENTS.map((d) => ({
    id: departmentIdByName.get(d.name)!,
    name: d.name,
    code: d.code,
  }));

  const sessionUser = session.user as { email?: string; role?: string; branchName?: string | null };

  return (
    <ClientShell>
      <StaffDirectory
        people={people}
        branches={branches}
        departments={departments}
        currentUser={{
          email: sessionUser.email ?? "",
          role: sessionUser.role ?? "",
          branchName: sessionUser.branchName ?? null,
        }}
      />
    </ClientShell>
  );
}
