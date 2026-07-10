import { NextResponse } from "next/server";
import { hrfsPrisma } from "@/lib/hrfs";
import { requireSession, canSeeAllBranches } from "@/lib/auth";
import { isBranchManager } from "@/lib/roles";

export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;

  const role = (session.user as { role?: unknown })?.role;
  if (!canSeeAllBranches(session) && !isBranchManager(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const staff = await hrfsPrisma.branchStaff.findMany({
    select: { role: true, branch: true },
    where: { status: { equals: "Active", mode: "insensitive" } },
  });

  const ptCoach = staff.filter(s => s.role?.toLowerCase() === "pt coach").length;
  const ftCoach = staff.filter(s => s.role?.toLowerCase() === "ft coach").length;
  const bm      = staff.filter(s => s.role?.toUpperCase() === "BM").length;
  const total   = ptCoach + ftCoach + bm;

  return NextResponse.json({ total, ptCoach, ftCoach, bm });
}
