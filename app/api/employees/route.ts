import { NextResponse } from 'next/server';
import { hrfsPrisma } from '@/lib/hrfs';
import { requireSession, requireRole, assertSameBranch, canSeeAllBranches } from '@/lib/auth';
import {
  ADMIN_ROLES,
  isAcademy, isAdmin, isHR,
  isEmployee, isExecutive, isIntern,
} from '@/lib/roles';
import { isValidEmployeeId } from '@/lib/employeeId';
import { COACH_ROLES_WITH_LEGACY } from '@/lib/constants';
import { syncEmployeeToDataSet } from '@/lib/hrms/employee-dataset-sync';

// Fire-and-forget push of one employee to the Process Street data set. Never
// blocks or fails the employee request (best-effort; no-ops if PS unconfigured).
function pushToProcessStreet(branchStaffId: number): void {
  void syncEmployeeToDataSet(branchStaffId).catch(() => {});
}

// Map BranchStaff DB row → Employee shape expected by the frontend
function toEmployee(s: Record<string, unknown>) {
  return {
    id: String(s.id),
    employeeId: (s.employeeId as string) || `BS-${String(s.id).padStart(3, '0')}`,
    fullName: (s.name as string) || '',
    gender: (s.gender as string) || '',
    nickName: (s.nickname as string) || '',
    email: (s.email as string) || '',
    phone: (s.phone as string) || '',
    nric: (s.nric as string) || '',
    dob: (s.dob as string) || '',
    homeAddress: (s.home_address as string) || '',
    branch: (s.branch as string) || '',
    department: (s.department as string) || '',
    role: (s.role as string) || '',
    contract: (s.contract as string) || '',
    startDate: (s.start_date as string) || '',
    endDate: (s.endDate as string) || '',
    probation: (s.probation as string) || '',
    rate: (s.rate as string) || '',
    Emc_Number: (s.emergency_phone as string) || '',
    Emc_Email: (s.emergency_name as string) || '',
    Emc_Relationship: (s.emergency_relation as string) || '',
    Signed_Date: (s.signed_date as string) || '',
    Emp_Hire_Date: (s.start_date as string) || '',
    Emp_Type: (s.employment_type as string) || '',
    Emp_Status: (s.status as string) || '',
    Bank: (s.bank as string) || '',
    Bank_Name: (s.bank_name as string) || '',
    Bank_Account: (s.bank_account as string) || '',
    University: (s.university as string) || '',
    accessStatus: (s.accessStatus as string) || 'AUTHORIZED',
    registeredAt: s.createdAt ? new Date(s.createdAt as string).toISOString() : '',
    updatedAt: s.updatedAt ? new Date(s.updatedAt as string).toISOString() : '',
    trainingStartDate: (s.trainingStartDate as string) || '',
    trainingEndDate: (s.trainingEndDate as string) || '',
  };
}

// Strict allowlist mapper for ACADEMY callers. Returns ONLY the 10 keys the
// Academy role is permitted to see. Sensitive fields (NRIC, DOB, home_address,
// bank, emergency contact, university, gender, nickname, employeeId,
// accessStatus, probation, endDate, rate, hire_date,
// signed_date, employment_type, email) MUST NOT leak over the wire.
function toEmployeeForAcademy(s: Record<string, unknown>) {
  return {
    id: String(s.id),
    fullName: (s.name as string) || '',
    phone: (s.phone as string) || '',
    branch: (s.branch as string) || '',
    role: (s.role as string) || '',
    contract: (s.contract as string) || '',
    startDate: (s.start_date as string) || '',
    Emp_Status: (s.status as string) || '',
    trainingStartDate: (s.trainingStartDate as string) || '',
    trainingEndDate: (s.trainingEndDate as string) || '',
  };
}

