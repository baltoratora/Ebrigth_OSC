import { NextRequest, NextResponse } from "next/server";
import { deleteInvitationRow, updateInvitationRow } from "@pcm/_lib/events.server";
import { InvitationStatus, InviteType, ArrivalWindow, PACKAGE_OPTIONS, PackageOption } from "@pcm/_types";
import { requireSession } from "@/lib/auth";

const ARRIVAL_WINDOWS: ArrivalWindow[] = ["before_class", "after_class", "during_class"];

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const updated = await updateInvitationRow(id, {
      status: body.status as InvitationStatus | undefined,
      sessionId: body.sessionId,
      eventId: body.eventId,
      markedBy: body.markedBy,
      coachId: body.coachId === undefined ? undefined : (body.coachId ?? null),
      coachName: body.coachName === undefined ? undefined : (body.coachName ?? null),
      inviteType: body.inviteType === "progress" || body.inviteType === "renewal"
        ? (body.inviteType as InviteType)
        : undefined,
      paid: typeof body.paid === "boolean" ? body.paid : undefined,
      package:
        body.package === undefined
          ? undefined
          : (body.package === null
              ? null
              : (PACKAGE_OPTIONS.includes(body.package) ? (body.package as PackageOption) : undefined)),
      videoSentToParent:
        typeof body.videoSentToParent === "boolean" ? body.videoSentToParent : undefined,
      videoLink:
        body.videoLink === undefined
          ? undefined
          : (body.videoLink === null || body.videoLink === ""
              ? null
              : String(body.videoLink).slice(0, 2000)),
      arrivalWindow:
        body.arrivalWindow === undefined
          ? undefined
          : (ARRIVAL_WINDOWS.includes(body.arrivalWindow as ArrivalWindow)
              ? (body.arrivalWindow as ArrivalWindow)
              : null),
      arrivalTime:
        body.arrivalTime === undefined
          ? undefined
          : (body.arrivalTime === null || String(body.arrivalTime).trim() === ""
              ? null
              : String(body.arrivalTime).trim().slice(0, 40)),
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
    await deleteInvitationRow(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/fa/invitations DELETE] failed:", err);
    return NextResponse.json({ error: "Failed to delete invitation" }, { status: 500 });
  }
}
