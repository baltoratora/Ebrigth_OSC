import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string }> }

function bumpYear(name: string): string {
  return name.replace(/\b(\d{4})\b/, (_, y) => String(Number(y) + 1));
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;

    const source = await prisma.showcaseEdition.findUnique({
      where: { id },
      include: { categories: true, feeWaves: true },
    });

    if (!source) return NextResponse.json({ error: "Edition not found" }, { status: 404 });

    const newName  = (body.name  as string | undefined)?.trim()  ?? bumpYear(source.name);
    const newTheme = (body.theme as string | undefined)?.trim()  ?? source.theme;

    const newEdition = await prisma.showcaseEdition.create({
      data: {
        name:                   newName,
        theme:                  newTheme,
        status:                 "DRAFT",
        venueName:              source.venueName              ?? undefined,
        venueAddress:           source.venueAddress           ?? undefined,
        participantTarget:      source.participantTarget,
        profitabilityTarget:    source.profitabilityTarget,
        currency:               source.currency,
        departmentLeads:        source.departmentLeads        ?? undefined,
        goodieBagChecklist:     source.goodieBagChecklist     ?? undefined,
        sponsorPackages:        source.sponsorPackages        ?? undefined,
        scoringCriteria:        source.scoringCriteria        ?? undefined,
        stageChecklist:         source.stageChecklist         ?? undefined,
        youthpreneurLayout:     source.youthpreneurLayout     ?? undefined,
        photographerGuidelines: source.photographerGuidelines ?? undefined,
        pressCoverage:          source.pressCoverage          ?? undefined,
        photoDistribution:      source.photoDistribution      ?? undefined,
        logisticsData:          source.logisticsData          ?? undefined,
      },
    });

    // Clone categories
    if (source.categories.length > 0) {
      await prisma.showcaseCategory.createMany({
        data: source.categories.map(cat => ({
          editionId:   newEdition.id,
          name:        cat.name,
          description: cat.description ?? undefined,
          maxTeamSize: cat.maxTeamSize,
        })),
      });
    }

    // Clone fee waves with deadline bumped +1 year
    if (source.feeWaves.length > 0) {
      await prisma.showcaseFeeWave.createMany({
        data: source.feeWaves.map(wave => {
          const d = new Date(wave.deadline);
          d.setFullYear(d.getFullYear() + 1);
          return { editionId: newEdition.id, name: wave.name, amount: wave.amount, deadline: d };
        }),
      });
    }

    return NextResponse.json({ id: newEdition.id, name: newEdition.name }, { status: 201 });
  } catch (err) {
    console.error("POST /clone error:", err);
    return NextResponse.json({ error: "Failed to clone edition" }, { status: 500 });
  }
}
