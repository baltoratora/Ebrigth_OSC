"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import Sidebar from "@/app/components/Sidebar";
import UserHeader from "@/app/components/UserHeader";
import FieldActivityView from "@/app/components/FieldActivityView";
import { hasAnyRole, ROLES } from "@/lib/roles";

function todayKL(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

export default function FieldActivityPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: unknown } | undefined)?.role;
  const allowed = hasAnyRole(role, [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MARKETING]);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [date, setDate] = useState<string>(todayKL());

  const dateLabel = new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });

  if (session && !allowed) {
    return (
      <div className="flex min-h-screen bg-gray-50 items-center justify-center p-6">
        <div className="max-w-sm text-center bg-white rounded-2xl border border-gray-200 p-8">
          <div className="text-3xl mb-2">🔒</div>
          <div className="font-semibold text-gray-900">Restricted</div>
          <div className="text-sm text-gray-500 mt-1">
            Field Activity is only available to Marketing and Super Admin.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen((p) => !p)} />
      <div className="flex-1 flex flex-col">
        <header className="bg-slate-900 text-white shrink-0 relative">
          <div className="relative flex flex-wrap justify-between items-center gap-3 pl-16 pr-4 py-6 sm:px-10 sm:py-8">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight uppercase">
                Field <span className="text-green-400">Activity</span>
              </h1>
              <p className="text-slate-400 font-medium text-sm tracking-widest mt-0.5">{dateLabel.toUpperCase()}</p>
            </div>
            <UserHeader
              userName={(session?.user as { name?: string } | undefined)?.name || "User"}
              userEmail={session?.user?.email || ""}
            />
          </div>
        </header>

        <main className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-8">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <FieldActivityView date={date} />
        </main>
      </div>
    </div>
  );
}
