import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface Ctx { params: Promise<{ participantId: string }> }

type CheckpointEntry = { num: number; at: string };

const TOTAL_CHECKPOINTS = 5;

// Public — no auth. Marks a participant at a specific checkpoint.
// Enforces sequential order: checkpoint N requires 1..N-1 to be completed first.
export async function POST(req: NextRequest, ctx: Ctx) {
  const { participantId } = await ctx.params;

  try {
    const body = await req.json() as { checkpoint?: number; undo?: boolean };
    const num = Number(body.checkpoint);

    if (!num || num < 1 || num > TOTAL_CHECKPOINTS) {
      return NextResponse.json({ error: `checkpoint must be 1–${TOTAL_CHECKPOINTS}` }, { status: 400 });
    }

    const participant = await prisma.showcaseParticipant.findUnique({
      where:  { id: participantId },
      select: { id: true, checkpoints: true },
    });
    if (!participant) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const done = (Array.isArray(participant.checkpoints) ? participant.checkpoints : []) as CheckpointEntry[];
    const completedNums = done.map(c => c.num);

    // Undo path: remove this checkpoint
    if (body.undo) {
      const updated = done.filter(c => c.num !== num);
      await prisma.showcaseParticipant.update({
        where: { id: participantId },
        data:  { checkpoints: updated },
      });
      return NextResponse.json({ ok: true, checkpoints: updated });
    }

    // Already done
    if (completedNums.includes(num)) {
      return NextResponse.json({ error: "Already checked in at this checkpoint", checkpoint: num }, { status: 400 });
    }

    // Sequential validation: find the first required previous checkpoint that's missing
    for (let i = 1; i < num; i++) {
      if (!completedNums.includes(i)) {
        return NextResponse.json({ error: "Skip detected", requiredCheckpoint: i }, { status: 422 });
      }
    }

    const entry: CheckpointEntry = { num, at: new Date().toISOString() };
    const updated = [...done, entry].sort((a, b) => a.num - b.num);

    await prisma.showcaseParticipant.update({
      where: { id: participantId },
      data:  { checkpoints: updated },
    });

    return NextResponse.json({ ok: true, checkpoints: updated });
  } catch (err) {
    console.error("public checkin POST error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
