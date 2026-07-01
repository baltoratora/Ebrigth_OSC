"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO, addDays } from "date-fns";
import { useSession } from "next-auth/react";
import Sidebar from "@/app/components/Sidebar";

// --- IMPORT SHARED CONSTANTS ---
import {
  SHARED_EMPLOYEES, ALL_COLUMNS, getColumnsForDay, TRAINING_DAY_HOURS, ALL_BRANCHES,
  getTimeSlotsForDay, isAdminSlot, getStaffColorByIndex,
  getWorkingDaysForBranch, isOpeningClosingSlot,
  isManagerOnDutySlot, isOnlineCoachOnly,
} from "@/lib/manpowerUtils";
import { isBranchManager } from "@/lib/roles";
import { isInTraining } from "@/lib/training";

function nameWithBadge(name: string, training?: { start?: string; end?: string }) {
  const inWindow = isInTraining(training?.start, training?.end);
  if (!inWindow) return name;
  return (
    <span title={`In training: ${training?.start} → ${training?.end}`}>
      {name} 🎓
    </span>
  );
}


// --- HELPER COMPONENT: SUMMARY TABLE ---
const SummaryTable = ({ data, trainingMap = {} }: { data: any[], trainingMap?: Record<string, { start?: string; end?: string }> }) => {
  const formatTime = (d: number) => {
    const h = Math.floor(d);
    const m = Math.round((d - h) * 60);
    return { h: h, m: m.toString().padStart(2, '0') };
  };

  const hasMod = data.some(r => (r.modHrs ?? 0) > 0);

  return (
    <div className="bg-white rounded-xl shadow-md border overflow-hidden mt-8">
        <div className="bg-slate-100 py-4 border-b border-slate-200">
            <h3 className="text-center font-black uppercase tracking-widest text-lg text-slate-800">Archived Hours Summary</h3>
        </div>
        <table className="w-full text-xs border-collapse">
            <thead className="bg-[#2D3F50] text-white">
                <tr>
                    <th className="p-3 text-left w-12 border-r border-slate-600">No.</th>
                    <th className="p-3 text-left border-r border-slate-600">Name</th>
                    <th className="p-3 text-center border-r border-slate-600">Class (Coach)</th>
                    {hasMod && <th className="p-3 text-center border-r border-slate-600">MOD Hrs</th>}
                    <th className="p-3 text-center border-r border-slate-600">Executive</th>
                    <th className="p-3 text-center">Total (hrs:min)</th>
                </tr>
            </thead>
            <tbody className="divide-y text-sm">
                {data.map((row, index) => {
                    const c = formatTime(row.coachHrs);
                    const mod = formatTime(row.modHrs ?? 0);
                    const e = formatTime(row.execHrs);
                    const t = formatTime(row.total);
                    return (
                        <tr key={row.name} className="hover:bg-slate-50 transition-colors">
                            <td className="p-4 text-center border-r font-bold text-slate-500">{index + 1}</td>
                            <td className="p-4 font-bold border-r text-slate-800">{nameWithBadge(row.name, trainingMap[row.name])}</td>
                            <td className="p-4 text-center border-r">
                                <span className="inline-flex items-baseline gap-1 border border-slate-200 bg-white px-2 py-1 rounded">
                                    <span className="font-bold">{c.h}</span> <span className="text-[10px] text-slate-400">HRS</span>
                                    <span className="font-bold">{c.m}</span> <span className="text-[10px] text-slate-400">MIN</span>
                                </span>
                            </td>
                            {hasMod && (
                                <td className="p-4 text-center border-r">
                                    <span className="inline-flex items-baseline gap-1 border border-amber-200 bg-amber-50 px-2 py-1 rounded">
                                        <span className="font-bold text-amber-700">{mod.h}</span> <span className="text-[10px] text-amber-400">HRS</span>
                                        <span className="font-bold text-amber-700">{mod.m}</span> <span className="text-[10px] text-amber-400">MIN</span>
                                    </span>
                                </td>
                            )}
                            <td className="p-4 text-center border-r">
                                <span className="inline-flex items-baseline gap-1 border border-slate-200 bg-white px-2 py-1 rounded">
                                    <span className="font-bold">{e.h}</span> <span className="text-[10px] text-slate-400">HRS</span>
                                    <span className="font-bold">{e.m}</span> <span className="text-[10px] text-slate-400">MIN</span>
                                </span>
                            </td>
                            <td className="p-4 text-center">
                                <span className="inline-flex items-baseline gap-1 border border-blue-200 px-2 py-1 rounded bg-blue-50">
                                    <span className="font-bold text-blue-700">{t.h}</span> <span className="text-[10px] text-blue-400">HRS</span>
                                    <span className="font-bold text-blue-700">{t.m}</span> <span className="text-[10px] text-blue-400">MIN</span>
                                </span>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
            {data.length > 0 && (() => {
                const totCoach = data.reduce((s, r) => s + r.coachHrs, 0);
                const totMod   = data.reduce((s, r) => s + (r.modHrs ?? 0), 0);
                const totExec  = data.reduce((s, r) => s + r.execHrs, 0);
                const totTotal = data.reduce((s, r) => s + r.total, 0);
                const tc = formatTime(totCoach);
                const tm = formatTime(totMod);
                const te = formatTime(totExec);
                const tt = formatTime(totTotal);
                return (
                    <tfoot>
                        <tr className="bg-[#2D3F50] text-white text-xs font-black uppercase tracking-wider">
                            <td colSpan={2} className="p-3 text-right border-r border-slate-600">Total</td>
                            <td className="p-3 text-center border-r border-slate-600">
                                <span className="inline-flex items-baseline gap-1">
                                    <span>{tc.h}</span> <span className="text-[10px] opacity-70">HRS</span>
                                    <span>{tc.m}</span> <span className="text-[10px] opacity-70">MIN</span>
                                </span>
                            </td>
                            {hasMod && (
                                <td className="p-3 text-center border-r border-slate-600">
                                    <span className="inline-flex items-baseline gap-1">
                                        <span>{tm.h}</span> <span className="text-[10px] opacity-70">HRS</span>
                                        <span>{tm.m}</span> <span className="text-[10px] opacity-70">MIN</span>
                                    </span>
                                </td>
                            )}
                            <td className="p-3 text-center border-r border-slate-600">
                                <span className="inline-flex items-baseline gap-1">
                                    <span>{te.h}</span> <span className="text-[10px] opacity-70">HRS</span>
                                    <span>{te.m}</span> <span className="text-[10px] opacity-70">MIN</span>
                                </span>
                            </td>
                            <td className="p-3 text-center">
                                <span className="inline-flex items-baseline gap-1">
                                    <span>{tt.h}</span> <span className="text-[10px] opacity-70">HRS</span>
                                    <span>{tt.m}</span> <span className="text-[10px] opacity-70">MIN</span>
                                </span>
                            </td>
                        </tr>
                    </tfoot>
                );
            })()}
        </table>
    </div>
  );
};

export default function ArchiveSchedulePage() {
  const router = useRouter();
  const { data: session } = useSession();
  
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [selectedDay, setSelectedDay] = useState<string>("");
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [branchStaffData, setBranchStaffData] = useState<Record<string, string[]>>({});
  const [branchManagerData, setBranchManagerData] = useState<Record<string, string[]>>({});
  const [trainingMap, setTrainingMap] = useState<Record<string, { start?: string; end?: string }>>({});
  const [employeeIdMap, setEmployeeIdMap] = useState<Record<string, string>>({});
  const [homeBranchMap, setHomeBranchMap] = useState<Record<string, string>>({});

  // --- FILTER STATES ---
  const [filterBranch, setFilterBranch] = useState<string>("");
  const [drillYear, setDrillYear] = useState<string | null>(null);
  const [drillMonth, setDrillMonth] = useState<number | null>(null);

  // --- FETCH DATA FROM POSTGRESQL ---
  useEffect(() => {
    const fetchSchedules = async () => {
      try {
        const res = await fetch('/api/schedules');
        const data = await res.json();
        if (data.success) setHistory(data.schedules);
      } catch (err) {
        console.error("Failed to load schedules", err);
      } finally {
        setIsLoading(false);
      }
    };
    const fetchStaff = async () => {
      const res = await fetch('/api/branch-staff?include=all');
      const staffList = await res.json();
      if (!Array.isArray(staffList)) return;
      const grouped: Record<string, string[]> = {};
      const managers: Record<string, string[]> = {};
      const tmap: Record<string, { start?: string; end?: string }> = {};
      const idmap: Record<string, string> = {};
      const hmap: Record<string, string> = {};
      staffList.forEach((s: any) => {
        if (!s.branch) return;
        if (!grouped[s.branch]) grouped[s.branch] = [];
        grouped[s.branch].push(s.name);
        hmap[s.name] = s.branch;
        if (s.role && s.role.startsWith('branch_manager')) {
          if (!managers[s.branch]) managers[s.branch] = [];
          managers[s.branch].push(s.name);
        }
        if (s.trainingStartDate || s.trainingEndDate) {
          tmap[s.name] = { start: s.trainingStartDate ?? undefined, end: s.trainingEndDate ?? undefined };
        }
        if (s.employeeId) {
          idmap[s.name] = s.employeeId;
        }
      });
      setBranchStaffData(grouped);
      setBranchManagerData(managers);
      setTrainingMap(tmap);
      setEmployeeIdMap(idmap);
      setHomeBranchMap(hmap);
    };
    fetchSchedules();
    fetchStaff();
  }, []);

  // Safely extract user info
  const userRole = (session?.user as any)?.role || "USER";
  const userBranch = (session?.user as any)?.branchName;

  // --- DATE FORMATTING HELPERS ---
  const formatDateString = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      return format(parseISO(dateStr), "dd MMM yyyy");
    } catch (e) {
      return dateStr;
    }
  };

  const getDateForDay = (dayName: string, startDateStr: string) => {
    if (!startDateStr) return "";
    try {
      const start = parseISO(startDateStr);
      for (let i = 0; i < 7; i++) {
        const currentDate = addDays(start, i);
        if (format(currentDate, "EEEE").toLowerCase() === dayName.toLowerCase()) {
          return format(currentDate, "dd MMM yyyy");
        }
      }
    } catch (error) {
      return "";
    }
    return "";
  };

  // --- APPLY FILTERS & ROLE SECURITY TO THE LIST ---
  const filteredHistory = useMemo(() => {
    return history.filter((record: any) => {
      if (isBranchManager(userRole) && record.branch !== userBranch) return false;
      if (filterBranch && record.branch !== filterBranch) return false;
      return true;
    });
  }, [history, filterBranch, userRole, userBranch]);

  // --- BULLETPROOF DATA SYNC ---
  const allKnownNames = useMemo(() => {
    return new Set([...SHARED_EMPLOYEES, ...Object.values(branchStaffData).flat()]);
  }, [branchStaffData]);

  const validData = useMemo<Record<string, string>>(() => {
    if (!selectedRecord) return {};
    const raw: Record<string, string> = selectedRecord.selections && Object.keys(selectedRecord.selections).length > 0
      ? selectedRecord.selections
      : selectedRecord.originalSelections || {};
    // Strip stale names (e.g. "ISHINI" saved before a nickname change) so they
    // don't appear in the grid or the hours summary.
    return Object.fromEntries(
      Object.entries(raw).filter(([, v]) => !v || v === "None" || allKnownNames.has(v as string))
    );
  }, [selectedRecord, allKnownNames]);


  const calculateHoursForData = () => {
    if (!selectedRecord) return [];
    
    const managerNames = new Set(Object.values(branchManagerData).flat());
    const allBranchStaff = (branchStaffData[selectedRecord.branch] || []).filter(n => !managerNames.has(n));
    const selectedInTable = (Object.values(validData).filter(val => val !== "" && val !== "None") as string[])
      .filter(n => !managerNames.has(n));
    const uniqueEmployeesToTrack: string[] = Array.from(new Set([...allBranchStaff, ...selectedInTable]));

    const staffStats: Record<string, { coachHrs: number; modHrs: number; execHrs: number; total: number }> = {};
    uniqueEmployeesToTrack.forEach((emp: string) => { staffStats[emp] = { coachHrs: 0, modHrs: 0, execHrs: 0, total: 0 }; });

    getWorkingDaysForBranch(selectedRecord.branch).forEach((day) => {
      const isWeekend = day === "Saturday" || day === "Sunday";
      const dailyTarget = isWeekend ? 10.5 : 5.0;

      uniqueEmployeesToTrack.forEach((emp: string) => {
        let coachingHoursForDay = 0;
        let trainingSlotHoursForDay = 0;
        let workedThatDay = false;
        let inTrainingThatDay = false;
        let managerSlotsForDay = 0;

        getTimeSlotsForDay(day, selectedRecord.branch).forEach((slot: string) => {
          if (isOpeningClosingSlot(slot, selectedRecord.branch)) return;
          const isAdmin = isAdminSlot(slot, selectedRecord.branch);

          // Check MANAGER column — counts for non-BM replacement managers.
          if (validData[`${day}-${slot}-MANAGER`] === emp) {
            workedThatDay = true;
            if (!isAdmin) managerSlotsForDay++;
          }

          ALL_COLUMNS.forEach((col) => {
            if (validData[`${day}-${slot}-${col.id}`] !== emp) return;
            workedThatDay = true;
            const slotDuration = isAdmin ? 0.25 : 1.25;
            // A training assignment makes the whole day a flat training day
            // (TRAINING_DAY_HOURS) — handled below.
            if (col.type === "training") {
              inTrainingThatDay = true;
              trainingSlotHoursForDay += slotDuration;
              return;
            }
            if (col.type === "coach") coachingHoursForDay += slotDuration;
          });
        });

        if (!workedThatDay) return;

        // Non-BM replacement in MANAGER column: MOD slot hours go to modHrs;
        // remaining time up to the daily target counts as exec hrs.
        if (managerSlotsForDay > 0) {
          const mHrs = Math.min(managerSlotsForDay * 1.25, dailyTarget);
          staffStats[emp].modHrs += mHrs;
          staffStats[emp].execHrs += Math.max(0, dailyTarget - mHrs);
          staffStats[emp].total = staffStats[emp].coachHrs + staffStats[emp].modHrs + staffStats[emp].execHrs;
          return;
        }

        if (inTrainingThatDay) {
          // Training day: a flat TRAINING_DAY_HOURS day, shown as slot hours
          // (coach) plus the remainder (exec) — the same split the manpower
          // cost report shows, where the day is paid at the flat training rate.
          const dayCoachHrs = coachingHoursForDay + trainingSlotHoursForDay;
          staffStats[emp].coachHrs += dayCoachHrs;
          staffStats[emp].execHrs += Math.max(0, TRAINING_DAY_HOURS - dayCoachHrs);
          staffStats[emp].total = staffStats[emp].coachHrs + staffStats[emp].modHrs + staffStats[emp].execHrs;
          return;
        }

        // Online coaches (home branch = Online) have no exec hours —
        // coaching hours only. Keyed on the coach's HOME branch, not this
        // schedule's branch: when an online coach covers another branch they
        // still hold the class online, so the rule follows them there.
        // Day-aware for Pooja (physical-style on Saturdays only).
        const coachOnly = isOnlineCoachOnly(homeBranchMap[emp] ?? selectedRecord.branch, employeeIdMap[emp], day);
        staffStats[emp].coachHrs += coachingHoursForDay;
        if (!coachOnly) {
          staffStats[emp].execHrs += Math.max(0, dailyTarget - coachingHoursForDay);
        }
        staffStats[emp].total = staffStats[emp].coachHrs + staffStats[emp].execHrs;
      });
    });
    
    return Object.entries(staffStats).map(([name, stats]) => ({ name, ...stats }));
  };

  // --- RECORD DETAIL VIEW ---
  if (selectedRecord) {
    const displayNotes = selectedRecord.notes || selectedRecord.originalNotes || {};

    return (
      <div className="flex h-screen bg-slate-50 text-slate-800 overflow-hidden">
        <Sidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen(p => !p)} />
        
        <main className="flex-1 h-screen flex flex-col overflow-hidden" style={{ zoom: 0.9 }}>
          
          <div className="shrink-0 w-full mx-auto px-4 md:px-6 pt-4 md:pt-6 z-50 bg-slate-50">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex justify-between items-center gap-6 mb-6">
              <div className="flex items-center gap-6">
                
                <button
                  onClick={() => setSelectedRecord(null)}
                  className="bg-slate-200 text-slate-700 hover:bg-slate-300 px-6 py-3 rounded-xl font-bold uppercase transition-colors flex items-center gap-2 shadow-sm"
                >
                  ← Back to List
                </button>
                <div className="h-8 w-px bg-slate-300"></div>
                <h1 className="text-lg font-black uppercase tracking-wide text-slate-800 leading-none m-0 flex items-center gap-4">
                  <span>Archived: {selectedRecord.branch}</span>
                  {selectedRecord.startDate && selectedRecord.endDate && (
                    <span className="text-sm bg-slate-100 text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg font-bold tracking-widest uppercase">
                      {formatDateString(selectedRecord.startDate)} - {formatDateString(selectedRecord.endDate)}
                    </span>
                  )}
                </h1>
              </div>
              <div className="bg-yellow-400 text-yellow-900 px-4 py-2 text-xs font-black rounded-lg uppercase tracking-widest shadow-sm">
                🔒 Read Only Record
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto w-full mx-auto px-4 md:px-6 pb-20">
            <div className="space-y-6">

              {/* DAY TAB BUTTONS */}
              <div className="flex gap-2 flex-wrap">
                {getWorkingDaysForBranch(selectedRecord.branch).map((day) => {
                  const isActive = selectedDay === day;
                  const validData = selectedRecord.selections || {};
                  const hasData = Object.keys(validData).some(k => k.startsWith(`${day}-`));
                  return (
                    <button key={day} onClick={() => setSelectedDay(day)}
                      className={`relative px-6 py-3 rounded-xl font-black uppercase text-sm tracking-wide transition-all shadow-sm ${
                        isActive ? "bg-[#2D3F50] text-white shadow-lg scale-105"
                        : hasData ? "bg-slate-100 text-slate-700 border-2 border-slate-400 hover:bg-slate-200"
                        : "bg-white text-slate-400 border-2 border-slate-200 hover:bg-slate-50"
                      }`}>
                      {day.slice(0, 3)}
                      {hasData && <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${isActive ? "bg-green-400" : "bg-slate-500"}`} />}
                    </button>
                  );
                })}
              </div>

              {selectedDay && (() => {
                const day = selectedDay;
                const slots = getTimeSlotsForDay(day, selectedRecord.branch);
                const dayColumns = getColumnsForDay(day, selectedRecord.branch);
                const branchStaff = Array.from(new Set([...SHARED_EMPLOYEES, ...(branchStaffData[selectedRecord.branch] || [])]));
                return (
                  <div key={day} className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
                    <div className="bg-slate-500 p-3 border-b flex flex-col items-center justify-center">
                        <h2 className="text-lg font-black text-white uppercase tracking-widest text-center m-0 leading-none">{day}</h2>
                        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-1">
                          {getDateForDay(day, selectedRecord.startDate)}
                        </span>
                    </div>

                    <div className="overflow-x-auto relative">
                        <table className="w-full border-collapse text-xs" style={{ minWidth: '2100px' }}>
                        <thead>
                            <tr className="bg-slate-700 text-white uppercase tracking-widest">
                                <th className="p-3 border-r border-slate-600 text-left w-[180px] sticky left-0 z-20 bg-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)]">Slot</th>
                                <th className="p-3 border-r border-slate-600 text-center w-[180px] bg-slate-700 border-b-4 border-b-emerald-400">Manager on Duty</th>
                                {dayColumns.map(c => (
                                    <th key={c.id} className={`p-3 border-r border-slate-600 text-center w-[150px] ${c.type === 'exec' ? 'bg-slate-800' : c.type === 'training' ? 'bg-yellow-600' : ''}`}>
                                        {c.label}
                                    </th>
                                ))}
                                <th className="p-3 border-slate-600 text-left w-[250px]">Notes</th>
                            </tr>
                        </thead>
                        <tbody>
                            {slots.map((slot, slotIndex) => {
                              const isOpenClose = isOpeningClosingSlot(slot, selectedRecord.branch);
                              // --- KEY FIX: check if manager dropdown applies per slot ---
                              const showManager = isManagerOnDutySlot(slot, selectedRecord.branch, day);
                              
                              // Support both old format (notes[day-MANAGER]) and new format (selections[day-slot-MANAGER])
                              const managerName =
                                validData[`${day}-${slot}-MANAGER`] ||           // new format (post-fix)
                                displayNotes[`${day}-MANAGER`] ||                 // old format (pre-fix, legacy records)
                                "";

                              return (
                                <tr key={slot} className={`group ${isOpenClose ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                                  <td className={`p-3 border-r border-b border-slate-200 font-bold text-slate-900 sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] transition-colors ${isOpenClose ? 'bg-blue-100' : 'bg-slate-50 group-hover:bg-slate-100'}`}>
                                      {slot}
                                  </td>

                                  {/* ---- MANAGER ON DUTY CELL (fixed: no rowSpan, per-slot logic) ---- */}
                                  {!isOpenClose && (
                                    <td className="p-2 border-r border-b border-slate-200 text-center font-bold bg-emerald-50 w-[180px]">
                                      {showManager ? (
                                        // Show manager name for slots where manager is on duty
                                        managerName ? (
                                          <span className={`inline-block w-full px-2 py-1.5 rounded text-xs font-bold ${getStaffColorByIndex(managerName, branchStaff)}`}>
                                            {nameWithBadge(managerName, trainingMap[managerName])}
                                          </span>
                                        ) : (
                                          <span className="text-slate-300 font-bold">-</span>
                                        )
                                      ) : (
                                        // Empty placeholder for slots after manager's shift (e.g. 08:30PM onwards)
                                        <div className="w-full h-[28px] rounded bg-emerald-100/50 border border-dashed border-emerald-200 flex items-center justify-center">
                                          <span className="text-[9px] text-emerald-300 font-bold uppercase tracking-wider">—</span>
                                        </div>
                                      )}
                                    </td>
                                  )}

                                  {isOpenClose ? (
                                    <td colSpan={dayColumns.length + 1} className="p-3 border-b border-slate-200 text-center">
                                      <span className="text-xs font-black text-blue-600 uppercase tracking-widest">All Staff — Executive ({slotIndex === 0 ? "Opening" : "Closing"})</span>
                                    </td>
                                  ) : (
                                    <>
                                      {dayColumns.map(col => {
                                        const name = validData[`${day}-${slot}-${col.id}`];
                                        const displayValue = name && name !== "None" ? name : "-";
                                        const bgColor = name && name !== "None" ? getStaffColorByIndex(name, branchStaff) : (col.type === 'exec' ? 'bg-slate-50 text-slate-300' : col.type === 'training' ? 'bg-yellow-50 text-slate-300' : 'bg-white text-slate-300');
                                        return (
                                            <td key={col.id} className={`p-3 border-r border-b border-slate-200 text-center font-bold transition-colors ${bgColor}`}>
                                                {displayValue !== "-" ? nameWithBadge(displayValue, trainingMap[displayValue]) : displayValue}
                                            </td>
                                        );
                                      })}
                                      <td className="p-3 border-b border-slate-200 text-slate-500 italic bg-white max-w-xs truncate">
                                          {displayNotes[`${day}-${slot}-notes`] || "-"}
                                      </td>
                                    </>
                                  )}
                                </tr>
                              );
                            })}
                        </tbody>
                        </table>
                    </div>
                  </div>
                );
              })()}

              <SummaryTable data={calculateHoursForData()} trainingMap={trainingMap} />
            </div>
          </div>
        </main>
      </div>
    );
  }

  // --- LIST VIEW ---
  return (
    <>
      <div className="flex h-screen bg-slate-50 overflow-hidden">
          <Sidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen(p => !p)} />
          
          <main className="flex-1 h-screen flex flex-col overflow-hidden" style={{ zoom: 0.9 }}>
              
              <div className="shrink-0 w-full mx-auto px-4 md:px-6 pt-4 md:pt-6 z-50 bg-slate-50">
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4 mb-6">
                    

                    <button
                      onClick={() => router.push('/manpower-schedule')}
                      className="bg-blue-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-md hover:bg-blue-600 transition-colors"
                    >
                      <span className="text-xl">👥</span>
                      <span className="text-base font-black uppercase tracking-wide leading-none">HRMS</span>
                    </button>
                    
                    <div className="h-8 w-px bg-slate-300"></div>
                    
                    <h1 className="text-lg font-black uppercase tracking-wide text-slate-800 leading-none m-0">
                      Archive Overview
                    </h1>
                  </div>

                  {/* FILTER CONTROLS */}
                  {!isBranchManager(userRole) && (
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-6">
                      <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Branch</label>
                      <select value={filterBranch} onChange={(e) => { setFilterBranch(e.target.value); setDrillYear(null); setDrillMonth(null); }}
                        className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 font-bold text-slate-700 outline-none focus:border-blue-500 transition-colors">
                        <option value="">All Branches</option>
                        {ALL_BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                  )}
              </div>

              {/* RECORD LIST AREA */}
              <div className="flex-1 overflow-y-auto w-full mx-auto px-4 md:px-6 pb-12">
                  {isLoading ? (
                    <div className="flex justify-center items-center h-40">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                    </div>
                  ) : (() => {
                    const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
                    const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                    // Derive week rows from actual planned schedules instead of fixed calendar ranges
                    const distinctWeeks = Array.from(new Set(
                      (drillYear !== null && drillMonth !== null
                        ? filteredHistory.filter((r: any) =>
                            format(parseISO(r.startDate), "yyyy") === drillYear &&
                            parseInt(format(parseISO(r.startDate), "M")) - 1 === drillMonth
                          )
                        : []
                      ).map((r: any) => r.startDate)
                    ))
                      .sort()
                      .map(startDate => {
                        const rec = filteredHistory.find((r: any) => r.startDate === startDate);
                        return {
                          startDate,
                          endDate: rec?.endDate ?? startDate,
                          label: `${format(parseISO(startDate as string), "dd MMM")} – ${format(parseISO(rec?.endDate ?? startDate as string), "dd MMM")}`,
                        };
                      });
                    const byYear: Record<string, any[]> = {};
                    filteredHistory.forEach((r: any) => {
                      const y = format(parseISO(r.startDate), "yyyy");
                      if (!byYear[y]) byYear[y] = [];
                      byYear[y].push(r);
                    });

                    if (drillYear !== null && drillMonth !== null) {
                      const monthRecs = filteredHistory.filter((r: any) =>
                        format(parseISO(r.startDate), "yyyy") === drillYear &&
                        parseInt(format(parseISO(r.startDate), "M")) - 1 === drillMonth
                      );
                      return (
                        <div>
                          <div className="flex items-center gap-3 mb-5">
                            <button onClick={() => setDrillMonth(null)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-black transition-colors shadow-sm">← Back</button>
                            <h2 className="text-lg font-black uppercase tracking-widest text-slate-800">{drillYear} <span className="text-slate-400">›</span> {MONTH_NAMES[drillMonth]}</h2>
                          </div>
                          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            {distinctWeeks.map((week, wi) => {
                              const weekRecs = monthRecs.filter((r: any) => r.startDate === week.startDate);
                              return (
                                <div key={week.startDate} className={`flex gap-4 items-start px-5 py-4 ${wi < distinctWeeks.length - 1 ? "border-b border-slate-100" : ""}`}>
                                  <div className="w-28 shrink-0 text-xs font-black text-slate-400 pt-2">{week.label}</div>
                                  <div className="flex flex-wrap gap-2 flex-1">
                                    {weekRecs.length > 0 ? weekRecs.map((record: any) => (
                                      <button key={record.id}
                                        onClick={() => { setSelectedRecord(record); const days = getWorkingDaysForBranch(record.branch); if (days.length > 0) setSelectedDay(days[0]); }}
                                        className="text-left bg-blue-50 hover:bg-blue-100 border border-blue-200 hover:border-blue-300 rounded-xl px-4 py-3 transition-colors min-w-[160px]">
                                        <div className="font-black text-sm text-blue-800 uppercase tracking-wide">{record.branch}</div>
                                        <div className="text-xs text-blue-500 font-bold mt-0.5">
                                          {format(parseISO(record.startDate), "dd MMM")} – {format(parseISO(record.endDate), "dd MMM")}
                                        </div>
                                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full mt-1 inline-block ${record.status === "Finalized" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                                          {record.status}
                                        </span>
                                      </button>
                                    )) : <span className="text-slate-200 text-sm font-bold pt-1">—</span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }

                    if (Object.keys(byYear).length === 0) {
                      return (
                        <div className="bg-white p-12 rounded-3xl border-2 border-dashed border-slate-300 text-center shadow-sm">
                          <p className="text-slate-500 font-bold text-lg uppercase tracking-widest">No archived records found.</p>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-4">
                        {Object.keys(byYear).sort((a, b) => parseInt(b) - parseInt(a)).map(year => {
                          const recs = byYear[year];
                          const monthCounts: Record<number, number> = {};
                          recs.forEach((r: any) => {
                            const mi = parseInt(format(parseISO(r.startDate), "M")) - 1;
                            monthCounts[mi] = (monthCounts[mi] || 0) + 1;
                          });
                          return (
                            <div key={year} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                              <div className="bg-[#2D3F50] px-6 py-3">
                                <h2 className="text-white font-black text-xl uppercase tracking-widest">{year}</h2>
                              </div>
                              <div className="p-4 grid grid-cols-6 gap-2">
                                {[0,1,2,3,4,5,6,7,8,9,10,11].map(mi => {
                                  const count = monthCounts[mi] || 0;
                                  const hasRecords = count > 0;
                                  return (
                                    <button key={mi}
                                      onClick={() => { if (hasRecords) { setDrillYear(year); setDrillMonth(mi); } }}
                                      disabled={!hasRecords}
                                      className={`rounded-xl py-3 px-2 text-center transition-colors ${hasRecords ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer shadow-sm" : "bg-slate-100 text-slate-300 cursor-not-allowed"}`}
                                    >
                                      <div className="font-black text-sm">{MONTH_SHORT[mi]}</div>
                                      {hasRecords && <div className="text-[10px] mt-0.5 opacity-80">{count}</div>}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
              </div>
          </main>
      </div>

    </>
  );
}
