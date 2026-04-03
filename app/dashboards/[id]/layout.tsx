"use client";

import { useState } from "react";
import Sidebar from "@/app/components/Sidebar";
import UserHeader from "@/app/components/UserHeader"; // Add this if you want the blue top bar back!

export default function DashboardsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    // 1. FIX: Changed to h-screen and overflow-hidden to lock the page frame!
    <div className="h-screen w-full bg-slate-50 flex flex-col overflow-hidden">
      {/* OPTIONAL: Uncomment this if you want the blue header on all dashboard pages! */}
      {/* <UserHeader userName="Admin User" userRole="SUPER_ADMIN" userEmail="admin@ebright.com" /> */}
      
      <div className="flex flex-1 overflow-hidden">
        {/* The Sidebar */}
        <Sidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen(p => !p)} />
        
        {/* The Actual Page Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 relative flex flex-col">
          
          {/* This renders your HRMS, Library, etc. */}
          {children}
        </main>
      </div>
    </div>
  );
}