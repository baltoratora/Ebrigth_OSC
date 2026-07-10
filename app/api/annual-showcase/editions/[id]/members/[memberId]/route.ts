import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string; memberId: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id, memberId } = await ctx.params;
  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name?.trim() || null;
    if (body.allowedUnits !== undefined) {
      data.allowedUnits = Array.isArray(body.allowedUnits) ? body.allowedUnits.map(String) : [];
    }

    const existing = await prisma.showcaseMember.findFirst({ where: { id: memberId, editionId: id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated = await prisma.showcaseMember.update({ where: { id: memberId }, data });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("PATCH member error:", err);
    return NextResponse.json({ error: "Failed to update member" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id, memberId } = await ctx.params;
  try {
    const existing = await prisma.showcaseMember.findFirst({ where: { id: memberId, editionId: id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.showcaseMember.delete({ where: { id: memberId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE member error:", err);
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }
}
