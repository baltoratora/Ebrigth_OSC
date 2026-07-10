import { NextRequest, NextResponse } from "next/server";
import { deleteEventRow, updateEventRow } from "@fa/_lib/events.server";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const patch = await req.json();
    const updated = await updateEventRow(id, patch);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[api/fa/events PATCH] failed:", err);
    return NextResponse.json({ error: "Failed to update event" }, { status: 500 });
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
    await deleteEventRow(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/fa/events DELETE] failed:", err);
    return NextResponse.json({ error: "Failed to delete event" }, { status: 500 });
  }
}
