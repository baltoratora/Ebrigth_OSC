import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { hrfsPrisma } from "@/lib/hrfs";
import { requireRole } from "@/lib/auth";
import { MANAGEMENT_ROLES } from "@/lib/roles";
import { remapStScan } from "@/lib/scan-identity";

export const dynamic = "force-dynamic";

// Autocount Payroll EmployeeCode → real name/role/branch, sourced from
// ebrightleads_db.public.autocount_employee_map JOINed to hrfs."BranchStaff"
// (the SAME bridge the internal dashboard uses). Many part-timers' leave comes
// only through Autocount Payroll, whose API returns no name — so their
// LeaveTransaction.EmployeeName is NULL and they'd otherwise render as raw codes
// (e.g. "EBPT216"). This DB is reachable via FA_DATABASE_URL / LEADS_DB_URL.
interface AutocountEntry { name: string; role: string | null; branch: string | null; status: string | null; employeeId: string | null; }
let _leadsPool: Pool | null = null;
function leadsPool(): Pool | null {
  const url = process.env.FA_DATABASE_URL || process.env.LEADS_DB_URL;
  if (!url) return null;
  if (!_leadsPool) _leadsPool = new Pool({ connectionString: url, max: 3 });
  return _leadsPool;
}
async function loadAutocountMap(): Promise<Map<string, AutocountEntry>> {
  const m = new Map<string, AutocountEntry>();
  const pool = leadsPool();
  if (!pool) return m;
  try {
    const r = await pool.query(
      `SELECT m.autocount_code AS code, bs.name, bs.role, bs.branch, bs.status, bs."employeeId" AS employee_id
         FROM public.autocount_employee_map m
         JOIN hrfs."BranchStaff" bs ON bs.id = m.branchstaff_id
        WHERE bs.name IS NOT NULL AND TRIM(bs.name) <> ''`,
    );
    for (const row of r.rows) {
      m.set(String(row.code).trim().toUpperCase(), { name: row.name, role: row.role, branch: row.branch, status: row.status, employeeId: row.employee_id ?? null });
    }
  } catch (e) {
    console.warn("[hr-dashboard] autocount map load failed:", (e as Error).message);
  }
  return m;
}

// HR Overview Dashboard data — mirrors the internal-dashboard "HR Overview"
// (Onboarding · Offboarding · Annual Leave · MC · Flagged · MIA) and reads the
// SAME source of truth: ebright_hrfs public."BranchStaff" + "LeaveTransaction"
// (via hrfsPrisma). Both tables live in the same DB here, so we can JOIN them
// directly. We DON'T have the internal app's `autocount_employee_map` bridge,
// so leave→staff resolution uses LeaveTransaction.EmployeeName (+ a per-code
// latest-name lookup) name-matched to BranchStaff — the same chain minus the
// autocount step.

const ISO_DATE = String.raw`^\d{4}-\d{2}-\d{2}$`;

// BranchStaff projection used by onboarding/offboarding.
const STAFF_COLS = `
  id, name,
  role AS position,
  COALESCE(NULLIF(TRIM(department), ''), branch) AS department_branch,
  NULLIF(TRIM(start_date), '') AS start_date,
  NULLIF(TRIM("endDate"), '')  AS end_date
`;

// Role → PT / FT / INT bucket (for the "signed this month" counts).
const BUCKET_SQL = `
  CASE
    WHEN role ILIKE 'PT%' OR role ILIKE '%Part Time%'              THEN 'partTime'
    WHEN role ILIKE 'INT%' OR role ILIKE '%Intern%'                THEN 'intern'
    WHEN role ILIKE 'FT%' OR role ILIKE '%Full Time%'
      OR role IN ('BM','CEO','Executive/Coach')                     THEN 'fullTime'
    ELSE 'other'
  END`;

