import { NextResponse } from "next/server";
import { hrfsPrisma } from "@/lib/hrfs";
import { requireSession, requireRole, assertSameBranch, canSeeAllBranches } from "@/lib/auth";
import { MANAGEMENT_ROLES, hasAnyRole, isEmployee } from "@/lib/roles";

export async function GET(request: Request) {
  const { session, error } = await requireSession();
  if (error) return error;

  const BRANCH_CODE_MAP: Record<string, string> = {
    'AMP': 'Ampang',
    'BBB': 'Bandar Baru Bangi',
    'BSP': 'Bandar Seri Putra',
    'BTHO': 'Bandar Tun Hussein Onn',
    'CJY': 'Cyberjaya',
    'DA': 'Denai Alam',
    'DK': 'Danau Kota',
    'EGR': 'Eco Grandeur',
    'KD': 'Kota Damansara',
    'KLG': 'Klang',
    'KTG': 'Kajang TTDI Groove',
    'KW': 'Kota Warisan',
    'ONL': 'Online',
    'Online': 'Online',
    'PJY': 'Putrajaya',
    'RBY': 'Rimbayu',
    'SA': 'Setia Alam',
    'SHA': 'Shah Alam',
    'SP': 'Sri Petaling',
    'ST': 'Subang Taipan',
    'Subang Taipan': 'Subang Taipan',
    'TSG': 'Taman Sri Gombak',
    'TSB': 'Tropicana Sungai Buloh',
  };

  try {
    type StaffRow = {
      id: number;
      employeeId: string | null;
      name: string | null;
      nickname: string | null;
      branch: string | null;
      role: string | null;
      status: string | null;
      trainingStartDate: string | null;
      trainingEndDate: string | null;
      endDate: string | null;
    };
    const staff = await hrfsPrisma.branchStaff.findMany({
      select: {
        id: true,
        employeeId: true,
        name: true,
        nickname: true,
        branch: true,
        role: true,
        status: true,
        trainingStartDate: true,
        trainingEndDate: true,
        endDate: true,
      },
      where: { status: { equals: 'Active', mode: 'insensitive' } },
    }) as StaffRow[];
    // Return nickname as name (historical shape callers already depend on);
    // fullName is the canonical legal/IC name from HR Employee Management —
    // added so callers that need to display or persist the real name (not
    // just the nickname used on the Manpower Schedule grid) can do so without
    // a second lookup. Map branch code → full name; map role "BM" → branch_manager_xxx.
    const mapped = staff
      .filter(s => s.nickname)
      .map(s => {
        const fullBranch = BRANCH_CODE_MAP[s.branch ?? ''] ?? s.branch;
        return {
          id: s.id,
          employeeId: s.employeeId,
          name: s.nickname as string,
          fullName: s.name ?? (s.nickname as string),
          branch: fullBranch,
          role: s.role?.toUpperCase() === 'BM'
            ? `branch_manager_${(fullBranch ?? '').substring(0, 3).toLowerCase()}`
            : null,
          trainingStartDate: s.trainingStartDate,
          trainingEndDate: s.trainingEndDate,
          endDate: s.endDate,
        };
      });

    // Scoping rules:
    //   Admin / HOD            → all branches.
    //   Branch Manager         → own branch only (can opt into ?include=all
    //                            to fetch cross-branch replacements).
    //   Part_Time / Full_Time  → own row only, matched by email.
    //   Anyone else            → empty (fail closed).
    //
    // The DB stores branch as short codes; mapped.branch was already converted
    // to full names, so we compare against session.branchName (full name).
    const sessionUser = session.user as { role?: unknown; email?: string | null; branchName?: string };

    if (isEmployee(sessionUser?.role)) {
      if (!sessionUser.email) return NextResponse.json([]);
      const self = await hrfsPrisma.branchStaff.findFirst({
        where: { email: { equals: sessionUser.email, mode: 'insensitive' } },
        select: { id: true, nickname: true },
      });
      if (!self || !self.nickname) return NextResponse.json([]);
      // Build a single-element response in the same shape as `mapped`.
      const own = mapped.find(m => m.id === self.id);
      return NextResponse.json(own ? [own] : []);
    }

    const includeAll =
      new URL(request.url).searchParams.get('include') === 'all' &&
      hasAnyRole(sessionUser?.role, MANAGEMENT_ROLES);
    const userBranch = sessionUser.branchName;
    const scoped = canSeeAllBranches(session) || includeAll
      ? mapped
      : mapped.filter(m => m.branch === userBranch);

    return NextResponse.json(scoped);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { session, error } = await requireRole(MANAGEMENT_ROLES);
  if (error) return error;

  // Reverse map: full branch name → short code stored in BranchStaff
  const BRANCH_NAME_TO_CODE: Record<string, string> = {
    'Ampang': 'AMP',
    'Bandar Baru Bangi': 'BBB',
    'Bandar Seri Putra': 'BSP',
    'Bandar Tun Hussein Onn': 'BTHO',
    'Cyberjaya': 'CJY',
    'Denai Alam': 'DA',
    'Danau Kota': 'DK',
    'Eco Grandeur': 'EGR',
    'Kota Damansara': 'KD',
    'Klang': 'KLG',
    'Kajang TTDI Groove': 'KTG',
    'Kota Warisan': 'KW',
    'Online': 'ONL',
    'Putrajaya': 'PJY',
    'Rimbayu': 'RBY',
    'Setia Alam': 'SA',
    'Shah Alam': 'SHA',
    'Sri Petaling': 'SP',
    'Subang Taipan': 'ST',
    'Taman Sri Gombak': 'TSG',
    'Tropicana Sungai Buloh': 'TSB',
  };

  try {
    const { name, branch, position } = await request.json();
    if (!name?.trim() || !branch) {
      return NextResponse.json({ error: "Name and branch are required" }, { status: 400 });
    }

    const branchGuard = assertSameBranch(session, branch);
    if (branchGuard) return branchGuard;

    const role = position === "Branch Manager" ? "BM" : position?.trim() || null;
    // Store branch as short code if a mapping exists, otherwise store as-is
    const branchCode = BRANCH_NAME_TO_CODE[branch] ?? branch;
    const employee = await hrfsPrisma.branchStaff.create({
      data: { nickname: name.trim(), branch: branchCode, role },
    });
    return NextResponse.json({ success: true, employee });
  } catch (err: any) {
    console.error('POST /api/branch-staff error:', err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? "Failed to create employee" }, { status: 500 });
  }
}
