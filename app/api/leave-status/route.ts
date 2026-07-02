import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { prisma } from '@/lib/prisma';
import { hrfsPrisma } from '@/lib/hrfs';
import { requireSession, canSeeAllBranches } from '@/lib/auth';
import { isEmployee } from '@/lib/roles';

// GET /api/leave-status
//   ?date=2026-05-29            → leave active on a single day
//   ?month=5&year=2026          → all leave days in a month
//
// Returns { leaves: [{ empNo, date, type }] } where `empNo` is the numeric
// BranchStaff.employeeId (scanner id) — resolved from the HR payroll code via
// autocount_employee_map so it lines up with the attendance views. `date` is
// YYYY-MM-DD and `type` is the leave code (AL, MC, EL, …); SL normalises to MC.
//
// Sources: LeaveTransaction (any LeaveTypeCode) + MedicalLeave (always MC).
// Records explicitly rejected/cancelled are excluded; everything else counts.
//
// Scoping mirrors /api/attendance-logs:
//   Admin / HOD            → all staff.
//   Branch Manager         → only their branch's staff.
//   Part_Time / Full_Time  → only themselves.
//   Anyone else            → empty (fail closed).

function isRejected(status: string | null | undefined): boolean {
  if (!status) return false;
  return /reject|cancel|void|withdraw/i.test(status);
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function normaliseType(code: string | null | undefined): string {
  const c = (code ?? '').trim().toUpperCase();
  if (!c) return 'LEAVE';
  if (c === 'SL') return 'MC'; // sick leave → medical cert label
  return c;
}

// LeaveTransaction / MedicalLeave carry an HR payroll code (EBRIGHT021, INT020,
// EBPT167 …) in EmployeeCode — a completely different namespace from the numeric
// scanner id (BranchStaff.employeeId, e.g. 33080012) that the attendance views
// key on. Without a bridge the two never match, so the "On Leave" box is always
// empty and nobody is held out of "Missing". autocount_employee_map (in
// ebrightleads_db) maps the payroll code → BranchStaff, giving us the numeric
// employeeId. Same bridge the HR dashboard uses. Cached per lambda instance.
let _leadsPool: Pool | null = null;
function leadsPool(): Pool | null {
  const url = process.env.FA_DATABASE_URL || process.env.LEADS_DB_URL;
  if (!url) return null;
  if (!_leadsPool) _leadsPool = new Pool({ connectionString: url, max: 3 });
  return _leadsPool;
}
async function loadCodeToEmployeeId(): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const pool = leadsPool();
  if (!pool) return m;
  try {
    const r = await pool.query<{ code: string; emp: string }>(
      `SELECT m.autocount_code AS code, bs."employeeId" AS emp
         FROM public.autocount_employee_map m
         JOIN hrfs."BranchStaff" bs ON bs.id = m.branchstaff_id
        WHERE bs."employeeId" IS NOT NULL AND TRIM(bs."employeeId") <> ''`,
    );
    for (const row of r.rows) m.set(String(row.code).trim().toUpperCase(), row.emp);
  } catch (e) {
    console.warn('[leave-status] autocount map load failed:', (e as Error).message);
  }
  return m;
}

