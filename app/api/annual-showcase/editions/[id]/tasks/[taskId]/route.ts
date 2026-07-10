import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string; taskId: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id, taskId } = await ctx.params;

  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (body.title !== undefined)       data.title       = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.status !== undefined)      data.status      = body.status;
    if (body.priority !== undefined)    data.priority    = body.priority;
    if (body.assigneeId !== undefined)  data.assigneeId  = body.assigneeId ? Number(body.assigneeId) : null;
    if (body.dueDate !== undefined)     data.dueDate     = body.dueDate ? new Date(body.dueDate) : null;
    if (body.unit !== undefined)        data.unit        = body.unit;

    const task = await prisma.showcaseTask.update({
      where: { id: taskId, editionId: id },
      data,
      include: { assignee: { select: { id: true, name: true, email: true } } },
    });
    return NextResponse.json(task);
  } catch (err) {
    console.error("PATCH task error:", err);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id, taskId } = await ctx.params;

  try {
    await prisma.showcaseTask.delete({ where: { id: taskId, editionId: id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE task error:", err);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
