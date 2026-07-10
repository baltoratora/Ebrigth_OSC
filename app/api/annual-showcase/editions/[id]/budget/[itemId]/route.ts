import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string; itemId: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { session, error } = await requireSession();
  if (error) return error;

  const { id, itemId } = await ctx.params;

  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (body.status !== undefined)      data.status      = body.status;
    if (body.amount !== undefined)      data.amount      = Number(body.amount);
    if (body.description !== undefined) data.description = String(body.description);
    if (body.unit !== undefined)        data.unit        = String(body.unit);
    if (body.type !== undefined)        data.type        = body.type;

    if (body.status === "APPROVED") {
      const userId = (session.user as { id?: number | string }).id;
      if (userId) {
        data.approvedById = Number(userId);
        data.approvedAt   = new Date();
      }
    }

    const item = await prisma.showcaseBudgetItem.update({
      where:   { id: itemId, editionId: id },
      data,
      include: { approvedBy: { select: { id: true, name: true } } },
    });
    return NextResponse.json(item);
  } catch (err) {
    console.error("PATCH budget item error:", err);
    return NextResponse.json({ error: "Failed to update budget item" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id, itemId } = await ctx.params;

  try {
    await prisma.showcaseBudgetItem.delete({ where: { id: itemId, editionId: id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE budget item error:", err);
    return NextResponse.json({ error: "Failed to delete budget item" }, { status: 500 });
  }
}
