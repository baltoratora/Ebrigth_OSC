"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/app/components/Sidebar";

type StaffStats = { total: number; ptCoach: number; ftCoach: number; bm: number };

type DayKey = "wed" | "thu" | "fri" | "sat" | "sun";

const DAYS: { key: DayKey; label: string; apiKey: string }[] = [
  { key: "wed", label: "Wed", apiKey: "wed" },
  { key: "thu", label: "Thu", apiKey: "thu" },
  { key: "fri", label: "Fri", apiKey: "fri" },
  { key: "sat", label: "Sat", apiKey: "sat" },
  { key: "sun", label: "Sun", apiKey: "sun" },
];

type DayData = { current: number; target: number; closed: boolean };

type Branch = {
  id: string;
  code: string;
  name: string;
  days: Record<DayKey, DayData>;
  avatarColor: string;
};

type QuotaMap = Record<string, { wed: number; thu: number; fri: number; sat: number; sun: number }>;

// Quota-only shape used in the modal (current stays read-only, closed is auto-derived)
type QuotaDay = { target: number };
type ModalState = {
  branchId: string;
  code: string;
  name: string;
  days: Record<DayKey, QuotaDay>;
  currentCounts: Record<DayKey, number>;
};

type ApiBranch = {
  code: string;
  name: string;
  wed: number; thu: number; fri: number; sat: number; sun: number;
};

const AVATAR_COLORS = [
  "bg-blue-500", "bg-purple-500", "bg-green-600", "bg-orange-500",
  "bg-teal-500", "bg-rose-500", "bg-indigo-500", "bg-amber-500",
  "bg-cyan-500", "bg-lime-600", "bg-fuchsia-500", "bg-red-500",
  "bg-violet-500", "bg-sky-500", "bg-emerald-500", "bg-pink-500",
  "bg-yellow-600", "bg-slate-500", "bg-stone-600", "bg-teal-700", "bg-rose-700",
];

const DEFAULT_TARGET = 5;

const REGIONS: Record<"A" | "B" | "C", string[]> = {
  A: ["RBY", "KLG", "SHA", "SA", "DA", "EGR", "ST"],
  B: ["DK", "KD", "AMP", "SP", "BTHO", "KTG", "TSG", "TSB"],
  C: ["PJY", "KW", "BBB", "CJY", "BSP", "DPU", "PJU", "ONL"],
};

function apiBranchToBranch(api: ApiBranch, idx: number, quotas: QuotaMap = {}): Branch {
  const q = quotas[api.code];
  return {
    id: api.code,
    code: api.code,
    name: api.name,
    avatarColor: AVATAR_COLORS[idx % AVATAR_COLORS.length],
    days: {
      wed: { current: api.wed, target: q?.wed ?? DEFAULT_TARGET, closed: api.wed === 0 },
      thu: { current: api.thu, target: q?.thu ?? DEFAULT_TARGET, closed: api.thu === 0 },
      fri: { current: api.fri, target: q?.fri ?? DEFAULT_TARGET, closed: api.fri === 0 },
      sat: { current: api.sat, target: q?.sat ?? DEFAULT_TARGET, closed: api.sat === 0 },
      sun: { current: api.sun, target: q?.sun ?? DEFAULT_TARGET, closed: api.sun === 0 },
    },
  };
}

function getFillPct(current: number, target: number): number {
  if (target === 0) return 0;
  return Math.round((current / target) * 100);
}

