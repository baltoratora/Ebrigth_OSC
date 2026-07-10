import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/nextauth";
import { duplicateEventRow } from "@pcm/_lib/events.server";

export const dynamic = "force-dynamic";

/**
 * POST /api/pcm/events/[id]/duplicate
 * Body: { name, startDate, endDate, invitationOpenDate, invitationCloseDate, notes? }
 *
 * Copies the source event's session + quota layout into a new draft event
 * with the supplied name/dates. Auth: any signed-in user — the page-level
 * role check already restricts this surface to Academy.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const required = ["name", "startDate", "endDate", "invitationOpenDate", "invitationCloseDate"] as const;
    for (const k of required) {
      if (!body[k]) return NextResponse.json({ error: `${k} is required` }, { status: 400 });
    }

    const created = await duplicateEventRow(id, {
      name: String(body.name).trim(),
      startDate: String(body.startDate),
      endDate: String(body.endDate),
      invitationOpenDate: String(body.invitationOpenDate),
      invitationCloseDate: String(body.invitationCloseDate),
      createdBy: session.user.email ?? "",
      notes: body.notes ? String(body.notes) : undefined,
    });
    if (!created) {
      return NextResponse.json({ error: "Source event not found" }, { status: 404 });
    }
    return NextResponse.json({ event: created });
  } catch (err) {
    console.error("[api/pcm/events/duplicate] failed:", err);
    return NextResponse.json({ error: "Failed to duplicate event" }, { status: 500 });
  }
}
