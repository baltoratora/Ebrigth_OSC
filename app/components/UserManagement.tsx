"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { BRANCH_OPTIONS, DEPARTMENT_OPTIONS, ROLE_OPTIONS, CONTRACT_OPTIONS, GENDER_OPTIONS, ROLE_CODES, COACH_ROLES_WITH_LEGACY } from "@/lib/constants";
import { isAdmin, isAcademy, isHR } from "@/lib/roles";
import { isInTraining } from "@/lib/training";
import EmployeeIdInput from "@/app/components/EmployeeIdInput";
import { splitEmployeeId, composeEmployeeId, isValidSuffix, isValidEmployeeId } from "@/lib/employeeId";

// Department applies only to HQ staff; Rate only to part-time coaches (paid
// hourly). Both fields are conditionally shown based on these checks.
const isPartTimeCoach = (role?: string | null) => {
  const r = (role ?? "").trim().toUpperCase();
  return r === "PT COACH" || r.startsWith("PT - COACH");
};

interface User {
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
  department: string;
  role: string;
  contract: string;
  startDate: string;
  endDate?: string;
  probation: string;
  rate?: string;
  Emc_Number?: string;
  Emc_Email?: string;
  Emc_Relationship?: string;
  Signed_Date?: string;
  Emp_Hire_Date?: string;
  Emp_Type?: string;
  Emp_Status?: string;
  Bank?: string;
  Bank_Name?: string;
  Bank_Account?: string;
  University?: string;
  accessStatus: string;
  registeredAt: string;
  updatedAt: string;
  trainingStartDate?: string;
  trainingEndDate?: string;
}

interface UserManagementProps {
  userRole?: string;
}

const UPPERCASE_LABELS = ["Full Name", "Nick Name", "Home Address"];

const field = (label: string, value: string | undefined | null) => (
  <div className="bg-gray-50 p-3 rounded">
    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
    <p className={`text-sm font-medium text-gray-900 ${UPPERCASE_LABELS.includes(label) ? "uppercase" : ""}`}>{value || "-"}</p>
  </div>
);

function hasUnrecognizedPrefix(employeeId: string | undefined): boolean {
  if (!employeeId || !isValidEmployeeId(employeeId)) return false;
  return !ROLE_CODES.includes(splitEmployeeId(employeeId).prefix);
}

