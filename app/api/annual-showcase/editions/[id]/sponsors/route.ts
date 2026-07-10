import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;

  try {
    const sponsors = await prisma.showcaseSponsor.findMany({
      where: { editionId: id },
      include: { outreachLog: { orderBy: { date: "desc" } } },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(sponsors);
  } catch (err) {
    console.error("GET sponsors error:", err);
    return NextResponse.json({ error: "Failed to fetch sponsors" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;

  try {
    const body = await req.json();
    if (!body.companyName || typeof body.companyName !== "string") {
      return NextResponse.json({ error: "companyName is required" }, { status: 400 });
    }

    const sponsor = await prisma.showcaseSponsor.create({
      data: {
        editionId:      id,
        companyName:    body.companyName.trim(),
        contactName:    body.contactName    ?? undefined,
        contactEmail:   body.contactEmail   ?? undefined,
        contactPhone:   body.contactPhone   ?? undefined,
        packageType:    body.packageType    ?? undefined,
        amount:         body.amount         ? Number(body.amount) : 0,
        pipelineStatus: body.pipelineStatus ?? "LEAD",
        notes:          body.notes          ?? undefined,
        isVVIP:         body.isVVIP         ?? false,
      },
    });
    return NextResponse.json(sponsor, { status: 201 });
  } catch (err) {
    console.error("POST sponsor error:", err);
    return NextResponse.json({ error: "Failed to create sponsor" }, { status: 500 });
  }
}
