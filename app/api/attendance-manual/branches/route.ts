import { NextRequest, NextResponse } from "next/server";
import { hrfsPrisma } from "@/lib/hrfs";
import { requireRole } from "@/lib/auth";
import { MANAGEMENT_ROLES } from "@/lib/roles";

export const dynamic = "force-dynamic";

// Real branch codes for the Attendance Manual picker: every distinct
// BranchStaff.branch value, EXCLUDING department codes that sometimes leak
// into that column (od, mkt, ops, fnc, hr, acd, iop, ceo, op, fin) — mirrors
// app/staff-directory/page.tsx's isDeptCode/isNonBranch exclusion.
//
// By default also EXCLUDES "hq" and "st" (this feature's own destination
// scope — those two branches have scanners and aren't managed here). Pass
// ?includeHqSt=1 to get the full list instead — used by the "add a
// replacement" picker's source-branch dropdown, since someone temporarily
// based at HQ or ST can still be borrowed to work at a branch that has no
// scanner yet.
const DEPT_CODES = new Set(["od", "mkt", "ops", "fnc", "hr", "acd", "iop", "ceo", "op", "fin"]);
const EXCLUDED = new Set(["hq", "st"]);

export async function GET(req: NextRequest) {
  const { error } = await requireRole(MANAGEMENT_ROLES);
  if (error) return error;

  const includeHqSt = new URL(req.url).searchParams.get("includeHqSt") === "1";

  try {
    const rows = await hrfsPrisma.branchStaff.findMany({
      where: { branch: { not: null } },
      select: { branch: true },
      distinct: ["branch"],
    });
    const branches = rows
      .map((r) => r.branch?.trim())
      .filter((b): b is string => !!b && !DEPT_CODES.has(b.toLowerCase()) && (includeHqSt || !EXCLUDED.has(b.toLowerCase())))
      .sort((a, b) => a.localeCompare(b));
    return NextResponse.json({ branches });
  } catch (err) {
    console.error("[api/attendance-manual/branches GET] failed:", err);
    return NextResponse.json({ error: "Failed to load branches" }, { status: 500 });
  }
}
