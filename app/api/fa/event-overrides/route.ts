import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/nextauth";
import {
  upsertEventBranchOverrideRow,
  deleteEventBranchOverrideRow,
} from "@fa/_lib/events.server";
import { BranchCode, DayPolicy } from "@fa/_types";
import { normalizeRole, ROLES } from "@/lib/roles";

const VALID_DAY_POLICIES: ReadonlySet<DayPolicy> = new Set(["SAME_DAY", "DIFF_DAY", "BOTH"]);

export const dynamic = "force-dynamic";

// Only these three NextAuth roles can grant/revoke the multi-grade override.
// ACADEMY and BRANCH_MANAGER are intentionally excluded — the toggle is an
// HQ marketing-side decision, not something branch users can self-issue.
const ALLOWED_ROLES = new Set<string>([
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.MARKETING,
]);

async function requireMarketingOrAdmin(): Promise<
  { ok: true; email: string } | { ok: false; status: number; body: { error: string } }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { ok: false, status: 401, body: { error: "Not authenticated" } };
  }
  const role = normalizeRole((session.user as { role?: unknown }).role);
  if (!role || !ALLOWED_ROLES.has(role)) {
    return { ok: false, status: 403, body: { error: "Forbidden — Marketing/Admin only" } };
  }
  return { ok: true, email: session.user.email };
}

// POST — grant (or update) the override for (eventId, branchCode).
// Body: { eventId: string, branchCode: BranchCode, dayPolicy?: DayPolicy, reason?: string }
export async function POST(req: NextRequest) {
  const guard = await requireMarketingOrAdmin();
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });

  try {
    const body = await req.json();
    const eventId = String(body.eventId ?? "");
    const branchCode = String(body.branchCode ?? "") as BranchCode;
    const reason = body.reason ? String(body.reason).slice(0, 500) : undefined;
    if (!eventId || !branchCode) {
      return NextResponse.json({ error: "eventId and branchCode are required" }, { status: 400 });
    }
    // Optional — defaults to SAME_DAY (legacy behaviour) when omitted/invalid.
    const rawPolicy = String(body.dayPolicy ?? "SAME_DAY") as DayPolicy;
    if (body.dayPolicy != null && !VALID_DAY_POLICIES.has(rawPolicy)) {
      return NextResponse.json(
        { error: "dayPolicy must be one of SAME_DAY, DIFF_DAY, BOTH" },
        { status: 400 }
      );
    }
    const dayPolicy: DayPolicy = VALID_DAY_POLICIES.has(rawPolicy) ? rawPolicy : "SAME_DAY";
    const override = await upsertEventBranchOverrideRow({
      eventId,
      branchCode,
      dayPolicy,
      grantedBy: guard.email,
      reason,
    });
    return NextResponse.json({ override });
  } catch (err) {
    console.error("[api/fa/event-overrides POST] failed:", err);
    return NextResponse.json({ error: "Failed to grant override" }, { status: 500 });
  }
}

// DELETE — revoke the override for (eventId, branchCode).
// Body: { eventId: string, branchCode: BranchCode }
export async function DELETE(req: NextRequest) {
  const guard = await requireMarketingOrAdmin();
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });

  try {
    const body = await req.json();
    const eventId = String(body.eventId ?? "");
    const branchCode = String(body.branchCode ?? "") as BranchCode;
    if (!eventId || !branchCode) {
      return NextResponse.json({ error: "eventId and branchCode are required" }, { status: 400 });
    }
    await deleteEventBranchOverrideRow(eventId, branchCode);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/fa/event-overrides DELETE] failed:", err);
    return NextResponse.json({ error: "Failed to revoke override" }, { status: 500 });
  }
}
