import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;

  try {
    const posts = await prisma.showcaseMediaPost.findMany({
      where: { editionId: id },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(posts);
  } catch (err) {
    console.error("GET media posts error:", err);
    return NextResponse.json({ error: "Failed to fetch media posts" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;

  try {
    const body = await req.json();
    if (!body.platform || !body.mediaType) {
      return NextResponse.json({ error: "platform and mediaType are required" }, { status: 400 });
    }

    const post = await prisma.showcaseMediaPost.create({
      data: {
        editionId:   id,
        platform:    body.platform,
        mediaType:   body.mediaType,
        caption:     body.caption     || null,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        publishedAt: body.publishedAt ? new Date(body.publishedAt) : null,
        status:      body.status      ?? "DRAFT",
        link:        body.link        || null,
        notes:       body.notes       || null,
      },
    });
    return NextResponse.json(post, { status: 201 });
  } catch (err) {
    console.error("POST media post error:", err);
    return NextResponse.json({ error: "Failed to create post" }, { status: 500 });
  }
}
