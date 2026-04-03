"use client";

import { useState } from "react";
import UserManagement from "@/app/components/UserManagement";
import RegistrationForm from "@/app/components/RegistrationForm";
import Sidebar from "@/app/components/Sidebar";
import UserHeader from "@/app/components/UserHeader";

export default function UserManagementPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* header */}
      <header className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg">
        <div className="flex justify-between items-center pl-14 pr-4 py-6">
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
        <Sidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen(p => !p)} />

        <main className="flex-1 overflow-y-auto px-8 py-8">
          {/* Add User Button */}
          <div className="mb-6">
            <button
              onClick={() => setShowAddUser(!showAddUser)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition-colors"
            >
              {showAddUser ? "✕ Close" : "+ Add User"}
            </button>
          </div>

          {/* Add User Form */}
          {showAddUser && (
            <div className="mb-8">
              <RegistrationForm onSuccess={() => setShowAddUser(false)} />
            </div>
          )}

          {/* User Management Table */}
          <UserManagement userRole="SUPER_ADMIN" />
        </main>
      </div>
    </div>
  );
}