// signed_date is free-text in three shapes — parse each, COALESCE.
const SIGNED_DATE_PARSED = `
  COALESCE(
    CASE WHEN signed_date ~ '^\\d{4}-\\d{2}-\\d{2}$'
         THEN to_date(signed_date, 'YYYY-MM-DD') END,
    CASE WHEN signed_date ~ '^\\d{1,2}-[A-Za-z]{3}-\\d{2}$'
         THEN to_date(signed_date, 'FMDD-Mon-YY') END,
    CASE WHEN signed_date ~* '^\\d{1,2}(st|nd|rd|th)?\\s+[A-Za-z]+\\s+\\d{4}$'
         THEN to_date(regexp_replace(signed_date, '(?i)(\\d+)(st|nd|rd|th)', '\\1'),
                      'FMDD FMMonth YYYY') END
  )`;

// LeaveTransaction → resolved staff name/role/branch (no autocount bridge).
// Resolution order: BranchStaff name-match → LeaveTransaction.EmployeeName →
// latest EmployeeName for that code → MedicalLeave.name for that code → raw code.
// MedicalLeave bridges EmployeeCode → name for many part-timers whose code never
// carries a name on LeaveTransaction. Rows that still resolve to only the raw
// code (no name anywhere) are dropped in buildLeaveAlert().
const RESOLVED_LEAVE_FROM = `
  FROM "LeaveTransaction" lt
  LEFT JOIN LATERAL (
    SELECT "EmployeeName" FROM "LeaveTransaction" x
    WHERE x."EmployeeCode" = lt."EmployeeCode"
      AND x."EmployeeName" IS NOT NULL AND TRIM(x."EmployeeName") <> ''
    ORDER BY x.created_at DESC LIMIT 1
  ) nl ON true
  LEFT JOIN LATERAL (
    SELECT name FROM public."MedicalLeave" m
    WHERE m."employeeCode" = lt."EmployeeCode"
      AND m.name IS NOT NULL AND TRIM(m.name) <> ''
      AND UPPER(TRIM(m.name)) <> UPPER(TRIM(m."employeeCode"))
    ORDER BY m."createdAt" DESC NULLS LAST LIMIT 1
  ) ml ON true
  LEFT JOIN "BranchStaff" bs
    ON UPPER(TRIM(bs.name)) = UPPER(TRIM(COALESCE(NULLIF(TRIM(lt."EmployeeName"), ''), nl."EmployeeName")))`;

const RESOLVED_NAME = `COALESCE(bs.name, NULLIF(TRIM(lt."EmployeeName"), ''), nl."EmployeeName", ml.name, lt."EmployeeCode")`;

type WeekHours = Record<string, { start?: string; end?: string } | null> | null;
interface AlertLeaveRow {
  code: string; name: string; position: string | null; department_branch: string | null;
  leave_date: string; dow: string; reason: string | null; working_hours: WeekHours;
}
interface AlertRecord {
  code: string; name: string; position: string | null; department_branch: string | null;
  cnt: number; last_date: string | null; reason: string | null; flag_label: string;
  // Every working leave-day that triggered this alert, newest first — so the
  // card/detail view can show exactly which dates the person was on leave.
  dates: string[];
}

// ── Date helpers for episode grouping ──────────────────────────────────────
const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function dowOfDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return DOW_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}
function addDaysStr(dateStr: string, k: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + k));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
function daysBetweenStr(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}
function isWorkingDateWH(wh: WeekHours, dateStr: string): boolean {
  if (!wh) return true; // unknown schedule → treat as working
  const day = wh[dowOfDate(dateStr)];
  return !!(day && typeof day === "object");
}

// Count leave EPISODES for one person's (working-day) rows: a maximal run of
// consecutive days with the SAME reason is ONE leave (a single multi-day MC is
// one leave, not N). A calendar gap only continues the run when every day in
// between is a rest day — so a Fri + Mon sick note over the weekend counts as one
// leave, but Fri + next Wed (with a worked Tue in between) counts as two.
function countLeaveEpisodes(rows: AlertLeaveRow[]): number {
  const byDate = new Map<string, AlertLeaveRow>();
  for (const r of rows) if (!byDate.has(r.leave_date)) byDate.set(r.leave_date, r);
  const days = Array.from(byDate.keys()).sort();
  if (days.length === 0) return 0;
  let episodes = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1], cur = days[i];
    const sameReason = (byDate.get(prev)!.reason ?? "") === (byDate.get(cur)!.reason ?? "");
    const gap = daysBetweenStr(prev, cur);
    let consecutive = false;
    if (sameReason && gap >= 1) {
      consecutive = true;
      const wh = byDate.get(cur)!.working_hours;
      for (let k = 1; k < gap; k++) {
        if (isWorkingDateWH(wh, addDaysStr(prev, k))) { consecutive = false; break; }
      }
    }
    if (!consecutive) episodes++;
  }
  return episodes;
}

