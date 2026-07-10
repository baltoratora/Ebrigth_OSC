import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string; sponsorId: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { sponsorId } = await ctx.params;

  try {
    const log = await prisma.showcaseSponsorOutreach.findMany({
      where: { sponsorId },
      orderBy: { date: "desc" },
    });
    return NextResponse.json(log);
  } catch (err) {
    console.error("GET outreach error:", err);
    return NextResponse.json({ error: "Failed to fetch outreach log" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { error, session } = await requireSession();
  if (error) return error;

  const { sponsorId } = await ctx.params;

  try {
    const body = await req.json();
    if (!body.type || !body.date) {
      return NextResponse.json({ error: "type and date are required" }, { status: 400 });
    }

    const entry = await prisma.showcaseSponsorOutreach.create({
      data: {
        sponsorId,
        type:         body.type,
        date:         new Date(body.date),
        outcome:      body.outcome      || null,
        followUpDate: body.followUpDate ? new Date(body.followUpDate) : null,
        loggedById:   (session?.user as { id?: number | string } | undefined)?.id ? Number((session!.user as { id?: number | string }).id) : null,
      },
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    console.error("POST outreach error:", err);
    return NextResponse.json({ error: "Failed to log outreach" }, { status: 500 });
  }
}
