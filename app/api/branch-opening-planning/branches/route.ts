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
  RBY:  "Rimbayu",
  SA:   "Setia Alam",
  SHA:  "Shah Alam",
  SP:   "Sri Petaling",
  ST:   "Subang Taipan",
  TSG:  "Taman Sri Gombak",
  TSB:  "Tropicana Sungai Buloh",
};

// Handles branches stored as full names in the DB (e.g. "Subang Taipan" → "ST")
const FULL_NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(BRANCH_CODE_MAP).map(([code, name]) => [name, code])
);

function resolveCode(raw: string): string | null {
  if (!raw) return null;
  if (BRANCH_CODE_MAP[raw]) return raw;                 // already a code
  if (FULL_NAME_TO_CODE[raw]) return FULL_NAME_TO_CODE[raw]; // full name
  return null;
}

const OPERATIONAL_ROLES = new Set(["pt coach", "ft coach", "bm"]);

const HEATMAP_DAYS = ["Wed", "Thu", "Fri", "Sat", "Sun"] as const;
type HDay = typeof HEATMAP_DAYS[number];

// Returns the branch code this staff member counts toward on a given day.
// HQ flag is informational only — staff always count toward their own branch.
// Returns null if they have no shift that day.
function getEffectiveBranch(workingHours: unknown, day: string, ownBranch: string): string | null {
  if (!workingHours || typeof workingHours !== "object") return null;
  const wh = workingHours as Record<string, unknown>;
  const slot = wh[day];
  if (!slot || typeof slot !== "object" || !("start" in (slot as object))) return null;
  return ownBranch;
}

export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;
  const role = (session.user as { role?: unknown })?.role;
  if (!canSeeAllBranches(session) && !isBranchManager(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const staff = await hrfsPrisma.branchStaff.findMany({
    select: { branch: true, role: true, workingHours: true },
    where: { status: { equals: "Active", mode: "insensitive" } },
  });

  const counts: Record<string, Record<HDay, number>> = {};

  // Pre-seed every known branch so they always appear even with 0 staff
  for (const code of Object.keys(BRANCH_CODE_MAP)) {
    counts[code] = { Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
  }

  for (const s of staff) {
    if (!OPERATIONAL_ROLES.has((s.role ?? "").toLowerCase())) continue;

    const code = resolveCode(s.branch ?? "");
    if (!code) continue;

    for (const day of HEATMAP_DAYS) {
      const effectiveBranch = getEffectiveBranch(s.workingHours, day, code);
      if (!effectiveBranch || !BRANCH_CODE_MAP[effectiveBranch]) continue;
      counts[effectiveBranch][day]++;
    }
  }

  const result = Object.entries(counts)
    .map(([code, c]) => ({
      code,
      name: BRANCH_CODE_MAP[code],
      wed: c.Wed,
      thu: c.Thu,
      fri: c.Fri,
      sat: c.Sat,
      sun: c.Sun,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json(result);
}