export async function GET(request: Request) {
  const { session, error } = await requireSession();
  if (error) return error;
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search')?.toLowerCase() || '';
  const branch = searchParams.get('branch') || '';
  const role = searchParams.get('role') || '';
  const accessStatus = searchParams.get('accessStatus') || '';

  const sessionUser = session.user as { role?: unknown; email?: string | null; branchName?: string };
  const callerRole = sessionUser?.role;

  // FT/PT/Executive/Intern: own row only. The full toEmployee payload includes
  // salary rate, bank account, NRIC and emergency contact — leaking a
  // branch-wide list lets a part-time coach read every coworker's pay and
  // bank details, which is what /profile (UserProfile.tsx) was inadvertently
  // displaying via employees[0]. Fail closed: if we can't tie the session to
  // a BranchStaff row by email, return an empty list rather than falling back
  // to the branch.
  //
  // Academy callers fall THROUGH this check intentionally — they need a
  // filtered list of coaches and get the toEmployeeForAcademy mapper below.
  if (isEmployee(callerRole) || isExecutive(callerRole) || isIntern(callerRole)) {
    const email = sessionUser?.email;
    if (!email) return NextResponse.json([]);
    const self = await hrfsPrisma.branchStaff.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      orderBy: { id: 'asc' },
    });
    return NextResponse.json(self ? [toEmployee(self as Record<string, unknown>)] : []);
  }

  const where: Record<string, unknown> = {};
  if (branch) where.branch = branch;
  if (role) where.role = role;
  if (accessStatus) where.accessStatus = accessStatus;

  // Interim branch scoping: non-admin/HOD users are restricted to their own
  // branch. This filters at the DB layer so unauthorized rows never load.
  // Step 3 replaces this with scopedDb(session) once the schema gets a
  // proper tenantId/branchId foreign key.
  if (!canSeeAllBranches(session)) {
    const userBranch = sessionUser.branchName;
    where.branch = userBranch ?? '__none__';
  }

  // Academy callers are restricted to FT/PT coaches. This intersects with any
  // client-supplied role filter, so passing role=BM yields an empty result.
  if (isAcademy(callerRole)) {
    where.role = { in: [...COACH_ROLES_WITH_LEGACY] };
  }

  const staff = await hrfsPrisma.branchStaff.findMany({ where, orderBy: { id: 'asc' } });

  const mapper = isAcademy(callerRole) ? toEmployeeForAcademy : toEmployee;
  let results = staff.map(mapper);

  if (search) {
    results = results.filter((e: Record<string, unknown>) =>
      isAcademy(callerRole)
        ? (e.fullName as string).toLowerCase().includes(search)
        : (e.fullName as string).toLowerCase().includes(search) ||
          ((e.email as string) || '').toLowerCase().includes(search) ||
          ((e.employeeId as string) || '').toLowerCase().includes(search)
    );
  }

  return NextResponse.json(results);
}

