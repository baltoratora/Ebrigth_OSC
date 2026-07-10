import { NextRequest, NextResponse } from "next/server";
import { deleteSessionRow, updateSessionRow } from "@pcm/_lib/events.server";
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
    const updated = await updateSessionRow(id, patch);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[api/fa/sessions PATCH] failed:", err);
    return NextResponse.json({ error: "Failed to update session" }, { status: 500 });
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
    await deleteSessionRow(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/fa/sessions DELETE] failed:", err);
    return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
  }
}
