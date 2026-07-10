import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const activeOnly = req.nextUrl.searchParams.get("active") === "true";

  try {
    if (activeOnly) {
      const edition = await prisma.showcaseEdition.findFirst({
        where: { isActive: true },
        include: { _count: { select: { participants: true, tasks: true } } },
      });
      return NextResponse.json(edition ?? null);
    }

    const editions = await prisma.showcaseEdition.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { participants: true, tasks: true } } },
    });
    return NextResponse.json(editions);
  } catch (err) {
    console.error("GET /api/annual-showcase/editions error:", err);
    return NextResponse.json({ error: "Failed to fetch editions" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  try {
    const body = await req.json();
    const { name, theme } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (!theme || typeof theme !== "string" || theme.trim().length === 0) {
      return NextResponse.json({ error: "theme is required" }, { status: 400 });
    }

    const edition = await prisma.showcaseEdition.create({
      data: {
        name: name.trim(),
        theme: theme.trim(),
        startDate:            body.startDate            ? new Date(body.startDate)            : undefined,
        endDate:              body.endDate              ? new Date(body.endDate)              : undefined,
        venueName:            body.venueName            ?? undefined,
        venueAddress:         body.venueAddress         ?? undefined,
        participantTarget:    body.participantTarget     ? Number(body.participantTarget)    : 0,
        profitabilityTarget:  body.profitabilityTarget   ? Number(body.profitabilityTarget)  : 0,
        registrationDeadline: body.registrationDeadline ? new Date(body.registrationDeadline) : undefined,
        testRunDate:          body.testRunDate          ? new Date(body.testRunDate)          : undefined,
        currency:             body.currency             ?? "MYR",
        departmentLeads:      body.departmentLeads      ?? undefined,
      },
    });
    return NextResponse.json(edition, { status: 201 });
  } catch (err) {
    console.error("POST /api/annual-showcase/editions error:", err);
    return NextResponse.json({ error: "Failed to create edition" }, { status: 500 });
  }
}
