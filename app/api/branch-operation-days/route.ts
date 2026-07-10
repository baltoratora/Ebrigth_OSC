import { NextResponse } from "next/server";
import { hrfsPrisma } from "@/lib/hrfs";
import { requireSession, canSeeAllBranches } from "@/lib/auth";
import { isBranchManager } from "@/lib/roles";

const BRANCH_CODE_MAP: Record<string, string> = {
  AMP:  "Ampang",
  ONL:  "Online",
  BBB:  "Bandar Baru Bangi",
  BSP:  "Bandar Seri Putra",
  BTHO: "Bandar Tun Hussein Onn",
  CJY:  "Cyberjaya",
  DA:   "Denai Alam",
  DK:   "Danau Kota",
  EGR:  "Eco Grandeur",
  KD:   "Kota Damansara",
  KLG:  "Klang",
  KTG:  "Kajang TTDI Groove",
  KW:   "Kota Warisan",
  PJY:  "Putrajaya",
  PJU:  "Puchong Utama",
  PJ:   "Puncak Jalil",
  RBY:  "Rimbayu",
  SA:   "Setia Alam",
  SHA:  "Shah Alam",
  SP:   "Sri Petaling",
  ST:   "Subang Taipan",
  TSG:  "Taman Sri Gombak",
  TSB:  "Tropicana Sungai Buloh",
};

const FULL_NAME_TO_CODE = Object.fromEntries(
  Object.entries(BRANCH_CODE_MAP).map(([code, name]) => [name, code])
);

function resolveFullName(raw: string): string | null {
  if (!raw) return null;
  if (BRANCH_CODE_MAP[raw]) return BRANCH_CODE_MAP[raw];
  if (FULL_NAME_TO_CODE[raw]) return raw;
  return null;
}

function hasShift(workingHours: unknown, day: string): boolean {
  if (!workingHours || typeof workingHours !== "object") return false;
  const slot = (workingHours as Record<string, unknown>)[day];
  if (!slot || typeof slot !== "object" || !("start" in (slot as object))) return false;
  // Exclude HQ shifts — they don't count as the branch operating that day
  return (slot as Record<string, unknown>).location !== "HQ";
}

export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;
  const role = (session.user as { role?: unknown })?.role;
  if (!canSeeAllBranches(session) && !isBranchManager(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const staff = await hrfsPrisma.branchStaff.findMany({
    select: { branch: true, workingHours: true },
    where: { status: { equals: "Active", mode: "insensitive" } },
  });

  // Per-branch: true if ANY active staff member has a shift that day
  const branchDays: Record<string, { wed: boolean; thu: boolean; fri: boolean; sat: boolean; sun: boolean }> = {};

  for (const s of staff) {
    const name = resolveFullName(s.branch ?? "");
    if (!name) continue;

    if (!branchDays[name]) {
      branchDays[name] = { wed: false, thu: false, fri: false, sat: false, sun: false };
    }

    const wh = s.workingHours;
    if (hasShift(wh, "Wed")) branchDays[name].wed = true;
    if (hasShift(wh, "Thu")) branchDays[name].thu = true;
    if (hasShift(wh, "Fri")) branchDays[name].fri = true;
    if (hasShift(wh, "Sat")) branchDays[name].sat = true;
    if (hasShift(wh, "Sun")) branchDays[name].sun = true;
  }

  const result = Object.entries(branchDays)
    .map(([branch, days]) => ({ branch, ...days }))
    .sort((a, b) => a.branch.localeCompare(b.branch));

  return NextResponse.json(result);
}
