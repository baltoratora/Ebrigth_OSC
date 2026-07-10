"use client";

import { useState } from "react";
import Sidebar from "@/app/components/Sidebar";

export default function SyllabusLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="h-screen w-full bg-slate-50 flex flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen((p) => !p)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 relative flex flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
