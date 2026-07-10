import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;
  try {
    const members = await prisma.showcaseMember.findMany({
      where: { editionId: id },
      orderBy: { invitedAt: "desc" },
    });
    return NextResponse.json(members);
  } catch (err) {
    console.error("GET members error:", err);
    return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;
  try {
    const body = await req.json();
    if (!body.email || typeof body.email !== "string" || !body.email.trim()) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }
    const allowedUnits = Array.isArray(body.allowedUnits) ? body.allowedUnits.map(String) : [];

    const member = await prisma.showcaseMember.create({
      data: {
        editionId: id,
        email: body.email.trim().toLowerCase(),
        name: body.name?.trim() || undefined,
        allowedUnits,
      },
    });
    return NextResponse.json(member, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "This email is already a member of this edition" }, { status: 409 });
    }
    console.error("POST member error:", err);
    return NextResponse.json({ error: "Failed to add member" }, { status: 500 });
  }
}
