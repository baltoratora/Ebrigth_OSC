import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;

  try {
    const scores = await prisma.showcaseScore.findMany({
      where: { editionId: id },
      include: {
        participant: {
          select: {
            id: true,
            fullName: true,
            categoryId: true,
            category: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { submittedAt: "asc" },
    });
    return NextResponse.json(scores);
  } catch (err) {
    console.error("GET scores error:", err);
    return NextResponse.json({ error: "Failed to fetch scores" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;

  try {
    const body = await req.json();
    if (!body.participantId || !body.judgeName || !body.criteriaScores || body.total === undefined) {
      return NextResponse.json({ error: "participantId, judgeName, criteriaScores, total are required" }, { status: 400 });
    }

    const score = await prisma.showcaseScore.create({
      data: {
        editionId:      id,
        participantId:  body.participantId,
        judgeName:      body.judgeName.trim(),
        criteriaScores: body.criteriaScores,
        total:          Number(body.total),
        locked:         body.locked ?? false,
      },
    });
    return NextResponse.json(score, { status: 201 });
  } catch (err) {
    console.error("POST score error:", err);
    return NextResponse.json({ error: "Failed to submit score" }, { status: 500 });
  }
}
