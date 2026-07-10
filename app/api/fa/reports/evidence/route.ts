import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/nextauth";
import { setFaReportEvidence } from "@fa/_lib/reports.server";
import { uploadToGoogleDrive, isGoogleDriveConfigured } from "@/lib/googleDrive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Report-delivery evidence photo (per FA report / attended invitation).
//
// Policy (opposite of who FILLS the report):
//   • Only the BRANCH (Branch Manager) may upload/remove — they're the ones who
//     hand the printed report to the student, so they upload the proof photo.
//   • Marketing / Academy / Admin see it read-only on the reports list.
//   • A photo can only be attached once the report is FILLED — setFaReportEvidence
//     returns null when no report row exists, which we surface as a 409.
//
//   POST   { invitationId, base64Data, fileName?, mimeType? } → upload + save link
//   DELETE ?invitationId=                                     → remove the photo
//
// The file is uploaded to Google Drive (same as PCM Inventory proof); only the
// shareable link is stored on fa_assessment_reports.evidence_photo_link.

// Branch-only write gate. SUPER_ADMIN keeps a universal override (consistent
// with the rest of the app); back-office roles (Marketing/Academy) are excluded
// on purpose — they view, they don't upload.
const UPLOAD_ROLES = new Set(["BRANCH_MANAGER", "BM", "SUPER_ADMIN"]);

function gate(session: { user?: { role?: string } } | null): NextResponse | null {
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const role = String((session.user as { role?: string }).role ?? "").toUpperCase().replace(/\s+/g, "_");
  if (!UPLOAD_ROLES.has(role)) {
    return NextResponse.json({ error: "Only the branch can upload report evidence." }, { status: 403 });
  }
  return null;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = gate(session);
  if (denied) return denied;

  if (!isGoogleDriveConfigured()) {
    return NextResponse.json(
      { error: "Google Drive isn't set up on the server yet (GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_DRIVE_FOLDER_ID)." },
      { status: 503 },
    );
  }

  try {
    const body = await req.json();
    const invitationId = String(body.invitationId ?? "").trim();
    if (!invitationId) return NextResponse.json({ error: "invitationId is required" }, { status: 400 });
    if (!body.base64Data) return NextResponse.json({ error: "base64Data is required" }, { status: 400 });

    const mime = String(body.mimeType ?? "image/jpeg");
    const ext = String(body.fileName ?? "").match(/\.[A-Za-z0-9]+$/)?.[0] ?? ".jpg";
    const safe = (s: unknown) => String(s ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || "x";
    const fileName = `fa-report-${safe(invitationId)}-${Date.now()}${ext}`;

    const { webViewLink } = await uploadToGoogleDrive(String(body.base64Data), fileName, mime);
    const report = await setFaReportEvidence(invitationId, webViewLink);
    if (!report) {
      return NextResponse.json(
        { error: "Report isn't filled yet — evidence can only be attached to a filled report." },
        { status: 409 },
      );
    }
    return NextResponse.json({ report });
  } catch (err) {
    console.error("[api/fa/reports/evidence POST] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = gate(session);
  if (denied) return denied;

  const invitationId = (req.nextUrl.searchParams.get("invitationId") ?? "").trim();
  if (!invitationId) return NextResponse.json({ error: "invitationId is required" }, { status: 400 });
  try {
    const report = await setFaReportEvidence(invitationId, null);
    if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
    return NextResponse.json({ report });
  } catch (err) {
    console.error("[api/fa/reports/evidence DELETE] failed:", err);
    return NextResponse.json({ error: "Failed to remove evidence" }, { status: 500 });
  }
}
