import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string; scoreId: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { scoreId } = await ctx.params;

  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (body.judgeName      !== undefined) data.judgeName      = body.judgeName;
    if (body.criteriaScores !== undefined) data.criteriaScores = body.criteriaScores;
    if (body.total          !== undefined) data.total          = Number(body.total);
    if (body.locked         !== undefined) data.locked         = Boolean(body.locked);

    const score = await prisma.showcaseScore.update({ where: { id: scoreId }, data });
    return NextResponse.json(score);
  } catch (err) {
    console.error("PATCH score error:", err);
    return NextResponse.json({ error: "Failed to update score" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { scoreId } = await ctx.params;

  try {
    await prisma.showcaseScore.delete({ where: { id: scoreId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE score error:", err);
    return NextResponse.json({ error: "Failed to delete score" }, { status: 500 });
  }
}
