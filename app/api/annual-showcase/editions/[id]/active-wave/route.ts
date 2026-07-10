import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;

  try {
    const now = new Date();

    const edition = await prisma.showcaseEdition.findUnique({
      where: { id },
      select: {
        registrationDeadline: true,
        participantTarget:    true,
        waitlistEnabled:      true,
        _count: { select: { participants: true } },
      },
    });

    if (!edition) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (edition.registrationDeadline && edition.registrationDeadline < now) {
      return NextResponse.json({ closed: true, reason: "deadline_passed" });
    }

    // Find active wave: the first wave whose deadline hasn't passed yet
    const wave = await prisma.showcaseFeeWave.findFirst({
      where: { editionId: id, deadline: { gte: now } },
      orderBy: { deadline: "asc" },
    });

    if (!wave) {
      return NextResponse.json({ closed: true, reason: "no_active_wave" });
    }

    const daysLeft = Math.ceil((wave.deadline.getTime() - now.getTime()) / 86400000);
    const isFull   = edition.participantTarget > 0 && edition._count.participants >= edition.participantTarget;

    return NextResponse.json({
      closed:  false,
      isFull,
      wave:    { id: wave.id, name: wave.name, amount: wave.amount, deadline: wave.deadline, daysLeft },
      waitlistEnabled:    edition.waitlistEnabled,
      participantTarget:  edition.participantTarget,
      participantCount:   edition._count.participants,
    });
  } catch (err) {
    console.error("GET /active-wave error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
