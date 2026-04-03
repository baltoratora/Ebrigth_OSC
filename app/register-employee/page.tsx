"use client";

import { useState } from "react";
import RegistrationForm from "@/app/components/RegistrationForm";
import Sidebar from "@/app/components/Sidebar";
import UserHeader from "@/app/components/UserHeader";

export default function RegisterPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg">
        <div className="flex justify-between items-center pl-14 pr-4 py-6">
          <div>
            <h1 className="text-3xl font-bold">Add User</h1>
            <p className="text-blue-100 mt-1">Add new employees to the system</p>
          </div>
          <UserHeader userName="Admin User" userRole="SUPER_ADMIN" userEmail="admin@ebright.com" />
        </div>
      </header>

      <div className="flex h-[calc(100vh-100px)]">
        <Sidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen(p => !p)} />

        <main className="flex-1 overflow-y-auto px-8 py-8">
          <RegistrationForm />
        </main>
      </div>
    </div>
  );
}