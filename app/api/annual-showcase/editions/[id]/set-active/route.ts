import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;

  try {
    await prisma.showcaseEdition.updateMany({ data: { isActive: false } });
    const edition = await prisma.showcaseEdition.update({
      where: { id },
      data:  { isActive: true },
    });
    return NextResponse.json(edition);
  } catch (err) {
    console.error("POST set-active error:", err);
    return NextResponse.json({ error: "Failed to set active edition" }, { status: 500 });
  }
}
