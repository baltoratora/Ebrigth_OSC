import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { MANAGEMENT_ROLES } from "@/lib/roles";
import { computeBranchMissingCandidates, sendBranchMissingReminders } from "@/lib/branch-missing-reminder";

export const dynamic = "force-dynamic";

// GET /api/hr-dashboard/branch-missing-reminder
//   PREVIEW ONLY — same idea as /api/hr-dashboard/missing-reminder (HQ), but
//   for every other branch's manual-tick Missing box. Claims each person's
//   first-seen timestamp (so the 30-min clock starts) but sends no email.
export async function GET() {
  const { error } = await requireRole(MANAGEMENT_ROLES);
  if (error) return error;

  try {
    const candidates = await computeBranchMissingCandidates();
    return NextResponse.json({
      now: new Date().toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur" }),
      schedulerEnabled: process.env.MISSING_REMINDER_EMAIL === "on",
      hrEmailConfigured: !!process.env.HR_JUSTIFY_EMAIL,
      count: candidates.length,
      candidates, // [{ name, branch, firstSeenAt, email }]
    });
  } catch (err) {
    console.error("[api/hr-dashboard/branch-missing-reminder GET] failed:", err);
    return NextResponse.json({ error: "Failed to compute candidates" }, { status: 500 });
  }
}

// POST /api/hr-dashboard/branch-missing-reminder   body: { "confirm": true }
//   Runs the real sweep once now (respects the 30-min-since-first-seen gate
//   and the once-per-day dedup) — for on-demand testing.
export async function POST(req: NextRequest) {
  const { error } = await requireRole(MANAGEMENT_ROLES);
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== true) {
    return NextResponse.json(
      { error: "Pass { confirm: true } to actually send. Use GET to preview first." },
      { status: 400 }
    );
  }

  try {
    const result = await sendBranchMissingReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[api/hr-dashboard/branch-missing-reminder POST] failed:", err);
    return NextResponse.json({ error: "Failed to send reminders" }, { status: 500 });
  }
}
