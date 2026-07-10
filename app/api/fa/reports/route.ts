import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/nextauth";
import { fetchAllFaReports, upsertFaReportRow } from "@fa/_lib/reports.server";
import { BranchCode, FA_REPORT_MAX_PER_CRITERION, isBackOfficeRole } from "@fa/_types";

export const dynamic = "force-dynamic";

/** Roles permitted to write a report. Per current policy:
 *  Marketing, Academy, and Admin can fill. Everyone else gets 403 on POST.
 *  Read is open to any signed-in user (BMs can view + print). */
const WRITE_ROLES = new Set(["MARKETING", "MKT", "ACADEMY", "ADMIN", "SUPER_ADMIN"]);

/** GET — all FA reports (tenant-scoped). Any signed-in user. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  try {
    const reports = await fetchAllFaReports();
    return NextResponse.json({ reports });
  } catch (err) {
    console.error("[api/fa/reports GET] failed:", err);
    const e = err as { message?: string; code?: string };
    return NextResponse.json(
      { error: "Failed to load reports", detail: e?.message ?? String(err), code: e?.code },
      { status: 500 },
    );
  }
}

/** POST — create or update an FA report (upsert by invitation_id).
 *  Role-gated to Marketing/Admin; back-office check stays a single source
 *  of truth via isBackOfficeRole for the read-only side but the write side
 *  is intentionally narrower (BM should never fill an FA report). */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const role = (session.user as { role?: string }).role;
  if (!role || !WRITE_ROLES.has(role)) {
    return NextResponse.json(
      { error: "Only Marketing or Admin can fill FA reports." },
      { status: 403 },
    );
  }
  try {
    const body = await req.json();
    const required = [
      "invitationId", "studentId", "studentName", "branch", "grade",
      "assessmentDate",
      "communicationScore", "analysisScore", "interactionScore", "performanceScore",
    ] as const;
    for (const k of required) {
      if (body[k] === undefined || body[k] === null || body[k] === "") {
        return NextResponse.json({ error: `${k} is required` }, { status: 400 });
      }
    }
    // Clamp each criterion into 0–25 so a bad client can't bypass the
    // CHECK constraint and trigger a DB-level rejection.
    const clamp = (n: number) =>
      Math.max(0, Math.min(FA_REPORT_MAX_PER_CRITERION, Math.floor(Number(n))));
    // isBackOfficeRole isn't used for the gate above (we want a stricter
    // write policy) but keep the import live — the surrounding system uses
    // the same helper for nav decisions, so a future role rename touches
    // one place. Reference it here just to keep TS happy if the linter
    // ever flips on no-unused-vars.
    void isBackOfficeRole;
    const report = await upsertFaReportRow({
      invitationId: String(body.invitationId),
      studentId: String(body.studentId),
      studentName: String(body.studentName).trim(),
      branch: body.branch as BranchCode,
      grade: Math.max(1, Math.floor(Number(body.grade))),
      assessmentDate: String(body.assessmentDate),
      communicationScore: clamp(body.communicationScore),
      analysisScore: clamp(body.analysisScore),
      interactionScore: clamp(body.interactionScore),
      performanceScore: clamp(body.performanceScore),
      remarks: String(body.remarks ?? ""),
      preparedBy: String(body.preparedBy ?? "").trim(),
      preparedById: body.preparedById ? String(body.preparedById) : undefined,
      // Video link of the student's recorded performance. Trimmed +
      // bounded to 2KB.
      videoLink: typeof body.videoLink === "string" && body.videoLink.trim().length > 0 && body.videoLink.length < 2000
        ? body.videoLink.trim()
        : undefined,
    });
    return NextResponse.json({ report });
  } catch (err) {
    console.error("[api/fa/reports POST] failed:", err);
    const e = err as { message?: string; code?: string };
    return NextResponse.json(
      { error: "Failed to save report", detail: e?.message ?? String(err), code: e?.code },
      { status: 500 },
    );
  }
}
