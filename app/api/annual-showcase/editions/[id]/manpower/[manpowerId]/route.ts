import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string; manpowerId: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { manpowerId } = await ctx.params;

  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (body.name   !== undefined) data.name   = body.name;
    if (body.role   !== undefined) data.role   = body.role;
    if (body.phone  !== undefined) data.phone  = body.phone  || null;
    if (body.email  !== undefined) data.email  = body.email  || null;
    if (body.shift  !== undefined) data.shift  = body.shift  || null;
    if (body.day    !== undefined) data.day    = body.day    || null;
    if (body.status !== undefined) data.status = body.status;
    if (body.notes  !== undefined) data.notes  = body.notes  || null;

    const entry = await prisma.showcaseManpower.update({
      where: { id: manpowerId },
      data,
    });
    return NextResponse.json(entry);
  } catch (err) {
    console.error("PATCH manpower error:", err);
    return NextResponse.json({ error: "Failed to update entry" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { manpowerId } = await ctx.params;

  try {
    await prisma.showcaseManpower.delete({ where: { id: manpowerId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE manpower error:", err);
    return NextResponse.json({ error: "Failed to delete entry" }, { status: 500 });
  }
}
