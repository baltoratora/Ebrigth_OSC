import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import QRCode from "qrcode";

interface Ctx { params: Promise<{ id: string; participantId: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id, participantId } = await ctx.params;

  const participant = await prisma.showcaseParticipant.findUnique({
    where: { id: participantId, editionId: id },
    select: { id: true },
  });
  if (!participant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const buffer = await QRCode.toBuffer(participant.id, {
    width: 400, margin: 2,
    color: { dark: "#1f2937", light: "#ffffff" },
  });

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type":        "image/png",
      "Content-Disposition": `attachment; filename="qr-${participantId}.png"`,
    },
  });
}
