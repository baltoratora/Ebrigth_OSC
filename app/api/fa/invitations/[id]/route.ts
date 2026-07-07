import { NextRequest, NextResponse } from "next/server";
import {
  deleteInvitationRow,
  updateInvitationRow,
  getEventStatusByInvitation,
} from "@fa/_lib/events.server";
import { InvitationStatus } from "@fa/_types";
import { requireSession } from "@/lib/auth";
import { isBranchManager } from "@/lib/roles";

export const dynamic = "force-dynamic";

// A Branch Manager may only change an invitation while its event is still open
// (invite / confirm / reject) or on event day (attendance, status "ongoing").
// Once the event is closed, completed, or still a draft, the roster is locked
// for them — they can view but not touch students. MKT / back-office roles are
// unrestricted. Returns a 403 response to short-circuit, or null to proceed.
async function blockBmWhenLocked(
  role: unknown,
  invitationId: string
): Promise<NextResponse | null> {
  if (!isBranchManager(role)) return null;
  const status = await getEventStatusByInvitation(invitationId);
  if (status && status !== "open" && status !== "ongoing") {
    return NextResponse.json(
      {
        error:
          "This event is closed — Branch Managers can no longer change students.",
      },
      { status: 403 }
    );
  }
  return null;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const blocked = await blockBmWhenLocked(
      (auth.session.user as { role?: unknown }).role,
      id
    );
    if (blocked) return blocked;
    const body = await req.json();
    // practiceDate/practiceTime may be explicitly null (clearing a previously
    // scheduled practice) — pass null through, not just strings.
    const asStringOrNull = (v: unknown): string | null | undefined =>
      v === null || typeof v === "string" ? v : undefined;
    const updated = await updateInvitationRow(id, {
      status: body.status as InvitationStatus | undefined,
      sessionId: body.sessionId,
      markedBy: body.markedBy,
      videoLink: typeof body.videoLink === "string" ? body.videoLink : undefined,
      proofUrl: typeof body.proofUrl === "string" ? body.proofUrl : undefined,
      practiceDate: asStringOrNull(body.practiceDate),
      practiceTime: asStringOrNull(body.practiceTime),
    });
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[api/fa/invitations PATCH] failed:", err);
    return NextResponse.json({ error: "Failed to update invitation" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const blocked = await blockBmWhenLocked(
      (auth.session.user as { role?: unknown }).role,
      id
    );
    if (blocked) return blocked;
    await deleteInvitationRow(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/fa/invitations DELETE] failed:", err);
    return NextResponse.json({ error: "Failed to delete invitation" }, { status: 500 });
  }
}
