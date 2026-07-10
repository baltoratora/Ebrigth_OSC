import { NextRequest, NextResponse } from "next/server";
import {
  updateInvitationRow,
  getEventStatusByInvitation,
} from "@fa/_lib/events.server";
import { uploadToGoogleDrive, isGoogleDriveConfigured } from "@/lib/googleDrive";
import { requireSession } from "@/lib/auth";
import { isBranchManager } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/fa/invitations/[id]/proof
// Body: { base64Data, videoLink?, studentId?, branch?, markedBy? }
//
// Attaches proof to an (already-confirmed) invitation: the image is uploaded to
// Google Drive (compressed client-side) and its shareable link is saved as
// proof_url; an optional testing video link is saved alongside it. Confirming
// itself happens on click (a plain status PATCH) — this endpoint only attaches
// the video/proof, which is optional and can be added now or later. Marketing
// then sees both. Mirrors the PCM inventory proof-upload flow.
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;

    // A Branch Manager may only confirm while the event is still open/ongoing —
    // the same lock the PATCH route enforces.
    const role = (auth.session.user as { role?: unknown }).role;
    if (isBranchManager(role)) {
      const status = await getEventStatusByInvitation(id);
      if (status && status !== "open" && status !== "ongoing") {
        return NextResponse.json(
          { error: "This event is closed — Branch Managers can no longer change students." },
          { status: 403 }
        );
      }
    }

    const body = await req.json();
    const videoLink = String(body.videoLink ?? "").trim();
    if (!body.base64Data) {
      return NextResponse.json({ error: "A proof image is required." }, { status: 400 });
    }
    if (!isGoogleDriveConfigured()) {
      return NextResponse.json(
        { error: "Google Drive isn't set up on the server yet (GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_DRIVE_FOLDER_ID)." },
        { status: 503 }
      );
    }

    const safe = (s: unknown) => String(s ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24) || "x";
    const fileName = `fa-proof-${safe(body.branch)}-${safe(body.studentId)}-${Date.now()}.jpg`;
    const { webViewLink } = await uploadToGoogleDrive(String(body.base64Data), fileName);

    const updated = await updateInvitationRow(id, {
      proofUrl: webViewLink,
      // Only overwrite the video link when one was supplied — a blank field
      // shouldn't wipe a previously-saved link.
      ...(videoLink ? { videoLink } : {}),
    });
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[/api/fa/invitations/[id]/proof] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
