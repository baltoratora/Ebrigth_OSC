import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;

  try {
    const blocks = await prisma.showcaseCueSheetBlock.findMany({
      where: { editionId: id },
      orderBy: [{ dayNumber: "asc" }, { order: "asc" }],
    });
    return NextResponse.json(blocks);
  } catch (err) {
    console.error("GET cuesheet error:", err);
    return NextResponse.json({ error: "Failed to fetch cue sheet" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;

  try {
    const body = await req.json();
    if (!body.title || !body.type || !body.startTime || body.durationMins === undefined) {
      return NextResponse.json({ error: "title, type, startTime, durationMins are required" }, { status: 400 });
    }

    const block = await prisma.showcaseCueSheetBlock.create({
      data: {
        editionId:    id,
        dayNumber:    Number(body.dayNumber ?? 1),
        order:        Number(body.order ?? 0),
        title:        body.title.trim(),
        type:         body.type,
        startTime:    body.startTime,
        durationMins: Number(body.durationMins),
        pic:          body.pic    ?? null,
        notes:        body.notes  ?? null,
        status:       body.status ?? "UPCOMING",
      },
    });
    return NextResponse.json(block, { status: 201 });
  } catch (err) {
    console.error("POST cuesheet error:", err);
    return NextResponse.json({ error: "Failed to create block" }, { status: 500 });
  }
}
