import { NextRequest, NextResponse } from "next/server";
import { upsertQuotaRow } from "@pcm/_lib/events.server";
import { BranchCode } from "@pcm/_types";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// PUT /api/pcm/quotas — upsert by (sessionId, branch). quota=0 deletes the row.
export async function PUT(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const result = await upsertQuotaRow(
      body.sessionId,
      body.branch as BranchCode,
      Number(body.quota)
    );
    return NextResponse.json({ quota: result });
  } catch (err) {
    console.error("[api/fa/quotas PUT] failed:", err);
    return NextResponse.json({ error: "Failed to upsert quota" }, { status: 500 });
  }
}
