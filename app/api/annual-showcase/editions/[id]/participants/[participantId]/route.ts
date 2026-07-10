import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string; participantId: string }> }

type LogEntry = { status: string; note?: string; at: string };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id, participantId } = await ctx.params;
  try {
    const p = await prisma.showcaseParticipant.findFirst({
      where: { id: participantId, editionId: id },
      include: {
        category: { select: { id: true, name: true } },
        feeWave:  { select: { id: true, name: true, amount: true } },
      },
    });
    if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(p);
  } catch (err) {
    console.error("GET participant error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id, participantId } = await ctx.params;
  try {
    const existing = await prisma.showcaseParticipant.findFirst({
      where: { id: participantId, editionId: id },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.showcaseParticipant.delete({ where: { id: participantId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE participant error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id, participantId } = await ctx.params;
  try {
    const body = await req.json() as { paymentStatus?: string; note?: string };

    const existing = await prisma.showcaseParticipant.findFirst({
      where: { id: participantId, editionId: id },
      select: { paymentStatus: true, paymentLog: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const prevLog = (Array.isArray(existing.paymentLog) ? existing.paymentLog : []) as LogEntry[];

    const data: Record<string, unknown> = {};
    if (body.paymentStatus !== undefined) {
      data.paymentStatus = body.paymentStatus;
      const entry: LogEntry = { status: body.paymentStatus, at: new Date().toISOString() };
      if (body.note) entry.note = body.note;
      data.paymentLog = [...prevLog, entry];
    }

    const updated = await prisma.showcaseParticipant.update({
      where: { id: participantId },
      data,
      include: {
        category: { select: { id: true, name: true } },
        feeWave:  { select: { id: true, name: true, amount: true } },
      },
    });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("PATCH participant error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
