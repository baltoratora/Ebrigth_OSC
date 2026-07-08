import { NextRequest, NextResponse } from "next/server";
import { hrfsPrisma } from "@/lib/hrfs";
import { requireRole } from "@/lib/auth";
import { ROLES, type Role } from "@/lib/roles";

export const dynamic = "force-dynamic";

const FIELD_ACTIVITY_ROLES: readonly Role[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MARKETING];

// GET /api/field-activity/people?branch=XX — active staff for any branch.
export async function GET(req: NextRequest) {
  const { error } = await requireRole(FIELD_ACTIVITY_ROLES);
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
    console.error("[api/field-activity/people GET] failed:", err);
    return NextResponse.json({ error: "Failed to load people" }, { status: 500 });
  }
}
