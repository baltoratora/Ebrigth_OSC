import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const entries = await prisma.showcaseWaitlist.findMany({
      where:   { editionId: id },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(entries);
  } catch (err) {
    console.error("GET /waitlist error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const body = await req.json() as { name?: string; email?: string; phone?: string };
    if (!body.name?.trim() || !body.email?.trim()) {
      return NextResponse.json({ error: "name and email are required" }, { status: 400 });
    }

    const entry = await prisma.showcaseWaitlist.create({
      data: {
        editionId: id,
        name:      body.name.trim(),
        email:     body.email.trim(),
        phone:     body.phone?.trim() || undefined,
      },
    });

    // Increment waitlistCount on edition
    await prisma.showcaseEdition.update({
      where: { id },
      data:  { waitlistCount: { increment: 1 } },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    console.error("POST /waitlist error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
