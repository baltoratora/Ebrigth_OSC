import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/nextauth";
import { uploadToGoogleDrive, isGoogleDriveConfigured } from "@/lib/googleDrive";
import { updateRenewalGift } from "@pcm/_lib/inventory.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/pcm/inventory/[id]/proof
// Body: { base64Data, studentId?, branch? }  (image is compressed client-side)
// Uploads the proof photo to Google Drive and saves the shareable link as the
// invitation's proof_link.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isGoogleDriveConfigured()) {
    return NextResponse.json(
      { error: "Google Drive isn't set up on the server yet (GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_DRIVE_FOLDER_ID)." },
      { status: 503 },
    );
  }
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    if (!body.base64Data) {
      return NextResponse.json({ error: "base64Data is required" }, { status: 400 });
    }
    const safe = (s: unknown) => String(s ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24) || "x";
    const fileName = `${safe(body.branch)}-${safe(body.studentId)}-${Date.now()}.jpg`;
    const { webViewLink } = await uploadToGoogleDrive(String(body.base64Data), fileName);
    await updateRenewalGift(id, { proofLink: webViewLink }, session.user.email ?? "");
    return NextResponse.json({ proofLink: webViewLink });
  } catch (err) {
    console.error("[/api/pcm/inventory/[id]/proof] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 },
    );
  }
}
