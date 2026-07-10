import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;

  try {
    const items = await prisma.showcaseBudgetItem.findMany({
      where: { editionId: id },
      include: { approvedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });

    const totalRevenue = items
      .filter((i) => i.type === "REVENUE" && i.status === "PAID")
      .reduce((sum, i) => sum + i.amount, 0);

    const totalExpense = items
      .filter((i) => i.type === "EXPENSE" && i.status === "PAID")
      .reduce((sum, i) => sum + i.amount, 0);

    return NextResponse.json({ items, totalRevenue, totalExpense });
  } catch (err) {
    console.error("GET budget error:", err);
    return NextResponse.json({ error: "Failed to fetch budget" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;

  try {
    const body = await req.json();
    if (!body.description || !body.type || body.amount === undefined) {
      return NextResponse.json({ error: "description, type, and amount are required" }, { status: 400 });
    }

    const item = await prisma.showcaseBudgetItem.create({
      data: {
        editionId:   id,
        unit:        body.unit        ?? "OC",
        type:        body.type,
        description: body.description.trim(),
        amount:      Number(body.amount),
        status:      body.status      ?? "PENDING",
      },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    console.error("POST budget error:", err);
    return NextResponse.json({ error: "Failed to create budget item" }, { status: 500 });
  }
}
