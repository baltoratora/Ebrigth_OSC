"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import SubAccountSwitcher, { subAccounts } from "./SubAccountSwitcher";
import Sidebar from "./Sidebar";

const attendanceItems = [
  { name: "Summary", href: "/attendance/summary", icon: "📋", code: "3.4.1" },
  { name: "Report", href: "/attendance/report", icon: "📄", code: "3.4.2" },
  { name: "Appeal", href: "/attendance/appeal", icon: "⚖️", code: "3.4.3" },
  { name: "Leave", href: "/attendance/leave", icon: "🏖️", code: "3.4.4" },
];

const STORAGE_KEY = "selectedAccount";

export default function AttendanceOptions() {
  const router = useRouter();
  const [selectedAccount, setSelectedAccount] = useState(subAccounts[0]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const savedAccount = localStorage.getItem(STORAGE_KEY);
    if (savedAccount) {
      const account = subAccounts.find((acc) => acc.name === savedAccount);
      if (account) {
        setSelectedAccount(account);
      }
    }
  }, []);

  const permissions: { [key: string]: string[] } = {
    FullTimer: ["Summary", "Report", "Leave"],
    HR: ["Summary", "Report", "Appeal", "Leave"],
    Intern: ["Summary", "Leave"],
  };

  const accessibleItems = permissions[selectedAccount.name] || [];
  const isAccessible = (itemName: string): boolean => accessibleItems.includes(itemName);

  return (
    <div className="flex min-h-screen bg-blue-50">
      <Sidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen(p => !p)} />
      <div className="flex-1">
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-6 flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-gray-100 rounded transition-colors"
              title="Toggle Sidebar"
            >
              <svg
                className="w-6 h-6 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
            <SubAccountSwitcher onAccountChange={setSelectedAccount} />
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
            {attendanceItems.map((item) => {
              const accessible = isAccessible(item.name);
              const content = (
                <div
                  className={`bg-white rounded-xl shadow-md transition-all p-12 flex flex-col items-center border-t-4 ${
                    accessible
                      ? "border-blue-500 hover:shadow-2xl cursor-pointer"
                      : "border-gray-300 opacity-50 cursor-not-allowed"
                  }`}
                >
                  <span className={`text-6xl mb-4 ${!accessible ? "grayscale" : ""}`}>
                    {item.icon}
                  </span>
                  <h2 className="text-2xl font-bold text-gray-800">{item.name}</h2>
                  <span className="text-xs text-gray-400 mt-2 uppercase tracking-widest">
                    {item.code}
                  </span>
                  {!accessible && (
                    <span className="text-xs text-red-600 font-semibold mt-4">
                      Access Denied
                    </span>
                  )}
                </div>
              );

              if (accessible) {
                return (
                  <Link key={item.name} href={item.href}>
                    {content}
                  </Link>
                );
              }

              return (
                <div key={item.name} onClick={(e) => e.preventDefault()}>
                  {content}
                </div>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}