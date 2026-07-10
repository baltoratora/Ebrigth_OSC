import { NextRequest, NextResponse } from "next/server";
import { hrfsPrisma } from "@/lib/hrfs";
import { requireSession, canSeeAllBranches } from "@/lib/auth";
import { isBranchManager } from "@/lib/roles";

type QuotaRow = { branch: string; wed: number; thu: number; fri: number; sat: number; sun: number };

export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;

  try {
    const rows = await hrfsPrisma.$queryRaw<QuotaRow[]>`
      SELECT branch, wed, thu, fri, sat, sun FROM branch_quota
    `;
    const map: Record<string, Omit<QuotaRow, "branch">> = {};
    for (const r of rows) {
      map[r.branch] = { wed: r.wed, thu: r.thu, fri: r.fri, sat: r.sat, sun: r.sun };
    }
    return NextResponse.json(map);
  } catch (e) {
    console.error("[quotas GET]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const role = (session.user as { role?: unknown })?.role;
  const sessionBranchName = ((session.user as { branchName?: unknown })?.branchName as string | undefined) ?? "";

  if (!canSeeAllBranches(session) && !isBranchManager(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as { code?: string; name?: string; wed?: number; thu?: number; fri?: number; sat?: number; sun?: number };
  const { code, name, wed, thu, fri, sat, sun } = body;

  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "code required" }, { status: 400 });
  }

  // Branch managers can only update their own branch
  if (isBranchManager(role) && !canSeeAllBranches(session)) {
    const requestedName = (name ?? "").trim().toLowerCase();
    const ownName = sessionBranchName.trim().toLowerCase();
    if (!ownName || requestedName !== ownName) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const safeInt = (v: unknown, def = 5) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : def);

  try {
    await hrfsPrisma.$executeRaw`
      INSERT INTO branch_quota (branch, wed, thu, fri, sat, sun, updated_at)
      VALUES (${code}, ${safeInt(wed)}, ${safeInt(thu)}, ${safeInt(fri)}, ${safeInt(sat)}, ${safeInt(sun)}, now())
      ON CONFLICT (branch) DO UPDATE SET
        wed        = EXCLUDED.wed,
        thu        = EXCLUDED.thu,
        fri        = EXCLUDED.fri,
        sat        = EXCLUDED.sat,
        sun        = EXCLUDED.sun,
        updated_at = now()
    `;
  } catch (e) {
    console.error("[quotas PUT]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
