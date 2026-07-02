import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import QRCode from "qrcode";

interface Ctx { params: Promise<{ id: string }> }

function buildRegistrationUrl(participantId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/showcase-register/${participantId}`;
}

async function buildParentEmail(opts: {
  studentName: string;
  editionName: string;
  parentName: string;
  qrDataUrl: string;
  registrationUrl: string;
}): Promise<string> {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:sans-serif">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="background:#f97316;padding:28px 32px">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700">🎪 Annual Showcase</h1>
      <p style="margin:6px 0 0;color:#fff3;font-size:13px">${opts.editionName}</p>
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 16px;color:#374151;font-size:15px">Dear <strong>${opts.parentName || "Parent/Guardian"}</strong>,</p>
      <p style="margin:0 0 16px;color:#374151;font-size:15px">
        We are pleased to inform you that <strong>${opts.studentName}</strong> has been invited to participate in the
        <strong>${opts.editionName}</strong>.
      </p>
      <p style="margin:0 0 24px;color:#374151;font-size:15px">
        Please present the QR code below at the event entrance for registration.
      </p>
      <div style="text-align:center;padding:24px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;margin-bottom:24px">
        <img src="${opts.qrDataUrl}" alt="Registration QR Code" style="width:200px;height:200px" />
        <p style="margin:12px 0 0;color:#6b7280;font-size:12px">Scan at event entrance</p>
      </div>
      <div style="text-align:center;margin-bottom:24px">
        <a href="${opts.registrationUrl}"
           style="display:inline-block;background:#f97316;color:#fff;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none">
          View Registration
        </a>
      </div>
      <p style="margin:0;color:#9ca3af;font-size:12px;border-top:1px solid #f3f4f6;padding-top:16px">
        This email was sent by Ebright OSC. If you have any questions, please contact us.
      </p>
    </div>
  </div>
</body>
</html>`;
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;

  try {
    const body = await req.json();

    if (!body.fullName || typeof body.fullName !== "string") {
      return NextResponse.json({ error: "fullName is required" }, { status: 400 });
    }
    if (!body.parentEmail || typeof body.parentEmail !== "string") {
      return NextResponse.json({ error: "parentEmail is required" }, { status: 400 });
    }

    // Check the edition exists and is active
    const edition = await prisma.showcaseEdition.findUnique({
      where: { id },
      select: { id: true, name: true, isActive: true },
    });
    if (!edition) return NextResponse.json({ error: "Edition not found" }, { status: 404 });

    // Prevent duplicate FA student registrations in same edition
    if (body.faStudentId) {
      const existing = await prisma.showcaseParticipant.findFirst({
        where: { editionId: id, faStudentId: String(body.faStudentId) },
      });
      if (existing) {
        return NextResponse.json({ error: "This student is already registered for this edition" }, { status: 409 });
      }
    }

    const participant = await prisma.showcaseParticipant.create({
      data: {
        editionId:   id,
        fullName:    body.fullName.trim(),
        email:       body.email       ?? undefined,
        phone:       body.phone       ?? undefined,
        parentName:  body.parentName  ?? undefined,
        parentEmail: body.parentEmail.trim().toLowerCase(),
        parentPhone: body.parentPhone ?? undefined,
        isEbrighter: true,
        faStudentId: body.faStudentId ? String(body.faStudentId) : undefined,
      },
    });

    const registrationUrl = buildRegistrationUrl(participant.id);

    // QR encodes the participant ID — staff scan this at each checkpoint.
    // The email also includes the card URL so parents can view/print the QR.
    const qrDataUrl = await QRCode.toDataURL(participant.id, {
      width: 400,
      margin: 2,
      color: { dark: "#1f2937", light: "#ffffff" },
    });

    // Send email to parent — fire-and-forget with best-effort (SMTP may not be configured)
    let emailSentAt: Date | null = null;
    try {
      const html = await buildParentEmail({
        studentName:     participant.fullName,
        editionName:     edition.name,
        parentName:      participant.parentName ?? "",
        qrDataUrl,
        registrationUrl,
      });

      await sendMail({
        from:    `"Ebright Annual Showcase" <${process.env.SMTP_USER}>`,
        to:      participant.parentEmail!,
        subject: `🎪 Registration Confirmed — ${participant.fullName} | ${edition.name}`,
        html,
      });
      emailSentAt = new Date();
      await prisma.showcaseParticipant.update({
        where: { id: participant.id },
        data:  { emailSentAt },
      });
    } catch (mailErr) {
      console.error("[invite] email send failed:", mailErr);
      // Registration succeeds even if email fails — admin can resend
    }

    return NextResponse.json({
      participant: { ...participant, emailSentAt },
      registrationUrl,
      emailSent: emailSentAt !== null,
    }, { status: 201 });
  } catch (err) {
    console.error("POST invite error:", err);
    return NextResponse.json({ error: "Failed to invite participant" }, { status: 500 });
  }
}
