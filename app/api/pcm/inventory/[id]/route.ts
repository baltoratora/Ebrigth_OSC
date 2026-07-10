import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/nextauth";
import { updateRenewalGift } from "@pcm/_lib/inventory.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/pcm/inventory/[id]
// Body: { academyDistributed?, giftGiven?, proofLink? }
//   academyDistributed → academy edits (gift handed to branch)
//   giftGiven / proofLink → branch edits (gift handed to student + Drive proof)
// (Edit permissions are enforced in the UI by role; this just persists.)
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    await updateRenewalGift(
      id,
      {
        academyDistributed: typeof body.academyDistributed === "boolean" ? body.academyDistributed : undefined,
        giftGiven: typeof body.giftGiven === "boolean" ? body.giftGiven : undefined,
        proofLink: body.proofLink === undefined ? undefined : (body.proofLink ? String(body.proofLink) : null),
      },
      session.user.email ?? "",
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/pcm/inventory/[id]] failed:", err);
    return NextResponse.json({ error: "Failed to update gift" }, { status: 500 });
  }
}
