import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;

  try {
    const edition = await prisma.showcaseEdition.findUnique({
      where: { id },
      include: {
        categories: true,
        feeWaves: true,
        members: true,
        _count: { select: { participants: true, tasks: true, budgetItems: true } },
      },
    });
    if (!edition) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(edition);
  } catch (err) {
    console.error("GET /api/annual-showcase/editions/[id] error:", err);
    return NextResponse.json({ error: "Failed to fetch edition" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;

  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (body.name !== undefined)                 data.name                = body.name;
    if (body.theme !== undefined)                data.theme               = body.theme;
    if (body.status !== undefined)               data.status              = body.status;
    if (body.startDate !== undefined)            data.startDate           = body.startDate ? new Date(body.startDate) : null;
    if (body.endDate !== undefined)              data.endDate             = body.endDate ? new Date(body.endDate) : null;
    if (body.venueName !== undefined)            data.venueName           = body.venueName;
    if (body.venueAddress !== undefined)         data.venueAddress        = body.venueAddress;
    if (body.participantTarget !== undefined)    data.participantTarget   = Number(body.participantTarget);
    if (body.profitabilityTarget !== undefined)  data.profitabilityTarget = Number(body.profitabilityTarget);
    if (body.registrationDeadline !== undefined) data.registrationDeadline = body.registrationDeadline ? new Date(body.registrationDeadline) : null;
    if (body.testRunDate !== undefined)          data.testRunDate         = body.testRunDate ? new Date(body.testRunDate) : null;
    if (body.currency !== undefined)             data.currency            = body.currency;
    if (body.goodieBagChecklist !== undefined)   data.goodieBagChecklist  = body.goodieBagChecklist;
    if (body.departmentLeads !== undefined)      data.departmentLeads     = body.departmentLeads;
    if (body.logisticsData           !== undefined) data.logisticsData           = body.logisticsData;
    if (body.sponsorPackages         !== undefined) data.sponsorPackages         = body.sponsorPackages;
    if (body.photographerGuidelines  !== undefined) data.photographerGuidelines  = body.photographerGuidelines;
    if (body.pressCoverage           !== undefined) data.pressCoverage           = body.pressCoverage;
    if (body.photoDistribution       !== undefined) data.photoDistribution       = body.photoDistribution;
    if (body.scoringCriteria         !== undefined) data.scoringCriteria         = body.scoringCriteria;
    if (body.stageChecklist          !== undefined) data.stageChecklist          = body.stageChecklist;
    if (body.youthpreneurLayout      !== undefined) data.youthpreneurLayout      = body.youthpreneurLayout;
    if (body.waitlistEnabled         !== undefined) data.waitlistEnabled         = Boolean(body.waitlistEnabled);

    const edition = await prisma.showcaseEdition.update({ where: { id }, data });
    return NextResponse.json(edition);
  } catch (err) {
    console.error("PATCH /api/annual-showcase/editions/[id] error:", err);
    return NextResponse.json({ error: "Failed to update edition" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;

  try {
    await prisma.showcaseEdition.update({ where: { id }, data: { status: "ARCHIVED" } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/annual-showcase/editions/[id] error:", err);
    return NextResponse.json({ error: "Failed to archive edition" }, { status: 500 });
  }
}
