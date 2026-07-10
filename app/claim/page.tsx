"use client";

import { useState } from "react";
import Sidebar from "@/app/components/Sidebar";
import UserHeader from "@/app/components/UserHeader";

// Claims is intentionally an empty-state shell. The previous version
// rendered MOCK_CLAIMS and MOCK_EMPLOYEE_CLAIMS unconditionally to every
// signed-in user, which leaked example payment data and bypassed role
// checks. Real data, role gating, and branch scoping will be wired up in
// a separate task — until then, this page deliberately does no fetching
// and shows only a placeholder.
export default function ClaimsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans">
      <header className="bg-slate-900 text-white shrink-0 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20" />
        <div className="relative flex justify-between items-center px-10 py-8">
          <div className="flex items-center gap-6">
            <button
              onClick={() => { window.location.href = "/dashboards/hrms"; }}
              className="bg-white/10 hover:bg-white/20 p-2.5 rounded-xl transition-colors"
              aria-label="Back to HRMS dashboard"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-3xl font-black tracking-tight uppercase">
                Claims <span className="text-blue-400">Status</span>
              </h1>
              <p className="text-slate-400 font-medium text-sm tracking-widest mt-0.5">EBRIGHT HRMS</p>
            </div>
          </div>
          <UserHeader userName="" userEmail="" />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen((p) => !p)} />

        <main className="flex-1 overflow-y-auto px-8 py-8 bg-[#F8FAFC]">
          <div className="mx-auto w-full max-w-3xl">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-6a2 2 0 012-2h2a2 2 0 012 2v6m-6 0h6m-9 4h12a2 2 0 002-2V7a2 2 0 00-2-2h-3l-2-2H8L6 5H3a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Coming soon</h2>
              <p className="text-slate-500 text-sm max-w-md mx-auto">
                The claims module is being rebuilt with role-based access and real
                data. Submit and approval flows will be available here in a future
                release.
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
