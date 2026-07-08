import { NextResponse } from "next/server";
import { hrfsPrisma } from "@/lib/hrfs";
import { requireRole } from "@/lib/auth";
import { ROLES, type Role } from "@/lib/roles";

export const dynamic = "force-dynamic";

const FIELD_ACTIVITY_ROLES: readonly Role[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MARKETING];
const DEPT_CODES = new Set(["od", "mkt", "ops", "fnc", "hr", "acd", "iop", "ceo", "op", "fin"]);

// GET /api/field-activity/branches — every real branch code, INCLUDING HQ/ST
// (unlike Attendance Manual's picker, there's no "destination branch" concept
// here — someone from any branch can be added for a field activity).
export async function GET() {
  const { error } = await requireRole(FIELD_ACTIVITY_ROLES);
  if (error) return error;

  try {
    const rows = await hrfsPrisma.branchStaff.findMany({
      where: { branch: { not: null } },
      select: { branch: true },
      distinct: ["branch"],
    });
    const branches = rows
      .map((r) => r.branch?.trim())
      .filter((b): b is string => !!b && !DEPT_CODES.has(b.toLowerCase()))
      .sort((a, b) => a.localeCompare(b));
    return NextResponse.json({ branches });
  } catch (err) {
    console.error("[api/field-activity/branches GET] failed:", err);
    return NextResponse.json({ error: "Failed to load branches" }, { status: 500 });
  }
}