function getCellStyle(day: DayData): { bg: string; text: string; border: string } {
  if (day.closed) return { bg: "bg-slate-100", text: "text-slate-400", border: "border-slate-200" };
  const pct = getFillPct(day.current, day.target);
  if (pct >= 100) return { bg: "bg-green-100", text: "text-green-700", border: "border-green-300" };
  if (pct >= 70)  return { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-300" };
  return { bg: "bg-red-100", text: "text-red-700", border: "border-red-300" };
}

function getWeeklyFill(branch: Branch): { current: number; target: number; pct: number } {
  let current = 0, target = 0;
  for (const d of DAYS) {
    const day = branch.days[d.key];
    if (!day.closed) { current += day.current; target += day.target; }
  }
  return { current, target, pct: getFillPct(current, target) };
}

type Tooltip = { branchName: string; day: string; current: number; target: number; pct: number; x: number; y: number } | null;

export default function BranchOpeningPlanning() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState<"all" | "A" | "B" | "C">("all");
  const [tooltip, setTooltip] = useState<Tooltip>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [staffStats, setStaffStats] = useState<StaffStats | null>(null);
  const [canEditAll, setCanEditAll] = useState(false);
  const [isBM, setIsBM] = useState(false);
  const [userBranchName, setUserBranchName] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/branch-opening-planning/branches").then(r => r.ok ? r.json() : []),
      fetch("/api/branch-opening-planning/stats").then(r => r.ok ? r.json() : null),
      fetch("/api/auth/session").then(r => r.ok ? r.json() : null),
      fetch("/api/branch-opening-planning/quotas").then(r => r.ok ? r.json() : {}),
    ]).then(([apiBranches, stats, session, quotas]: [ApiBranch[], StaffStats | null, { user?: { role?: string; branchName?: string } } | null, QuotaMap]) => {
      setBranches(apiBranches.map((b, i) => apiBranchToBranch(b, i, quotas)));
      if (stats && !stats.total.toString().includes("error")) setStaffStats(stats);
      const role = session?.user?.role?.toUpperCase() ?? "";
      const bm = role === "BRANCH_MANAGER" || role === "BM";
      setIsBM(bm);
      setUserBranchName(session?.user?.branchName ?? null);
      setCanEditAll(!bm);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Aggregate metrics
  let totalCurrent = 0, totalTarget = 0;
  for (const b of branches) {
    for (const d of DAYS) {
      const day = b.days[d.key];
      if (!day.closed) { totalCurrent += day.current; totalTarget += day.target; }
    }
  }
  const slotsUnfilled = Math.max(0, totalTarget - totalCurrent);
  const understaffedBranches = branches.filter(b =>
    DAYS.some(d => { const day = b.days[d.key]; return !day.closed && getFillPct(day.current, day.target) < 70; })
  ).length;

  const filteredBranches = region === "all"
    ? branches
    : branches.filter(b => REGIONS[region].includes(b.code));

  function openEdit(branch: Branch) {
    setModal({
      branchId: branch.id,
      code: branch.code,
      name: branch.name,
      currentCounts: {
        wed: branch.days.wed.current,
        thu: branch.days.thu.current,
        fri: branch.days.fri.current,
        sat: branch.days.sat.current,
        sun: branch.days.sun.current,
      },
      days: {
        wed: { target: branch.days.wed.target },
        thu: { target: branch.days.thu.target },
        fri: { target: branch.days.fri.target },
        sat: { target: branch.days.sat.target },
        sun: { target: branch.days.sun.target },
      },
    });
  }

  async function saveModal() {
    if (!modal) return;
    await fetch("/api/branch-opening-planning/quotas", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: modal.code,
        name: modal.name,
        wed: modal.days.wed.target,
        thu: modal.days.thu.target,
        fri: modal.days.fri.target,
        sat: modal.days.sat.target,
        sun: modal.days.sun.target,
      }),
    }).catch(() => {});
    setBranches(prev => prev.map(b => {
      if (b.id !== modal.branchId) return b;
      const newDays = { ...b.days };
      for (const d of DAYS) {
        newDays[d.key] = {
          current: b.days[d.key].current,
          closed: b.days[d.key].closed,
          target: modal.days[d.key].target,
        };
      }
      return { ...b, days: newDays };
    }));
    setModal(null);
  }

  function updateModalQuota(day: DayKey, target: number) {
    setModal(prev => {
      if (!prev) return prev;
      return { ...prev, days: { ...prev.days, [day]: { target } } };
    });
  }

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
            <h1 className="text-lg font-black uppercase tracking-wide text-slate-800 leading-none m-0">Branch Opening Planning</h1>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 pb-12">

          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase mb-2"><span>👥</span> Total Active Staff</div>
              <div className="text-3xl font-black text-slate-800">
                {staffStats ? staffStats.total : <span className="text-slate-300 text-2xl">—</span>}
              </div>
              {staffStats
                ? <div className="text-xs text-slate-400 mt-1">{staffStats.ptCoach} PT · {staffStats.ftCoach} FT · {staffStats.bm} BM</div>
                : <div className="text-xs text-slate-300 mt-1">{loading ? "loading…" : "—"}</div>}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase mb-2"><span>📋</span> Weekly Quota Filled</div>
              <div className="text-3xl font-black text-blue-600">
                {loading ? <span className="text-slate-300 text-2xl">—</span> : <>{totalCurrent}<span className="text-slate-400 text-xl font-bold">/{totalTarget}</span></>}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {loading ? "loading…" : `slots filled this week (${getFillPct(totalCurrent, totalTarget)}%)`}
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase mb-2"><span>🎯</span> Slots Unfilled</div>
              <div className={`text-3xl font-black ${loading ? "text-slate-300" : slotsUnfilled > 0 ? "text-red-500" : "text-green-600"}`}>
                {loading ? "—" : slotsUnfilled}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {loading ? "loading…" : slotsUnfilled > 0 ? "recruitment needed to fill quota" : "all slots covered"}
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase mb-2"><span>🏪</span> Branches Understaffed</div>
              <div className={`text-3xl font-black ${loading ? "text-slate-300" : understaffedBranches > 0 ? "text-amber-500" : "text-green-600"}`}>
                {loading ? "—" : <>{understaffedBranches}<span className="text-slate-400 text-xl font-bold">/{branches.length}</span></>}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {loading ? "loading…" : understaffedBranches > 0 ? "branches with a day below 70% fill" : "no branches critically short"}
              </div>
            </div>
          </div>

          {/* Heatmap table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto mb-6">
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
                    {DAYS.map(d => (
                      <th key={d.key} className="text-center px-4 py-3.5 text-slate-500 font-semibold text-xs uppercase tracking-wide">{d.label}</th>
                    ))}
                    <th className="text-center px-4 py-3.5 text-slate-500 font-semibold text-xs uppercase tracking-wide">Weekly Fill</th>
                    <th className="w-16" />
                  </tr>
                </thead>
                <tbody>
                  {filteredBranches.map(branch => {
                    const weekly = getWeeklyFill(branch);
                    const weeklyColor = weekly.target === 0
                      ? "text-slate-400 bg-slate-50"
                      : weekly.pct >= 100 ? "text-green-700 bg-green-50"
                      : weekly.pct >= 70  ? "text-amber-700 bg-amber-50"
                      : "text-red-700 bg-red-50";

                    return (
                      <tr key={branch.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-full ${branch.avatarColor} text-white flex items-center justify-center text-xs font-black shrink-0 shadow-sm`}>
                              {branch.code}
                            </div>
                            <span className="font-semibold text-slate-700 leading-tight">{branch.name}</span>
                          </div>
                        </td>

                        {DAYS.map(d => {
                          const day = branch.days[d.key];
                          const style = getCellStyle(day);
                          const pct = day.closed ? 0 : getFillPct(day.current, day.target);
                          return (
                            <td key={d.key} className="px-4 py-4 text-center">
                              <div
                                className={`inline-flex items-center justify-center rounded-xl px-3 py-1.5 border font-bold min-w-[68px] cursor-default select-none transition-transform hover:scale-105 ${style.bg} ${style.text} ${style.border}`}
                                onMouseEnter={e => {
                                  if (!day.closed) {
                                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                    setTooltip({ branchName: branch.name, day: d.label, current: day.current, target: day.target, pct, x: rect.left + rect.width / 2, y: rect.top });
                                  }
                                }}
                                onMouseLeave={() => setTooltip(null)}
                              >
                                {day.closed
                                  ? <span className="text-xs font-medium text-slate-400">Closed</span>
                                  : <span>{day.current}/{day.target}</span>}
                              </div>
                            </td>
                          );
                        })}

                        <td className="px-4 py-4 text-center">
                          <span className={`inline-block rounded-xl px-3 py-1.5 text-xs font-black ${weeklyColor}`}>
                            {weekly.target === 0 ? "—" : `${weekly.pct}%`}
                            {weekly.target > 0 && <span className="font-medium opacity-70 ml-1">({weekly.current}/{weekly.target})</span>}
                          </span>
                        </td>

                        <td className="px-3 py-4 text-right">
                          {(canEditAll || (isBM && userBranchName !== null && branch.name.toLowerCase() === userBranchName.toLowerCase())) && (
                            <button
                              onClick={() => openEdit(branch)}
                              className="text-xs font-semibold text-slate-400 hover:text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {filteredBranches.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-14 text-center text-slate-400 text-sm">
                        No branches found for this region.
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
            <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-lg bg-green-100 border border-green-300 inline-block" /><span>100% filled</span></div>
            <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-lg bg-amber-100 border border-amber-300 inline-block" /><span>70–99% filled</span></div>
            <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-lg bg-red-100 border border-red-300 inline-block" /><span>Below 70%</span></div>
            <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-lg bg-slate-100 border border-slate-200 inline-block" /><span>Closed</span></div>
            {!loading && (canEditAll || isBM) && <span className="ml-auto text-xs text-slate-400">Quota default: {DEFAULT_TARGET} per day · editable via Edit</span>}
          </div>
        </div>
      </main>

      {/* Tooltip */}
      {tooltip && (
        <div className="fixed z-50 pointer-events-none" style={{ left: tooltip.x, top: tooltip.y - 8, transform: "translate(-50%, -100%)" }}>
          <div className="bg-slate-800 text-white text-xs rounded-xl px-3 py-2 shadow-xl whitespace-nowrap">
            <div className="font-bold mb-0.5">{tooltip.branchName} · {tooltip.day}</div>
            <div className="text-slate-300">{tooltip.current}/{tooltip.target} staff · {tooltip.pct}% filled</div>
          </div>
          <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-slate-800 mx-auto" />
        </div>
      )}

      {/* Edit Quota Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-800 uppercase tracking-wide">Edit Quota</h2>
                <p className="text-xs text-slate-400 mt-0.5">{modal.name} ({modal.code}) — set target per day</p>
              </div>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
            </div>

            <div className="px-6 py-5 max-h-[65vh] overflow-y-auto">
              {/* Column header */}
              <div className="grid grid-cols-[3rem_1fr_6rem] gap-3 mb-2 px-3">
                <span className="text-xs font-semibold text-slate-400 uppercase">Day</span>
                <span className="text-xs font-semibold text-slate-400 uppercase">Scheduled staff</span>
                <span className="text-xs font-semibold text-slate-400 uppercase text-center">Quota</span>
              </div>

              <div className="space-y-2">
                {DAYS.map(d => {
                  const current = modal.currentCounts[d.key];
                  const isOpen = current > 0;
                  return (
                    <div key={d.key} className={`grid grid-cols-[3rem_1fr_6rem] items-center gap-3 p-3 rounded-xl border ${isOpen ? "bg-white border-slate-200" : "bg-slate-50 border-slate-200 opacity-50"}`}>
                      <span className="text-sm font-bold text-slate-700">{d.label}</span>

                      {/* Current — read-only from workingHours */}
                      {isOpen ? (
                        <span className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold bg-blue-50 text-blue-700 w-fit">
                          👤 {current} scheduled
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Not operating (no working hours set)</span>
                      )}

                      {/* Quota — only editable for open days */}
                      {isOpen ? (
                        <input
                          type="number"
                          min={0}
                          value={modal.days[d.key].target}
                          onChange={e => updateModalQuota(d.key, Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-center font-bold focus:outline-none focus:ring-2 focus:ring-teal-400"
                        />
                      ) : (
                        <span className="text-center text-slate-300 text-sm font-bold">—</span>
                      )}
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-slate-400 mt-4">
                Operating days and staff counts are automatically derived from working hour schedules.
              </p>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setModal(null)} className="px-5 py-2 rounded-xl text-sm font-semibold text-slate-500 hover:bg-slate-100 transition-colors">Cancel</button>
              <button onClick={saveModal} className="px-5 py-2 rounded-xl text-sm font-bold bg-teal-500 text-white hover:bg-teal-600 transition-colors shadow-sm">
                Save Quota
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
