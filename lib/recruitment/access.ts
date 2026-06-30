import "server-only";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/nextauth";
// Recruitment lives in the ebright_hrfs database — use the HRFS client.
import { hrfsPrisma as prisma } from "@/lib/hrfs";
import { ROLES, normalizeRole } from "@/lib/roles";

// Roles allowed inside the Recruitment (HR) portal. Mirrors _actions.ts and the
// /recruitment middleware gate.
const ALLOWED = new Set<string>([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR, ROLES.HOD]);

export async function requireRecruitmentAccess(): Promise<{ userId: string; email: string }> {
  const session = await getServerSession(authOptions);
  const role = normalizeRole((session?.user as { role?: string } | undefined)?.role);
  if (!session?.user || !role || !ALLOWED.has(role)) {
    throw new Error("Not authorized for Recruitment.");
  }
  const u = session.user as { id?: string; email?: string };
  return { userId: String(u.id ?? u.email ?? "unknown"), email: String(u.email ?? "") };
}

/** Resolve a stage id from its shortCode (e.g. "ID", "RS", "BR"). */
export async function stageIdByShortCode(shortCode: string): Promise<string | null> {
  const s = await prisma.recStage.findUnique({ where: { shortCode }, select: { id: true } });
  return s?.id ?? null;
}

// Interview times are stored "naive-KL-as-UTC": the HR picks 03:00 PM and we
// persist UTC hour 15, matching the trial-appointment convention so the Calendar
// reads back via getUTC* without a timezone double-shift.
/** Build a naive-KL Date from "YYYY-MM-DD" + "HH:mm". Throws on bad input. */
export function klWallClock(date: string, time: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m || !t) throw new Error("Invalid date or time");
  const d = new Date(`${date}T${time}:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date or time");
  return d;
}
