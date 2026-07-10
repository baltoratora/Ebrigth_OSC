import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { normalizeRole, ROLES, type Role } from "@/lib/roles";
import type { Prisma } from "@prisma/client";

// These roles always get full Annual Showcase access ("ALL" units), regardless
// of any ShowcaseMember / ShowcaseManpower assignment.
const ALWAYS_VISIBLE_ROLES: readonly Role[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MARKETING, ROLES.EXECUTIVE, ROLES.HR];

export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;

  const role = normalizeRole((session.user as { role?: unknown } | undefined)?.role);
  if (role !== null && ALWAYS_VISIBLE_ROLES.includes(role)) {
    return NextResponse.json({ units: "ALL" });
  }

  const email = session.user?.email;
  const name  = (session.user as { name?: string | null } | undefined)?.name;
  if (!email) return NextResponse.json({ units: [] });

  try {
    const activeEdition = await prisma.showcaseEdition.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    if (!activeEdition) return NextResponse.json({ units: [] });

    const units = new Set<string>();

    const member = await prisma.showcaseMember.findFirst({
      where: { editionId: activeEdition.id, email: email.toLowerCase() },
      select: { allowedUnits: true },
    });
    member?.allowedUnits.forEach(u => units.add(u));

    // Staff rostered in ShowcaseManpower (matched by email or name) also get
    // access to whichever unit they're scheduled under, even without an
    // explicit ShowcaseMember row.
    const manpowerOr: Prisma.ShowcaseManpowerWhereInput[] = [
      { email: { equals: email, mode: "insensitive" } },
    ];
    if (name) manpowerOr.push({ name: { equals: name, mode: "insensitive" } });

    const manpowerEntries = await prisma.showcaseManpower.findMany({
      where: { editionId: activeEdition.id, OR: manpowerOr },
      select: { unit: true },
    });
    manpowerEntries.forEach(m => units.add(m.unit));

    return NextResponse.json({ units: Array.from(units) });
  } catch (err) {
    console.error("GET my-access error:", err);
    return NextResponse.json({ units: [] });
  }
}
