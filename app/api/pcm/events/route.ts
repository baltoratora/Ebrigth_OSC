import { NextRequest, NextResponse } from "next/server";
import { createEventRow } from "@pcm/_lib/events.server";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const created = await createEventRow({
      name: body.name,
      month: body.month,
      year: body.year,
      venue: body.venue,
      startDate: body.startDate,
      endDate: body.endDate,
      numberOfDays: body.numberOfDays,
      invitationOpenDate: body.invitationOpenDate,
      invitationCloseDate: body.invitationCloseDate,
      status: body.status,
      createdBy: body.createdBy ?? "",
      notes: body.notes,
    });
    return NextResponse.json(created);
  } catch (err) {
    console.error("[api/fa/events POST] failed:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
