import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;
  const unit = req.nextUrl.searchParams.get("unit");

  try {
    const tasks = await prisma.showcaseTask.findMany({
      where: { editionId: id, ...(unit ? { unit } : {}) },
      include: {
        assignee:  { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(tasks);
  } catch (err) {
    console.error("GET tasks error:", err);
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
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
    if (!body.unit || typeof body.unit !== "string") {
      return NextResponse.json({ error: "unit is required" }, { status: 400 });
    }

    const userId = (session.user as { id?: number | string }).id;

    const task = await prisma.showcaseTask.create({
      data: {
        editionId:   id,
        unit:        body.unit,
        title:       body.title.trim(),
        description: body.description ?? undefined,
        status:      body.status      ?? "TODO",
        priority:    body.priority    ?? "MEDIUM",
        assigneeId:  body.assigneeId  ? Number(body.assigneeId) : undefined,
        createdById: userId           ? Number(userId)          : undefined,
        dueDate:     body.dueDate     ? new Date(body.dueDate)  : undefined,
      },
      include: { assignee: { select: { id: true, name: true, email: true } } },
    });
    return NextResponse.json(task, { status: 201 });
  } catch (err) {
    console.error("POST task error:", err);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
