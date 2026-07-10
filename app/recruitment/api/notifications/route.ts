import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/nextauth";
import { ROLES, normalizeRole } from "@/lib/roles";
import { getRecruitmentNotifications } from "@/lib/recruitment/data";

const ALLOWED = new Set<string>([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR, ROLES.HOD]);

// Day/week notification feed for the bell dropdown + push poller. Polled by the
// client every ~60s while the tab is open.
export async function GET() {
  const session = await getServerSession(authOptions);
  const role = normalizeRole((session?.user as { role?: string } | undefined)?.role);
  if (!session?.user || !role || !ALLOWED.has(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const data = await getRecruitmentNotifications();
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
