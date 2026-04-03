"use client";

import { useState } from "react";
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

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Show a simple loading state while checking who they are
  if (status === "loading") {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-blue-600 font-bold text-xl">Loading Dashboard...</div>;
  }

  // Safely extract our custom session variables
  const userEmail = session?.user?.email || "";
  const userRole = (session?.user as any)?.role || "USER";
  const branchName = (session?.user as any)?.branchName || "Admin User";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* header */}
      <header className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg">
        <div className="flex justify-between items-center pl-14 pr-4 py-6">
          <div>
            <h1 className="text-3xl font-bold">Ebright HR System</h1>
            <p className="text-blue-100 mt-1">Dashboard Home</p>
          </div>
          
          {/* NOW USING LIVE DATA FROM POSTGRESQL! */}
          <UserHeader 
            userName={branchName} 
            userRole={userRole} 
            userEmail={userEmail} 
          />
        </div>
      </header>

      <div className="flex h-[calc(100vh-100px)]">
        <Sidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen(p => !p)} />

        <main className="flex-1 overflow-y-auto">
          {/* We will pass the user role into the DashboardHome component so it knows what to grey out! */}
          <DashboardHome userRole={userRole} />
        </main>
      </div>
    </div>
  );
}