import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;

  try {
    const responses = await prisma.showcasePostMortemResponse.findMany({
      where: { editionId: id },
      orderBy: { submittedAt: "desc" },
    });
    return NextResponse.json(responses);
  } catch (err) {
    console.error("GET postmortem error:", err);
    return NextResponse.json({ error: "Failed to fetch post-mortem responses" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { error, session } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;

  try {
    const body = await req.json();
    if (!body.unit) {
      return NextResponse.json({ error: "unit is required" }, { status: 400 });
    }

    const response = await prisma.showcasePostMortemResponse.upsert({
      where: { editionId_unit: { editionId: id, unit: body.unit } },
      create: {
        editionId:       id,
        unit:            body.unit,
        submittedById:   (session?.user as { id?: number | string } | undefined)?.id ? Number((session!.user as { id?: number | string }).id) : null,
        wentWell:        body.wentWell        || null,
        didNotGoWell:    body.didNotGoWell    || null,
        improvements:    body.improvements    || null,
        recommendations: body.recommendations || null,
        rating:          body.rating ? Number(body.rating) : null,
      },
      update: {
        wentWell:        body.wentWell        || null,
        didNotGoWell:    body.didNotGoWell    || null,
        improvements:    body.improvements    || null,
        recommendations: body.recommendations || null,
        rating:          body.rating ? Number(body.rating) : null,
      },
    });
    return NextResponse.json(response, { status: 201 });
  } catch (err) {
    console.error("POST postmortem error:", err);
    return NextResponse.json({ error: "Failed to submit post-mortem" }, { status: 500 });
  }
}
