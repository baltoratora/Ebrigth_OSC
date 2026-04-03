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
  SHARED_EMPLOYEES, ALL_BRANCHES,
  COLUMNS,
  getTimeSlotsForDay, isAdminSlot, getEmployeeColor,
  getWorkingDaysForBranch, isOpeningClosingSlot,
  isManagerOnDutySlot, // <-- NEW IMPORT
} from "@/lib/manpowerUtils";

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

// --- HELPER COMPONENT: DETAILED SUMMARY TABLE ---
const SummaryTable = ({ title, data, theme = "blue" }: { title: string, data: any[], theme?: "blue" | "orange" }) => {
  const formatTime = (d: number) => {
    const h = Math.floor(d);
    const m = Math.round((d - h) * 60);
    return { h: h, m: m.toString().padStart(2, '0') };
  };

  return (
    <div className={`overflow-hidden rounded-xl border ${theme === "orange" ? "border-orange-200" : "border-slate-200"} bg-white shadow-md w-full flex-1`}>
      <header className={`border-b px-2 py-1.5 text-center ${theme === "orange" ? "bg-orange-600 text-white" : "bg-[#2D3F50] text-white"}`}>
        <h3 className="text-[10px] font-black uppercase tracking-widest">{title}</h3>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-[8px] border-collapse">
          <thead className="bg-slate-100 text-slate-600 border-b">
            <tr>
              <th className="p-1.5 border-r text-left w-6">No.</th>
              <th className="p-1.5 border-r text-left">Name</th>
              <th className="p-2 border-r text-center">Coach</th>
              <th className="p-2 border-r text-center">Exec</th>
              <th className="p-2 text-center">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((row, index) => {
              const c = formatTime(row.coachHrs);
              const e = formatTime(row.execHrs);
              const t = formatTime(row.total);
              return (
                <tr key={row.name} className="hover:bg-slate-50 transition-colors">
                  <td className="p-1.5 border-r text-center text-slate-400 font-bold">{index + 1}</td>
                  <td className="p-1.5 border-r font-black text-slate-700 truncate">{row.name}</td>
                  <td className="p-1.5 border-r text-center">
                    <span className="bg-slate-50 border rounded px-1 py-0.5 text-slate-600 font-bold">{c.h}h {c.m}m</span>
                  </td>
                  <td className="p-1.5 border-r text-center">
                    <span className="bg-slate-50 border rounded px-1 py-0.5 text-slate-600 font-bold">{e.h}h {e.m}m</span>
                  </td>
                  <td className="p-1.5 text-center">
                    <span className={`rounded-lg px-2 py-0.5 font-black border ${theme === "orange" ? "bg-orange-50 border-orange-200 text-orange-600" : "bg-blue-50 border-blue-200 text-blue-600"}`}>
                      {t.h}:{t.m}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default function UpdateSchedulePage() {
  const router = useRouter();
  const { data: session } = useSession();
  
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [updatedSelections, setUpdatedSelections] = useState<Record<string, string>>({});
  const [updatedNotes, setUpdatedNotes] = useState<Record<string, string>>({});
  const [branchStaffData, setBranchStaffData] = useState<Record<string, string[]>>({});
  const [branchManagerData, setBranchManagerData] = useState<Record<string, string[]>>({});
  const [columnReplacementBranch, setColumnReplacementBranch] = useState<Record<string, string>>({});
  const [managerReplacementBranch, setManagerReplacementBranch] = useState<Record<string, string>>({});
  const [scheduledElsewhere, setScheduledElsewhere] = useState<Record<string, Record<string, Set<string>>>>({});

  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [filterBranch, setFilterBranch] = useState<string>("");
  const [filterDate, setFilterDate] = useState<string>(""); 
  
  const [showCalendar, setShowCalendar] = useState(false);
  const [shownDate, setShownDate] = useState(new Date());
  const [isDateFiltered, setIsDateFiltered] = useState(false);
  const [range, setRange] = useState([{
    startDate: new Date(),
    endDate: new Date(),
    key: "selection",
  }]);

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

  const userRole = (session?.user as any)?.role || "USER";
  const userBranch = (session?.user as any)?.branchName;

  const filteredHistory = useMemo(() => {
    return history.filter((record: any) => {
      if (userRole === "BRANCH_MANAGER" && record.branch !== userBranch) return false;
      const matchBranch = filterBranch ? record.branch === filterBranch : true;
      const matchWeek = filterDate ? record.startDate === filterDate : true;
      return matchBranch && matchWeek;
    });
  }, [history, filterBranch, filterDate, userRole, userBranch]);

  // Compute which staff are already scheduled at other branches for the same week
  useEffect(() => {
    if (!selectedRecord) return;
    const map: Record<string, Record<string, Set<string>>> = {};
    history.forEach((s: any) => {
      if (s.startDate !== selectedRecord.startDate || s.branch === selectedRecord.branch) return;
      const dayMap: Record<string, Set<string>> = {};
      Object.entries(s.selections || {}).forEach(([key, val]: [string, any]) => {
        if (!val || val === "None") return;
        const dayName = key.split('-')[0];
        if (!dayMap[dayName]) dayMap[dayName] = new Set();
        dayMap[dayName].add(val as string);
      });
      if (Object.keys(dayMap).length > 0) map[s.branch] = dayMap;
    });
    setScheduledElsewhere(map);
  }, [selectedRecord, history]);

  const handleSelectRecord = (record: any) => {
    setSelectedRecord(record);
    setUpdatedSelections({ ...record.selections });
    setUpdatedNotes({ ...record.notes });
  };

  const handleActualNameSelect = (day: string, targetTime: string, colId: string, name: string) => {
    setUpdatedSelections((prev) => {
      const next = { ...prev };
      if (!name || name === "None") {
        delete next[`${day}-${targetTime}-${colId}`];
      } else {
        next[`${day}-${targetTime}-${colId}`] = name;
      }
      return next;
    });
  };

  const handleClearDay = (day: string) => {
    if (!window.confirm(`Clear assignments for ${day}?`)) return;
    setUpdatedSelections(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(key => { if (key.startsWith(`${day}-`)) delete next[key]; });
      return next;
    });
  };

  const clearManagerForDay = (day: string) => {
    setUpdatedSelections(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(key => { if (key.startsWith(`${day}-`) && key.endsWith(`-MANAGER`)) delete next[key]; });
      return next;
    });
  };

  const handleClearColumn = (day: string, colId: string) => {
    setUpdatedSelections(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(key => { if (key.startsWith(`${day}-`) && key.endsWith(`-${colId}`)) delete next[key]; });
      return next;
    });
  };

  const calculateHoursForData = (selections: Record<string, string>, isOriginalData = false) => {
    if (!selectedRecord) return [];
    const dataToCalculate = isOriginalData ? (selectedRecord.originalSelections || selectedRecord.selections) : selections;
    if (!dataToCalculate) return [];

    const managerNames = new Set(Object.values(branchManagerData).flat());
    const allBranchStaff = (branchStaffData[selectedRecord.branch] || []).filter(n => !managerNames.has(n));
    const uniqueEmployeesToTrack: string[] = Array.from(new Set([
      ...allBranchStaff,
      ...(Object.values(dataToCalculate) as string[]).filter(e => e && e !== "None" && !managerNames.has(e))
    ]));

    const staffStats: Record<string, { coachHrs: number; execHrs: number; total: number }> = {};
    uniqueEmployeesToTrack.forEach(emp => { staffStats[emp] = { coachHrs: 0, execHrs: 0, total: 0 }; });

    getWorkingDaysForBranch(selectedRecord.branch).forEach((day) => {
      const isWeekend = day === "Saturday" || day === "Sunday";
      const dailyTarget = isWeekend ? 10.5 : 5.0;
      const branchForDay = selectedRecord.branch;

      uniqueEmployeesToTrack.forEach((emp) => {
        let coachingHoursForDay = 0;
        let workedThatDay = false;
        getTimeSlotsForDay(day, branchForDay).forEach((slot: string) => {
          if (isOpeningClosingSlot(slot, branchForDay)) return;
          COLUMNS.forEach((col) => {
            if (dataToCalculate[`${day}-${slot}-${col.id}`] === emp) {
              workedThatDay = true;
              if (col.type === "coach") coachingHoursForDay += isAdminSlot(slot, branchForDay) ? 0.25 : 1.25;
            }
          });
        });
        if (workedThatDay) {
          staffStats[emp].coachHrs += coachingHoursForDay;
          staffStats[emp].execHrs += Math.max(0, dailyTarget - coachingHoursForDay);
          staffStats[emp].total = staffStats[emp].coachHrs + staffStats[emp].execHrs;
        }
      });
    });
    return Object.entries(staffStats).map(([name, stats]) => ({ name, ...stats }));
  };

  const handleUpdateSave = async () => {
    if (!window.confirm("Save adjustments to the database?")) return;
    
    const updatedRecord = {
      ...selectedRecord,
      selections: updatedSelections,
      notes: updatedNotes,
      status: "Updated",
    };

    try {
      const response = await fetch('/api/save-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedRecord)
      });

      if (!response.ok) throw new Error("Failed to save");

      alert("Adjustments Saved Successfully! 💾");
      setHistory(prev => prev.map(h => h.id === updatedRecord.id ? updatedRecord : h));
      setSelectedRecord(null);
      
    } catch (error) {
      console.error(error);
      alert("Error saving adjustments to database.");
    }
  };


  if (selectedRecord) {
    
    const namesUsedInOriginal = Object.values(selectedRecord.originalSelections || {}).filter(Boolean) as string[];
    const namesUsedInUpdates = Object.values(updatedSelections || {}).filter(Boolean) as string[];
    const globalUsedNames = Array.from(new Set([...namesUsedInOriginal, ...namesUsedInUpdates]));
    const originalData = selectedRecord.originalSelections || selectedRecord.selections || {};
    const originalNotes = selectedRecord.notes || selectedRecord.originalNotes || {};

    return (
      <div className="flex h-screen bg-slate-50 text-slate-800 overflow-hidden">
        <Sidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen(p => !p)} />
        
        <main className="flex-1 h-screen flex flex-col overflow-hidden relative" style={{ zoom: 0.9 }}>
          
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
                  <span>Updating: {selectedRecord.branch}</span>
                  {selectedRecord.startDate && selectedRecord.endDate && (
                    <span className="text-sm bg-slate-100 text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg font-bold tracking-widest uppercase">
                      {formatDateString(selectedRecord.startDate)} - {formatDateString(selectedRecord.endDate)}
                    </span>
                  )}
                </h1>
              </div>
              <button onClick={handleUpdateSave} className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-xl text-sm font-black uppercase shadow-md transition-colors flex items-center gap-2">
                <span>💾</span> Save Adjustments
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto w-full mx-auto px-4 md:px-6 pb-20">
            <div className="space-y-6 mb-10">
              {getWorkingDaysForBranch(selectedRecord.branch).map((day) => {
                const slots = getTimeSlotsForDay(day, selectedRecord.branch);

                const activeStaffList = Array.from(new Set([
                    ...SHARED_EMPLOYEES,
                    ...(branchStaffData[selectedRecord.branch] || []),
                    ...globalUsedNames
                ]));

                return (
                  <div key={day} className="bg-white rounded-xl shadow-lg p-3 border-t-2 border-orange-500">
                    <div className="relative flex flex-col justify-center items-center mb-3 border-b pb-2 min-h-[30px]">
                      <h2 className="text-lg font-black uppercase text-slate-700 m-0 leading-none">{day}</h2>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                        {getDateForDay(day, selectedRecord.startDate)}
                      </span>
                    </div>
                    
                    <div className="flex flex-col xl:flex-row gap-3 relative">

                      {/* ===== PLANNING SIDE (read-only) ===== */}
                      <div className="flex-1 opacity-60 flex flex-col min-w-0">
                        <div className="bg-slate-500 p-1.5 text-center font-bold text-[9px] uppercase mb-1 rounded text-white tracking-widest h-8 sticky left-0 right-0 z-30">
                            Planning
                        </div>
                        <div className="overflow-x-auto border rounded relative">
                          <table className="w-full border-collapse text-[9px]" style={{ minWidth: '1700px' }}>
                            <thead>
                              <tr className="bg-slate-700 text-white text-center h-[40px]">
                                <th className="p-1 border border-slate-600 w-32 sticky left-0 z-20 bg-slate-700">
                                  <div className="flex flex-col items-center"><span>Slot</span></div>
                                </th>
                                <th className="p-1 border border-slate-600 w-24 bg-slate-700 border-b-2 border-b-emerald-400">
                                  <div className="flex flex-col items-center"><span>Manager</span></div>
                                </th>
                                {COLUMNS.map(c => (
                                  <th key={c.id} className={`p-1 border border-slate-600 w-24 ${c.type==='exec'?'bg-slate-800':''}`}>
                                    <div className="flex flex-col items-center"><span>{c.label}</span></div>
                                  </th>
                                ))}
                                <th className="p-1 border border-slate-600 w-40">
                                  <div className="flex flex-col items-center"><span>Notes</span></div>
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {slots.map((slot, slotIndex) => {
                                const isOpenClose = isOpeningClosingSlot(slot, selectedRecord.branch);
                                // --- KEY FIX: per-slot manager logic for Planning side ---
                                const showManagerPlanning = isManagerOnDutySlot(slot, selectedRecord.branch, day);
                                const planningManagerName =
                                  originalData[`${day}-${slot}-MANAGER`] ||     // new format
                                  originalNotes[`${day}-MANAGER`] ||             // legacy format
                                  "";

                                return (
                                  <tr key={slot} className={`h-[32px] ${isOpenClose ? 'bg-blue-50' : ''}`}>
                                    <td className={`p-1 border font-bold sticky left-0 z-10 h-[32px] ${isOpenClose ? 'bg-blue-100' : 'bg-slate-50'}`}>{slot}</td>
                                    
                                    {/* Planning Manager Cell — per slot, no rowSpan */}
                                    {!isOpenClose && (
                                      <td className="p-1 border bg-emerald-50 text-center font-bold align-middle h-[32px]">
                                        {showManagerPlanning ? (
                                          planningManagerName ? (
                                            <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-bold ${planningManagerName ? '' : ''}`}>
                                              {planningManagerName}
                                            </span>
                                          ) : (
                                            <span className="text-slate-300">-</span>
                                          )
                                        ) : (
                                          <div className="w-full h-full flex items-center justify-center">
                                            <span className="text-[8px] text-emerald-200">—</span>
                                          </div>
                                        )}
                                      </td>
                                    )}

                                    {isOpenClose ? (
                                      <td colSpan={COLUMNS.length + (isOpenClose ? 2 : 1)} className="p-1 border text-center">
                                        <span className="text-[8px] font-black text-blue-600 uppercase tracking-widest">All Staff — Executive ({slotIndex === 0 ? "Opening" : "Closing"})</span>
                                      </td>
                                    ) : (
                                      <>
                                        {COLUMNS.map(col => {
                                          const name = originalData[`${day}-${slot}-${col.id}`];
                                          return (
                                            <td key={col.id} className={`p-1 border text-center font-bold h-[32px] ${name ? getEmployeeColor(name) : 'bg-white'}`}>
                                              {name || "-"}
                                            </td>
                                          );
                                        })}
                                        <td className="p-1 border bg-white italic text-slate-400 h-[32px]">...</td>
                                      </>
                                    )}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* ===== ACTUAL SIDE (editable) ===== */}
                      <div className="flex-1 flex flex-col min-w-0">
                        <div className="bg-orange-600 p-1.5 flex justify-between items-center mb-1 rounded text-white tracking-widest h-8 sticky left-0 right-0 z-30">
                            <div className="w-fit min-w-[100px] text-[8px] font-black bg-black/10 px-2 py-1 rounded">
                                {selectedRecord.branch}
                            </div>
                            <span className="font-bold text-[9px] uppercase">Actual</span>
                            <div className="w-24 flex justify-end">
                              <button onClick={() => handleClearDay(day)} className="text-[7px] font-bold bg-orange-800 px-1.5 py-0.5 rounded">CLEAR DAY</button>
                            </div>
                        </div>
                        <div className="overflow-x-auto border rounded relative">
                          <table className="w-full border-collapse text-[9px]" style={{ minWidth: '1700px' }}>
                            <thead>
                              <tr className="bg-[#2D3F50] text-white h-[40px]">
                                <th className="p-1 border border-slate-900 w-32 sticky left-0 z-20 bg-[#2D3F50]">
                                  <div className="flex flex-col items-center"><span>Slot</span></div>
                                </th>
                                <th className="p-1 border border-slate-900 w-24 bg-slate-700 border-b-2 border-b-emerald-400">
                                  <div className="flex flex-col items-center gap-0.5">
                                    <span>Manager</span>
                                    <select
                                      value={managerReplacementBranch[day] || ""}
                                      onChange={(e) => setManagerReplacementBranch(prev => ({ ...prev, [day]: e.target.value }))}
                                      className="text-[7px] bg-slate-600 text-white border-none rounded px-1 py-0.5 w-full appearance-none text-center"
                                    >
                                      <option value="">Own Branch</option>
                                      {ALL_BRANCHES.filter(b => b !== selectedRecord.branch).map(b => (
                                        <option key={b} value={b}>{b}</option>
                                      ))}
                                    </select>
                                    <button onClick={() => clearManagerForDay(day)} className="text-[7px] text-orange-300 font-bold hover:text-white uppercase px-2 py-0.5 rounded transition-colors bg-slate-600">CLEAR</button>
                                  </div>
                                </th>
                                {COLUMNS.map(c => (
                                  <th key={c.id} className={`p-1 border border-slate-900 w-24 ${c.type==='exec'?'bg-slate-700 border-b-2 border-b-blue-400':''}`}>
                                    <div className="flex flex-col items-center gap-0.5">
                                      <span>{c.label}</span>
                                      <select
                                        value={columnReplacementBranch[`${day}-${c.id}`] || ""}
                                        onChange={(e) => setColumnReplacementBranch(prev => ({ ...prev, [`${day}-${c.id}`]: e.target.value }))}
                                        className="text-[7px] bg-slate-600 text-white border-none rounded px-1 py-0.5 w-full appearance-none text-center"
                                      >
                                        <option value="">Own Branch</option>
                                        {ALL_BRANCHES.filter(b => b !== selectedRecord.branch).map(b => (
                                          <option key={b} value={b}>{b}</option>
                                        ))}
                                      </select>
                                      <button onClick={() => handleClearColumn(day, c.id)} className="text-[6px] text-orange-300 font-bold hover:text-white py-0.5">CLEAR</button>
                                    </div>
                                  </th>
                                ))}
                                <th className="p-1 border border-slate-900 w-40">
                                  <div className="flex flex-col items-center"><span>Notes</span></div>
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {slots.map((slot, slotIndex) => {
                                const isOpenClose = isOpeningClosingSlot(slot, selectedRecord.branch);
                                // --- KEY FIX: per-slot manager logic for Actual side ---
                                const showManagerActual = isManagerOnDutySlot(slot, selectedRecord.branch, day);
                                const actualManagerVal =
                                  updatedSelections[`${day}-${slot}-MANAGER`] ||   // new format
                                  updatedNotes[`${day}-MANAGER`] ||                 // legacy format
                                  "";

                                return (
                                  <tr key={slot} className={`group h-[32px] ${isOpenClose ? 'bg-blue-50' : ''}`}>
                                    <td className={`p-1 border font-bold sticky left-0 z-10 h-[32px] ${isOpenClose ? 'bg-blue-100' : 'bg-orange-50 group-hover:bg-orange-100'}`}>{slot}</td>

                                    {/* Actual Manager Cell — per slot, no rowSpan */}
                                    {!isOpenClose && (
                                      <td className="p-1 border bg-emerald-50 align-middle h-[32px]">
                                        {showManagerActual ? (
                                          // Show editable dropdown for manager slots
                                          <select
                                            value={actualManagerVal}
                                            onChange={(e) => {
                                              const val = e.target.value;
                                              setUpdatedSelections(prev => {
                                                const next = { ...prev };
                                                if (val) {
                                                  next[`${day}-${slot}-MANAGER`] = val;
                                                } else {
                                                  delete next[`${day}-${slot}-MANAGER`];
                                                }
                                                return next;
                                              });
                                            }}
                                            className="w-full h-full p-1 text-[9px] font-bold text-center border border-emerald-200 rounded bg-white appearance-none outline-none"
                                          >
                                            <option value="">-- Select --</option>
                                            {(branchManagerData[managerReplacementBranch[day] || selectedRecord.branch] || []).map(e => {
                                              const mgReplacementBranch = managerReplacementBranch[day];
                                              const conflictBranch = mgReplacementBranch
                                                ? Object.entries(scheduledElsewhere).find(([, dayMap]) => dayMap[day]?.has(e))?.[0]
                                                : undefined;
                                              const isConflict = !!conflictBranch;
                                              return (
                                                <option key={e} value={e} disabled={isConflict}>
                                                  {isConflict ? `${e} (at ${conflictBranch})` : e}
                                                </option>
                                              );
                                            })}
                                          </select>
                                        ) : (
                                          // Empty placeholder for slots after manager's shift
                                          <div className="w-full h-full flex items-center justify-center">
                                            <span className="text-[8px] text-emerald-200">—</span>
                                          </div>
                                        )}
                                      </td>
                                    )}

                                    {isOpenClose ? (
                                      <td colSpan={COLUMNS.length + 1} className="p-1 border text-center">
                                        <span className="text-[8px] font-black text-blue-600 uppercase tracking-widest">All Staff — Executive ({slotIndex === 0 ? "Opening" : "Closing"})</span>
                                      </td>
                                    ) : (
                                      <>
                                        {COLUMNS.map(col => {
                                          const val = updatedSelections[`${day}-${slot}-${col.id}`] || "";
                                          const replacementBranch = columnReplacementBranch[`${day}-${col.id}`];
                                          const colStaffList = replacementBranch
                                            ? (branchStaffData[replacementBranch] || [])
                                            : activeStaffList;
                                          // Block names used in same slot across any column type (cross-type per-slot conflict)
                                          const namesInSameSlot = new Set(
                                            COLUMNS.filter(c => c.id !== col.id)
                                              .map(c => updatedSelections[`${day}-${slot}-${c.id}`])
                                              .filter(Boolean)
                                          );
                                          // Block names used in same column type across any slot (same-role dedup)
                                          const namesInSameType = new Set(
                                            COLUMNS.filter(c => c.id !== col.id && c.type === col.type)
                                              .flatMap(c => slots.map(s => updatedSelections[`${day}-${s}-${c.id}`]))
                                              .filter(Boolean)
                                          );
                                          const namesUsedInOtherColumns = new Set([
                                            ...namesInSameSlot,
                                            ...namesInSameType,
                                            ...(actualManagerVal ? [actualManagerVal] : []),
                                          ]);
                                          return (
                                            <td key={col.id} className={`p-0 border h-[32px] ${col.type==='exec' ? 'bg-slate-50' : 'bg-white'}`}>
                                              <select value={val} onChange={(e) => handleActualNameSelect(day, slot, col.id, e.target.value)}
                                                className={`w-full h-full p-1 outline-none font-bold text-center appearance-none block ${val ? getEmployeeColor(val) : 'bg-transparent text-slate-300'}`}>
                                                <option value="">None</option>
                                                {colStaffList.map(e => {
                                                  const conflictBranch = replacementBranch
                                                    ? Object.entries(scheduledElsewhere).find(([, dayMap]) => dayMap[day]?.has(e))?.[0]
                                                    : undefined;
                                                  const isConflict = !!conflictBranch;
                                                  return (
                                                    <option key={e} value={e} disabled={namesUsedInOtherColumns.has(e) || isConflict} className="text-black">
                                                      {isConflict ? `${e} (at ${conflictBranch})` : e}
                                                    </option>
                                                  );
                                                })}
                                              </select>
                                            </td>
                                          );
                                        })}
                                        <td className="p-0 border bg-white h-[32px]">
                                          <textarea value={updatedNotes[`${day}-${slot}-notes`] || ""} onChange={(e) => setUpdatedNotes(p => ({...p, [`${day}-${slot}-notes`]: e.target.value}))} className="w-full h-full p-1 text-[8px] resize-none outline-none italic text-slate-600 block" />
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
                    </div>
                  </div>
                );
              })}

              <div className="mt-6 bg-white p-4 rounded-xl border border-slate-200 shadow-md">
                <h2 className="text-sm font-black text-center uppercase tracking-widest text-slate-800 mb-4">📊 Staff Hours Comparison</h2>
                <div className="flex flex-col md:flex-row gap-4">
                    <SummaryTable title="ORIGINAL" data={calculateHoursForData({}, true)} theme="blue" />
                    <SummaryTable title="ADJUSTED" data={calculateHoursForData(updatedSelections, false)} theme="orange" />
                </div>
              </div>
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
        
        <main className="flex-1 h-screen flex flex-col overflow-hidden relative" style={{ zoom: 0.9 }}>
            
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
                  Update Manpower Schedule
                </h1>
              </div>

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

            <div className="flex-1 overflow-y-auto w-full mx-auto px-4 md:px-6 pb-12">
              {isLoading ? (
                <div className="flex justify-center items-center h-40">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                </div>
              ) : filteredHistory.length === 0 ? (
                <div className="bg-white p-12 rounded-3xl border-2 border-dashed border-slate-300 text-center shadow-sm">
                    <p className="text-slate-500 font-bold text-lg uppercase tracking-widest">No schedules available matching filters.</p>
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
                                              <button key={record.id} onClick={() => handleSelectRecord(record)}
                                                className="w-full text-left px-3 py-2 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg transition-colors">
                                                <div className="font-black text-xs text-orange-800 uppercase">{record.branch}</div>
                                                <div className="text-[10px] text-orange-500 font-bold mt-0.5">
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