// Defaults to "" so that a caller forgetting to pass userRole fails closed
// via `isAdmin("") === false`, rather than silently granting admin access.
export default function UserManagement({ userRole = "" }: UserManagementProps) {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<User | null>(null);
  const [empIdPrefix, setEmpIdPrefix] = useState("");
  const [empIdSuffix, setEmpIdSuffix] = useState("");
  const [empIdError, setEmpIdError] = useState("");
  const detailRef = useRef<HTMLDivElement>(null);

  const searchParams = useSearchParams();
  const targetEmployeeId = searchParams.get("employeeId");

  const academyView = isAcademy(userRole);
  const hrView = isHR(userRole);
  const isAuthorized = isAdmin(userRole) || academyView;

  useEffect(() => {
    if (!isAuthorized) { setLoading(false); return; }
    const fetchUsers = async () => {
      try {
        const response = await fetch("/api/employees");
        const employees = await response.json();
        setUsers(Array.isArray(employees) ? employees : []);
      } catch (err) {
        console.error("Error fetching users:", err);
        setError("Failed to load users");
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, [isAuthorized]);

  useEffect(() => {
    if (!targetEmployeeId || users.length === 0) return;
    const match = users.find((u) => u.id === targetEmployeeId);
    if (match) {
      setSelectedUser(match);
      setEditData({ ...match });
      setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    }
  }, [targetEmployeeId, users]);

  const handleArchive = async (id: string) => {
    if (!confirm("Archive this employee? They will be marked as resigned.")) return;
    try {
      const response = await fetch("/api/employees", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, accessStatus: "ARCHIVED" }),
      });
      if (response.ok) {
        const updated = users.map((u) =>
          u.id === id ? { ...u, accessStatus: "ARCHIVED" } : u
        );
        setUsers(updated);
        setSelectedUser((prev) => prev?.id === id ? { ...prev, accessStatus: "ARCHIVED" } : prev);
      } else {
        setError("Failed to archive employee");
      }
    } catch {
      setError("Failed to archive employee");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this employee? This action cannot be undone.")) return;
    try {
      const response = await fetch(`/api/employees?id=${id}`, { method: "DELETE" });
      if (response.ok) {
        setUsers(users.filter((u) => u.id !== id));
        setSelectedUser(null);
        setEditMode(false);
      } else {
        setError("Failed to delete employee");
      }
    } catch (err) {
      console.error("Error deleting user:", err);
      setError("Failed to delete employee");
    }
  };

  const handleSave = async () => {
    if (!editData) return;
    if (editData.trainingStartDate && editData.trainingEndDate &&
        editData.trainingStartDate > editData.trainingEndDate) {
      setError("Training end date must be on or after start date.");
      return;
    }
    // Only send employeeId if BOTH parts are filled and valid; otherwise skip
    // it from the payload so other field edits can still save.
    const original = splitEmployeeId(selectedUser?.employeeId || "");
    const idChanged = empIdPrefix !== original.prefix || empIdSuffix !== original.suffix;
    const idIsComplete = !!empIdPrefix && isValidSuffix(empIdSuffix);
    setEmpIdError("");
    try {
      const newEmployeeId = idChanged && idIsComplete
        ? composeEmployeeId(empIdPrefix, empIdSuffix)
        : undefined;
      const fullPayload: Partial<User> = newEmployeeId !== undefined
        ? { ...editData, employeeId: newEmployeeId }
        : editData;
      // HR can edit everything except training fields; strip them so the
      // server-side guard (which 403s on any HR PUT containing those keys)
      // doesn't reject unrelated edits.
      const stripTraining = (p: typeof fullPayload) => {
        const { trainingStartDate: _ts, trainingEndDate: _te, ...rest } = p;
        void _ts; void _te;
        return rest;
      };
      const payload = academyView
        ? {
            id: editData.id,
            trainingStartDate: editData.trainingStartDate || "",
            trainingEndDate: editData.trainingEndDate || "",
          }
        : hrView
          ? stripTraining(fullPayload)
          : fullPayload;
      const response = await fetch("/api/employees", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        const result = await response.json();
        const saved: User = result.data || editData;
        setUsers(users.map((u) => (u.id === editData.id ? saved : u)));
        setSelectedUser(saved);
        setEditMode(false);
      } else {
        const errBody = await response.json().catch(() => ({}));
        if (response.status === 409 && errBody.error?.toLowerCase().includes('employee id')) {
          setEmpIdError(errBody.error);
        } else {
          setError(errBody.error || "Failed to save user");
        }
      }
    } catch (err) {
      console.error("Error saving user:", err);
      setError("Failed to save user");
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (!editData) return;
    const uppercaseFields = ["fullName", "nickName", "homeAddress"];
    const normalized = uppercaseFields.includes(name) ? value.toUpperCase() : value;
    const updates: Partial<User> = { [name]: normalized };
    if (name === "Emp_Status") {
      updates.accessStatus = value === "Active" ? "AUTHORIZED" : value === "Inactive" ? "UNAUTHORIZED" : editData.accessStatus;
    } else if (name === "accessStatus") {
      updates.Emp_Status = value === "AUTHORIZED" ? "Active" : value === "UNAUTHORIZED" ? "Inactive" : editData.Emp_Status;
    }
    // Department only applies to HQ; Rate only to part-time coaches. Clear the
    // stale value when the controlling field changes so it isn't saved.
    if (name === "branch" && value !== "HQ") updates.department = "";
    if (name === "role" && !isPartTimeCoach(value)) updates.rate = "";
    setEditData({ ...editData, ...updates });
  };

  const getDisplayName = (user: User) =>
    user.fullName || `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "-";

  const filteredUsers = users
    .filter((u) => !academyView || (COACH_ROLES_WITH_LEGACY as readonly string[]).includes(u.role))
    .filter(
      (user) =>
        getDisplayName(user).toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.employeeId.toLowerCase().includes(searchTerm.toLowerCase())
    );

  const inp = (label: string, name: keyof User, type = "text", extraClass = "") => (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      <input
        type={type}
        name={name}
        value={(editData?.[name] as string) || ""}
        onChange={handleInputChange}
        className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 ${extraClass}`}
      />
    </div>
  );

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-8">
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading users...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="bg-white rounded-lg shadow p-8">
        <div className="text-center py-12">
          <p className="text-4xl mb-4">🔒</p>
          <p className="text-lg font-semibold text-gray-900 mb-2">Access Denied</p>
          <p className="text-gray-600 mb-6">This feature is only available for Super Administrators.</p>
          <a href="/dashboard-employee-management" className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition-colors">
            Back to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">👥 User</h2>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search by name, email, or employee ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">
            🔍 Search
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User List */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white p-4">
              <h3 className="font-bold text-lg">Users ({filteredUsers.length})</h3>
            </div>
            <div className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
              {filteredUsers.length === 0 ? (
                <p className="p-4 text-gray-500 text-center">No users found</p>
              ) : (
                filteredUsers.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => { setSelectedUser(user); setEditMode(false); setEditData({ ...user }); }}
                    className={`w-full text-left p-4 hover:bg-gray-50 transition-colors border-l-4 ${
                      selectedUser?.id === user.id ? "border-blue-600 bg-blue-50" : "border-transparent"
                    }`}
                  >
                    <p className="font-semibold text-gray-900">{getDisplayName(user)}</p>
                    <p className="text-sm text-gray-600">{user.employeeId}</p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Detail / Edit Panel */}
        <div className="lg:col-span-2" ref={detailRef}>
          {selectedUser ? (
            <div className="bg-white rounded-lg shadow p-6">
              {/* Header */}
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{getDisplayName(selectedUser)}</h3>
                  <p className="text-sm text-gray-500">{selectedUser.employeeId}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    selectedUser.accessStatus === "AUTHORIZED" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                  }`}>
                    {selectedUser.accessStatus === "AUTHORIZED" ? "✓ Authorized" : "✗ Unauthorized"}
                  </span>
                  {isInTraining(selectedUser.trainingStartDate, selectedUser.trainingEndDate) && (
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800"
                          title={`Training: ${selectedUser.trainingStartDate} → ${selectedUser.trainingEndDate}`}>
                      🎓 In Training
                    </span>
                  )}
                  {!editMode && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditMode(true);
                          const parts = splitEmployeeId(selectedUser.employeeId);
                          setEmpIdPrefix(parts.prefix);
                          setEmpIdSuffix(parts.suffix);
                          setEmpIdError("");
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-1.5 px-4 rounded-lg transition-colors"
                      >
                        ✏️ Edit
                      </button>
                      {!academyView && selectedUser.accessStatus !== "ARCHIVED" && (
                        <button
                          onClick={() => handleArchive(selectedUser.id)}
                          className="bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-medium py-1.5 px-4 rounded-lg transition-colors"
                        >
                          Archive
                        </button>
                      )}
                      {!academyView && (
                        <button
                          onClick={() => handleDelete(selectedUser.id)}
                          className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-1.5 px-4 rounded-lg transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {editMode && academyView ? (
                <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
                  {/* Academy edit: read-only employment + editable training */}
                  <section>
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide border-b pb-2 mb-4">Employment</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {field("Full Name", getDisplayName(selectedUser))}
                      {field("Phone", selectedUser.phone)}
                      {field("Role", selectedUser.role)}
                      {field("Branch", selectedUser.branch)}
                      {field("Department", selectedUser.department)}
                      {field("Contract", selectedUser.contract)}
                      {field("Start Date", selectedUser.startDate)}
                      {field("Status", selectedUser.Emp_Status)}
                    </div>
                  </section>

                  <section>
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide border-b pb-2 mb-4">Training</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {inp("Training Start Date", "trainingStartDate", "date")}
                      {inp("Training End Date", "trainingEndDate", "date")}
                    </div>
                    {editData?.trainingStartDate && editData?.trainingEndDate &&
                      editData.trainingStartDate > editData.trainingEndDate && (
                      <p className="text-xs text-red-600 mt-2">End date must be on or after start date.</p>
                    )}
                  </section>

                  <div className="flex gap-3 pt-2 border-t">
                    <button onClick={handleSave}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors">
                      💾 Save
                    </button>
                    <button onClick={() => {
                      setEditMode(false);
                      setEditData({ ...selectedUser });
                      setEmpIdError("");
                    }}
                      className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-lg transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : editMode ? (
                <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
                  {/* Personal Info */}
                  <section>
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide border-b pb-2 mb-4">Personal Info</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <EmployeeIdInput
                          prefix={empIdPrefix}
                          suffix={empIdSuffix}
                          onPrefixChange={(v) => { setEmpIdPrefix(v); if (empIdError) setEmpIdError(""); }}
                          onSuffixChange={(v) => { setEmpIdSuffix(v); if (empIdError) setEmpIdError(""); }}
                          error={empIdError}
                          warning={hasUnrecognizedPrefix(selectedUser?.employeeId) ? "Existing ID has unrecognized role code" : undefined}
                          required={false}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Full Name</label>
                        <input type="text" name="fullName" value={editData ? getDisplayName(editData) : ""}
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Gender</label>
                        <select name="gender" value={editData?.gender || "MALE"} onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                          {GENDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      {inp("Nick Name", "nickName", "text", "uppercase")}
                      {inp("Email", "email", "email")}
                      {inp("Phone Number", "phone", "tel")}
                      {inp("NRIC", "nric")}
                      {inp("Date of Birth", "dob", "date")}
                      {inp("University", "University")}
                      <div className="md:col-span-2">{inp("Home Address", "homeAddress", "text", "uppercase")}</div>
                    </div>
                  </section>

                  {/* Employment */}
                  <section>
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide border-b pb-2 mb-4">Employment</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Branch</label>
                        <select name="branch" value={editData?.branch || ""} onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                          <option value="">— None —</option>
                          {BRANCH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      {editData?.branch === "HQ" && (
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Department</label>
                          <select name="department" value={editData?.department || ""} onChange={handleInputChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                            {DEPARTMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                      )}
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Role</label>
                        <select name="role" value={editData?.role || ""} onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                          {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Contract</label>
                        <select name="contract" value={editData?.contract ?? ""} onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                          {CONTRACT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      {inp("Start Date", "startDate", "date")}
                      {inp("Probation", "probation", "date")}
                      {inp("End Date", "endDate", "date")}
                      {/* Rate — only for part-time coaches (paid hourly) */}
                      {isPartTimeCoach(editData?.role) && inp("Rate", "rate", "number")}
                      {inp("Hire Date", "Emp_Hire_Date", "date")}
                      {inp("Signed Date", "Signed_Date", "date")}
                      {inp("Employee Type", "Emp_Type")}
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Employee Status</label>
                        <select name="Emp_Status" value={editData?.Emp_Status || ""} onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                          <option value="">-- Select Status --</option>
                          <option value="Active">Active</option>
                          <option value="Inactive">Inactive</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Access Status</label>
                        <select name="accessStatus" value={editData?.accessStatus || "AUTHORIZED"} onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                          <option value="AUTHORIZED">AUTHORIZED</option>
                          <option value="UNAUTHORIZED">UNAUTHORIZED</option>
                        </select>
                      </div>
                    </div>
                  </section>

                  {/* Training — HR cannot edit; only Admin/SuperAdmin/Academy can */}
                  <section>
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide border-b pb-2 mb-4">Training</h4>
                    {hrView ? (
                      <div className="grid grid-cols-2 gap-3">
                        {field("Training Start Date", selectedUser.trainingStartDate)}
                        {field("Training End Date", selectedUser.trainingEndDate)}
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {inp("Training Start Date", "trainingStartDate", "date")}
                          {inp("Training End Date", "trainingEndDate", "date")}
                        </div>
                        {editData?.trainingStartDate && editData?.trainingEndDate &&
                          editData.trainingStartDate > editData.trainingEndDate && (
                          <p className="text-xs text-red-600 mt-2">End date must be on or after start date.</p>
                        )}
                      </>
                    )}
                  </section>

                  {/* Emergency Contact */}
                  <section>
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide border-b pb-2 mb-4">Emergency Contact</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {inp("Contact Number", "Emc_Number", "tel")}
                      {inp("Full Name", "Emc_Email", "text")}
                      <div className="md:col-span-2">{inp("Relationship", "Emc_Relationship")}</div>
                    </div>
                  </section>

                  {/* Bank Details */}
                  <section>
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide border-b pb-2 mb-4">Bank Details</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {inp("Bank", "Bank")}
                      {inp("Account Name", "Bank_Name")}
                      <div className="md:col-span-2">{inp("Account Number", "Bank_Account")}</div>
                    </div>
                  </section>

                  {/* Actions */}
                  <div className="flex gap-3 pt-2 border-t">
                    <button onClick={handleSave}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors">
                      💾 Save
                    </button>
                    <button onClick={() => {
                      setEditMode(false);
                      setEditData({ ...selectedUser });
                      setEmpIdError("");
                    }}
                      className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-lg transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : academyView ? (
                <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
                  {/* Academy read-only view */}
                  <section>
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide border-b pb-2 mb-4">Employment</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {field("Full Name", getDisplayName(selectedUser))}
                      {field("Phone", selectedUser.phone)}
                      {field("Role", selectedUser.role)}
                      {field("Branch", selectedUser.branch)}
                      {field("Department", selectedUser.department)}
                      {field("Contract", selectedUser.contract)}
                      {field("Start Date", selectedUser.startDate)}
                      {field("Status", selectedUser.Emp_Status)}
                    </div>
                  </section>
                  <section>
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide border-b pb-2 mb-4">Training</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {field("Training Start Date", selectedUser.trainingStartDate)}
                      {field("Training End Date", selectedUser.trainingEndDate)}
                    </div>
                  </section>
                </div>
              ) : (
                <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
                  {/* Personal Info */}
                  <section>
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide border-b pb-2 mb-4">Personal Info</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {field("Employee ID", selectedUser.employeeId)}
                      {field("Full Name", getDisplayName(selectedUser))}
                      {field("Gender", selectedUser.gender === "MALE" ? "Male" : selectedUser.gender === "FEMALE" ? "Female" : selectedUser.gender)}
                      {field("Nick Name", selectedUser.nickName)}
                      {field("Email", selectedUser.email)}
                      {field("Phone", selectedUser.phone)}
                      {field("NRIC", selectedUser.nric)}
                      {field("Date of Birth", selectedUser.dob)}
                      {field("University", selectedUser.University)}
                      <div className="col-span-2">{field("Home Address", selectedUser.homeAddress)}</div>
                    </div>
                  </section>

                  {/* Employment */}
                  <section>
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide border-b pb-2 mb-4">Employment</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {field("Branch", selectedUser.branch)}
                      {field("Department", selectedUser.department)}
                      {field("Role", selectedUser.role)}
                      {field("Contract", selectedUser.contract)}
                      {field("Start Date", selectedUser.startDate)}
                      {field("Probation", selectedUser.probation)}
                      {field("End Date", selectedUser.endDate)}
                      {field("Rate", selectedUser.rate)}
                      {field("Hire Date", selectedUser.Emp_Hire_Date)}
                      {field("Signed Date", selectedUser.Signed_Date)}
                      {field("Employee Type", selectedUser.Emp_Type)}
                      {field("Employee Status", selectedUser.Emp_Status)}
                      {field("Access Status", selectedUser.accessStatus)}
                      {field("Registered On", selectedUser.registeredAt ? new Date(selectedUser.registeredAt).toLocaleDateString() : "")}
                    </div>
                  </section>

                  {/* Training */}
                  <section>
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide border-b pb-2 mb-4">Training</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {field("Training Start Date", selectedUser.trainingStartDate)}
                      {field("Training End Date", selectedUser.trainingEndDate)}
                    </div>
                  </section>

                  {/* Emergency Contact */}
                  <section>
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide border-b pb-2 mb-4">Emergency Contact</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {field("Contact Number", selectedUser.Emc_Number)}
                      {field("Full Name", selectedUser.Emc_Email)}
                      <div className="col-span-2">{field("Relationship", selectedUser.Emc_Relationship)}</div>
                    </div>
                  </section>

                  {/* Bank Details */}
                  <section>
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide border-b pb-2 mb-4">Bank Details</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {field("Bank", selectedUser.Bank)}
                      {field("Account Name", selectedUser.Bank_Name)}
                      <div className="col-span-2">{field("Account Number", selectedUser.Bank_Account)}</div>
                    </div>
                  </section>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-8">
              <div className="text-center text-gray-500">
                <p className="text-lg">Select a user to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
