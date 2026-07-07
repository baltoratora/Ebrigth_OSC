import { NextRequest, NextResponse } from "next/server";
import { hrfsPrisma } from "@/lib/hrfs";
import { requireRole, canSeeAllBranches } from "@/lib/auth";
import { MANAGEMENT_ROLES } from "@/lib/roles";
import { hasSchedule, slotForDate } from "@/lib/working-hours";

export const dynamic = "force-dynamic";

// Attendance Manual — a per-branch daily register for branches that don't have
// a scanner device yet. Independent of the scanner pipeline
// (public.hikvision_attendance_all) — its own self-provisioned table, same
// pattern as flagged_action_log / career_applications elsewhere in this app.
//
// Scope: every branch EXCEPT HQ and ST (Subang Taipan).
//
// Model (paper-logbook style, not clock-in/out): each person gets ONE status
// per day — Present / Absent / Leave / MIA / Late — picked from a dropdown.
// The roster is computed live from BranchStaff (same source Staff Directory
// reads) for the SELECTED date (any date, past/present/future):
//   - active, started on/before the date, not yet ended
//   - has a working-hours slot for that weekday (or no schedule at all, in
//     which case we show them anyway rather than guess they're off)
// A row in manual_attendance exists only once someone has an actual status
// set, OR was added as a replacement/extra for the day.

const EXCLUDED_BRANCHES = new Set(["hq", "st"]);
const STATUSES = new Set(["present", "absent", "leave", "mia", "late"]);

