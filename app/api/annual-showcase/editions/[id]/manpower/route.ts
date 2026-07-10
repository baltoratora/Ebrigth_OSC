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
    const where: { editionId: string; unit?: string } = { editionId: id };
    if (unit) where.unit = unit;

    const manpower = await prisma.showcaseManpower.findMany({
      where,
      orderBy: [{ type: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(manpower);
  } catch (err) {
    console.error("GET manpower error:", err);
    return NextResponse.json({ error: "Failed to fetch manpower" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;

  try {
    const body = await req.json();
    const { unit, type, name, role, phone, email, shift, day, status, notes } = body;

    if (!unit || !type || !name || !role) {
      return NextResponse.json({ error: "unit, type, name, role are required" }, { status: 400 });
    }

    const entry = await prisma.showcaseManpower.create({
      data: {
        editionId: id,
        unit,
        type,
        name,
        role,
        phone: phone || null,
        email: email || null,
        shift: shift || null,
        day: day || null,
        status: status ?? "CONFIRMED",
        notes: notes || null,
      },
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    console.error("POST manpower error:", err);
    return NextResponse.json({ error: "Failed to create entry" }, { status: 500 });
  }
}
