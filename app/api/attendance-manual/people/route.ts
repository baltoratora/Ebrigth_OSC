import { NextRequest, NextResponse } from "next/server";
import { hrfsPrisma } from "@/lib/hrfs";
import { requireRole } from "@/lib/auth";
import { MANAGEMENT_ROLES } from "@/lib/roles";

export const dynamic = "force-dynamic";

// GET /api/attendance-manual/people?branch=XX
// Active staff for ANY branch (including HQ/ST) — feeds the "add a
// replacement" picker: pick a source branch, then pick a name from it.
export async function GET(req: NextRequest) {
  const { error } = await requireRole(MANAGEMENT_ROLES);
  if (error) return error;

  const branch = new URL(req.url).searchParams.get("branch") || "";
  if (!branch) return NextResponse.json({ error: "branch is required" }, { status: 400 });

  try {
    const staff = await hrfsPrisma.branchStaff.findMany({
      where: { branch, status: { not: "Inactive" }, employeeId: { not: null } },
      select: { employeeId: true, name: true, role: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ people: staff });
  } catch (err) {
    console.error("[api/attendance-manual/people GET] failed:", err);
    return NextResponse.json({ error: "Failed to load people" }, { status: 500 });
  }
}
