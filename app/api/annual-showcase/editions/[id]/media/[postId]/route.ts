import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string; postId: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { postId } = await ctx.params;

  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (body.platform    !== undefined) data.platform    = body.platform;
    if (body.mediaType   !== undefined) data.mediaType   = body.mediaType;
    if (body.caption     !== undefined) data.caption     = body.caption     || null;
    if (body.status      !== undefined) data.status      = body.status;
    if (body.link        !== undefined) data.link        = body.link        || null;
    if (body.notes       !== undefined) data.notes       = body.notes       || null;
    if (body.scheduledAt !== undefined) data.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    if (body.publishedAt !== undefined) data.publishedAt = body.publishedAt ? new Date(body.publishedAt) : null;

    const post = await prisma.showcaseMediaPost.update({ where: { id: postId }, data });
    return NextResponse.json(post);
  } catch (err) {
    console.error("PATCH media post error:", err);
    return NextResponse.json({ error: "Failed to update post" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { postId } = await ctx.params;

  try {
    await prisma.showcaseMediaPost.delete({ where: { id: postId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE media post error:", err);
    return NextResponse.json({ error: "Failed to delete post" }, { status: 500 });
  }
}
