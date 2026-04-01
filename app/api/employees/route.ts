import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

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
    biometricTemplate: (s.biometricTemplate as string) || null,
    registeredAt: s.createdAt ? new Date(s.createdAt as string).toISOString() : '',
    updatedAt: s.updatedAt ? new Date(s.updatedAt as string).toISOString() : '',
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search')?.toLowerCase() || '';
  const branch = searchParams.get('branch') || '';
  const role = searchParams.get('role') || '';
  const accessStatus = searchParams.get('accessStatus') || '';

  const where: Record<string, unknown> = {};
  if (branch) where.branch = branch;
  if (role) where.role = role;
  if (accessStatus) where.accessStatus = accessStatus;

  const staff = await prisma.branchStaff.findMany({ where, orderBy: { id: 'asc' } });

  let results = staff.map(toEmployee);

  if (search) {
    results = results.filter(
      (e) =>
        e.fullName.toLowerCase().includes(search) ||
        e.email.toLowerCase().includes(search) ||
        e.employeeId.toLowerCase().includes(search)
    );
  }

  return NextResponse.json(results);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fullName, email, phone, branch, role, gender, nickName, nric, dob,
            homeAddress, contract, startDate, endDate, probation, rate,
            Emc_Number, Emc_Email, Emc_Relationship, Signed_Date, Emp_Hire_Date,
            Emp_Type, Emp_Status, Bank, Bank_Name, Bank_Account, University } = body;

    if (!fullName || !email || !phone || !branch || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const existing = await prisma.branchStaff.findFirst({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
    }

    const count = await prisma.branchStaff.count();
    const branchPrefix = branch === 'HQ' ? 'HQ' : branch.substring(0, 2).toUpperCase();
    const branchCount = await prisma.branchStaff.count({ where: { branch } });
    const employeeId = `${branchPrefix}-${String(branchCount + 1).padStart(3, '0')}`;

    const newStaff = await prisma.branchStaff.create({
      data: {
        name: fullName,
        gender: gender || 'MALE',
        nickname: nickName || null,
        email,
        phone,
        nric: nric || null,
        dob: dob || null,
        home_address: homeAddress || null,
        branch,
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

    return NextResponse.json(
      { message: 'Employee registered successfully', data: toEmployee(newStaff as unknown as Record<string, unknown>) },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error registering employee:', error);
    return NextResponse.json({ error: 'Failed to register employee' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, fullName, email, phone, branch, role, gender, nickName, nric, dob,
            homeAddress, contract, startDate, endDate, probation, rate, accessStatus,
            Emc_Number, Emc_Email, Emc_Relationship, Signed_Date, Emp_Hire_Date,
            Emp_Type, Emp_Status, Bank, Bank_Name, Bank_Account, University,
            employeeId, biometricTemplate } = body;

    if (!id) {
      return NextResponse.json({ error: 'Employee ID is required' }, { status: 400 });
    }

    const updated = await prisma.branchStaff.update({
      where: { id: parseInt(id) },
      data: {
        ...(fullName !== undefined && { name: fullName }),
        ...(gender !== undefined && { gender }),
        ...(nickName !== undefined && { nickname: nickName }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
        ...(nric !== undefined && { nric }),
        ...(dob !== undefined && { dob }),
        ...(homeAddress !== undefined && { home_address: homeAddress }),
        ...(branch !== undefined && { branch }),
        ...(role !== undefined && { role }),
        ...(contract !== undefined && { contract }),
        ...(startDate !== undefined && { start_date: startDate }),
        ...(endDate !== undefined && { endDate }),
        ...(probation !== undefined && { probation }),
        ...(rate !== undefined && { rate }),
        ...(accessStatus !== undefined && { accessStatus }),
        ...(biometricTemplate !== undefined && { biometricTemplate }),
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
      },
    });

    return NextResponse.json({
      message: 'Employee updated successfully',
      data: toEmployee(updated as unknown as Record<string, unknown>),
    });
  } catch (error) {
    console.error('Error updating employee:', error);
    return NextResponse.json({ error: 'Failed to update employee' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Employee ID is required' }, { status: 400 });
    }

    const deleted = await prisma.branchStaff.delete({ where: { id: parseInt(id) } });

    return NextResponse.json({
      message: 'Employee deleted successfully',
      data: toEmployee(deleted as unknown as Record<string, unknown>),
    });
  } catch (error) {
    console.error('Error deleting employee:', error);
    return NextResponse.json({ error: 'Failed to delete employee' }, { status: 500 });
  }
}
