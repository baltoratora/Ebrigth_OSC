import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;

  try {
    const announcements = await prisma.showcaseAnnouncement.findMany({
      where: { editionId: id },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(announcements);
  } catch (err) {
    console.error("GET announcements error:", err);
    return NextResponse.json({ error: "Failed to fetch announcements" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { session, error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;

  try {
    const body = await req.json();
    if (!body.title || typeof body.title !== "string" || body.title.trim().length === 0) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    if (!body.body || typeof body.body !== "string" || body.body.trim().length === 0) {
      return NextResponse.json({ error: "body is required" }, { status: 400 });
    }

    const userId = (session.user as { id?: number | string }).id;

    const announcement = await prisma.showcaseAnnouncement.create({
      data: {
        editionId:   id,
        title:       body.title.trim(),
        body:        body.body.trim(),
        targetUnits: Array.isArray(body.targetUnits) ? body.targetUnits : [],
        authorId:    userId ? Number(userId) : undefined,
      },
      include: { author: { select: { id: true, name: true } } },
    });
    return NextResponse.json(announcement, { status: 201 });
  } catch (err) {
    console.error("POST announcement error:", err);
    return NextResponse.json({ error: "Failed to create announcement" }, { status: 500 });
  }
}
