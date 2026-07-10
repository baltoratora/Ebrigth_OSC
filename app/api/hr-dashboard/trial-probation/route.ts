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
// trial_date: the Trial-period warning/end date. Unlike Probation (which
// already has BranchStaff.probation to read from), there's no existing source
// for this on the recruitment side — self-provisioned here, NULL until
// something populates it, so the read path is ready the moment it is.
async function ensureColumns(): Promise<void> {
  await hrfsPrisma.$executeRawUnsafe(`
    ALTER TABLE public.career_applications
      ADD COLUMN IF NOT EXISTS feedback1  text,
      ADD COLUMN IF NOT EXISTS feedback2  text,
      ADD COLUMN IF NOT EXISTS status1    text,
      ADD COLUMN IF NOT EXISTS status2    text,
      ADD COLUMN IF NOT EXISTS trial_date text`);
}

const SELECT_COLS =
  `id, name, position, board_stage, feedback1, feedback2, status1, status2, trial_date`;

// Malaysian Indian naming carries a relationship infix — "A/P"/"D/O" (daughter
// of) and "A/L"/"S/O" (son of) are the same thing spelled two ways, and
// career_applications vs BranchStaff often disagree on which. Strip it from
// both sides before comparing so they still match as the same person. Same
// helper as app/api/hr-dashboard/route.ts (kept local — each API route in
// this app owns its own small SQL helpers rather than sharing one).
const stripHonorific = (col: string) =>
  `TRIM(REGEXP_REPLACE(REGEXP_REPLACE(UPPER(TRIM(${col})), '(A/L|A/P|S/O|D/O)', '', 'g'), '\\s+', ' ', 'g'))`;

// GET → applications currently on the Trial or Probation board stage.
//   role / branch / department shown on the card come from BranchStaff (the
//   HR Employee Management / "Employee Dashboard" record) whenever the
//   applicant is matched there — email match first (most reliable), falling
//   back to the honorific-tolerant name match. Once someone is actually hired
//   and in BranchStaff, this ensures the card always follows the canonical
//   record instead of the (possibly stale) recruitment-application snapshot.
//   Falls back to the application's own position/branch/department only when
//   no BranchStaff record exists yet (still pre-hire).
//
//   warning_date is the "this person's stage ends around here" date shown on
//   the card: for Probation it's BranchStaff.probation (already populated —
//   the Employee Dashboard's own probation-end field); for Trial it's
//   career_applications.trial_date, which is currently always NULL until
//   something populates it — the read path is wired up ahead of that.
export async function GET() {
  const { error } = await requireRole(MANAGEMENT_ROLES);
  if (error) return error;
  try {
    await ensureColumns();
    const rows = await hrfsPrisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT ca.id, ca.name, ca.board_stage, ca.feedback1, ca.feedback2, ca.status1, ca.status2,
              COALESCE(bs.role, ca.position)                         AS position,
              COALESCE(NULLIF(TRIM(bs.branch), ''), NULLIF(TRIM(ca.branch), ''))         AS branch,
              COALESCE(NULLIF(TRIM(bs.department), ''), NULLIF(TRIM(ca.department), '')) AS department,
              CASE WHEN LOWER(ca.board_stage) = 'probation' THEN NULLIF(TRIM(bs.probation), '')
                   ELSE NULLIF(TRIM(ca.trial_date), '')
              END AS warning_date
         FROM public.career_applications ca
         LEFT JOIN LATERAL (
           SELECT role, branch, department, email, probation
             FROM "BranchStaff" bs
            WHERE (ca.email IS NOT NULL AND TRIM(ca.email) <> '' AND LOWER(TRIM(bs.email)) = LOWER(TRIM(ca.email)))
               OR ${stripHonorific('bs.name')} = ${stripHonorific('ca.name')}
            ORDER BY (LOWER(TRIM(bs.email)) = LOWER(TRIM(ca.email))) DESC NULLS LAST
            LIMIT 1
         ) bs ON true
        WHERE LOWER(ca.board_stage) IN ('trial', 'probation')
        ORDER BY ca.board_stage, ca.name`
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
