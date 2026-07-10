"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { format, parseISO } from "date-fns";
import Sidebar from "@/app/components/Sidebar";
import ManpowerDashboardMatrix from "@/app/components/ManpowerDashboardMatrix";
import { isBranchManager } from "@/lib/roles";
import {
  ALL_BRANCHES,
  ALL_COLUMNS,
  getStaffColorByIndex,
  getTimeSlotsForDay,
  getWorkingDaysForBranch,
  isOpeningClosingSlot,
} from "@/lib/manpowerUtils";
import {
  countClassesForDay,
  countClassesForSlot,
  countClassesForWeek,
  getWeekRanges,
  isWeekPlanned,
  type WeekRange,
  type SelectionsMap,
} from "@/lib/manpowerDashboard";

type ScheduleRow = {
  id: string;
  branch: string;
  startDate: string;
  endDate: string;
  selections: SelectionsMap;
  notes: Record<string, string>;
  status: string;
};

type WeekKey = "lastWeek" | "thisWeek" | "nextWeek";

const WEEK_LABELS: Record<WeekKey, string> = {
  lastWeek: "Last Week",
  thisWeek: "This Week",
  nextWeek: "Next Week",
};

export default function ManpowerDashboard() {
  const router = useRouter();
  const { data: session } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const userBranch = (session?.user as { branchName?: string } | undefined)?.branchName;
  const isBM = isBranchManager(userRole) && !!userBranch;

  // Computed once per mount — using today at render time.
  const weekRanges = useMemo(() => getWeekRanges(new Date()), []);
  const [weekKey, setWeekKey] = useState<WeekKey>("thisWeek");
  const selectedWeek: WeekRange = weekRanges[weekKey];

  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchSchedules = async () => {
      setLoading(true);
      setFetchError(null);
      try {
        const res = await fetch("/api/schedules");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error ?? "Failed to load");
        if (!cancelled) setSchedules(data.schedules as ScheduleRow[]);
      } catch (err) {
        if (!cancelled) setFetchError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchSchedules();
    return () => {
      cancelled = true;
    };
  }, []);

  // Filter to the 3 week ranges for current scope
  const relevantSchedules = useMemo(() => {
    const weekStarts = new Set<string>([
      weekRanges.lastWeek.startDate,
      weekRanges.thisWeek.startDate,
      weekRanges.nextWeek.startDate,
    ]);
    return schedules.filter((s) => {
      if (!weekStarts.has(s.startDate)) return false;
      if (isBM && s.branch !== userBranch) return false;
      return true;
    });
  }, [schedules, weekRanges, isBM, userBranch]);

  const headerBranchLabel = isBM ? userBranch : "All Branches";

  const [branchTab, setBranchTab] = useState<string>("__ALL__");
  // For BMs, force branchTab to their own branch on session load
  useEffect(() => {
    if (isBM && userBranch) setBranchTab(userBranch);
  }, [isBM, userBranch]);

  const showingAllBranches = !isBM && branchTab === "__ALL__";
  const activeBranch = isBM ? (userBranch as string) : branchTab;

  const activeBranchSchedule = useMemo(() => {
    if (showingAllBranches) return null;
    return (
      relevantSchedules.find(
        (s) => s.branch === activeBranch && s.startDate === selectedWeek.startDate,
      ) ?? null
    );
  }, [relevantSchedules, activeBranch, selectedWeek.startDate, showingAllBranches]);

  const workingDays = useMemo(
    () => (showingAllBranches ? [] : getWorkingDaysForBranch(activeBranch)),
    [showingAllBranches, activeBranch],
  );

  const [selectedDay, setSelectedDay] = useState<string>("");
  useEffect(() => {
    if (!showingAllBranches && workingDays.length > 0 && !workingDays.includes(selectedDay)) {
      setSelectedDay(workingDays[0]);
    }
  }, [showingAllBranches, workingDays, selectedDay]);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen((p) => !p)} />

      <main className="flex-1 h-screen flex flex-col overflow-hidden relative">
        {/* Sticky Header */}
        <div className="shrink-0 w-full mx-auto px-6 pt-6 z-50 bg-slate-50">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4 mb-6">
            <button
              onClick={() => router.push("/manpower-schedule")}
              className="bg-blue-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-md hover:bg-blue-600 transition-colors"
            >
              <span className="text-xl">👥</span>
              <span className="text-base font-black uppercase tracking-wide leading-none">HRMS</span>
            </button>
            <div className="h-8 w-px bg-slate-300" />
            <h1 className="text-lg font-black uppercase tracking-wide text-slate-800 leading-none m-0 flex items-center gap-4">
              <span>Manpower Dashboard — {headerBranchLabel}</span>
              <span className="text-sm bg-slate-100 text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg font-bold tracking-widest uppercase">
                {format(parseISO(selectedWeek.startDate), "dd MMM yyyy")} – {format(parseISO(selectedWeek.endDate), "dd MMM yyyy")}
              </span>
            </h1>
          </div>

          {/* Week Pills */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-4 flex items-center gap-3">
            <span className="text-xs font-black uppercase tracking-widest text-slate-500 mr-2">Week:</span>
            {(Object.keys(WEEK_LABELS) as WeekKey[]).map((k) => {
              const range = weekRanges[k];
              const active = k === weekKey;
              return (
                <button
                  key={k}
                  onClick={() => setWeekKey(k)}
                  className={`px-5 py-3 rounded-xl font-black uppercase text-sm tracking-wide transition-all shadow-sm flex flex-col items-center ${
                    active
                      ? "bg-[#2D3F50] text-white shadow-lg scale-105"
                      : "bg-white text-slate-600 border-2 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span>{WEEK_LABELS[k]}</span>
                  <span className={`text-[9px] font-bold mt-1 ${active ? "text-slate-300" : "text-slate-400"}`}>
                    {format(parseISO(range.startDate), "dd MMM")} – {format(parseISO(range.endDate), "dd MMM")}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrolling Body */}
        <div className="flex-1 overflow-y-auto w-full mx-auto px-6 pb-12">
          {loading ? (
            <div className="bg-white p-10 rounded-2xl border border-slate-200 text-center text-slate-500 font-bold uppercase tracking-widest text-sm">
              Loading schedules…
            </div>
          ) : fetchError ? (
            <div className="bg-red-50 border border-red-200 p-6 rounded-2xl flex items-center justify-between">
              <span className="text-red-700 font-bold">Couldn&apos;t load schedules. {fetchError}</span>
              <button
                onClick={() => window.location.reload()}
                className="bg-red-600 text-white px-4 py-2 rounded-lg font-bold uppercase text-xs"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* Branch Tabs (admin only) */}
              {!isBM && (
                <div className="flex gap-2 flex-wrap mb-4">
                  <button
                    onClick={() => setBranchTab("__ALL__")}
                    className={`px-4 py-2 rounded-xl font-black uppercase text-xs tracking-wide transition-all shadow-sm ${
                      branchTab === "__ALL__"
                        ? "bg-[#2D3F50] text-white"
                        : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    All Branches
                  </button>
                  {ALL_BRANCHES.map((b) => (
                    <button
                      key={b}
                      onClick={() => setBranchTab(b)}
                      className={`px-4 py-2 rounded-xl font-black uppercase text-xs tracking-wide transition-all shadow-sm ${
                        branchTab === b
                          ? "bg-[#2D3F50] text-white"
                          : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              )}

              {showingAllBranches ? (
                <ManpowerDashboardMatrix
                  schedules={relevantSchedules}
                  weekStart={selectedWeek.startDate}
                  onBranchClick={(b) => setBranchTab(b)}
                />
              ) : !isWeekPlanned(activeBranchSchedule) ? (
                <EmptyStateCard
                  weekKey={weekKey}
                  branch={activeBranch}
                  range={selectedWeek}
                  isBM={isBM}
                />
              ) : (
                <PerBranchView
                  schedule={activeBranchSchedule!}
                  branch={activeBranch}
                  workingDays={workingDays}
                  selectedDay={selectedDay}
                  setSelectedDay={setSelectedDay}
                />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

type ScheduleForView = {
  id: string;
  branch: string;
  startDate: string;
  endDate: string;
  selections: SelectionsMap;
  notes: Record<string, string>;
  status: string;
};

function PerBranchView({
  schedule,
  branch,
  workingDays,
  selectedDay,
  setSelectedDay,
}: {
  schedule: ScheduleForView;
  branch: string;
  workingDays: string[];
  selectedDay: string;
  setSelectedDay: (d: string) => void;
}) {
  const day = selectedDay;
  const slots = day ? getTimeSlotsForDay(day, branch) : [];
  const dayTotal = day ? countClassesForDay(schedule.selections, day, branch) : 0;
  const weekTotal = countClassesForWeek(schedule.selections, branch);

  const coachNamesForSlot = (slot: string): string[] => {
    const names: string[] = [];
    for (const col of ALL_COLUMNS) {
      if (col.type !== "coach") continue;
      const v = schedule.selections[`${day}-${slot}-${col.id}`];
      if (v && v !== "None") names.push(v);
    }
    return names;
  };

  const managerForSlot = (slot: string): string => {
    const v = schedule.selections[`${day}-${slot}-MANAGER`];
    return v && v !== "None" ? v : "";
  };

  const allNames = useMemoStaffList(schedule.selections);

  return (
    <div className="space-y-4">
      {/* Day Tabs */}
      <div className="flex gap-2 flex-wrap">
        {workingDays.map((d) => {
          const active = d === selectedDay;
          return (
            <button
              key={d}
              onClick={() => setSelectedDay(d)}
              className={`px-6 py-3 rounded-xl font-black uppercase text-sm tracking-wide transition-all shadow-sm ${
                active
                  ? "bg-[#2D3F50] text-white shadow-lg scale-105"
                  : "bg-white text-slate-500 border-2 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {d.slice(0, 3)}
            </button>
          );
        })}
      </div>

      {/* Table */}
      {day && (
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
          <header className="bg-white p-4 border-b flex items-center justify-between">
            <h2 className="text-xl font-black uppercase text-slate-800 m-0">{day}</h2>
            <span className="text-xs font-black uppercase tracking-widest text-slate-500">
              Day total: {dayTotal} class{dayTotal === 1 ? "" : "es"}
            </span>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: "900px" }}>
              <thead className="bg-[#2D3F50] text-white text-[10px] uppercase tracking-widest">
                <tr>
                  <th className="p-3 text-left w-[180px]">Time Slot</th>
                  <th className="p-3 text-left w-[160px]">Manager on Duty</th>
                  <th className="p-3 text-left">Coaches</th>
                  <th className="p-3 text-right w-[100px]">Classes</th>
                </tr>
              </thead>
              <tbody>
                {slots.map((slot) => {
                  const isOpenClose = isOpeningClosingSlot(slot, branch);
                  if (isOpenClose) {
                    return (
                      <tr key={slot} className="border-b bg-blue-50">
                        <td className="p-3 font-bold text-xs text-slate-900">{slot}</td>
                        <td colSpan={3} className="p-3 text-center">
                          <span className="inline-flex items-center gap-2 bg-blue-600 text-white text-xs font-black px-4 py-1.5 rounded-full uppercase tracking-widest">
                            All Staff — Executive
                          </span>
                        </td>
                      </tr>
                    );
                  }
                  const mgr = managerForSlot(slot);
                  const coaches = coachNamesForSlot(slot);
                  const count = countClassesForSlot(schedule.selections, day, slot, branch);
                  return (
                    <tr key={slot} className="border-b hover:bg-slate-50">
                      <td className="p-3 font-bold text-xs text-slate-900">{slot}</td>
                      <td className="p-3">
                        {mgr ? (
                          <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${getStaffColorByIndex(mgr, allNames)}`}>
                            {mgr}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1.5">
                          {coaches.length === 0 ? (
                            <span className="text-slate-300 text-xs">—</span>
                          ) : (
                            coaches.map((name) => (
                              <span
                                key={name}
                                className={`inline-block px-2 py-1 rounded text-xs font-bold ${getStaffColorByIndex(name, allNames)}`}
                              >
                                {name}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-right text-sm font-black text-slate-800">{count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white p-4 rounded-2xl border border-slate-200 text-right">
        <span className="text-sm font-black uppercase tracking-widest text-slate-800">
          Week total: {weekTotal} class{weekTotal === 1 ? "" : "es"}
        </span>
      </div>
    </div>
  );
}

// Build a stable ordered list of staff names appearing in this schedule's
// selections, so getStaffColorByIndex assigns consistent colours per name.
function useMemoStaffList(selections: SelectionsMap): string[] {
  return useMemo(() => {
    const set = new Set<string>();
    for (const v of Object.values(selections)) {
      if (v && v !== "None") set.add(v);
    }
    return Array.from(set);
  }, [selections]);
}

function EmptyStateCard({
  weekKey,
  branch,
  range,
  isBM,
}: {
  weekKey: WeekKey;
  branch: string;
  range: WeekRange;
  isBM: boolean;
}) {
  const showCTA = isBM && weekKey !== "lastWeek";
  let heading: string;
  let body: string;
  if (weekKey === "lastWeek") {
    heading = "📭 No data recorded";
    body = "No data was recorded for last week.";
  } else if (isBM && weekKey === "nextWeek") {
    heading = "📝 Not planned yet";
    body = "Next week's manpower hasn't been planned. BMs should plan 2 weeks ahead.";
  } else if (isBM && weekKey === "thisWeek") {
    heading = "📝 Not planned yet";
    body = "This week wasn't planned. Plan it now to track attendance.";
  } else {
    heading = "📝 Not planned yet";
    body = `${branch} hasn't planned this week yet.`;
  }

  const ctaHref = `/manpower-schedule/plan-new-week?start=${range.startDate}&end=${range.endDate}`;
  const ctaLabel = weekKey === "nextWeek" ? "Plan Next Week Now →" : "Plan This Week Now →";

  return (
    <div className="flex items-center justify-center py-16">
      <div className="bg-white p-10 rounded-[2rem] shadow-xl border border-slate-100 text-center max-w-md w-full">
        <h2 className="text-2xl font-black text-slate-800 mb-3 uppercase tracking-tight">{heading}</h2>
        <p className="text-slate-600 mb-6">{body}</p>
        {showCTA && (
          <a
            href={ctaHref}
            className="inline-block w-full py-4 bg-green-600 text-white font-black rounded-xl hover:bg-green-700 uppercase tracking-widest transition-colors shadow-md"
          >
            {ctaLabel}
          </a>
        )}
        <p className="mt-4 text-xs text-slate-400 font-bold uppercase tracking-widest">
          {range.startDate} – {range.endDate} (Mon – Sun)
        </p>
      </div>
    </div>
  );
}
