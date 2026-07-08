import { NextRequest, NextResponse } from "next/server";
import { hrfsPrisma } from "@/lib/hrfs";
import { requireRole } from "@/lib/auth";
import { ROLES, type Role } from "@/lib/roles";

export const dynamic = "force-dynamic";

// Field Activity — a Marketing/Super-Admin/Admin-only register for staff out
// doing something away from any single branch (Showcase, Roadshow, Site
// Visit, etc). NOT tied to the FA (Feeder Academy) events system — purely a
// manual add-list, same paper-logbook model as Attendance Manual, and reuses
// its exact table (public.manual_attendance) so it automatically flows into
// Attendance Summary (Missing box, at the person's own branch) and Attendance
// Report the same way a branch's Attendance Manual tick does — zero extra
// code needed there. Field Activity rows are distinguished from regular
// Attendance Manual rows purely by having `reason` set (NOT NULL); regular
// branch-roster rows always have reason = NULL.
const FIELD_ACTIVITY_ROLES: readonly Role[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MARKETING];
const REASONS = new Set(["Showcase", "Roadshow", "Site Visit", "Others"]);
const STATUSES = new Set(["present", "absent"]);

let columnsEnsured: Promise<void> | null = null;
function ensureColumns(): Promise<void> {
  if (!columnsEnsured) {
    columnsEnsured = hrfsPrisma.$executeRawUnsafe(`
      ALTER TABLE public.manual_attendance
        ADD COLUMN IF NOT EXISTS reason      text,
        ADD COLUMN IF NOT EXISTS reason_note text
    `).then(() => undefined).catch((err) => {
      columnsEnsured = null;
      throw err;
    });
  }
  return columnsEnsured;
}

function todayKL(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

interface FieldActivityRow {
  id: string;
  branch: string;
  employee_id: string;
  employee_name: string;
  role: string | null;
  status: string | null;
  reason: string | null;
  reason_note: string | null;
}

// GET /api/field-activity?date=YYYY-MM-DD (defaults to today) — everyone
// added for Field Activity that day, across every branch (no branch filter;
// this view is deliberately branch-agnostic).
export async function GET(req: NextRequest) {
  const { error } = await requireRole(FIELD_ACTIVITY_ROLES);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.get("date") || "")
    ? (searchParams.get("date") as string)
    : todayKL();

  try {
    await ensureColumns();
    const rows = await hrfsPrisma.$queryRawUnsafe<FieldActivityRow[]>(
      `SELECT id::text, branch, employee_id, employee_name, role, status, reason, reason_note
         FROM public.manual_attendance
        WHERE work_date = $1::date AND reason IS NOT NULL
        ORDER BY employee_name`,
      date,
    );
    return NextResponse.json({
      date,
      entries: rows.map((r) => ({
        rowId: r.id,
        employeeId: r.employee_id,
        name: r.employee_name,
        role: r.role,
        branch: r.branch,
        status: r.status,
        reason: r.reason,
        reasonNote: r.reason_note,
      })),
    });
  } catch (err) {
    console.error("[api/field-activity GET] failed:", err);
    return NextResponse.json({ error: "Failed to load field activity" }, { status: 500 });
  }
}

// POST — two actions, discriminated by body.action:
//   { action: "add",    date?, employeeId, reason, reasonNote? }
//   { action: "status", date?, employeeId, status }  → present/absent, locked
//     after save (same rule as Attendance Manual).
export async function POST(req: NextRequest) {
  const { session, error } = await requireRole(FIELD_ACTIVITY_ROLES);
  if (error) return error;

  try {
    const body = await req.json();
    await ensureColumns();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(body?.date) ? body.date : todayKL();
    const enteredBy = (session.user as { name?: string | null; email?: string | null })?.name
      ?? (session.user as { email?: string | null })?.email ?? "unknown";

    if (body?.action === "add") {
      const employeeId = String(body?.employeeId || "").trim();
      const reason = String(body?.reason || "").trim();
      const reasonNote = body?.reasonNote ? String(body.reasonNote).trim().slice(0, 500) : null;
      if (!employeeId) return NextResponse.json({ error: "employeeId is required" }, { status: 400 });
      if (!REASONS.has(reason)) return NextResponse.json({ error: "Invalid reason" }, { status: 400 });

      const person = await hrfsPrisma.branchStaff.findFirst({ where: { employeeId }, select: { name: true, role: true, branch: true } });
      if (!person) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
      if (!person.branch) return NextResponse.json({ error: "This employee has no branch on file" }, { status: 400 });

      const rows = await hrfsPrisma.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO public.manual_attendance (branch, work_date, employee_id, employee_name, role, home_branch, is_adhoc, created_by, reason, reason_note)
         VALUES ($1, $2::date, $3, $4, $5, $1, true, $6, $7, $8)
         ON CONFLICT (branch, work_date, employee_id) DO UPDATE
           SET is_adhoc = true, reason = $7, reason_note = $8, updated_at = now()
         RETURNING id::text`,
        person.branch, date, employeeId, person.name, person.role, enteredBy, reason, reasonNote,
      );
      return NextResponse.json({ ok: true, rowId: rows[0].id });
    }

    if (body?.action === "status") {
      const employeeId = String(body?.employeeId || "").trim();
      const status = String(body?.status || "").trim().toLowerCase();
      if (!employeeId) return NextResponse.json({ error: "employeeId is required" }, { status: 400 });
      if (!STATUSES.has(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

      const existing = await hrfsPrisma.$queryRawUnsafe<{ id: string; status: string | null; branch: string }[]>(
        `SELECT id::text, status, branch FROM public.manual_attendance
          WHERE work_date = $1::date AND employee_id = $2 AND reason IS NOT NULL`,
        date, employeeId,
      );
      const target = existing[0];
      if (!target) return NextResponse.json({ error: "Not found — add them first." }, { status: 404 });
      if (target.status) {
        return NextResponse.json({ error: "Already saved for this day — it can no longer be changed." }, { status: 409 });
      }

      await hrfsPrisma.$executeRawUnsafe(
        `UPDATE public.manual_attendance SET status = $1, updated_at = now() WHERE id = $2::bigint`,
        status, target.id,
      );
      return NextResponse.json({ ok: true, status });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[api/field-activity POST] failed:", err);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}

// DELETE ?id=... — removes a Field Activity entry entirely (any status;
// unlike Attendance Manual's branch roster, every row here is ad hoc by
// nature, so there's no "clear status instead" fallback needed).
export async function DELETE(req: NextRequest) {
  const { error } = await requireRole(FIELD_ACTIVITY_ROLES);
  if (error) return error;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    await ensureColumns();

    const rows = await hrfsPrisma.$queryRawUnsafe<{ reason: string | null }[]>(
      `SELECT reason FROM public.manual_attendance WHERE id = $1::bigint`,
      id,
    );
    if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!rows[0].reason) {
      return NextResponse.json({ error: "Not a Field Activity entry" }, { status: 400 });
    }

    await hrfsPrisma.$executeRawUnsafe(`DELETE FROM public.manual_attendance WHERE id = $1::bigint`, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/field-activity DELETE] failed:", err);
    return NextResponse.json({ error: "Failed to remove entry" }, { status: 500 });
  }
}
