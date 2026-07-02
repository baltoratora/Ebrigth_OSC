import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import QRCode from "qrcode";

interface Ctx { params: Promise<{ id: string; participantId: string }> }

function buildRegistrationUrl(participantId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/showcase-register/${participantId}`;
}

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id, participantId } = await ctx.params;

  try {
    const [participant, edition] = await Promise.all([
      prisma.showcaseParticipant.findUnique({ where: { id: participantId, editionId: id } }),
      prisma.showcaseEdition.findUnique({ where: { id }, select: { name: true } }),
    ]);

    if (!participant || !edition) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!participant.parentEmail) {
      return NextResponse.json({ error: "No parent email on record" }, { status: 400 });
    }

    const registrationUrl = buildRegistrationUrl(participant.id);
    const qrDataUrl = await QRCode.toDataURL(registrationUrl, {
      width: 400, margin: 2,
      color: { dark: "#1f2937", light: "#ffffff" },
    });

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:sans-serif">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="background:#f97316;padding:28px 32px">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700">🎪 Annual Showcase</h1>
      <p style="margin:6px 0 0;color:#fff3;font-size:13px">${edition.name}</p>
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 16px;color:#374151;font-size:15px">Dear <strong>${participant.parentName || "Parent/Guardian"}</strong>,</p>
      <p style="margin:0 0 24px;color:#374151;font-size:15px">
        Here is the registration QR code for <strong>${participant.fullName}</strong>.
        Please present this at the event entrance.
      </p>
      <div style="text-align:center;padding:24px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;margin-bottom:24px">
        <img src="${qrDataUrl}" alt="Registration QR Code" style="width:200px;height:200px" />
      </div>
      <div style="text-align:center;margin-bottom:24px">
        <a href="${registrationUrl}"
           style="display:inline-block;background:#f97316;color:#fff;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none">
          View Registration
        </a>
      </div>
    </div>
  </div>
</body>
</html>`;

    await sendMail({
      from:    `"Ebright Annual Showcase" <${process.env.SMTP_USER}>`,
      to:      participant.parentEmail,
      subject: `🎪 Registration QR — ${participant.fullName} | ${edition.name}`,
      html,
    });

    const now = new Date();
    await prisma.showcaseParticipant.update({
      where: { id: participantId },
      data:  { emailSentAt: now },
    });

    return NextResponse.json({ ok: true, emailSentAt: now });
  } catch (err) {
    console.error("resend-email error:", err);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
