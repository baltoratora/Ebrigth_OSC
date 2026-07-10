import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string; unit: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id, unit } = await ctx.params;

  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (body.wentWell        !== undefined) data.wentWell        = body.wentWell        || null;
    if (body.didNotGoWell    !== undefined) data.didNotGoWell    = body.didNotGoWell    || null;
    if (body.improvements    !== undefined) data.improvements    = body.improvements    || null;
    if (body.recommendations !== undefined) data.recommendations = body.recommendations || null;
    if (body.rating          !== undefined) data.rating          = body.rating ? Number(body.rating) : null;

    const response = await prisma.showcasePostMortemResponse.update({
      where: { editionId_unit: { editionId: id, unit } },
      data,
    });
    return NextResponse.json(response);
  } catch (err) {
    console.error("PATCH postmortem error:", err);
    return NextResponse.json({ error: "Failed to update post-mortem" }, { status: 500 });
  }
}
