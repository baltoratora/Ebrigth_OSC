import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string; blockId: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { blockId } = await ctx.params;

  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (body.dayNumber    !== undefined) data.dayNumber    = Number(body.dayNumber);
    if (body.order        !== undefined) data.order        = Number(body.order);
    if (body.title        !== undefined) data.title        = body.title;
    if (body.type         !== undefined) data.type         = body.type;
    if (body.startTime    !== undefined) data.startTime    = body.startTime;
    if (body.durationMins !== undefined) data.durationMins = Number(body.durationMins);
    if (body.pic          !== undefined) data.pic          = body.pic   || null;
    if (body.notes        !== undefined) data.notes        = body.notes || null;
    if (body.status       !== undefined) data.status       = body.status;

    const block = await prisma.showcaseCueSheetBlock.update({ where: { id: blockId }, data });
    return NextResponse.json(block);
  } catch (err) {
    console.error("PATCH cuesheet block error:", err);
    return NextResponse.json({ error: "Failed to update block" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { blockId } = await ctx.params;

  try {
    await prisma.showcaseCueSheetBlock.delete({ where: { id: blockId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE cuesheet block error:", err);
    return NextResponse.json({ error: "Failed to delete block" }, { status: 500 });
  }
}
