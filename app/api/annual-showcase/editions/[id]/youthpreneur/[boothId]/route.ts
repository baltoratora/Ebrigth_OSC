import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string; boothId: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { boothId } = await ctx.params;

  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (body.boothNumber   !== undefined) data.boothNumber   = body.boothNumber  || null;
    if (body.businessName  !== undefined) data.businessName  = body.businessName;
    if (body.ownerName     !== undefined) data.ownerName     = body.ownerName;
    if (body.ownerAge      !== undefined) data.ownerAge      = body.ownerAge ? Number(body.ownerAge) : null;
    if (body.category      !== undefined) data.category      = body.category      || null;
    if (body.description   !== undefined) data.description   = body.description   || null;
    if (body.status        !== undefined) data.status        = body.status;
    if (body.boothSize     !== undefined) data.boothSize     = body.boothSize     || null;
    if (body.specialNeeds  !== undefined) data.specialNeeds  = body.specialNeeds  || null;
    if (body.parentName    !== undefined) data.parentName    = body.parentName    || null;
    if (body.parentContact !== undefined) data.parentContact = body.parentContact || null;

    const booth = await prisma.showcaseYouthpreneurBooth.update({
      where: { id: boothId },
      data,
      include: { products: true },
    });
    return NextResponse.json(booth);
  } catch (err) {
    console.error("PATCH booth error:", err);
    return NextResponse.json({ error: "Failed to update booth" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { boothId } = await ctx.params;

  try {
    await prisma.showcaseYouthpreneurBooth.delete({ where: { id: boothId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE booth error:", err);
    return NextResponse.json({ error: "Failed to delete booth" }, { status: 500 });
  }
}
