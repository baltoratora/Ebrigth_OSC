"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/app/components/Sidebar";

type DayKey = "wed" | "thu" | "fri" | "sat" | "sun";

const REGIONS: Record<"A" | "B" | "C", string[]> = {
  A: ["Rimbayu", "Klang", "Shah Alam", "Setia Alam", "Denai Alam", "Eco Grandeur", "Subang Taipan"],
  B: ["Danau Kota", "Kota Damansara", "Ampang", "Sri Petaling", "Bandar Tun Hussein Onn", "Kajang TTDI Groove", "Taman Sri Gombak", "Tropicana Sungai Buloh"],
  C: ["Putrajaya", "Kota Warisan", "Bandar Baru Bangi", "Cyberjaya", "Bandar Seri Putra", "Dataran Puchong Utama", "Puchong Utama", "Online"],
};

const DAYS: { key: DayKey; label: string; full: string }[] = [
  { key: "wed", label: "W", full: "Wednesday" },
  { key: "thu", label: "T", full: "Thursday" },
  { key: "fri", label: "F", full: "Friday" },
  { key: "sat", label: "S", full: "Saturday" },
  { key: "sun", label: "S", full: "Sunday" },
];

type BranchRow = {
  branch: string;
  wed: boolean;
  thu: boolean;
  fri: boolean;
  sat: boolean;
  sun: boolean;
};

export default function BranchOperationDays() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rows, setRows] = useState<BranchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState<"all" | "A" | "B" | "C">("all");

  useEffect(() => {
    fetch("/api/branch-operation-days")
      .then(r => r.ok ? r.json() : [])
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = region === "all"
    ? rows
    : rows.filter(r => REGIONS[region].includes(r.branch));

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen(p => !p)} />

      <main className="flex-1 h-screen flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="shrink-0 px-6 pt-6 bg-slate-50 z-40">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4 mb-6">
            <button
              onClick={() => router.push("/dashboards/hrms")}
              className="bg-blue-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-md hover:bg-blue-600 transition-colors"
            >
              <span className="text-xl">👥</span>
              <span className="text-base font-black uppercase tracking-wide leading-none">HRMS</span>
            </button>
            <div className="h-8 w-px bg-slate-300" />
            <button onClick={() => router.push("/manpower-schedule")} className="text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors">
              Manpower Planning
            </button>
            <span className="text-slate-300 text-lg">›</span>
            <h1 className="text-lg font-black uppercase tracking-wide text-slate-800 leading-none m-0">Branch Operation Days</h1>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 pb-12">

          {/* Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto mb-4">
            {loading ? (
              <div className="py-16 text-center text-slate-400 text-sm">Loading branch data…</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <th className="text-left px-4 py-3 w-64">
                      <div className="flex gap-1.5">
                        {(["all", "A", "B", "C"] as const).map(r => (
                          <button
                            key={r}
                            onClick={() => setRegion(r)}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                              region === r
                                ? "bg-teal-500 text-white shadow-sm"
                                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                            }`}
                          >
                            {r === "all" ? "All" : `Region ${r}`}
                          </button>
                        ))}
                      </div>
                    </th>
                    {DAYS.map((d, i) => (
                      <th key={d.key} className={`text-center px-6 py-3.5 text-slate-600 font-black text-sm uppercase tracking-wider ${i === 2 ? "border-r border-slate-100" : ""}`}>
                        <div className="flex flex-col items-center gap-0.5">
                          <span>{d.label}</span>
                          <span className="text-[9px] font-medium text-slate-400 normal-case tracking-normal">{d.full.slice(0, 3)}</span>
                        </div>
                      </th>
                    ))}
                    <th className="text-center px-4 py-3.5 text-slate-500 font-semibold text-xs uppercase tracking-wide">Days/wk</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(row => {
                    const openCount = DAYS.filter(d => row[d.key]).length;
                    return (
                      <tr key={row.branch} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                        <td className="px-5 py-3.5">
                          <span className="font-semibold text-slate-700 text-sm">{row.branch}</span>
                        </td>

                        {DAYS.map((d, i) => {
                          const isOpen = row[d.key];
                          return (
                            <td key={d.key} className={`px-6 py-3.5 text-center ${i === 2 ? "border-r border-slate-100" : ""}`}>
                              <div className={`w-9 h-9 rounded-full flex items-center justify-center mx-auto select-none
                                ${isOpen ? "bg-teal-500 shadow-sm shadow-teal-200" : "bg-slate-100 border-2 border-slate-200"}`}
                              >
                                {isOpen
                                  ? <span className="text-white font-black text-base">✓</span>
                                  : <span className="text-slate-400 font-black text-sm">✕</span>
                                }
                              </div>
                            </td>
                          );
                        })}

                        <td className="px-4 py-3.5 text-center">
                          <span className={`inline-block rounded-xl px-3 py-1 text-xs font-black
                            ${openCount === 5 ? "bg-teal-50 text-teal-700" :
                              openCount >= 3 ? "bg-amber-50 text-amber-700" :
                              "bg-red-50 text-red-600"}`}>
                            {openCount}
                          </span>
                        </td>
                      </tr>
                    );
                  })}

                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-14 text-center text-slate-400 text-sm">
                        {rows.length === 0 ? "No branch data found." : "No branches found for this region."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-5 text-sm text-slate-600">
            <span className="font-semibold text-slate-500 text-xs uppercase tracking-wide">Legend</span>
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-teal-500 flex items-center justify-center shadow-sm">
                <span className="text-white font-black text-base leading-none">✓</span>
              </span>
              <span className="text-xs text-slate-600">Operating — at least one staff has hours set</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-slate-100 border-2 border-slate-200 flex items-center justify-center">
                <span className="text-slate-400 font-black text-xs leading-none">✕</span>
              </span>
              <span className="text-xs text-slate-600">No working hours set</span>
            </div>
            <div className="w-px h-4 bg-slate-200" />
            <span className="text-xs text-slate-400">W = Wed &nbsp;·&nbsp; T = Thu &nbsp;·&nbsp; F = Fri &nbsp;·&nbsp; S = Sat &nbsp;·&nbsp; S = Sun</span>
          </div>
        </div>
      </main>
    </div>
  );
}
