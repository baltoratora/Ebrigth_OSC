"use client";

import { useState, useEffect } from "react";
import { BRANCH_OPTIONS, ROLE_OPTIONS, CONTRACT_OPTIONS, GENDER_OPTIONS } from "@/lib/constants";

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
  biometricTemplate: string | null;
  registeredAt: string;
  updatedAt: string;
}

interface UserManagementProps {
  userRole?: string;
}

const field = (label: string, value: string | undefined | null) => (
  <div className="bg-gray-50 p-3 rounded">
    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
    <p className="text-sm font-medium text-gray-900">{value || "-"}</p>
  </div>
);

export default function UserManagement({ userRole = "SUPER_ADMIN" }: UserManagementProps) {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<User | null>(null);

  const isAuthorized = userRole === "SUPER_ADMIN";

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
    try {
      const response = await fetch("/api/employees", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editData),
      });
      if (response.ok) {
        setUsers(users.map((u) => (u.id === editData.id ? editData : u)));
        setSelectedUser(editData);
        setEditMode(false);
      } else {
        setError("Failed to save user");
      }
    } catch (err) {
      console.error("Error saving user:", err);
      setError("Failed to save user");
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (editData) setEditData({ ...editData, [name]: value });
  };

  const getDisplayName = (user: User) =>
    user.fullName || `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "-";

  const filteredUsers = users.filter(
    (user) =>
      getDisplayName(user).toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.employeeId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const inp = (label: string, name: keyof User, type = "text") => (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      <input
        type={type}
        name={name}
        value={(editData?.[name] as string) || ""}
        onChange={handleInputChange}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
        <h2 className="text-2xl font-bold text-gray-900 mb-4">👥 User Management</h2>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search by name, email, or employee ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
        <div className="lg:col-span-2">
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
                  {!editMode && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditMode(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-1.5 px-4 rounded-lg transition-colors"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        onClick={() => handleDelete(selectedUser.id)}
                        className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-1.5 px-4 rounded-lg transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {editMode ? (
                <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
                  {/* Personal Info */}
                  <section>
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide border-b pb-2 mb-4">Personal Info</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Full Name</label>
                        <input type="text" name="fullName" value={editData ? getDisplayName(editData) : ""}
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Gender</label>
                        <select name="gender" value={editData?.gender || "MALE"} onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                          {GENDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      {inp("Nick Name", "nickName")}
                      {inp("Email", "email", "email")}
                      {inp("Phone Number", "phone", "tel")}
                      {inp("NRIC", "nric")}
                      {inp("Date of Birth", "dob", "date")}
                      {inp("University", "University")}
                      <div className="md:col-span-2">{inp("Home Address", "homeAddress")}</div>
                    </div>
                  </section>

                  {/* Employment */}
                  <section>
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide border-b pb-2 mb-4">Employment</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Branch</label>
                        <select name="branch" value={editData?.branch || "HQ"} onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                          {BRANCH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Role</label>
                        <select name="role" value={editData?.role || ""} onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                          {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Contract</label>
                        <select name="contract" value={editData?.contract || "12 MONTH"} onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                          {CONTRACT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      {inp("Rate", "rate", "number")}
                      {inp("Start Date", "startDate", "date")}
                      {inp("End Date", "endDate", "date")}
                      {inp("Probation", "probation", "date")}
                      {inp("Hire Date", "Emp_Hire_Date", "date")}
                      {inp("Signed Date", "Signed_Date", "date")}
                      {inp("Employee Type", "Emp_Type")}
                      {inp("Employee Status", "Emp_Status")}
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Access Status</label>
                        <select name="accessStatus" value={editData?.accessStatus || "AUTHORIZED"} onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                          <option value="AUTHORIZED">AUTHORIZED</option>
                          <option value="UNAUTHORIZED">UNAUTHORIZED</option>
                        </select>
                      </div>
                    </div>
                  </section>

                  {/* Emergency Contact */}
                  <section>
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide border-b pb-2 mb-4">Emergency Contact</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {inp("Contact Number", "Emc_Number", "tel")}
                      {inp("Contact Email", "Emc_Email", "email")}
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
                    <button onClick={() => { setEditMode(false); setEditData({ ...selectedUser }); }}
                      className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-lg transition-colors">
                      Cancel
                    </button>
                  </div>
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
                      {field("Role", selectedUser.role)}
                      {field("Contract", selectedUser.contract)}
                      {field("Rate", selectedUser.rate)}
                      {field("Start Date", selectedUser.startDate)}
                      {field("End Date", selectedUser.endDate)}
                      {field("Probation", selectedUser.probation)}
                      {field("Hire Date", selectedUser.Emp_Hire_Date)}
                      {field("Signed Date", selectedUser.Signed_Date)}
                      {field("Employee Type", selectedUser.Emp_Type)}
                      {field("Employee Status", selectedUser.Emp_Status)}
                      {field("Access Status", selectedUser.accessStatus)}
                      {field("Biometrics", selectedUser.biometricTemplate ? "✓ Enrolled" : "✗ Not Enrolled")}
                      {field("Registered On", selectedUser.registeredAt ? new Date(selectedUser.registeredAt).toLocaleDateString() : "")}
                    </div>
                  </section>

                  {/* Emergency Contact */}
                  <section>
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide border-b pb-2 mb-4">Emergency Contact</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {field("Contact Number", selectedUser.Emc_Number)}
                      {field("Contact Email", selectedUser.Emc_Email)}
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
