import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import QRCode from "qrcode";

interface Ctx { params: Promise<{ token: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;

  try {
    const participant = await prisma.showcaseParticipant.findUnique({
      where: { id: token },
      select: {
        id:            true,
        fullName:      true,
        parentName:    true,
        parentPhone:   true,
        paymentStatus: true,
        registeredAt:  true,
        edition: { select: { name: true, theme: true, status: true } },
      },
    });
    if (!participant) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // QR encodes the participant ID — staff scan at each of the 5 checkpoints
    const qrDataUrl = await QRCode.toDataURL(participant.id, {
      width: 300, margin: 2,
      color: { dark: "#1f2937", light: "#ffffff" },
    });

    return NextResponse.json({ participant, qrDataUrl });
  } catch (err) {
    console.error("public register GET error:", err);
    return NextResponse.json({ error: "Failed to load registration" }, { status: 500 });
  }
}
