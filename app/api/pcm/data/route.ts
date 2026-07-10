import { NextResponse } from "next/server";
import { fetchAllEventData } from "@pcm/_lib/events.server";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const data = await fetchAllEventData();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/fa/data] failed:", err);
    return NextResponse.json({ error: "Failed to load FA data" }, { status: 500 });
  }
}