export async function GET(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  try {
    const { searchParams } = new URL(req.url);
    const date  = searchParams.get('date');
    const month = searchParams.get('month');
    const year  = searchParams.get('year') ?? new Date().getFullYear().toString();

    // ── Resolve the date window [start, end) ───────────────────────────────────
    let start: Date;
    let end: Date;
    if (date) {
      const [y, m, d] = date.split('-').map(Number);
      if (!y || !m || !d) {
        return NextResponse.json({ error: 'invalid date' }, { status: 400 });
      }
      start = new Date(Date.UTC(y, m - 1, d));
      end   = new Date(Date.UTC(y, m - 1, d + 1));
    } else if (month) {
      const mNum = parseInt(month, 10);
      const yNum = parseInt(year, 10);
      if (!mNum || mNum < 1 || mNum > 12 || !yNum) {
        return NextResponse.json({ error: 'invalid month/year' }, { status: 400 });
      }
      start = new Date(Date.UTC(yNum, mNum - 1, 1));
      end   = new Date(Date.UTC(yNum, mNum, 1));
    } else {
      return NextResponse.json({ error: 'date or month is required' }, { status: 400 });
    }

    // ── Resolve the allowed empNo set for non-admin callers ────────────────────
    //   null → unrestricted; [] → fail closed; [...] → restricted.
    let allowedEmpNos: string[] | null = null;
    const sessionUser = session.user as { role?: unknown; email?: string | null; branchName?: string };

    if (!canSeeAllBranches(session)) {
      if (isEmployee(sessionUser?.role)) {
        if (!sessionUser.email) return NextResponse.json({ leaves: [] });
        const self = await hrfsPrisma.branchStaff.findFirst({
          where: { email: { equals: sessionUser.email, mode: 'insensitive' } },
          select: { employeeId: true },
        });
        allowedEmpNos = self?.employeeId ? [self.employeeId] : [];
      } else if (sessionUser?.branchName) {
        const staff = await hrfsPrisma.branchStaff.findMany({
          where: { branch: sessionUser.branchName },
          select: { employeeId: true },
        });
        allowedEmpNos = staff.map(s => s.employeeId).filter((e): e is string => !!e);
      } else {
        return NextResponse.json({ leaves: [] });
      }
      if (allowedEmpNos.length === 0) return NextResponse.json({ leaves: [] });
    }

    // Fetch WITHOUT filtering by EmployeeCode: the previous `EmployeeCode in
    // allowedEmpNos` compared HR payroll codes against numeric scanner ids and
    // so matched nothing. We resolve each row to its numeric employeeId below,
    // then scope by that.
    const [transactions, medical, codeMap] = await Promise.all([
      prisma.leaveTransaction.findMany({
        where: { LeaveDate: { gte: start, lt: end } },
        select: { EmployeeCode: true, LeaveTypeCode: true, LeaveDate: true, ApplyStatus: true },
      }),
      prisma.medicalLeave.findMany({
        where: { leaveDate: { gte: start, lt: end } },
        select: { employeeCode: true, leaveDate: true, status: true },
      }),
      loadCodeToEmployeeId(),
    ]);

    // Resolve an HR payroll code → numeric scanner employeeId (what the
    // attendance views key on). Unresolved codes (not in the autocount map —
    // typically staff not yet mapped) are dropped: we can't tie them to anyone.
    const resolve = (code: string | null | undefined): string | undefined =>
      code ? codeMap.get(code.trim().toUpperCase()) : undefined;

    const allowedSet = allowedEmpNos === null ? null : new Set(allowedEmpNos);

    // Merge into one entry per (empNo, date). MedicalLeave (MC) wins over a
    // matching SL transaction so the same sick day isn't shown twice.
    const byKey = new Map<string, { empNo: string; date: string; type: string }>();

    for (const t of transactions) {
      if (!t.EmployeeCode || !t.LeaveDate || isRejected(t.ApplyStatus)) continue;
      const empNo = resolve(t.EmployeeCode);
      if (!empNo || (allowedSet && !allowedSet.has(empNo))) continue;
      const dateStr = toDateStr(t.LeaveDate);
      byKey.set(`${empNo}|${dateStr}`, {
        empNo,
        date: dateStr,
        type: normaliseType(t.LeaveTypeCode),
      });
    }
    for (const m of medical) {
      if (!m.employeeCode || !m.leaveDate || isRejected(m.status)) continue;
      const empNo = resolve(m.employeeCode);
      if (!empNo || (allowedSet && !allowedSet.has(empNo))) continue;
      const dateStr = toDateStr(m.leaveDate);
      byKey.set(`${empNo}|${dateStr}`, {
        empNo,
        date: dateStr,
        type: 'MC',
      });
    }

    return NextResponse.json({ leaves: Array.from(byKey.values()) });
  } catch (err) {
    console.error('GET /api/leave-status error:', err);
    return NextResponse.json({ error: 'Failed to fetch leave status' }, { status: 500 });
  }
}
