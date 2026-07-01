import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { MANAGEMENT_ROLES } from "@/lib/roles";
import { computeMissingCandidates, sendMissingReminders } from "@/lib/missing-reminder";

export const dynamic = "force-dynamic";

// GET  /api/hr-dashboard/missing-reminder
//   PREVIEW ONLY — who would get the "justify your absence" email right now.
//   No emails sent, no log written. Safe to call anytime. Also reports whether
//   the scheduled sweep is enabled (MISSING_REMINDER_EMAIL) and whether the HR
//   address is configured, so HR can see if the feature is actually live.
export async function GET() {
  const { error } = await requireRole(MANAGEMENT_ROLES);
  if (error) return error;

  try {
    const candidates = await computeMissingCandidates();
    return NextResponse.json({
      now: new Date().toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur" }),
      schedulerEnabled: process.env.MISSING_REMINDER_EMAIL === "on",
      hrEmailConfigured: !!process.env.HR_JUSTIFY_EMAIL,
      count: candidates.length,
      candidates, // [{ code, name, email, start }]
    });
  } catch (err) {
    console.error("[api/hr-dashboard/missing-reminder GET] failed:", err);
    return NextResponse.json({ error: "Failed to compute candidates" }, { status: 500 });
  }
}

// POST /api/hr-dashboard/missing-reminder   body: { "confirm": true }
//   Runs the real sweep ONCE now — sends emails to everyone currently eligible
//   (respects the once-per-day dedup). For on-demand testing without waiting
//   for the 5-min scheduler. Requires an explicit confirm flag so it can't fire
//   by accident. Works regardless of MISSING_REMINDER_EMAIL (that flag only
//   gates the automatic scheduler, not this manual, authenticated trigger).
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
    const result = await sendMissingReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[api/hr-dashboard/missing-reminder POST] failed:", err);
    return NextResponse.json({ error: "Failed to send reminders" }, { status: 500 });
  }
}
