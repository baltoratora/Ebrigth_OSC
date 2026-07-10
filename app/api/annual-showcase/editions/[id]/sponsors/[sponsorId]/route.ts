import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string; sponsorId: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { sponsorId } = await ctx.params;

  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (body.companyName   !== undefined) data.companyName   = body.companyName;
    if (body.contactName   !== undefined) data.contactName   = body.contactName   || null;
    if (body.contactEmail  !== undefined) data.contactEmail  = body.contactEmail  || null;
    if (body.contactPhone  !== undefined) data.contactPhone  = body.contactPhone  || null;
    if (body.packageType   !== undefined) data.packageType   = body.packageType   || null;
    if (body.amount        !== undefined) data.amount        = Number(body.amount);
    if (body.pipelineStatus !== undefined) data.pipelineStatus = body.pipelineStatus;
    if (body.notes         !== undefined) data.notes         = body.notes         || null;
    if (body.isVVIP        !== undefined) data.isVVIP        = Boolean(body.isVVIP);

    const sponsor = await prisma.showcaseSponsor.update({
      where: { id: sponsorId },
      data,
      include: { outreachLog: { orderBy: { date: "desc" } } },
    });
    return NextResponse.json(sponsor);
  } catch (err) {
    console.error("PATCH sponsor error:", err);
    return NextResponse.json({ error: "Failed to update sponsor" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { sponsorId } = await ctx.params;

  try {
    await prisma.showcaseSponsor.delete({ where: { id: sponsorId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE sponsor error:", err);
    return NextResponse.json({ error: "Failed to delete sponsor" }, { status: 500 });
  }
}
