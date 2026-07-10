import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;

  try {
    const booths = await prisma.showcaseYouthpreneurBooth.findMany({
      where: { editionId: id },
      include: { products: { orderBy: { createdAt: "asc" } } },
      orderBy: [{ boothNumber: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(booths);
  } catch (err) {
    console.error("GET youthpreneur booths error:", err);
    return NextResponse.json({ error: "Failed to fetch booths" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;

  try {
    const body = await req.json();
    if (!body.businessName || !body.ownerName) {
      return NextResponse.json({ error: "businessName and ownerName are required" }, { status: 400 });
    }

    const booth = await prisma.showcaseYouthpreneurBooth.create({
      data: {
        editionId:     id,
        businessName:  body.businessName.trim(),
        ownerName:     body.ownerName.trim(),
        ownerAge:      body.ownerAge    ? Number(body.ownerAge)  : null,
        category:      body.category    ?? null,
        description:   body.description ?? null,
        boothSize:     body.boothSize   ?? null,
        specialNeeds:  body.specialNeeds ?? null,
        parentName:    body.parentName   ?? null,
        parentContact: body.parentContact ?? null,
        status:        "PENDING",
      },
      include: { products: true },
    });
    return NextResponse.json(booth, { status: 201 });
  } catch (err) {
    console.error("POST youthpreneur booth error:", err);
    return NextResponse.json({ error: "Failed to create booth" }, { status: 500 });
  }
}
