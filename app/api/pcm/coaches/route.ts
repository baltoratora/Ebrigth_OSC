import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/nextauth";
import { hrfsPrisma } from "@/lib/hrfs";

export const dynamic = "force-dynamic";

// Branch-code → full-name mapping used elsewhere in OSC. The branchstaff
// table stores either form, so we accept both via the lookup. Keep this
// list in sync with @pcm/_types BRANCHES[].name when a branch is added.
const BRANCH_CODE_TO_NAME: Record<string, string> = {
  ONL: "Online",
  ST:  "Subang Taipan",
  SA:  "Setia Alam",
  SP:  "Sri Petaling",
  KD:  "Kota Damansara",
  PJY: "Putrajaya",
  AMP: "Ampang",
  CJY: "Cyberjaya",
  KLG: "Klang",
  DA:  "Denai Alam",
  BBB: "Bandar Baru Bangi",
  DK:  "Danau Kota",
  SHA: "Shah Alam",
  BTHO:"Bandar Tun Hussein Onn",
  EGR: "Eco Grandeur",
  BSP: "Bandar Seri Putra",
  RBY: "Bandar Rimbayu",
  TSG: "Taman Sri Gombak",
  KW:  "Kota Warisan",
  KTG: "Kajang TTDI",
};

/**
 * GET /api/pcm/coaches?branch=<code>
 *
 * Returns active branchstaff at the given branch, suitable for assigning
 * to a PCM invitation as the coach for that student. We don't restrict
 * by `role` (e.g. only Coaches) because the customer hasn't pinned a
 * single role label yet — every active staff at the branch is a valid
 * candidate. If/when a "Coach" role gets standardised, narrow the filter.
 *
 * Auth: any signed-in user. The endpoint is read-only and only exposes
 * (id, name, branch, role) — same fields the existing /api/branch-staff
 * route already surfaces, so no new privacy surface area.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const branchParam = (req.nextUrl.searchParams.get("branch") || "").trim();
  if (!branchParam) {
    return NextResponse.json({ error: "branch is required" }, { status: 400 });
  }
  const fullName = BRANCH_CODE_TO_NAME[branchParam.toUpperCase()] ?? branchParam;

  try {
    type StaffRow = {
      id: number;
      nickname: string | null;
      branch: string | null;
      role: string | null;
    };
    // Match either form: branchstaff.branch may hold the short code OR the
    // full name depending on when the row was created.
    const staff = await hrfsPrisma.branchStaff.findMany({
      select: { id: true, nickname: true, branch: true, role: true },
      where: {
        status: { equals: "Active", mode: "insensitive" },
        OR: [
          { branch: { equals: branchParam, mode: "insensitive" } },
          { branch: { equals: fullName,    mode: "insensitive" } },
        ],
      },
      orderBy: { nickname: "asc" },
    }) as StaffRow[];

    const coaches = staff
      .filter(s => s.nickname && s.nickname.trim().length > 0)
      .map(s => ({
        id: String(s.id),
        name: (s.nickname as string).trim(),
        branch: branchParam.toUpperCase(),
        role: s.role ?? null,
      }));

    return NextResponse.json({ coaches });
  } catch (err) {
    console.error("[api/pcm/coaches] failed:", err);
    return NextResponse.json({ error: "Failed to load coaches" }, { status: 500 });
  }
}
