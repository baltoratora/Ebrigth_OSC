import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

// GET /api/me
//
// Returns the signed-in user's display identity, preferring the full name from
// their matching BranchStaff record (joined by email — the reliable link now
// that User.role mirrors BranchStaff.role). Falls back to the session name, so
// callers always get *something* even for users with no staff row.
export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;

  const user = session.user as { email?: string | null; name?: string | null } | undefined;
  const email = user?.email?.trim().toLowerCase() || "";
  const sessionName = user?.name ?? null;

  if (!email) {
    return NextResponse.json({ name: sessionName, branch: null, email: null });
  }

  let staff: { name: string | null; branch: string | null } | null = null;
  try {
    staff = await prisma.branchStaff.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { name: true, branch: true },
    });
  } catch {
    // BranchStaff read failed (e.g. transient DB issue) — fall back to session.
  }

  return NextResponse.json({
    name: staff?.name?.trim() || sessionName || null,
    branch: staff?.branch ?? null,
    email,
  });
}