export async function POST(request: Request) {
  const { session, error } = await requireRole(ADMIN_ROLES);
  if (error) return error;

  try {
    const body = await request.json();
    const { employeeId, fullName, email, phone, branch, department, role, gender, nickName, nric, dob,
            homeAddress, contract, startDate, endDate, probation, rate,
            Emc_Number, Emc_Email, Emc_Relationship, Signed_Date,
            Emp_Type, Emp_Status, Bank, Bank_Name, Bank_Account, University } = body;

    if (!fullName || !email || !phone || !branch || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    // Employee ID is optional. If provided, validate format and uniqueness.
    if (employeeId !== undefined && employeeId !== null && employeeId !== '') {
      if (!isValidEmployeeId(employeeId)) {
        return NextResponse.json({ error: 'Employee ID must be exactly 8 digits' }, { status: 400 });
      }
      const existingByEmployeeId = await hrfsPrisma.branchStaff.findFirst({ where: { employeeId } });
      if (existingByEmployeeId) {
        return NextResponse.json({ error: 'Employee ID already exists' }, { status: 409 });
      }
    }

    const branchGuard = assertSameBranch(session, branch);
    if (branchGuard) return branchGuard;

    const normalizedFullName = fullName.toUpperCase();
    const normalizedNickName = nickName ? nickName.toUpperCase() : null;
    const normalizedHomeAddress = homeAddress ? homeAddress.toUpperCase() : null;

    const existingByEmail = await hrfsPrisma.branchStaff.findFirst({ where: { email } });
    if (existingByEmail) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
    }

    const newStaff = await hrfsPrisma.branchStaff.create({
      data: {
        name: normalizedFullName,
        gender: gender || 'MALE',
        nickname: normalizedNickName,
        email,
        phone,
        nric: nric || null,
        dob: dob || null,
        home_address: normalizedHomeAddress,
        branch,
        department: department || null,
        role,
        contract: contract || '12 MONTH',
        start_date: startDate || null,
        endDate: endDate || null,
        probation: probation || null,
        rate: rate || null,
        emergency_phone: Emc_Number || null,
        emergency_name: Emc_Email || null,
        emergency_relation: Emc_Relationship || null,
        signed_date: Signed_Date || null,
        employment_type: Emp_Type || null,
        status: Emp_Status || null,
        bank: Bank || null,
        bank_name: Bank_Name || null,
        bank_account: Bank_Account || null,
        university: University || null,
        employeeId,
        accessStatus: 'AUTHORIZED',
      },
    });

    pushToProcessStreet(newStaff.id);
    return NextResponse.json(
      { message: 'Employee registered successfully', data: toEmployee(newStaff as Record<string, unknown>) },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error registering employee:', error);
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as { code?: string })?.code;
    return NextResponse.json(
      { error: `Failed to register employee: ${code ? `[${code}] ` : ''}${message}` },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const { session, error } = await requireSession();
  if (error) return error;

  const callerRole = (session.user as { role?: unknown } | undefined)?.role;
  const isAdminEdit = isAdmin(callerRole);
  const isAcademyEdit = isAcademy(callerRole);
  if (!isAdminEdit && !isAcademyEdit) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { id, fullName, email, phone, branch, department, role, gender, nickName, nric, dob,
            homeAddress, contract, startDate, endDate, probation, rate, accessStatus,
            Emc_Number, Emc_Email, Emc_Relationship, Signed_Date,
            Emp_Type, Emp_Status, Bank, Bank_Name, Bank_Account, University,
            employeeId,
            trainingStartDate, trainingEndDate } = body;

    if (!id) {
      return NextResponse.json({ error: 'Employee ID is required' }, { status: 400 });
    }

    if (isAcademyEdit) {
      const allowedKeys = new Set(['id', 'trainingStartDate', 'trainingEndDate']);
      const extraKeys = Object.keys(body).filter((k) => !allowedKeys.has(k));
      if (extraKeys.length > 0) {
        return NextResponse.json(
          { error: `Academy cannot edit: ${extraKeys.join(', ')}` },
          { status: 403 },
        );
      }
      const target = await hrfsPrisma.branchStaff.findUnique({
        where: { id: parseInt(id) },
        select: { role: true },
      });
      if (!target || !(COACH_ROLES_WITH_LEGACY as readonly string[]).includes(target.role || '')) {
        return NextResponse.json(
          { error: 'Academy can only edit FT Coach or PT Coach' },
          { status: 403 },
        );
      }
    }

    if (isHR(callerRole) && (
      body.trainingStartDate !== undefined ||
      body.trainingEndDate !== undefined
    )) {
      return NextResponse.json(
        { error: 'HR cannot edit training fields in v1' },
        { status: 403 },
      );
    }

    // End date must be on or after start date (when both are supplied).
    if (trainingStartDate && trainingEndDate && trainingStartDate > trainingEndDate) {
      return NextResponse.json(
        { error: 'Training end date must be on or after start date' },
        { status: 400 },
      );
    }

    if (!isAcademyEdit) {
      if (branch !== undefined) {
        const branchGuard = assertSameBranch(session, branch);
        if (branchGuard) return branchGuard;
      }
      const existing = await hrfsPrisma.branchStaff.findUnique({
        where: { id: parseInt(id) },
        select: { branch: true },
      });
      if (!existing) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      const idGuard = assertSameBranch(session, existing.branch);
      if (idGuard) return idGuard;
    }

    if (employeeId !== undefined) {
      if (!isValidEmployeeId(employeeId)) {
        return NextResponse.json({ error: 'Employee ID must be exactly 8 digits' }, { status: 400 });
      }
      const existingByEmployeeId = await hrfsPrisma.branchStaff.findFirst({
        where: { employeeId, NOT: { id: parseInt(id) } },
      });
      if (existingByEmployeeId) {
        return NextResponse.json({ error: 'Employee ID already exists' }, { status: 409 });
      }
    }

    const updated = await hrfsPrisma.branchStaff.update({
      where: { id: parseInt(id) },
      data: {
        ...(fullName !== undefined && { name: fullName.toUpperCase() }),
        ...(gender !== undefined && { gender }),
        ...(nickName !== undefined && { nickname: nickName.toUpperCase() }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
        ...(nric !== undefined && { nric }),
        ...(dob !== undefined && { dob }),
        ...(homeAddress !== undefined && { home_address: homeAddress.toUpperCase() }),
        ...(branch !== undefined && { branch }),
        ...(department !== undefined && { department: department || null }),
        ...(role !== undefined && { role }),
        ...(contract !== undefined && { contract }),
        ...(startDate !== undefined && { start_date: startDate }),
        ...(endDate !== undefined && { endDate }),
        ...(probation !== undefined && { probation }),
        ...(rate !== undefined && { rate }),
        ...(accessStatus !== undefined && { accessStatus }),
        ...(Emc_Number !== undefined && { emergency_phone: Emc_Number }),
        ...(Emc_Email !== undefined && { emergency_name: Emc_Email }),
        ...(Emc_Relationship !== undefined && { emergency_relation: Emc_Relationship }),
        ...(Signed_Date !== undefined && { signed_date: Signed_Date }),
        ...(Emp_Type !== undefined && { employment_type: Emp_Type }),
        ...(Emp_Status !== undefined && { status: Emp_Status }),
        ...(Bank !== undefined && { bank: Bank }),
        ...(Bank_Name !== undefined && { bank_name: Bank_Name }),
        ...(Bank_Account !== undefined && { bank_account: Bank_Account }),
        ...(University !== undefined && { university: University }),
        ...(employeeId !== undefined && { employeeId }),
        ...(trainingStartDate !== undefined && { trainingStartDate: trainingStartDate || null }),
        ...(trainingEndDate !== undefined && { trainingEndDate: trainingEndDate || null }),
      },
    });

    pushToProcessStreet(updated.id);
    return NextResponse.json({
      message: 'Employee updated successfully',
      data: toEmployee(updated as Record<string, unknown>),
    });
  } catch (error) {
    console.error('Error updating employee:', error);
    return NextResponse.json({ error: 'Failed to update employee' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { session, error } = await requireRole(ADMIN_ROLES);
  if (error) return error;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Employee ID is required' }, { status: 400 });
    }

    const existing = await hrfsPrisma.branchStaff.findUnique({
      where: { id: parseInt(id) },
      select: { branch: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const idGuard = assertSameBranch(session, existing.branch);
    if (idGuard) return idGuard;

    const deleted = await hrfsPrisma.branchStaff.delete({ where: { id: parseInt(id) } });

    // Employee is gone from the DB → this removes their Process Street row.
    pushToProcessStreet(parseInt(id));
    return NextResponse.json({
      message: 'Employee deleted successfully',
      data: toEmployee(deleted as Record<string, unknown>),
    });
  } catch (error) {
    console.error('Error deleting employee:', error);
    return NextResponse.json({ error: 'Failed to delete employee' }, { status: 500 });
  }
}