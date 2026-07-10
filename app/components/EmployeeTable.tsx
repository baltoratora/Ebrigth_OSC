"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown, SlidersHorizontal } from "lucide-react";
import { getRoleLabel, getBranchLabel, BRANCH_OPTIONS, ROLE_OPTIONS, COACH_ROLES_WITH_LEGACY } from "@/lib/constants";
import { isAcademy } from "@/lib/roles";
import { isInTraining } from "@/lib/training";
import EmployeeAdvancedFilterModal, {
  AdvancedFilters,
  EMPTY_ADVANCED_FILTERS,
  countActiveAdvancedFilters,
} from "@/app/components/EmployeeAdvancedFilterModal";

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
  endDate?: string;
  probation: string;
  rate?: string;
  Emp_Status?: string;
  accessStatus: string;
  registeredAt: string;
  trainingStartDate?: string;
  trainingEndDate?: string;
}

interface EmployeeTableProps {
  refreshTrigger?: number;
  userRole?: string;
}

function TrainingCell({ start, end }: { start?: string; end?: string }) {
  if (!start && !end) return <span className="text-gray-400 text-xs">—</span>;
  const inWindow = isInTraining(start, end);
  const today = new Date().toISOString().slice(0, 10);
  const future = !!start && start > today;
  const cls = inWindow
    ? "bg-green-100 text-green-800"
    : future
    ? "bg-blue-100 text-blue-800"
    : "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold ${cls}`}>
      🎓 {start || "—"} → {end || "—"}
    </span>
  );
}

