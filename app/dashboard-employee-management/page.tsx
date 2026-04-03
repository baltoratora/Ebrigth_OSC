"use client";

import { useState } from "react";
import EmployeeTable from "@/app/components/EmployeeTable";
import Sidebar from "@/app/components/Sidebar";
import UserHeader from "@/app/components/UserHeader";

export default function DashboardPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* header */}
      <header className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg">
        <div className="flex justify-between items-center pl-14 pr-4 py-6">
          <div className="flex items-center gap-4">
            <a
              href="/dashboards/hrms"
              className="bg-white/20 hover:bg-white/30 text-white px-3 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              ← Back
            </a>
            <div>
              <h1 className="text-3xl font-bold">HR Employee Management</h1>
              <p className="text-blue-100 mt-1">Super Admin Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end gap-2">
              <UserHeader userName="Admin User" userRole="SUPER_ADMIN" userEmail="admin@ebright.com" />
              <a
                href="/user-management"
                className="bg-white text-blue-600 hover:bg-blue-50 font-medium py-2 px-4 rounded-lg transition-colors shadow text-sm"
              >
                + Add User
              </a>
            </div>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-100px)]">
        <Sidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen(p => !p)} />

        <main className="flex-1 overflow-y-auto px-8 py-8">
          <EmployeeTable />
        </main>
      </div>
    </div>
  );
}