// Group approved leave-days of one type into per-person alert records, counting
// ONLY days the person is scheduled to work (BranchStaff.workingHours; unknown
// schedule → count every day). With opts.countEpisodes, consecutive same-reason
// days count as ONE leave (Flagged); otherwise each working day counts (MIA).
// Keep people whose count >= minCount.
function buildLeaveAlert(
  rows: AlertLeaveRow[], minCount: number, unit: string,
  opts: { countEpisodes?: boolean } = {},
): AlertRecord[] {
  const isWorkingDay = (r: AlertLeaveRow) => {
    const wh = r.working_hours;
    if (!wh) return true; // unknown schedule → count it
    const day = wh[r.dow];
    return !!(day && typeof day === "object");
  };
  const byCode = new Map<string, { r: AlertLeaveRow; days: Set<string>; rows: AlertLeaveRow[] }>();
  for (const r of rows) {
    if (!isWorkingDay(r)) continue;
    let p = byCode.get(r.code);
    if (!p) { p = { r, days: new Set(), rows: [] }; byCode.set(r.code, p); }
    p.days.add(r.leave_date);
    p.rows.push(r);
  }
  const out: AlertRecord[] = [];
  for (const p of byCode.values()) {
    const cnt = opts.countEpisodes ? countLeaveEpisodes(p.rows) : p.days.size;
    if (cnt < minCount) continue;
    const sorted = p.rows.slice().sort((a, b) => (a.leave_date < b.leave_date ? 1 : -1));
    const dates = Array.from(p.days).sort((a, b) => (a < b ? 1 : -1)); // newest first
    out.push({
      code: p.r.code, name: p.r.name, position: p.r.position, department_branch: p.r.department_branch,
      cnt, last_date: sorted[0]?.leave_date ?? null,
      reason: (sorted.find(x => x.reason) || {}).reason ?? null,
      flag_label: opts.countEpisodes
        ? `${cnt} ${unit} leave${cnt !== 1 ? "s" : ""}`
        : `${cnt} ${unit} days`,
      dates,
    });
  }
  out.sort((a, b) => b.cnt - a.cnt || ((a.last_date ?? "") < (b.last_date ?? "") ? 1 : -1));
  return out;
}

// Merge several alert lists into one record per employee. When the same person
// is flagged by more than one rule (e.g. ≥3 SL AND ≥2 UL), their labels and
// leave-dates are combined into a single row instead of appearing twice.
function mergeAlerts(...lists: AlertRecord[][]): AlertRecord[] {
  const byCode = new Map<string, AlertRecord>();
  for (const list of lists) {
    for (const rec of list) {
      const existing = byCode.get(rec.code);
      if (!existing) { byCode.set(rec.code, { ...rec, dates: [...rec.dates] }); continue; }
      existing.cnt += rec.cnt;
      existing.flag_label = `${existing.flag_label} · ${rec.flag_label}`;
      existing.dates = Array.from(new Set([...existing.dates, ...rec.dates])).sort((a, b) => (a < b ? 1 : -1));
      existing.last_date = (existing.last_date ?? "") >= (rec.last_date ?? "") ? existing.last_date : rec.last_date;
      existing.reason = existing.reason ?? rec.reason;
    }
  }
  return Array.from(byCode.values())
    .sort((a, b) => b.cnt - a.cnt || ((a.last_date ?? "") < (b.last_date ?? "") ? 1 : -1));
}

