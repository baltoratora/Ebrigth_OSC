import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const dataFilePath = path.join(process.cwd(), 'data', 'employees.json');

// Helper to read employees from file
function readEmployees(): Record<string, unknown>[] {
  try {
    const data = fs.readFileSync(dataFilePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// Helper to write employees to file
function writeEmployees(employees: Record<string, unknown>[]) {
  fs.writeFileSync(dataFilePath, JSON.stringify(employees, null, 2));
}

// Helper to generate employee ID based on branch
function generateEmployeeId(employees: any[], branch: string): string {
  const branchPrefix = branch === "HQ" ? "HQ" : branch.substring(0, 2).toUpperCase();
  const branchEmployees = employees.filter((e) => e.employeeId.startsWith(branchPrefix));
  const nextNumber = branchEmployees.length + 1;
  return `${branchPrefix}-${String(nextNumber).padStart(3, "0")}`;
}

// Helper to generate unique ID
function generateId(employees: any[]): string {
  return (employees.length + 1).toString();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.toLowerCase() || "";
  const branch = searchParams.get("branch") || "";
  const role = searchParams.get("role") || "";
  const accessStatus = searchParams.get("accessStatus") || "";

  let employees = readEmployees() as Record<string, string>[];

  if (search) {
    employees = employees.filter((e) => {
      const fullName = (e.fullName || `${e.firstName ?? ""} ${e.lastName ?? ""}`).toLowerCase();
      return (
        fullName.includes(search) ||
        (e.email ?? "").toLowerCase().includes(search) ||
        (e.employeeId ?? "").toLowerCase().includes(search)
      );
    });
  }
  if (branch) employees = employees.filter((e) => e.branch === branch);
  if (role) employees = employees.filter((e) => e.role === role);
  if (accessStatus) employees = employees.filter((e) => e.accessStatus === accessStatus);

  return NextResponse.json(employees);
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Employee ID is required" },
        { status: 400 }
      );
    }

    let employees = readEmployees();
    const employeeIndex = employees.findIndex((e: Record<string, unknown>) => e.id === id);

    if (employeeIndex === -1) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    // Remove employee from the array
    const deletedEmployee = employees.splice(employeeIndex, 1)[0];
    
    // Save to file
    writeEmployees(employees);

    return NextResponse.json({
      message: "Employee deleted successfully",
      data: deletedEmployee,
    });
  } catch (error) {
    console.error("Error deleting employee:", error);
    return NextResponse.json(
      { error: "Failed to delete employee" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Employee ID is required" },
        { status: 400 }
      );
    }

    let employees = readEmployees();
    const employeeIndex = employees.findIndex((e: Record<string, unknown>) => e.id === id);

    if (employeeIndex === -1) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    // Update employee
    employees[employeeIndex] = {
      ...employees[employeeIndex],
      ...updateData,
      updatedAt: new Date().toISOString(),
    };

    // Save to file
    writeEmployees(employees);

    return NextResponse.json({
      message: "Employee updated successfully",
      data: employees[employeeIndex],
    });
  } catch (error) {
    console.error("Error updating employee:", error);
    return NextResponse.json(
      { error: "Failed to update employee" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate required fields
    const { fullName, email, phone, branch, role, gender, nickName, nric, dob, homeAddress, contract, startDate, probation, rate } = body;

    if (!fullName || !email || !phone || !branch || !role) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    let employees = readEmployees();

    // Check if email already exists
    if (employees.some((e: Record<string, unknown>) => e.email === email)) {
      return NextResponse.json(
        { error: "Email already exists" },
        { status: 409 }
      );
    }

    // Create new employee object
    const newEmployee = {
      id: generateId(employees),
      employeeId: generateEmployeeId(employees, branch),
      fullName,
      gender: gender || "MALE",
      nickName: nickName || "",
      phone,
      nric: nric || "",
      dob: dob || "",
      homeAddress: homeAddress || "",
      branch,
      role,
      contract: contract || "12 MONTH",
      startDate: startDate || "",
      probation: probation || "",
      rate: rate || "",
      biometricTemplate: null,
      accessStatus: "AUTHORIZED",
      email,
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Add to employees array
    employees.push(newEmployee);

    // Save to file
    writeEmployees(employees);

    return NextResponse.json(
      {
        message: "Employee registered successfully",
        data: newEmployee,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error registering employee:", error);
    return NextResponse.json(
      { error: "Failed to register employee" },
      { status: 500 }
    );
  }
}
