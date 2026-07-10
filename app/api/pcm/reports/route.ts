import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/nextauth";
import { fetchAllReports, upsertReportRow } from "@pcm/_lib/reports.server";
import { BranchCode } from "@pcm/_types";

export const dynamic = "force-dynamic";

/** GET — all reports (tenant-scoped). Read-only, any signed-in user. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  try {
    const reports = await fetchAllReports();
    return NextResponse.json({ reports });
  } catch (err) {
    console.error("[api/pcm/reports GET] failed:", err);
    return NextResponse.json({ error: "Failed to load reports" }, { status: 500 });
  }
}

/** POST — create or update a report (upsert by invitation_id). */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const required = [
      "invitationId", "studentId", "studentName", "branch", "grade",
      "assessmentDate",
      "confidenceScore", "voiceClarityScore", "eyeContactScore", "ideaExpressionScore",
    ] as const;
    for (const k of required) {
      if (body[k] === undefined || body[k] === null || body[k] === "") {
        return NextResponse.json({ error: `${k} is required` }, { status: 400 });
      }
    }
    // Clamp scores into 1–5 so a bad client can't slip past the CHECK.
    const clamp = (n: number) => Math.max(1, Math.min(5, Math.floor(Number(n))));
    const report = await upsertReportRow({
      invitationId: String(body.invitationId),
      studentId: String(body.studentId),
      studentName: String(body.studentName).trim(),
      branch: body.branch as BranchCode,
      grade: Math.max(1, Math.floor(Number(body.grade))),
      assessmentDate: String(body.assessmentDate),
      confidenceScore: clamp(body.confidenceScore),
      voiceClarityScore: clamp(body.voiceClarityScore),
      eyeContactScore: clamp(body.eyeContactScore),
      ideaExpressionScore: clamp(body.ideaExpressionScore),
      strengths: String(body.strengths ?? ""),
      improvementPlan: String(body.improvementPlan ?? ""),
      preparedBy: String(body.preparedBy ?? "").trim(),
      preparedById: body.preparedById ? String(body.preparedById) : undefined,
      // Signature comes in as a base64 data URL. Reject anything > 300 KB
      // (server-side cap matching the client compressor) so a runaway
      // upload can't bloat the row.
      preparedBySignature: typeof body.preparedBySignature === "string" && body.preparedBySignature.length < 300_000
        ? body.preparedBySignature
        : undefined,
      receivedBy: String(body.receivedBy ?? "").trim(),
      // Video link — trim and bound to 2KB so a runaway paste can't
      // bloat the row. Empty string treated as "no link".
      videoLink: typeof body.videoLink === "string" && body.videoLink.trim().length > 0 && body.videoLink.length < 2000
        ? body.videoLink.trim()
        : undefined,
    });
    return NextResponse.json({ report });
  } catch (err) {
    console.error("[api/pcm/reports POST] failed:", err);
    return NextResponse.json({ error: "Failed to save report" }, { status: 500 });
  }
}
