"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import DashboardHome from "@/app/components/DashboardHome";
import Sidebar from "@/app/components/Sidebar";
import UserHeader from "@/app/components/UserHeader";

export default function HomePage() {
  // Grab the live session data!
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      redirect('/login'); // Kick them to login if they aren't authenticated
    },
  });

  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, []);

  // Show a simple loading state while checking who they are
  if (status === "loading") {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-blue-600 font-bold text-xl">Loading Dashboard...</div>;
  }

  const userEmail = session?.user?.email || "";
  const userRole = (session?.user as any)?.role || "USER";
  const branchName = (session?.user as any)?.branchName || "Admin User";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* header */}
      <header className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg">
        <div className="flex justify-between items-center px-4 py-4 sm:py-6 gap-2">
          <div className="pl-12 sm:pl-14 min-w-0">
            <h1 className="text-xl sm:text-3xl font-bold truncate">Ebright Portal</h1>
            <p className="text-blue-100 mt-1 text-xs sm:text-base hidden sm:block">Dashboard Home</p>
          </div>

          {/* NOW USING LIVE DATA FROM POSTGRESQL! */}
          <UserHeader
            userName={branchName}
            userEmail={userEmail}
          />
        </div>
      </header>

      <div className="flex h-[calc(100vh-100px)]">
        <Sidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen(p => !p)} />

        <main className="flex-1 overflow-y-auto">
          <DashboardHome userRole={userRole} userEmail={userEmail} />
        </main>
      </div>
    </div>
  );
}
