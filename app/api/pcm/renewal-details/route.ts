import { NextResponse } from "next/server";
import { fetchRenewalDetails } from "@pcm/_lib/renewals.server";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const url = new URL(req.url);
    const data = await fetchRenewalDetails({
      branch: url.searchParams.get("branch"),
      start: url.searchParams.get("start"),
      end: url.searchParams.get("end"),
    });
    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/pcm/renewal-details] failed:", err);
    return NextResponse.json({ error: "Failed to load renewal details" }, { status: 500 });
  }
}
