import { NextRequest, NextResponse } from "next/server";
import { createSessionRow } from "@fa/_lib/events.server";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const created = await createSessionRow({
      eventId: body.eventId,
      dayNumber: body.dayNumber,
      sessionNumber: body.sessionNumber,
      startTime: body.startTime,
      endTime: body.endTime,
      label: body.label,
    });
    return NextResponse.json(created);
  } catch (err) {
    console.error("[api/fa/sessions POST] failed:", err);
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}
