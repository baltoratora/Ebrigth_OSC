import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;
  const page  = Math.max(1, Number(req.nextUrl.searchParams.get("page")  ?? 1));
  const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 20)));
  const skip  = (page - 1) * limit;

  try {
    const [participants, total] = await Promise.all([
      prisma.showcaseParticipant.findMany({
        where: { editionId: id },
        include: {
          category: { select: { id: true, name: true } },
          feeWave:  { select: { id: true, name: true, amount: true } },
        },
        orderBy: { registeredAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.showcaseParticipant.count({ where: { editionId: id } }),
    ]);
    return NextResponse.json({ participants, total, page, limit });
  } catch (err) {
    console.error("GET participants error:", err);
    return NextResponse.json({ error: "Failed to fetch participants" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;

  try {
    const body = await req.json();
    if (!body.fullName || typeof body.fullName !== "string") {
      return NextResponse.json({ error: "fullName is required" }, { status: 400 });
    }

    const participant = await prisma.showcaseParticipant.create({
      data: {
        editionId:     id,
        fullName:      body.fullName.trim(),
        email:         body.email         ?? undefined,
        phone:         body.phone         ?? undefined,
        teamName:      body.teamName      ?? undefined,
        categoryId:    body.categoryId    ?? undefined,
        feeWaveId:     body.feeWaveId     ?? undefined,
        paymentStatus: body.paymentStatus ?? "UNPAID",
        dateOfBirth:   body.dateOfBirth   ? new Date(body.dateOfBirth)  : undefined,
        isEbrighter:   body.isEbrighter   ?? false,
        parentName:    body.parentName    ?? undefined,
        parentEmail:   body.parentEmail   ?? undefined,
        parentPhone:   body.parentPhone   ?? undefined,
        orderNo:       body.orderNo       ? Number(body.orderNo) : undefined,
      },
    });
    return NextResponse.json(participant, { status: 201 });
  } catch (err) {
    console.error("POST participant error:", err);
    return NextResponse.json({ error: "Failed to create participant" }, { status: 500 });
  }
}
