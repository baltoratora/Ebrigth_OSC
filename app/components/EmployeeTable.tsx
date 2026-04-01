"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getRoleLabel, getBranchLabel, BRANCH_OPTIONS, ROLE_OPTIONS } from "@/lib/constants";

interface Employee {
  id: string;
  employeeId: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  gender: string;
  nickName: string;
  email: string;
  phone: string;
  nric: string;
  dob: string;
  homeAddress: string;
  branch: string;
  role: string;
  contract: string;
  startDate: string;
  probation: string;
  accessStatus: string;
  biometricTemplate: string | null;
  registeredAt: string;
}

interface EmployeeTableProps {
  refreshTrigger?: number;
}

export default function EmployeeTable({
  refreshTrigger,
}: EmployeeTableProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [accessFilter, setAccessFilter] = useState("all");
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchEmployees = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();

      if (searchTerm) params.append("search", searchTerm);
      if (branchFilter !== "all") params.append("branch", branchFilter);
      if (roleFilter !== "all") params.append("role", roleFilter);
      if (accessFilter !== "all") params.append("accessStatus", accessFilter);

      const response = await fetch(`/api/employees?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch employees");

      const data = await response.json();
      setEmployees(data);
    } catch (error) {
      console.error("Error fetching employees:", error);
      alert("Failed to load employees");
    } finally {
      setLoading(false);
    }
  }, [searchTerm, branchFilter, roleFilter, accessFilter]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees, refreshTrigger]);

  const ACCESS_OPTIONS = [
    { value: "FULL_TIME", label: "Full Time" },
    { value: "PART_TIME", label: "Part Time" },
    { value: "INTERN", label: "Intern" },
    { value: "HR", label: "HR" },
    { value: "HQ", label: "HQ" },
    { value: "OD", label: "OD" },
    { value: "ACD", label: "ACD" },
    { value: "MKT", label: "MKT" },
    { value: "RM", label: "RM" },
    { value: "FINANCE", label: "Finance" },
    { value: "CEO", label: "CEO" },
    { value: "IOP", label: "IOP" },
  ];

  const handleAccessChange = async (employeeId: string, selected: string[]) => {
    const newStatus = selected.join(",");
    try {
      const response = await fetch("/api/employees", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: employeeId, accessStatus: newStatus }),
      });
      if (!response.ok) throw new Error("Failed to update access");
      setEmployees((prev) =>
        prev.map((emp) => emp.id === employeeId ? { ...emp, accessStatus: newStatus } : emp)
      );
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };


  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Employee Management</h2>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <input
          type="text"
          placeholder="Search by name, email, or ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        />

        <select
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Branches</option>
          {BRANCH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Roles</option>
          {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <select
          value={accessFilter}
          onChange={(e) => setAccessFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Access Status</option>
          <option value="AUTHORIZED">Authorized</option>
          <option value="UNAUTHORIZED">Unauthorized</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading employees...</div>
      ) : employees.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No employees found</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 border-b">
              <tr>
                <th className="px-2 py-3 text-left font-semibold text-gray-700 text-xs">Employee ID</th>
                <th className="px-2 py-3 text-left font-semibold text-gray-700 text-xs">Full Name</th>
                <th className="px-2 py-3 text-left font-semibold text-gray-700 text-xs">Gender</th>
                <th className="px-2 py-3 text-left font-semibold text-gray-700 text-xs">Nick Name</th>
                <th className="px-2 py-3 text-left font-semibold text-gray-700 text-xs">Phone</th>
                <th className="px-2 py-3 text-left font-semibold text-gray-700 text-xs">NRIC</th>
                <th className="px-2 py-3 text-left font-semibold text-gray-700 text-xs">DOB</th>
                <th className="px-2 py-3 text-left font-semibold text-gray-700 text-xs">Home Address</th>
                <th className="px-2 py-3 text-left font-semibold text-gray-700 text-xs">Role</th>
                <th className="px-2 py-3 text-left font-semibold text-gray-700 text-xs">Contract</th>
                <th className="px-2 py-3 text-left font-semibold text-gray-700 text-xs">Branch/Dept</th>
                <th className="px-2 py-3 text-left font-semibold text-gray-700 text-xs">Start Date</th>
                <th className="px-2 py-3 text-left font-semibold text-gray-700 text-xs">Probation</th>
                <th className="px-2 py-3 text-center font-semibold text-gray-700 text-xs">Biometrics</th>
                <th className="px-2 py-3 text-center font-semibold text-gray-700 text-xs">Access</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id} className="border-b hover:bg-gray-50">
                  <td className="px-2 py-3 font-medium text-gray-900 text-xs">
                    {employee.employeeId}
                  </td>
                  <td className="px-2 py-3 text-gray-900 text-xs">
                    {employee.fullName || `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() || "-"}
                  </td>
                  <td className="px-2 py-3 text-gray-600 text-xs">
                    {employee.gender === "MALE" ? "Male" : employee.gender === "FEMALE" ? "Female" : "-"}
                  </td>
                  <td className="px-2 py-3 text-gray-600 text-xs">{employee.nickName || "-"}</td>
                  <td className="px-2 py-3 text-gray-600 text-xs">{employee.phone}</td>
                  <td className="px-2 py-3 text-gray-600 text-xs">{employee.nric || "-"}</td>
                  <td className="px-2 py-3 text-gray-600 text-xs">{employee.dob || "-"}</td>
                  <td className="px-2 py-3 text-gray-600 text-xs max-w-[150px] truncate" title={employee.homeAddress}>
                    {employee.homeAddress || "-"}
                  </td>
                  <td className="px-2 py-3 text-gray-600 text-xs">{getRoleLabel(employee.role)}</td>
                  <td className="px-2 py-3 text-gray-600 text-xs">
                    {employee.contract || "-"}
                  </td>
                  <td className="px-2 py-3 text-gray-600 text-xs">{getBranchLabel(employee.branch)}</td>
                  <td className="px-2 py-3 text-gray-600 text-xs">{employee.startDate || "-"}</td>
                  <td className="px-2 py-3 text-gray-600 text-xs">{employee.probation || "-"}</td>
                  <td className="px-2 py-3 text-center">
                    {employee.biometricTemplate ? (
                      <span className="text-green-600 font-semibold text-xs">✓</span>
                    ) : (
                      <span className="text-red-600 font-semibold text-xs">✗</span>
                    )}
                  </td>
                  <td className="px-2 py-3 text-center relative">
                    <div ref={openDropdown === employee.id ? dropdownRef : null}>
                      <button
                        onClick={() => setOpenDropdown(openDropdown === employee.id ? null : employee.id)}
                        className="px-2 py-1 border border-gray-300 rounded text-xs bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full text-left"
                      >
                        {employee.accessStatus
                          ? employee.accessStatus.split(",").join(", ")
                          : "— None —"}
                        <span className="float-right">▾</span>
                      </button>
                      {openDropdown === employee.id && (
                        <div className="absolute z-50 left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2 min-w-[140px] text-left">
                          {ACCESS_OPTIONS.map((o) => {
                            const current = employee.accessStatus ? employee.accessStatus.split(",") : [];
                            const checked = current.includes(o.value);
                            return (
                              <label key={o.value} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 rounded cursor-pointer text-xs">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    const next = checked
                                      ? current.filter((v) => v !== o.value)
                                      : [...current, o.value];
                                    handleAccessChange(employee.id, next);
                                  }}
                                />
                                {o.label}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <p className="text-sm text-gray-600">
          Total Employees: <span className="font-bold text-gray-900">{employees.length}</span>
        </p>
        <p className="text-sm text-gray-600 mt-2">
          Authorized:{" "}
          <span className="font-bold text-green-600">
            {employees.filter((e) => e.accessStatus === "AUTHORIZED").length}
          </span>{" "}
          | Unauthorized:{" "}
          <span className="font-bold text-red-600">
            {employees.filter((e) => e.accessStatus === "UNAUTHORIZED").length}
          </span>
        </p>
      </div>
    </div>
  );
}
