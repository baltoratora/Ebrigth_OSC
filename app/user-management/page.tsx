"use client";

import { useRef, useState } from "react";
import UserManagement from "@/app/components/UserManagement";
import RegistrationForm from "@/app/components/RegistrationForm";
import Sidebar from "@/app/components/Sidebar";
import UserHeader from "@/app/components/UserHeader";

const CSV_HEADERS = [
  "fullName", "gender", "nickName", "email", "phone", "nric", "dob",
  "homeAddress", "branch", "role", "contract", "startDate", "endDate", "probation", "rate",
  "Emc_Number", "Emc_Email", "Emc_Relationship", "Signed_Date", "Emp_Hire_Date",
  "Emp_Type", "Emp_Status", "Bank", "Bank_Name", "Bank_Account", "University",
];

export default function UserManagementPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showAddUser, setShowAddUser] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showExportFilter, setShowExportFilter] = useState(false);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    const response = await fetch("/api/employees");
    const employees = await response.json();
    if (!Array.isArray(employees) || employees.length === 0) {
      alert("No employees to export.");
      return;
    }
    const filtered = employees.filter((emp: Record<string, string>) => {
      const date = emp.startDate || emp.registeredAt?.substring(0, 10) || "";
      if (exportFrom && date < exportFrom) return false;
      if (exportTo && date > exportTo) return false;
      return true;
    });
    if (filtered.length === 0) {
      alert("No employees match the selected date range.");
      return;
    }
    const rows = [
      CSV_HEADERS.join(","),
      ...filtered.map((emp: Record<string, string>) =>
        CSV_HEADERS.map((h) => `"${String(emp[h] ?? "").replace(/"/g, '""')}"`).join(",")
      ),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `employees${exportFrom ? `_from_${exportFrom}` : ""}${exportTo ? `_to_${exportTo}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportFilter(false);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = "";
    if (!file) return;
    const text = await file.text();
    const lines = text.trim().split("\n");
    const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    let success = 0, failed = 0;
    setImportStatus("Importing...");
    for (const line of lines.slice(1)) {
      if (!line.trim()) continue;
      const values = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) ?? [];
      const record: Record<string, string> = {};
      headers.forEach((h, i) => { record[h] = (values[i] ?? "").trim().replace(/^"|"$/g, ""); });
      try {
        const res = await fetch("/api/employees", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(record),
        });
        if (res.ok) success++; else failed++;
      } catch { failed++; }
    }
    setImportStatus(`Import complete: ${success} added, ${failed} failed.`);
    setTimeout(() => {
      setImportStatus(null);
      if (success > 0) setRefreshKey((k) => k + 1);
    }, 3000);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* header */}
      <header className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg">
        <div className="flex justify-between items-center px-4 py-6">
          <div className="flex items-center gap-4">
            <a
              href="/dashboard-employee-management"
              className="bg-white/20 hover:bg-white/30 text-white px-3 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              ← Back
            </a>
            <div>
              <h1 className="text-3xl font-bold">User Management</h1>
              <p className="text-blue-100 mt-1">Manage system users and permissions</p>
            </div>
          </div>
          <UserHeader userName="Admin User" userRole="SUPER_ADMIN" userEmail="admin@ebright.com" />
        </div>
      </header>

      <div className="flex h-[calc(100vh-100px)]">
        <Sidebar sidebarOpen={sidebarOpen} onCollapse={() => setSidebarOpen(false)} />

        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-16 bg-white shadow-lg hover:bg-gray-50 transition-colors border-r border-gray-200 flex items-center justify-center text-blue-600 font-bold text-2xl"
          >
            ☰
          </button>
        )}

        <main className="flex-1 overflow-y-auto px-8 py-8">
          {/* Action Bar */}
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => setShowAddUser(!showAddUser)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition-colors"
            >
              {showAddUser ? "✕ Close" : "+ Add User"}
            </button>
            <div className="flex items-center gap-2">
              <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImport} className="hidden" />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-5 rounded-lg transition-colors"
              >
                Import CSV
              </button>
              <button
                onClick={() => setShowExportFilter((v) => !v)}
                className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-5 rounded-lg transition-colors"
              >
                Export CSV
              </button>
            </div>
          </div>

          {/* Export Date Filter */}
          {showExportFilter && (
            <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date From</label>
                <input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date To</label>
                <input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex gap-2">
                <button onClick={handleExport}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors">
                  Download
                </button>
                <button onClick={() => { setShowExportFilter(false); setExportFrom(""); setExportTo(""); }}
                  className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 text-sm font-medium rounded-lg transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Import Status */}
          {importStatus && (
            <div className="mb-6 p-4 bg-blue-100 border border-blue-400 text-blue-700 rounded-lg">
              {importStatus}
            </div>
          )}

          {/* Add User Form */}
          {showAddUser && (
            <div className="mb-8">
              <RegistrationForm onSuccess={() => { setShowAddUser(false); setRefreshKey(k => k + 1); }} />
            </div>
          )}

          {/* User Management Table */}
          <UserManagement key={refreshKey} userRole="SUPER_ADMIN" />
        </main>
      </div>
    </div>
  );
}
