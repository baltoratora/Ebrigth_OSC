"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Sidebar from "./Sidebar";
import { canAccess } from "@/lib/dashboard-access";
import { useMyPermissions } from "@/lib/use-my-permissions";

const attendanceItems = [
  { key: "hrms.attendance.summary", name: "Summary", href: "/attendance/summary", icon: "📋", code: "3.4.1" },
  { key: "hrms.attendance.report",  name: "Report",  href: "/attendance/report",  icon: "📄", code: "3.4.2" },
  { key: "hrms.attendance.appeal",  name: "Appeal",  href: "/attendance/appeal",  icon: "⚖️", code: "3.4.3" },
  { key: "hrms.attendance.leave",   name: "Leave",   href: "/attendance/leave",   icon: "🏖️", code: "3.4.4" },
];

export default function AttendanceOptions() {
  const router = useRouter();
  const { role, overrides } = useMyPermissions();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex min-h-screen bg-blue-50">
      <Sidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen(p => !p)} />
      <div className="flex-1">
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-6 flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
            >
              ← Back
            </button>
            <h1 className="text-3xl font-bold text-blue-800">Attendance Sub-Menu</h1>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 py-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {attendanceItems.filter((item) => canAccess(role, item.key, overrides)).map((item) => (
              <Link key={item.name} href={item.href}>
                <div className="bg-white rounded-xl shadow-md transition-all p-12 flex flex-col items-center border-t-4 border-blue-500 hover:shadow-2xl hover:scale-105 cursor-pointer">
                  <span className="text-6xl mb-4">{item.icon}</span>
                  <h2 className="text-2xl font-bold text-gray-800">{item.name}</h2>
                  <span className="text-xs text-gray-400 mt-2 uppercase tracking-widest">
                    {item.code}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}