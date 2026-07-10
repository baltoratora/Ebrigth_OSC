import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public — no auth. Returns active edition + all participants with checkpoint data
// for the staff check-in page.
export async function GET() {
  try {
    const edition = await prisma.showcaseEdition.findFirst({
      where: { isActive: true },
      select: { id: true, name: true, theme: true },
    });
    if (!edition) return NextResponse.json({ error: "No active edition" }, { status: 404 });

    let participants;
    try {
      participants = await prisma.showcaseParticipant.findMany({
        where: { editionId: edition.id },
        select: {
          id:          true,
          fullName:    true,
          parentName:  true,
          parentPhone: true,
          checkpoints: true,
        },
        orderBy: { fullName: "asc" },
      });
    } catch {
      // checkpoints column may not exist yet (needs npx prisma db push)
      participants = await prisma.showcaseParticipant.findMany({
        where: { editionId: edition.id },
        select: { id: true, fullName: true, parentName: true, parentPhone: true },
        orderBy: { fullName: "asc" },
      });
    }

    return NextResponse.json({ edition, participants });
  } catch (err) {
    console.error("public checkin GET error:", err);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}