export async function GET(req: NextRequest) {
  const { error } = await requireRole(MANAGEMENT_ROLES);
  if (error) return error;

  const monthParam = String(req.nextUrl.searchParams.get("month") || "").trim();
  const useMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam);
  const monthExpr = useMonth ? "$1::date" : "CURRENT_DATE";
  const monthArgs = useMonth ? [`${monthParam}-01`] : [];

  // MIA card follows its own selectable month (defaults to the current month).
  // Regex-validated so it can be safely interpolated into the leave-date filter.
  const miaMonthParam = String(req.nextUrl.searchParams.get("miaMonth") || "").trim();
  const useMiaMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(miaMonthParam);

  // Flagged card follows its own selectable month too (defaults to current).
  const flaggedMonthParam = String(req.nextUrl.searchParams.get("flaggedMonth") || "").trim();
  const useFlaggedMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(flaggedMonthParam);

  try {
    // Autocount code → name bridge (matches the internal dashboard). Applied to
    // every leave card below so part-timers whose LeaveTransaction.EmployeeName
    // is NULL show their real name instead of a raw code (e.g. "EBPT216").
    const autocountMap = await loadAutocountMap();
    const resolveRow = <T extends { code?: string | null; name?: string | null; position?: string | null; department_branch?: string | null }>(row: T): T => {
      const code = row.code ? String(row.code).trim().toUpperCase() : "";
      if (code && (!row.name || row.name.trim() === "" || row.name === row.code) && autocountMap.has(code)) {
        const a = autocountMap.get(code)!;
        row.name = a.name;
        if (!row.position) row.position = a.role;
        if (!row.department_branch) row.department_branch = a.branch;
      }
      return row;
    };

    // ── Onboarding: start_date within -1 month .. +6 months, Active. ──
    const onboarding = await hrfsPrisma.$queryRawUnsafe<any[]>(
      `SELECT ${STAFF_COLS}
         FROM "BranchStaff"
        WHERE start_date ~ $1
          AND start_date::date >= CURRENT_DATE - INTERVAL '1 month'
          AND start_date::date <= CURRENT_DATE + INTERVAL '6 months'
          AND COALESCE(NULLIF(TRIM(status), ''), 'Active') ILIKE 'Active'
        ORDER BY (start_date::date < CURRENT_DATE),
                 CASE WHEN start_date::date >= CURRENT_DATE THEN start_date::date END ASC NULLS LAST,
                 start_date::date DESC`,
      ISO_DATE,
    );

    // ── Offboarding: endDate within -1 week .. +2 months (any status). ──
    const offboarding = await hrfsPrisma.$queryRawUnsafe<any[]>(
      `SELECT ${STAFF_COLS}
         FROM "BranchStaff"
        WHERE "endDate" ~ $1
          AND "endDate"::date >= CURRENT_DATE - INTERVAL '1 week'
          AND "endDate"::date <= CURRENT_DATE + INTERVAL '2 months'
        ORDER BY "endDate"::date ASC`,
      ISO_DATE,
    );

    // ── Signed this month → PT/FT/INT counts + list ──
    const SIGNED_IN_MONTH = `date_trunc('month', ${SIGNED_DATE_PARSED}) = date_trunc('month', ${monthExpr})
      AND COALESCE(NULLIF(TRIM(status), ''), 'Active') ILIKE 'Active'`;
    const bucketRows = await hrfsPrisma.$queryRawUnsafe<any[]>(
      `SELECT ${BUCKET_SQL} AS bucket, COUNT(*)::int AS n FROM "BranchStaff" WHERE ${SIGNED_IN_MONTH} GROUP BY 1`,
      ...monthArgs,
    );
    const signedCounts = { partTime: 0, fullTime: 0, intern: 0 } as Record<string, number>;
    for (const r of bucketRows) if (r.bucket in signedCounts) signedCounts[r.bucket] = Number(r.n);
    const signedStaff = await hrfsPrisma.$queryRawUnsafe<any[]>(
      `SELECT id, name, role AS position,
              COALESCE(NULLIF(TRIM(department), ''), branch) AS department_branch,
              ${SIGNED_DATE_PARSED}::text AS signed_date,
              NULLIF(TRIM(start_date), '') AS start_date,
              ${BUCKET_SQL} AS bucket
         FROM "BranchStaff" WHERE ${SIGNED_IN_MONTH}
        ORDER BY ${SIGNED_DATE_PARSED} DESC, name ASC`,
      ...monthArgs,
    );

    // ── Annual Leave: approved AL, today .. +14 days, deduped per person+date. ──
    let annualLeave = await hrfsPrisma.$queryRawUnsafe<any[]>(
      `SELECT id, code, name, position, department_branch, al_date, al_duration FROM (
         SELECT DISTINCT ON (lt."EmployeeCode", lt."LeaveDate"::date, lt."LeaveTypeCode")
                lt.id, lt."EmployeeCode" AS code,
                ${RESOLVED_NAME} AS name,
                bs.role AS position, bs.branch AS department_branch,
                lt."LeaveDate"::date AS al_date, lt."Days" AS al_duration
         ${RESOLVED_LEAVE_FROM}
         WHERE lt."LeaveTypeCode" = 'AL' AND lt."ApplyStatus" = 'A'
           AND lt."LeaveDate"::date >= CURRENT_DATE
           AND lt."LeaveDate"::date <= CURRENT_DATE + INTERVAL '14 days'
           AND (bs.status IS NULL OR bs.status <> 'Inactive')
         ORDER BY lt."EmployeeCode", lt."LeaveDate"::date, lt."LeaveTypeCode",
                  (bs.name IS NOT NULL) DESC, lt.created_at DESC
       ) d ORDER BY al_date ASC`,
    );

    // ── MC: every approved NON-AL leave, -1 month .. today, deduped, newest first. ──
    let mc = await hrfsPrisma.$queryRawUnsafe<any[]>(
      `SELECT id, code, name, position, department_branch, mc_date, leave_type, reason FROM (
         SELECT DISTINCT ON (lt."EmployeeCode", lt."LeaveDate"::date, lt."LeaveTypeCode")
                lt.id, lt."EmployeeCode" AS code,
                ${RESOLVED_NAME} AS name,
                bs.role AS position, bs.branch AS department_branch,
                lt."LeaveDate"::date AS mc_date,
                lt."LeaveTypeCode" AS leave_type, lt."ApplyReason" AS reason
         ${RESOLVED_LEAVE_FROM}
         WHERE lt."LeaveTypeCode" IS NOT NULL AND lt."LeaveTypeCode" <> 'AL' AND lt."ApplyStatus" = 'A'
           AND lt."LeaveDate"::date >= CURRENT_DATE - INTERVAL '1 month'
           AND lt."LeaveDate"::date <= CURRENT_DATE
           AND (bs.status IS NULL OR bs.status <> 'Inactive')
         ORDER BY lt."EmployeeCode", lt."LeaveDate"::date, lt."LeaveTypeCode",
                  (bs.name IS NOT NULL) DESC, lt.created_at DESC
       ) d ORDER BY mc_date DESC`,
    );

    // ── Flagged (SL>2 this month) + MIA (UL last 2 weeks) — working-day filtered. ──
    const alertRowsSql = (leaveType: string, dateCond: string) =>
      `SELECT lt."EmployeeCode" AS code,
              ${RESOLVED_NAME} AS name,
              bs.role AS position, bs.branch AS department_branch,
              to_char(lt."LeaveDate"::date, 'YYYY-MM-DD') AS leave_date,
              trim(to_char(lt."LeaveDate"::date, 'Dy')) AS dow,
              NULLIF(TRIM(lt."ApplyReason"), '') AS reason,
              bs."workingHours" AS working_hours
       ${RESOLVED_LEAVE_FROM}
       WHERE lt."LeaveTypeCode" = '${leaveType}' AND lt."ApplyStatus" = 'A'
         AND ${dateCond}
         AND (bs.status IS NULL OR bs.status <> 'Inactive')`;
    const THIS_MONTH = `date_trunc('month', lt."LeaveDate"::date) = date_trunc('month', CURRENT_DATE)`;
    // MIA UL window = the selected month (defaults to the current month).
    const MIA_MONTH = useMiaMonth
      ? `date_trunc('month', lt."LeaveDate"::date) = '${miaMonthParam}-01'::date`
      : THIS_MONTH;
    // Flagged window = its own selected month (defaults to the current month).
    const FLAGGED_MONTH = useFlaggedMonth
      ? `date_trunc('month', lt."LeaveDate"::date) = '${flaggedMonthParam}-01'::date`
      : THIS_MONTH;

    let slRows = await hrfsPrisma.$queryRawUnsafe<AlertLeaveRow[]>(alertRowsSql("SL", FLAGGED_MONTH));
    let ulRows = await hrfsPrisma.$queryRawUnsafe<AlertLeaveRow[]>(alertRowsSql("UL", MIA_MONTH));
    // UL in the flagged month feeds the Flagged card (≥2 UL days), separate from
    // the MIA card's own selected-month UL window above.
    let ulMonthRows = await hrfsPrisma.$queryRawUnsafe<AlertLeaveRow[]>(alertRowsSql("UL", FLAGGED_MONTH));
    // Exclude staff the autocount map ties to an Inactive BranchStaff — the
    // internal dashboard drops these via its autocount JOIN + status filter, but
    // our SQL can't JOIN that cross-DB table, so we apply the same exclusion in
    // JS. Then resolve Autocount-only codes to real names across every card.
    const isInactiveCode = (code?: string | null) => {
      const c = code ? String(code).trim().toUpperCase() : "";
      return !!c && autocountMap.get(c)?.status === "Inactive";
    };
    annualLeave = annualLeave.filter((r: any) => !isInactiveCode(r.code)).map(resolveRow);
    mc = mc.filter((r: any) => !isInactiveCode(r.code)).map(resolveRow);
    slRows = slRows.filter(r => !isInactiveCode(r.code)).map(resolveRow);
    ulRows = ulRows.filter(r => !isInactiveCode(r.code)).map(resolveRow);
    ulMonthRows = ulMonthRows.filter(r => !isInactiveCode(r.code)).map(resolveRow);
    // Flagged = repeat offenders this month: ≥2 SL leaves OR ≥2 UL leaves, where
    // consecutive same-reason days count as ONE leave (a multi-day MC ≠ many
    // flags). A person hit by both rules is merged into one row.
    const flagged = mergeAlerts(
      buildLeaveAlert(slRows, 2, "SL", { countEpisodes: true }),
      buildLeaveAlert(ulMonthRows, 2, "UL", { countEpisodes: true }),
    );
    // MIA still counts UL working-days (unchanged): any UL day surfaces here.
    const mia = buildLeaveAlert(ulRows, 1, "UL");

    // Mark whether HR has already completed the escalation action for each
    // flagged person this month (verbal @2 / email @3 / show-cause @4+). The
    // tier is derived from their flagged-day count, matching the UI.
    const flaggedTier = (cnt: number) => (cnt >= 4 ? "show_cause" : cnt === 3 ? "email" : "verbal");
    const klMonth = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).slice(0, 7);
    const flaggedMonthKey = useFlaggedMonth ? flaggedMonthParam : klMonth;
    try {
      await hrfsPrisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS public.flagged_action_log (
          emp_code text NOT NULL, action_month text NOT NULL, tier text NOT NULL,
          completed_by text, completed_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (emp_code, action_month, tier))`);
      const done = await hrfsPrisma.$queryRawUnsafe<{ emp_code: string; tier: string }[]>(
        `SELECT emp_code, tier FROM public.flagged_action_log WHERE action_month = $1`,
        flaggedMonthKey,
      );
      const doneSet = new Set(done.map(r => `${r.emp_code}|${r.tier}`));
      flagged.forEach((f: any) => { f.actionDone = doneSet.has(`${f.code}|${flaggedTier(f.cnt)}`); });
    } catch (e) {
      console.error("[hr-dashboard] flag-action enrich failed:", (e as Error).message);
    }

    // ── Missing today: scheduled staff who haven't scanned (changes each day) ──
    // Appended to the MIA card. "Expected" = active + a working slot today (per
    // BranchStaff.workingHours) whose start time has passed; minus anyone who
    // scanned (ST-remapped), is on approved leave, or has a recorded
    // justification today. All "today" filters use Kuala Lumpur wall-time.
    const todayKL = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
    const dowKL = new Date().toLocaleDateString("en-US", { weekday: "short", timeZone: "Asia/Kuala_Lumpur" });
    const klTime = new Date().toLocaleTimeString("en-GB", { hour12: false, timeZone: "Asia/Kuala_Lumpur" });
    const nowSeconds = (() => { const [h, m] = klTime.split(":").map(Number); return (h || 0) * 3600 + (m || 0) * 60; })();
    const toSeconds = (t?: string) => { if (!t) return 0; const [h, m] = t.split(":").map(Number); return (h || 0) * 3600 + (m || 0) * 60; };

    interface StaffRow {
      code: string; name: string; position: string | null; department_branch: string | null;
      branch: string | null; working_hours: WeekHours; start_date: string | null; end_date: string | null;
    }
    // HQ, ST, and department codes that sometimes leak into BranchStaff.branch
    // (od/mkt/ops/fnc/hr/acd/iop/ceo/op/fin) all use the real scanner — every
    // OTHER branch code uses Attendance Manual instead (no scanner device yet).
    // This mirrors the exact branch classification Attendance Manual itself uses.
    const SCANNER_BRANCH_CODES = new Set([
      "hq", "st", "od", "mkt", "ops", "fnc", "hr", "acd", "iop", "ceo", "op", "fin",
    ]);
    const isScannerBranch = (b: string | null) => !b || SCANNER_BRANCH_CODES.has(b.trim().toLowerCase());

    const staffRows = await hrfsPrisma.$queryRawUnsafe<StaffRow[]>(
      `SELECT "employeeId" AS code, name, role AS position,
              COALESCE(NULLIF(TRIM(department), ''), branch) AS department_branch,
              branch,
              "workingHours" AS working_hours,
              NULLIF(TRIM(start_date), '') AS start_date,
              NULLIF(TRIM("endDate"), '')  AS end_date
         FROM "BranchStaff"
        WHERE COALESCE(NULLIF(TRIM(status), ''), 'Active') ILIKE 'Active'
          AND "employeeId" IS NOT NULL AND "employeeId" <> ''`,
    );
    const scanRows = await hrfsPrisma.$queryRawUnsafe<{ person_id: string; device_id: string | null }[]>(
      `SELECT DISTINCT person_id, device_id
         FROM public.hikvision_attendance_all
        WHERE event_time::date = $1::date
          AND person_id IS NOT NULL AND person_id <> '' AND person_id <> '0'`,
      todayKL,
    );
    const scannedSet = new Set(scanRows.map(r => remapStScan(r.device_id, r.person_id, null).personId));
    // Attendance Manual branches: ANY tick today (present/absent/leave/mia/late)
    // counts as "accounted for" — they were looked at and marked, whatever the
    // status says, so they shouldn't also show up as "missing".
    let manualTickedSet = new Set<string>();
    try {
      const manualRows = await hrfsPrisma.$queryRawUnsafe<{ employee_id: string }[]>(
        `SELECT DISTINCT employee_id FROM public.manual_attendance
          WHERE work_date = $1::date AND status IS NOT NULL`,
        todayKL,
      );
      manualTickedSet = new Set(manualRows.map(r => r.employee_id));
    } catch {
      // manual_attendance not provisioned yet (feature never used) — nobody ticked.
    }
    // Anyone on approved leave today → resolve their payroll code to the numeric
    // employeeId so they're excluded from "Missing today". Two bridges, unioned:
    //   (a) autocount_employee_map (payroll code → employeeId) — the reliable one;
    //   (b) name-match on lt.EmployeeName (a fallback; that column is often NULL).
    // Matching only on EmployeeName wrongly nagged people on leave (e.g. an MC).
    const leaveCodeRows = await hrfsPrisma.$queryRawUnsafe<{ code: string }[]>(
      `SELECT DISTINCT lt."EmployeeCode" AS code
         FROM "LeaveTransaction" lt
        WHERE lt."ApplyStatus" = 'A' AND lt."LeaveDate"::date = $1::date
          AND lt."EmployeeCode" IS NOT NULL`,
      todayKL,
    );
    const leaveNameRows = await hrfsPrisma.$queryRawUnsafe<{ code: string }[]>(
      `SELECT DISTINCT bs."employeeId" AS code
         FROM "LeaveTransaction" lt
         JOIN "BranchStaff" bs ON UPPER(TRIM(bs.name)) = UPPER(TRIM(lt."EmployeeName"))
        WHERE lt."ApplyStatus" = 'A' AND lt."LeaveDate"::date = $1::date
          AND bs."employeeId" IS NOT NULL`,
      todayKL,
    );
    const onLeaveSet = new Set<string>();
    for (const { code } of leaveCodeRows) {
      const emp = autocountMap.get(String(code).trim().toUpperCase())?.employeeId;
      if (emp) onLeaveSet.add(emp);
    }
    for (const { code } of leaveNameRows) if (code) onLeaveSet.add(code);
    const justRows = await hrfsPrisma.$queryRawUnsafe<{ code: string }[]>(
      `SELECT emp_no AS code FROM public.attendance_justification WHERE just_date = $1::date`,
      todayKL,
    );
    const justifiedSet = new Set(justRows.map(r => r.code));

    const parseDay = (s: string | null): Date | null => {
      if (!s) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + "T00:00:00");
      const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00`);
      return null;
    };
    const todayDate = new Date(todayKL + "T00:00:00");

    // Staff intentionally hidden from attendance tracking — never shown as
    // "Missing today" (mirrors ATTENDANCE_HIDDEN_EMPLOYEE_IDS in branch-locations).
    const HIDDEN_EMPLOYEE_IDS = new Set(["33030010", "33010041"]); // CHOW CHIN HUI, ROHAN KUMAR A/L MANOHAR LAL

    const miaMissingToday = staffRows.filter(s => {
      if (HIDDEN_EMPLOYEE_IDS.has(s.code)) return false;
      // Active window
      const sd = parseDay(s.start_date); if (sd && sd > todayDate) return false;
      const ed = parseDay(s.end_date);   if (ed && ed < todayDate) return false;
      // Must have a working slot today (rest day / no schedule → not flagged here)
      const wh = s.working_hours;
      if (!wh || typeof wh !== "object") return false;
      const day = (wh as Record<string, { start?: string; end?: string } | null>)[dowKL];
      if (!day || typeof day !== "object") return false;
      // Not yet "missing" until the scheduled start time has passed
      if (nowSeconds < toSeconds(day.start)) return false;
      // Accounted for elsewhere? Scanner branches check real scans; branches
      // using Attendance Manual (no scanner) check whether they were ticked.
      const accountedFor = isScannerBranch(s.branch) ? scannedSet.has(s.code) : manualTickedSet.has(s.code);
      if (accountedFor || onLeaveSet.has(s.code) || justifiedSet.has(s.code)) return false;
      return true;
    }).map(s => ({
      code: s.code, name: s.name, position: s.position, department_branch: s.department_branch,
    }));

    // "Missing today" only makes sense for the current month — when the MIA card
    // is viewing a past/other month, there's no "today" inside it.
    const currentYM = todayKL.slice(0, 7);
    const miaMonth = useMiaMonth ? miaMonthParam : currentYM;
    const miaMissingTodayOut = miaMonth === currentYM ? miaMissingToday : [];

    return NextResponse.json({
      onboarding, offboarding, signedCounts, signedStaff,
      signedMonth: useMonth ? monthParam : new Date().toISOString().slice(0, 7),
      annualLeave, mc, flagged, flaggedMonth: useFlaggedMonth ? flaggedMonthParam : currentYM,
      mia, miaMonth,
      miaMissingToday: miaMissingTodayOut, miaMissingDate: todayKL,
    });
  } catch (err: any) {
    console.error("HR Dashboard API error:", err);
    return NextResponse.json({ error: err?.message || "Failed to load HR dashboard" }, { status: 500 });
  }
}
