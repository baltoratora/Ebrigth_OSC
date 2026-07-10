import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string; boothId: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { boothId } = await ctx.params;

  try {
    const body = await req.json();
    if (!body.name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const product = await prisma.showcaseYouthpreneurProduct.create({
      data: {
        boothId,
        name:        body.name.trim(),
        price:       body.price       ? Number(body.price)  : null,
        description: body.description ?? null,
      },
    });
    return NextResponse.json(product, { status: 201 });
  } catch (err) {
    console.error("POST product error:", err);
    return NextResponse.json({ error: "Failed to add product" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  try {
    const body = await req.json() as { productId?: string };
    if (!body.productId) {
      return NextResponse.json({ error: "productId is required" }, { status: 400 });
    }
    await prisma.showcaseYouthpreneurProduct.delete({ where: { id: body.productId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE product error:", err);
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
  }
}
