"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO, addDays, startOfWeek, endOfWeek } from "date-fns"; 
import { DateRange, RangeKeyDict } from "react-date-range"; 
import { useSession } from "next-auth/react";
import "react-date-range/dist/styles.css"; 
import "react-date-range/dist/theme/default.css"; 
import Sidebar from "@/app/components/Sidebar";

// --- IMPORT SHARED CONSTANTS ---
import {
  COLUMNS, ALL_BRANCHES,
  getTimeSlotsForDay, isAdminSlot, getEmployeeColor,
  getWorkingDaysForBranch, isOpeningClosingSlot,
  isManagerOnDutySlot, // <-- NEW IMPORT
} from "@/lib/manpowerUtils";


// --- HELPER COMPONENT: SUMMARY TABLE ---
const SummaryTable = ({ data }: { data: any[] }) => {
  const formatTime = (d: number) => {
    const h = Math.floor(d);
    const m = Math.round((d - h) * 60);
    return { h: h, m: m.toString().padStart(2, '0') };
  };

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
                    <th className="p-3 text-center border-r border-slate-600">Executive</th>
                    <th className="p-3 text-center">Total (hrs:min)</th>
                </tr>
            </thead>
            <tbody className="divide-y text-sm">
                {data.map((row, index) => {
                    const c = formatTime(row.coachHrs);
                    const e = formatTime(row.execHrs);
                    const t = formatTime(row.total);
                    return (
                        <tr key={row.name} className="hover:bg-slate-50 transition-colors">
                            <td className="p-4 text-center border-r font-bold text-slate-500">{index + 1}</td>
                            <td className="p-4 font-bold border-r text-slate-800">{row.name}</td>
                            <td className="p-4 text-center border-r">
                                <span className="inline-flex items-baseline gap-1 border border-slate-200 bg-white px-2 py-1 rounded">
                                    <span className="font-bold">{c.h}</span> <span className="text-[10px] text-slate-400">HRS</span>
                                    <span className="font-bold">{c.m}</span> <span className="text-[10px] text-slate-400">MIN</span>
                                </span>
                            </td>
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
        </table>
    </div>
  );
};

export default function ArchiveSchedulePage() {
  const router = useRouter();
  const { data: session } = useSession();
  
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [branchStaffData, setBranchStaffData] = useState<Record<string, string[]>>({});
  const [branchManagerData, setBranchManagerData] = useState<Record<string, string[]>>({});
  
  // --- FILTER STATES ---
  const [filterBranch, setFilterBranch] = useState<string>("");
  const [filterDate, setFilterDate] = useState<string>(""); 
  
  // --- CALENDAR POPOVER STATES ---
  const [showCalendar, setShowCalendar] = useState(false);
  const [shownDate, setShownDate] = useState(new Date());
  const [isDateFiltered, setIsDateFiltered] = useState(false);
  const [range, setRange] = useState([{
    startDate: new Date(),
    endDate: new Date(),
    key: "selection",
  }]);

  // --- FETCH DATA FROM POSTGRESQL ---
  useEffect(() => {
    const fetchSchedules = async () => {
      try {
        const res = await fetch('/api/get-schedules');
        const data = await res.json();
        if (data.success) setHistory(data.schedules);
      } catch (err) {
        console.error("Failed to load schedules", err);
      } finally {
        setIsLoading(false);
      }
    };
    const fetchStaff = async () => {
      const res = await fetch('/api/branch-staff');
      const staffList = await res.json();
      const grouped: Record<string, string[]> = {};
      const managers: Record<string, string[]> = {};
      staffList.forEach((s: any) => {
        if (!grouped[s.branch]) grouped[s.branch] = [];
        grouped[s.branch].push(s.name);
        if (s.role && s.role.startsWith('branch_manager')) {
          if (!managers[s.branch]) managers[s.branch] = [];
          managers[s.branch].push(s.name);
        }
      });
      setBranchStaffData(grouped);
      setBranchManagerData(managers);
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
      // SECURITY FILTER: Branch Managers ONLY see their own branch!
      if (userRole === "BRANCH_MANAGER" && record.branch !== userBranch) {
        return false;
      }
      const matchBranch = filterBranch ? record.branch === filterBranch : true;
      const matchWeek = filterDate ? record.startDate === filterDate : true;
      return matchBranch && matchWeek;
    });
  }, [history, filterBranch, filterDate, userRole, userBranch]);

  // --- BULLETPROOF DATA SYNC ---
  const validData = useMemo(() => {
    if (!selectedRecord) return {};
    if (selectedRecord.selections && Object.keys(selectedRecord.selections).length > 0) {
        return selectedRecord.selections;
    }
    return selectedRecord.originalSelections || {};
  }, [selectedRecord]);


  const calculateHoursForData = () => {
    if (!selectedRecord) return [];
    
    const managerNames = new Set(Object.values(branchManagerData).flat());
    const allBranchStaff = (branchStaffData[selectedRecord.branch] || []).filter(n => !managerNames.has(n));
    const selectedInTable = (Object.values(validData).filter(val => val !== "" && val !== "None") as string[]).filter(n => !managerNames.has(n));
    const uniqueEmployeesToTrack: string[] = Array.from(new Set([...allBranchStaff, ...selectedInTable]));

    const staffStats: Record<string, { coachHrs: number; execHrs: number; total: number }> = {};
    uniqueEmployeesToTrack.forEach((emp: string) => { staffStats[emp] = { coachHrs: 0, execHrs: 0, total: 0 }; });

    getWorkingDaysForBranch(selectedRecord.branch).forEach((day) => {
      const isWeekend = day === "Saturday" || day === "Sunday";
      const dailyTarget = isWeekend ? 10.5 : 5.0;

      uniqueEmployeesToTrack.forEach((emp: string) => {
        let coachingHoursForDay = 0;
        let explicitExecHoursForDay = 0;
        let workedThatDay = false;

        getTimeSlotsForDay(day, selectedRecord.branch).forEach((slot: string) => {
          if (isOpeningClosingSlot(slot, selectedRecord.branch)) return;
          COLUMNS.forEach((col) => {
            if (validData[`${day}-${slot}-${col.id}`] === emp) {
              workedThatDay = true;
              if (col.type === "coach") {
                  const slotDuration = isAdminSlot(slot, selectedRecord.branch) ? 0.25 : 1.25;
                  coachingHoursForDay += slotDuration;
              } else if (col.type === "exec") {
                  const slotDuration = isAdminSlot(slot, selectedRecord.branch) ? 0.25 : 1.25;
                  explicitExecHoursForDay += slotDuration;
              }
            }
          });
        });
        
        if (workedThatDay) {
          staffStats[emp].coachHrs += coachingHoursForDay;
          if (explicitExecHoursForDay > 0) {
             staffStats[emp].execHrs += explicitExecHoursForDay;
          } else {
             staffStats[emp].execHrs += Math.max(0, dailyTarget - coachingHoursForDay);
          }
          staffStats[emp].total = staffStats[emp].coachHrs + staffStats[emp].execHrs;
        }
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
            <div className="space-y-8">
              {getWorkingDaysForBranch(selectedRecord.branch).map((day) => {
                const slots = getTimeSlotsForDay(day, selectedRecord.branch);

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
                                {COLUMNS.map(c => (
                                    <th key={c.id} className={`p-3 border-r border-slate-600 text-center w-[150px] ${c.type === 'exec' ? 'bg-slate-800' : ''}`}>
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
                                          <span className={`inline-block w-full px-2 py-1.5 rounded text-xs font-bold ${getEmployeeColor(managerName)}`}>
                                            {managerName}
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
                                    <td colSpan={COLUMNS.length + 1} className="p-3 border-b border-slate-200 text-center">
                                      <span className="text-xs font-black text-blue-600 uppercase tracking-widest">All Staff — Executive ({slotIndex === 0 ? "Opening" : "Closing"})</span>
                                    </td>
                                  ) : (
                                    <>
                                      {COLUMNS.map(col => {
                                        const name = validData[`${day}-${slot}-${col.id}`];
                                        const displayValue = name && name !== "None" ? name : "-";
                                        const bgColor = name && name !== "None" ? getEmployeeColor(name) : (col.type === 'exec' ? 'bg-slate-50 text-slate-300' : 'bg-white text-slate-300');
                                        return (
                                            <td key={col.id} className={`p-3 border-r border-b border-slate-200 text-center font-bold transition-colors ${bgColor}`}>
                                                {displayValue}
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
              })}

              <SummaryTable data={calculateHoursForData()} />
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
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 mb-6 relative">
                    
                    {userRole !== "BRANCH_MANAGER" && (
                      <div className="flex-1">
                        <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Filter by Branch</label>
                        <select 
                          value={filterBranch} 
                          onChange={(e) => setFilterBranch(e.target.value)} 
                          className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 font-bold text-slate-700 outline-none focus:border-blue-500 transition-colors"
                        >
                          <option value="">All Branches</option>
                          {ALL_BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </div>
                    )}
                    
                    <div className="flex-1">
                      <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Filter by Week</label>
                      <div 
                        onClick={() => setShowCalendar(true)}
                        className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 font-bold text-slate-700 cursor-pointer flex justify-between items-center transition-colors hover:border-blue-500"
                      >
                        <span>
                          {isDateFiltered 
                            ? `${format(range[0].startDate, "dd MMM yyyy")} - ${format(range[0].endDate, "dd MMM yyyy")}` 
                            : "All Weeks"}
                        </span>
                        <span>📅</span>
                      </div>
                    </div>
                    
                    {(filterBranch || isDateFiltered) && (
                      <div className="flex items-end">
                        <button 
                          onClick={() => { 
                            setFilterBranch(""); 
                            setFilterDate(""); 
                            setIsDateFiltered(false);
                          }}
                          className="h-[50px] px-6 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl font-black uppercase tracking-widest text-xs transition-colors"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>
              </div>

              {/* SCROLLING GRID AREA */}
              <div className="flex-1 overflow-y-auto w-full mx-auto px-4 md:px-6 pb-12">
                  {isLoading ? (
                    <div className="flex justify-center items-center h-40">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                    </div>
                  ) : filteredHistory.length === 0 ? (
                      <div className="bg-white p-12 rounded-3xl border-2 border-dashed border-slate-300 text-center shadow-sm">
                          <p className="text-slate-500 font-bold text-lg uppercase tracking-widest">No archived records found matching filters.</p>
                      </div>
                  ) : (() => {
                      const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                      const WEEK_LABELS = ["1 – 7","8 – 14","15 – 21","22 – 31"];
                      const getWeekBucket = (dateStr: string) => {
                        const d = parseInt(format(parseISO(dateStr), "d"));
                        if (d <= 7) return 0; if (d <= 14) return 1; if (d <= 21) return 2; return 3;
                      };
                      const byYear: Record<string, any[]> = {};
                      filteredHistory.forEach(r => {
                        const y = format(parseISO(r.startDate), "yyyy");
                        if (!byYear[y]) byYear[y] = [];
                        byYear[y].push(r);
                      });
                      return Object.keys(byYear).sort((a,b) => parseInt(b)-parseInt(a)).map(year => {
                        const recs = byYear[year];
                        const monthIdxs = Array.from(new Set(recs.map(r => parseInt(format(parseISO(r.startDate),"M"))-1))).sort((a,b)=>a-b);
                        const buckets = Array.from(new Set(recs.map(r => getWeekBucket(r.startDate)))).sort();
                        const lookup: Record<string,any[]> = {};
                        recs.forEach(r => {
                          const k = `${parseInt(format(parseISO(r.startDate),"M"))-1}-${getWeekBucket(r.startDate)}`;
                          if (!lookup[k]) lookup[k] = [];
                          lookup[k].push(r);
                        });
                        return (
                          <div key={year} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
                            <div className="bg-[#2D3F50] px-6 py-3">
                              <h2 className="text-white font-black text-xl uppercase tracking-widest">{year}</h2>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full border-collapse">
                                <thead>
                                  <tr className="bg-slate-100">
                                    <th className="p-3 text-xs font-black uppercase text-slate-400 border-b border-r border-slate-200 w-20"></th>
                                    {monthIdxs.map(mi => (
                                      <th key={mi} className="p-3 text-xs font-black uppercase text-slate-600 border-b border-r border-slate-200 text-center min-w-[140px]">
                                        {MONTH_NAMES[mi]}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {buckets.map(bucket => (
                                    <tr key={bucket} className="border-b border-slate-100">
                                      <td className="p-3 text-xs font-black text-slate-400 border-r border-slate-200 text-center whitespace-nowrap bg-slate-50">
                                        {WEEK_LABELS[bucket]}
                                      </td>
                                      {monthIdxs.map(mi => {
                                        const cellRecs = lookup[`${mi}-${bucket}`] || [];
                                        return (
                                          <td key={mi} className="p-2 border-r border-slate-200 align-top">
                                            {cellRecs.length > 0 ? (
                                              <div className="flex flex-col gap-1">
                                                {cellRecs.map(record => (
                                                  <button key={record.id} onClick={() => setSelectedRecord(record)}
                                                    className="w-full text-left px-3 py-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors">
                                                    <div className="font-black text-xs text-blue-800 uppercase">{record.branch}</div>
                                                    <div className="text-[10px] text-blue-500 font-bold mt-0.5">
                                                      {format(parseISO(record.startDate),"dd MMM")} – {format(parseISO(record.endDate),"dd MMM")}
                                                    </div>
                                                  </button>
                                                ))}
                                              </div>
                                            ) : <span className="text-slate-200 text-xs flex justify-center">—</span>}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      });
                  })()}
              </div>
          </main>
      </div>

      {/* --- CENTERED MODAL FOR CALENDAR --- */}
      {showCalendar && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white p-6 rounded-[2rem] shadow-2xl border border-slate-100 flex flex-col max-w-md w-full relative">
            <h2 className="text-xl font-black text-slate-800 mb-4 uppercase tracking-tight text-center">Select a Week</h2>
            
            <div className="flex justify-center w-full overflow-hidden mb-4">
              <DateRange
                onChange={(item: RangeKeyDict) => {
                  const selection = item.selection;
                  if (selection.startDate) {
                    const start = startOfWeek(selection.startDate, { weekStartsOn: 1 });
                    const end = endOfWeek(selection.startDate, { weekStartsOn: 1 });
                    setRange([{ startDate: start, endDate: end, key: "selection" }]);
                    setIsDateFiltered(true);
                    setFilterDate(format(start, "yyyy-MM-dd")); 
                    setTimeout(() => setShowCalendar(false), 250);
                  }
                }}
                shownDate={shownDate}
                onShownDateChange={(date) => setShownDate(date)}
                moveRangeOnFirstSelection={true}
                ranges={range}
                rangeColors={["#3b82f6"]}
                months={1}
                direction="horizontal"
                dateDisplayFormat="dd MMM yyyy"
                className="border-none"
              />
            </div>

            <button 
              onClick={() => setShowCalendar(false)} 
              className="w-full py-4 bg-slate-200 text-slate-700 font-black rounded-xl hover:bg-slate-300 uppercase tracking-widest text-sm transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
