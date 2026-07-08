"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import Sidebar from "@/app/components/Sidebar";
import UserHeader from "@/app/components/UserHeader";
import { isAdmin, isHOD, isHR, isAcademy, isBranchManager, hasAnyRole, ROLES } from "@/lib/roles";

// Landing hub for Attendance Manual — a card grid (same pattern as
// AttendanceOptions.tsx) rather than a single page, so Field Activity has its
// own clear entry point alongside the branch roster instead of a toggle
// buried in the roster's own toolbar.
export default function AttendanceManualHubPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: unknown } | undefined)?.role;
  const canManualRoster = isAdmin(role) || isHOD(role) || isHR(role) || isAcademy(role) || isBranchManager(role);
  const canFieldActivity = hasAnyRole(role, [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MARKETING]);

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const cards = [
    canManualRoster && {
      key: "roster",
      href: "/attendance-manual/roster",
      icon: "✍️",
      title: "Attendance Manual",
      desc: "Tick Present/Absent for branches without a scanner device.",
    },
    canFieldActivity && {
      key: "field",
      href: "/attendance/field-activity",
      icon: "🗺️",
      title: "Field Activity",
      desc: "FA events happening today, outside any single branch.",
    },
  ].filter((c): c is Exclude<typeof c, false> => c !== false);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen((p) => !p)} />
      <div className="flex-1 flex flex-col">
        <header className="bg-slate-900 text-white shrink-0 relative">
          <div className="relative flex flex-wrap justify-between items-center gap-3 pl-16 pr-4 py-6 sm:px-10 sm:py-8">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight uppercase">
                Attendance <span className="text-green-400">Manual</span>
              </h1>
              <p className="text-slate-400 font-medium text-sm tracking-widest mt-0.5">CHOOSE A VIEW</p>
            </div>
            <UserHeader
              userName={(session?.user as { name?: string } | undefined)?.name || "User"}
              userEmail={session?.user?.email || ""}
            />
          </div>
        </header>

        <main className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-12">
          {cards.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400 bg-white rounded-2xl border border-gray-200">
              Nothing available for your role yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {cards.map((c) => (
                <Link key={c.key} href={c.href}>
                  <div className="h-full bg-white rounded-2xl border border-gray-200 p-8 flex flex-col items-center text-center hover:shadow-xl hover:-translate-y-0.5 transition-all cursor-pointer">
                    <span className="text-5xl mb-4">{c.icon}</span>
                    <h2 className="text-lg font-bold text-gray-900">{c.title}</h2>
                    <p className="text-xs text-gray-500 mt-2 leading-relaxed">{c.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