let tableEnsured: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (!tableEnsured) {
    tableEnsured = (async () => {
      await hrfsPrisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS public.manual_attendance (
          id            bigserial PRIMARY KEY,
          branch        text NOT NULL,
          work_date     date NOT NULL,
          employee_id   text NOT NULL,
          employee_name text NOT NULL,
          role          text,
          home_branch   text,
          is_adhoc      boolean NOT NULL DEFAULT false,
          status        text,
          created_by    text,
          created_at    timestamptz NOT NULL DEFAULT now(),
          updated_at    timestamptz NOT NULL DEFAULT now(),
          UNIQUE (branch, work_date, employee_id)
        )
      `);
      // CREATE TABLE IF NOT EXISTS is a no-op when the table already exists
      // with an older shape (e.g. from an earlier version of this feature) —
      // it does NOT add missing columns. These ADD COLUMN IF NOT EXISTS calls
      // self-heal that case so a stale table can never silently 500 again.
      await hrfsPrisma.$executeRawUnsafe(`
        ALTER TABLE public.manual_attendance
          ADD COLUMN IF NOT EXISTS home_branch text,
          ADD COLUMN IF NOT EXISTS status       text
      `);
    })().catch((err) => {
      tableEnsured = null;
      throw err;
    });
  }
  return tableEnsured;
}

function todayKL(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

// Current Kuala Lumpur wall-clock time as seconds since midnight.
function nowKLSeconds(): number {
  const t = new Date().toLocaleTimeString("en-GB", { hour12: false, timeZone: "Asia/Kuala_Lumpur" });
  const [h, m, sec] = t.split(":").map(Number);
  return (h || 0) * 3600 + (m || 0) * 60 + (sec || 0);
}
// "HH:MM" or "HH:MM:SS" → seconds since midnight.
function timeToSeconds(t: string): number {
  const [h, m, s] = t.split(":").map(Number);
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
}

// Same loose date parsing Staff Directory uses for BranchStaff.start_date /
// endDate (free-text field with mixed formats) — kept in sync deliberately.
function parseLooseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const num = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (num) {
    let [, a, b, y] = num;
    let dd = Number(a);
    let mm = Number(b);
    if (mm > 12 && dd <= 12) [dd, mm] = [mm, dd];
    if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return null;
    let yyyy = Number(y);
    if (yyyy < 100) yyyy += yyyy >= 70 ? 1900 : 2000;
    return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = parsed.getMonth() + 1;
    const d = parsed.getDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return null;
}

function branchGuard(session: { user?: unknown }, branch: string): NextResponse | null {
  if (EXCLUDED_BRANCHES.has(branch.trim().toLowerCase())) {
    return NextResponse.json({ error: "HQ and ST are not available in Attendance Manual." }, { status: 400 });
  }
  const sessionUser = session.user as { branchName?: string | null } | undefined;
  if (!canSeeAllBranches(session as Parameters<typeof canSeeAllBranches>[0]) && branch !== sessionUser?.branchName) {
    return NextResponse.json({ error: "Forbidden: cross-branch operation" }, { status: 403 });
  }
  return null;
}

interface ManualRow {
  id: string;
  employee_id: string;
  employee_name: string;
  role: string | null;
  home_branch: string | null;
  is_adhoc: boolean;
  status: string | null;
}

// GET /api/attendance-manual?branch=XX&date=YYYY-MM-DD (date defaults to today)
export async function GET(req: NextRequest) {
  const { session, error } = await requireRole(MANAGEMENT_ROLES);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const sessionUser = session.user as { branchName?: string | null };
  const branch = canSeeAllBranches(session) ? (searchParams.get("branch") || "") : (sessionUser.branchName ?? "");
  if (!branch) return NextResponse.json({ error: "branch is required" }, { status: 400 });
  const guard = branchGuard(session, branch);
  if (guard) return guard;

  const date = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.get("date") || "") ? (searchParams.get("date") as string) : todayKL();

  try {
    await ensureTable();

    const staff = await hrfsPrisma.branchStaff.findMany({
      where: { branch, status: { not: "Inactive" }, employeeId: { not: null } },
      select: { employeeId: true, name: true, role: true, workingHours: true, start_date: true, endDate: true },
      orderBy: { name: "asc" },
    });
    // Only for TODAY: hold a person off the roster until their scheduled start
    // time actually arrives (an 11pm start shouldn't appear at 9pm). Past/future
    // dates aren't "live", so this clock-time gate doesn't apply to them.
    const isToday = date === todayKL();
    const nowSeconds = isToday ? nowKLSeconds() : null;
    const expected = staff.filter((s) => {
      const start = parseLooseDate(s.start_date);
      if (start && start > date) return false; // not started yet on this date
      const end = parseLooseDate(s.endDate);
      if (end && end < date) return false; // already ended by this date
      if (!hasSchedule(s.workingHours)) return true; // no schedule at all → show anyway
      const slot = slotForDate(s.workingHours, date);
      if (!slot) return false; // day off (or, defensively, no slot resolved)
      if (nowSeconds !== null && nowSeconds < timeToSeconds(slot.start)) return false; // shift hasn't started yet today
      return true;
    });

    const rows = await hrfsPrisma.$queryRawUnsafe<ManualRow[]>(
      `SELECT id::text, employee_id, employee_name, role, home_branch, is_adhoc, status
         FROM public.manual_attendance
        WHERE branch = $1 AND work_date = $2::date`,
      branch, date,
    );
    const byEmployeeId = new Map(rows.map((r) => [r.employee_id, r]));
    const expectedIds = new Set(expected.map((s) => s.employeeId as string));

    const result = expected.map((s) => {
      const r = byEmployeeId.get(s.employeeId as string);
      return {
        rowId: r?.id ?? null,
        employeeId: s.employeeId,
        name: s.name,
        role: s.role,
        homeBranch: null as string | null,
        isAdhoc: false,
        status: r?.status ?? null,
      };
    });
    // Rows that exist in manual_attendance but aren't part of today's expected
    // roster are replacements/extras added for the day (possibly borrowed
    // from another branch) — surfaced separately, tagged with their home branch.
    for (const r of rows) {
      if (expectedIds.has(r.employee_id)) continue;
      result.push({
        rowId: r.id,
        employeeId: r.employee_id,
        name: r.employee_name,
        role: r.role,
        homeBranch: r.home_branch,
        isAdhoc: true,
        status: r.status,
      });
    }

    return NextResponse.json({ date, staff: result });
  } catch (err) {
    console.error("[api/attendance-manual GET] failed:", err);
    return NextResponse.json({ error: "Failed to load attendance" }, { status: 500 });
  }
}

// POST — two actions, discriminated by body.action:
//   { action: "add",    branch, date?, employeeId }
//     → adds a replacement/extra person (picked from ANY branch) to this
//       branch's roster for the date.
//   { action: "status", branch, date?, employeeId, status }
//     → sets a person's status for the day. status one of present/absent/
//       leave/mia/late, or null to clear it back to "not marked".
export async function POST(req: NextRequest) {
  const { session, error } = await requireRole(MANAGEMENT_ROLES);
  if (error) return error;

  try {
    const body = await req.json();
    const branch = String(body?.branch || "").trim();
    if (!branch) return NextResponse.json({ error: "branch is required" }, { status: 400 });
    const guard = branchGuard(session, branch);
    if (guard) return guard;

    await ensureTable();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(body?.date) ? body.date : todayKL();
    const enteredBy = (session.user as { name?: string | null; email?: string | null })?.name
      ?? (session.user as { email?: string | null })?.email ?? "unknown";

    if (body?.action === "add") {
      const employeeId = String(body?.employeeId || "").trim();
      if (!employeeId) return NextResponse.json({ error: "employeeId is required" }, { status: 400 });
      const person = await hrfsPrisma.branchStaff.findFirst({ where: { employeeId }, select: { name: true, role: true, branch: true } });
      if (!person) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
      const rows = await hrfsPrisma.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO public.manual_attendance (branch, work_date, employee_id, employee_name, role, home_branch, is_adhoc, created_by)
         VALUES ($1, $2::date, $3, $4, $5, $6, true, $7)
         ON CONFLICT (branch, work_date, employee_id) DO UPDATE SET updated_at = now()
         RETURNING id::text`,
        branch, date, employeeId, person.name, person.role, person.branch, enteredBy,
      );
      return NextResponse.json({ ok: true, rowId: rows[0].id });
    }

    if (body?.action === "status") {
      const employeeId = String(body?.employeeId || "").trim();
      const status = body?.status === null ? null : String(body?.status || "").trim().toLowerCase();
      if (!employeeId) return NextResponse.json({ error: "employeeId is required" }, { status: 400 });
      if (status !== null && !STATUSES.has(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      const person = await hrfsPrisma.branchStaff.findFirst({ where: { employeeId }, select: { name: true, role: true, branch: true } });
      if (!person) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

      const rows = await hrfsPrisma.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO public.manual_attendance (branch, work_date, employee_id, employee_name, role, home_branch, created_by, status, updated_at)
         VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, now())
         ON CONFLICT (branch, work_date, employee_id)
         DO UPDATE SET status = $8, updated_at = now()
         RETURNING id::text`,
        branch, date, employeeId, person.name, person.role, person.branch, enteredBy, status,
      );
      return NextResponse.json({ ok: true, rowId: rows[0].id, status });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[api/attendance-manual POST] failed:", err);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}

// DELETE ?id=... — removes a replacement/extra row entirely. Only allowed for
// ad hoc (is_adhoc=true) rows; a regular roster member's row is never deleted
// outright — clear their status back to null via POST action=status instead.
export async function DELETE(req: NextRequest) {
  const { session, error } = await requireRole(MANAGEMENT_ROLES);
  if (error) return error;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    await ensureTable();

    const rows = await hrfsPrisma.$queryRawUnsafe<{ branch: string; is_adhoc: boolean }[]>(
      `SELECT branch, is_adhoc FROM public.manual_attendance WHERE id = $1::bigint`,
      id,
    );
    const target = rows[0];
    if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const guard = branchGuard(session, target.branch);
    if (guard) return guard;
    if (!target.is_adhoc) {
      return NextResponse.json({ error: "Only replacement/extra entries can be removed. Clear the status instead." }, { status: 400 });
    }

    await hrfsPrisma.$executeRawUnsafe(`DELETE FROM public.manual_attendance WHERE id = $1::bigint`, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/attendance-manual DELETE] failed:", err);
    return NextResponse.json({ error: "Failed to remove entry" }, { status: 500 });
  }
}
