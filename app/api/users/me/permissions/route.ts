import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { parseOverrides } from "@/lib/dashboard-access";

// Returns the logged-in user's dashboard overrides. Any signed-in user can
// read their own — no admin required, since the result only controls what
// they themselves see in the sidebar.
export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;

  const email = session.user?.email;
  if (!email) return NextResponse.json({ error: "Session missing email" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, dashboardOverrides: true },
  });

  if (!user) return NextResponse.json({ overrides: {}, role: null });

  return NextResponse.json({
    role:      user.role,
    overrides: parseOverrides(user.dashboardOverrides),
  });
}