export default function EmployeeTable({
  refreshTrigger,
  userRole = "",
}: EmployeeTableProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  // Sort by Start Date / End Date. null = original (registration) order.
  const [sortKey, setSortKey] = useState<"startDate" | "endDate" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  // Advanced filters (date ranges, rate, missing-info) — applied client-side.
  const [advOpen, setAdvOpen] = useState(false);
  const [advFilters, setAdvFilters] = useState<AdvancedFilters>(EMPTY_ADVANCED_FILTERS);
  const activeAdvCount = countActiveAdvancedFilters(advFilters);

  const toggleSort = (key: "startDate" | "endDate") => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortIcon = (key: "startDate" | "endDate") => {
    if (sortKey !== key) return <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-60" />;
    return sortDir === "asc"
      ? <ArrowUp className="w-3 h-3 text-blue-600" />
      : <ArrowDown className="w-3 h-3 text-blue-600" />;
  };

  const academyView = isAcademy(userRole);

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
  }, [searchTerm, branchFilter, roleFilter]);

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

  const handleStatusToggle = async (employeeId: string, current: string | undefined) => {
    const next = current === "Active" ? "Inactive" : "Active";
    const nextAccess = next === "Active" ? "AUTHORIZED" : "UNAUTHORIZED";
    try {
      const response = await fetch("/api/employees", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: employeeId, Emp_Status: next, accessStatus: nextAccess }),
      });
      if (!response.ok) throw new Error("Failed to update status");
      setEmployees((prev) =>
        prev.map((emp) => emp.id === employeeId ? { ...emp, Emp_Status: next, accessStatus: nextAccess } : emp)
      );
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const matchesAdvanced = (e: Employee): boolean => {
    const f = advFilters;
    // Date ranges (ISO strings compare lexically). A row with no date in a
    // column is excluded once a bound is set for that column.
    if (f.startFrom && (!e.startDate || e.startDate < f.startFrom)) return false;
    if (f.startTo && (!e.startDate || e.startDate > f.startTo)) return false;
    if (f.endFrom && (!e.endDate || e.endDate < f.endFrom)) return false;
    if (f.endTo && (!e.endDate || e.endDate > f.endTo)) return false;

    // Rate — only PT coaches have a rate, so any rate filter implicitly
    // restricts the result to PT coaches.
    const rateFilterActive = f.rateMode !== "any" || f.rateMin !== "" || f.rateMax !== "";
    if (rateFilterActive) {
      const isPtCoach = e.role === "PT Coach" || e.role === "PT - Coach";
      if (!isPtCoach) return false;
    }
    const rateStr = (e.rate || "").trim();
    const rateNum = parseFloat(rateStr);
    const hasRate = rateStr !== "" && !Number.isNaN(rateNum) && rateNum > 0;
    if (f.rateMode === "none" && hasRate) return false;
    if (f.rateMode === "set" && !hasRate) return false;
    if (f.rateMode !== "none") {
      if (f.rateMin && (!hasRate || rateNum < parseFloat(f.rateMin))) return false;
      if (f.rateMax && (!hasRate || rateNum > parseFloat(f.rateMax))) return false;
    }

    // Missing-info checks.
    if (f.missingEmployeeId && (e.employeeId || "").trim() !== "") return false;
    if (f.missingNric && (e.nric || "").trim() !== "") return false;
    if (f.missingDob && (e.dob || "").trim() !== "") return false;
    if (f.missingEmail && (e.email || "").trim() !== "") return false;

    return true;
  };

  const filteredEmployees = employees
    .filter((e) => !academyView || (COACH_ROLES_WITH_LEGACY as readonly string[]).includes(e.role))
    .filter((e) => {
      if (statusFilter === "all") return true;
      return (e.Emp_Status || "") === statusFilter;
    })
    .filter(matchesAdvanced)
    .sort((a, b) => {
      if (!sortKey) return 0;
      const av = a[sortKey] || "";
      const bv = b[sortKey] || "";
      // Empty dates always sort to the bottom regardless of direction.
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      return (sortDir === "asc" ? 1 : -1) * av.localeCompare(bv);
    });

  const openPrintRoute = (useCurrentFilters: boolean) => {
    const qs = new URLSearchParams();
    if (useCurrentFilters) {
      if (searchTerm) qs.append("search", searchTerm);
      if (branchFilter !== "all") qs.append("branch", branchFilter);
      if (roleFilter !== "all") qs.append("role", roleFilter);
      if (statusFilter !== "all") qs.append("status", statusFilter);
    } else {
      qs.append("all", "1");
    }
    const url = `/dashboard-employee-management/print?${qs.toString()}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setPrintModalOpen(false);
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Employee</h2>
        {!academyView && (
          <button
            type="button"
            onClick={() => setPrintModalOpen(true)}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium shadow"
          >
            Print List
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <input
          type="text"
          placeholder="Search by name, email, or ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
        />

        <select
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
        >
          <option value="all">Branch/Dept</option>
          {BRANCH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
        >
          <option value="all">All Roles</option>
          {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
          >
            <option value="all">All Status</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>

          {!academyView && (
            <button
              type="button"
              onClick={() => setAdvOpen(true)}
              title="Advanced filters"
              className={`relative shrink-0 p-2.5 rounded-lg border transition-colors ${
                activeAdvCount > 0
                  ? "border-blue-600 bg-blue-50 text-blue-600"
                  : "border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              <SlidersHorizontal className="w-5 h-5" />
              {activeAdvCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-bold">
                  {activeAdvCount}
                </span>
              )}
            </button>
          )}
        </div>

      </div>

      {/* Active advanced-filter summary */}
      {activeAdvCount > 0 && (
        <div className="flex items-center gap-2 mb-4 -mt-2">
          <span className="text-xs text-gray-500">
            {activeAdvCount} advanced filter{activeAdvCount !== 1 ? "s" : ""} active
          </span>
          <button
            type="button"
            onClick={() => setAdvFilters(EMPTY_ADVANCED_FILTERS)}
            className="text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading employees...</div>
      ) : filteredEmployees.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No employees found</div>
      ) : (
        <div className="overflow-auto min-h-[320px] max-h-[70vh]">
          {academyView ? (
            <table className="w-full text-sm">
              <thead className="bg-gray-100 border-b sticky top-0 z-10">
                <tr>
                  <th className="px-2 py-3 text-left font-semibold text-gray-700 text-xs">Full Name</th>
                  <th className="px-2 py-3 text-left font-semibold text-gray-700 text-xs">Phone</th>
                  <th className="px-2 py-3 text-left font-semibold text-gray-700 text-xs">Role</th>
                  <th className="px-2 py-3 text-left font-semibold text-gray-700 text-xs">Branch/Dept</th>
                  <th className="px-2 py-3 text-left font-semibold text-gray-700 text-xs">Contract</th>
                  <th className="px-2 py-3 text-left font-semibold text-gray-700 text-xs">
                    <button onClick={() => toggleSort("startDate")} className="inline-flex items-center gap-1 group hover:text-gray-900">
                      Start Date {sortIcon("startDate")}
                    </button>
                  </th>
                  <th className="px-2 py-3 text-center font-semibold text-gray-700 text-xs">Status</th>
                  <th className="px-2 py-3 text-left font-semibold text-gray-700 text-xs">Training</th>
                  <th className="px-2 py-3 text-center font-semibold text-gray-700 text-xs">Manage</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((employee) => (
                  <tr key={employee.id} className="border-b hover:bg-gray-50">
                    <td className="px-2 py-3 text-gray-900 text-xs uppercase">
                      {employee.fullName || `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() || "-"}
                      {isInTraining(employee.trainingStartDate, employee.trainingEndDate) && (
                        <span className="ml-1" title={`In training: ${employee.trainingStartDate} → ${employee.trainingEndDate}`}>🎓</span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-gray-600 text-xs">{employee.phone}</td>
                    <td className="px-2 py-3 text-gray-600 text-xs">{getRoleLabel(employee.role)}</td>
                    <td className="px-2 py-3 text-gray-600 text-xs">{getBranchLabel(employee.branch)}</td>
                    <td className="px-2 py-3 text-gray-600 text-xs">{employee.contract || "-"}</td>
                    <td className="px-2 py-3 text-gray-600 text-xs">{employee.startDate || "-"}</td>
                    <td className="px-2 py-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        employee.Emp_Status === "Active"
                          ? "bg-green-100 text-green-800"
                          : employee.Emp_Status === "Inactive"
                          ? "bg-red-100 text-red-800"
                          : "bg-gray-100 text-gray-600"
                      }`}>
                        {employee.Emp_Status || "—"}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <TrainingCell start={employee.trainingStartDate} end={employee.trainingEndDate} />
                    </td>
                    <td className="px-2 py-3 text-center">
                      <a
                        href={`/user-management?employeeId=${employee.id}`}
                        className="px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        Edit
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-100 border-b sticky top-0 z-10">
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
                  <th className="px-2 py-3 text-left font-semibold text-gray-700 text-xs">
                    <button onClick={() => toggleSort("startDate")} className="inline-flex items-center gap-1 group hover:text-gray-900">
                      Start Date {sortIcon("startDate")}
                    </button>
                  </th>
                  <th className="px-2 py-3 text-left font-semibold text-gray-700 text-xs">
                    <button onClick={() => toggleSort("endDate")} className="inline-flex items-center gap-1 group hover:text-gray-900">
                      End Date {sortIcon("endDate")}
                    </button>
                  </th>
                  <th className="px-2 py-3 text-left font-semibold text-gray-700 text-xs">Probation</th>
                  <th className="px-2 py-3 text-left font-semibold text-gray-700 text-xs">Training</th>
                  <th className="px-2 py-3 text-center font-semibold text-gray-700 text-xs">Status</th>
                  <th className="px-2 py-3 text-center font-semibold text-gray-700 text-xs">Access</th>
                  <th className="px-2 py-3 text-center font-semibold text-gray-700 text-xs">Manage</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((employee) => (
                  <tr key={employee.id} className="border-b hover:bg-gray-50">
                    <td className="px-2 py-3 font-medium text-gray-900 text-xs">
                      {employee.employeeId}
                    </td>
                    <td className="px-2 py-3 text-gray-900 text-xs uppercase">
                      {employee.fullName || `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() || "-"}
                    </td>
                    <td className="px-2 py-3 text-gray-600 text-xs">
                      {employee.gender === "MALE" ? "Male" : employee.gender === "FEMALE" ? "Female" : "-"}
                    </td>
                    <td className="px-2 py-3 text-gray-600 text-xs uppercase">{employee.nickName || "-"}</td>
                    <td className="px-2 py-3 text-gray-600 text-xs">{employee.phone}</td>
                    <td className="px-2 py-3 text-gray-600 text-xs">{employee.nric || "-"}</td>
                    <td className="px-2 py-3 text-gray-600 text-xs">{employee.dob || "-"}</td>
                    <td className="px-2 py-3 text-gray-600 text-xs uppercase max-w-[150px] truncate" title={employee.homeAddress}>
                      {employee.homeAddress || "-"}
                    </td>
                    <td className="px-2 py-3 text-gray-600 text-xs">{getRoleLabel(employee.role)}</td>
                    <td className="px-2 py-3 text-gray-600 text-xs">
                      {employee.contract || "-"}
                    </td>
                    <td className="px-2 py-3 text-gray-600 text-xs">{getBranchLabel(employee.branch)}</td>
                    <td className="px-2 py-3 text-gray-600 text-xs">{employee.startDate || "-"}</td>
                    <td className="px-2 py-3 text-gray-600 text-xs">{employee.endDate || "-"}</td>
                    <td className="px-2 py-3 text-gray-600 text-xs">{employee.probation || "-"}</td>
                    <td className="px-2 py-3">
                      <TrainingCell start={employee.trainingStartDate} end={employee.trainingEndDate} />
                    </td>
                    <td className="px-2 py-3 text-center">
                      <button
                        onClick={() => handleStatusToggle(employee.id, employee.Emp_Status)}
                        className={`px-2 py-1 rounded-full text-xs font-semibold transition-colors ${
                          employee.Emp_Status === "Active"
                            ? "bg-green-100 text-green-800 hover:bg-green-200"
                            : employee.Emp_Status === "Inactive"
                            ? "bg-red-100 text-red-800 hover:bg-red-200"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {employee.Emp_Status || "—"}
                      </button>
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
                    <td className="px-2 py-3 text-center">
                      <a
                        href={`/user-management?employeeId=${employee.id}`}
                        className="px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        Manage
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Summary */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <div>
          <p className="text-sm text-gray-600">
            Total Employees: <span className="font-bold text-gray-900">{employees.length}</span>
            {(statusFilter !== "all" || activeAdvCount > 0) && (
              <span className="ml-2 text-gray-400">(showing {filteredEmployees.length} filtered)</span>
            )}
          </p>
          <p className="text-sm text-gray-600 mt-2">
            Active:{" "}
            <span className="font-bold text-green-600">
              {employees.filter((e) => e.Emp_Status === "Active").length}
            </span>{" "}
            | Inactive:{" "}
            <span className="font-bold text-red-600">
              {employees.filter((e) => e.Emp_Status === "Inactive").length}
            </span>
          </p>
        </div>
      </div>

      {printModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
          onClick={() => setPrintModalOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-2 text-gray-900">Print Employee List</h3>
            <p className="text-sm text-gray-600 mb-4">
              Choose which employees to include. The list opens in a new tab and the print dialog appears automatically.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => openPrintRoute(true)}
                className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm"
              >
                Print current view
              </button>
              <button
                type="button"
                onClick={() => openPrintRoute(false)}
                className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-900 text-sm"
              >
                Print all employees
              </button>
              <button
                type="button"
                onClick={() => setPrintModalOpen(false)}
                className="px-4 py-2 rounded bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <EmployeeAdvancedFilterModal
        open={advOpen}
        initial={advFilters}
        showRate={!academyView}
        onApply={(f) => { setAdvFilters(f); setAdvOpen(false); }}
        onClose={() => setAdvOpen(false)}
      />
    </div>
  );
}
