import { NextRequest, NextResponse } from "next/server";
import { hrfsPrisma } from "@/lib/hrfs";
import { requireRole } from "@/lib/auth";
import { MANAGEMENT_ROLES } from "@/lib/roles";

export const dynamic = "force-dynamic";

// Trial & Probation tracker, driven by public.career_applications.board_stage
// (the live recruitment-board stage name, e.g. "Candidate (CD)", "Trial",
// "Hired") — NOT the separate `stage` column, which uses its own unrelated
// vocabulary (new/screening/interview/offer) for a different pipeline and
// must never be overwritten by this feature:
//   board_stage='Trial'     → (feedback1 written, status1=complete) → 'Probation'
//   board_stage='Probation' → (feedback2 written, status2=accept|reject) → 'Hired' | 'Rejected'
// The 4 status/feedback columns are added on demand (ADD COLUMN IF NOT
// EXISTS) so no separate migration is needed — same self-provisioning idea
// as flagged_action_log.
async function ensureColumns(): Promise<void> {
  await hrfsPrisma.$executeRawUnsafe(`
    ALTER TABLE public.career_applications
      ADD COLUMN IF NOT EXISTS feedback1 text,
      ADD COLUMN IF NOT EXISTS feedback2 text,
      ADD COLUMN IF NOT EXISTS status1   text,
      ADD COLUMN IF NOT EXISTS status2   text`);
}

const SELECT_COLS =
  `id, name, position, board_stage, feedback1, feedback2, status1, status2`;

// GET → applications currently on the Trial or Probation board stage.
export async function GET() {
  const { error } = await requireRole(MANAGEMENT_ROLES);
  if (error) return error;
  try {
    await ensureColumns();
    const rows = await hrfsPrisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT ${SELECT_COLS} FROM public.career_applications
        WHERE LOWER(board_stage) IN ('trial', 'probation')
        ORDER BY board_stage, name`
    );
    return NextResponse.json({ entries: rows });
  } catch (err) {
    console.error("[api/hr-dashboard/trial-probation GET] failed:", err);
    return NextResponse.json({ error: "Failed to load trial/probation list" }, { status: 500 });
  }
}

// PATCH → save feedback text, or run a stage action.
// Body: { id, feedback1?, feedback2?, action? }
//   action: "complete_trial" → status1='accept', board_stage='Probation'
//           "reject_trial"   → status1='reject', board_stage='Rejected'
//           "accept"         → status2='accept', board_stage='Hired'
//           "reject"         → status2='reject', board_stage='Rejected'
export async function PATCH(req: NextRequest) {
  const { error } = await requireRole(MANAGEMENT_ROLES);
  if (error) return error;
  try {
    const body = await req.json();
    const id = Number(body?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "valid id is required" }, { status: 400 });
    }

    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (typeof body?.feedback1 === "string") { sets.push(`feedback1 = $${i++}`); vals.push(body.feedback1); }
    if (typeof body?.feedback2 === "string") { sets.push(`feedback2 = $${i++}`); vals.push(body.feedback2); }

    switch (body?.action) {
      case "complete_trial":
        sets.push(`status1 = 'accept'`, `board_stage = 'Probation'`);
        break;
      case "reject_trial":
        sets.push(`status1 = 'reject'`, `board_stage = 'Rejected'`);
        break;
      case "accept":
        sets.push(`status2 = 'accept'`, `board_stage = 'Hired'`);
        break;
      case "reject":
        sets.push(`status2 = 'reject'`, `board_stage = 'Rejected'`);
        break;
      case undefined:
      case null:
        break;
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: "nothing to update" }, { status: 400 });
    }

    await ensureColumns();
    sets.push(`updated_at = now()`);
    vals.push(id);
    const rows = await hrfsPrisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `UPDATE public.career_applications SET ${sets.join(", ")} WHERE id = $${i} RETURNING ${SELECT_COLS}`,
      ...vals,
    );
    if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("[api/hr-dashboard/trial-probation PATCH] failed:", err);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
