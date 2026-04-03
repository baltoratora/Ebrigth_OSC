"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { format, parseISO, addDays } from "date-fns";
import { useSession } from "next-auth/react"; // <-- IMPORT SESSION
import WeekSelector from "@/app/components/WeekSelector";
import Sidebar from "@/app/components/Sidebar";

// --- IMPORT SHARED CONSTANTS ---
import {
  SHARED_EMPLOYEES, ALL_BRANCHES, DAYS, WEEKDAY_DAYS,
  COLUMNS, BRANCH_SLOTS_CONFIG,
  getTimeSlotsForDay, isAdminSlot, getEmployeeColor,
  getWorkingDaysForBranch, isOpeningClosingSlot,
  isManagerOnDutySlot, // <-- NEW IMPORT
  SELECT_ARROW_WHITE, SELECT_ARROW_DARK
} from "@/lib/manpowerUtils";


// --- HELPER COMPONENT: SUMMARY TABLE ---
const SummaryTable = ({ title, data }: { title: string, data: any[] }) => {
  const formatTime = (d: number) => {
    const h = Math.floor(d);
    const m = Math.round((d - h) * 60);
    return { h: h.toString(), m: m.toString().padStart(2, '0') };
  };
  return (
    <div className="mt-12 bg-white p-8 rounded-2xl border border-slate-200 shadow-md overflow-hidden text-slate-800">
      <header className="border-b border-slate-200 pb-4 mb-4 text-center">
        <h2 className="m-0 text-xl font-black uppercase tracking-widest text-slate-800">{title}</h2>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="w-[60px] border border-slate-300 bg-[#2D3F50] p-3 text-white font-bold text-center">No.</th>
              <th className="w-[250px] border border-slate-300 bg-[#2D3F50] p-3 text-white font-bold text-left">Name</th>
              <th className="w-[240px] border border-slate-300 bg-[#2D3F50] p-3 text-white font-bold text-center">Class (Coach)</th>
              <th className="w-[240px] border border-slate-300 bg-[#2D3F50] p-3 text-white font-bold text-center">Executive</th>
              <th className="w-[240px] border border-slate-300 bg-[#2D3F50] p-3 text-white font-bold text-center">Total (hrs:min)</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, index) => {
              const c = formatTime(row.coachHrs);
              const e = formatTime(row.execHrs);
              const t = formatTime(row.total);
              return (
                <tr key={row.name} className="even:bg-slate-50 hover:bg-slate-100 transition-colors">
                  <td className="border border-slate-300 px-3 py-3 text-center font-bold text-slate-500">{index + 1}</td>
                  <td className="border border-slate-300 px-3 py-3 font-black text-slate-800">{row.name}</td>
                  {[c, e, t].map((time, i) => (
                    <td key={i} className={`border border-slate-300 px-2 py-3 ${i === 2 ? 'bg-blue-50/50' : ''}`}>
                      <div className="flex flex-row gap-4 items-center justify-center">
                        <div className="flex items-baseline gap-1 bg-white border border-slate-200 px-2 py-1 rounded">
                          <span className="text-sm font-bold text-slate-700">{time.h}</span>
                          <span className="text-[9px] uppercase font-black text-slate-400">hrs</span>
                        </div>
                        <div className="flex items-baseline gap-1 bg-white border border-slate-200 px-2 py-1 rounded">
                          <span className="text-sm font-bold text-slate-700">{time.m}</span>
                          <span className="text-[9px] uppercase font-black text-slate-400">min</span>
                        </div>
                      </div>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

function PlanNewWeekPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession(); // <-- GET LOGGED IN USER

  const startDateStr = searchParams.get("start");
  const endDateStr = searchParams.get("end");

  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [hasConfirmedBranch, setHasConfirmedBranch] = useState(false);
  const [hasConfirmedWeek, setHasConfirmedWeek] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [editingDays, setEditingDays] = useState<Record<string, boolean>>(
    DAYS.reduce((acc, day) => ({ ...acc, [day]: true }), {})
  );
  
  const [branchStaffData, setBranchStaffData] = useState<Record<string, string[]>>({});
  const [branchManagerData, setBranchManagerData] = useState<Record<string, string[]>>({});
  const [columnReplacementBranch, setColumnReplacementBranch] = useState<Record<string, string>>({});
  const [managerReplacementBranch, setManagerReplacementBranch] = useState<Record<string, string>>({});
  // branch → set of employee names already assigned in their saved schedule for this week
  const [scheduledElsewhere, setScheduledElsewhere] = useState<Record<string, Record<string, Set<string>>>>({});

  // --- ADD EMPLOYEE MODAL ---
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [addEmployeeError, setAddEmployeeError] = useState("");
  const [isAddingEmployee, setIsAddingEmployee] = useState(false);

  // --- NEW AUTOMATION FOR BRANCH MANAGERS ---
  useEffect(() => {
    if (session?.user) {
      const userRole = (session.user as any).role;
      const userBranch = (session.user as any).branchName;

      // If they are a branch manager, skip the selection screen immediately!
      if (userRole === "BRANCH_MANAGER" && userBranch) {
        setSelectedBranch(userBranch);
        setHasConfirmedBranch(true);
      }
    }
  }, [session]);

  useEffect(() => {
    if (startDateStr && endDateStr) {
      setHasConfirmedWeek(true);
      const history = JSON.parse(localStorage.getItem("manpower_history") || "[]");
      const record = history.find((h: any) => h.startDate === startDateStr);
      if (record && searchParams.get("view") === "archive") {
        setSelections(record.selections || {});
        setNotes(record.notes || {});
        setSelectedBranch(record.branch);
        setHasConfirmedBranch(true);
        setIsLocked(true);
      }
    } else {
      setHasConfirmedWeek(false);
    }
  }, [startDateStr, endDateStr, searchParams]);

  // Restore draft from localStorage when branch + week are confirmed
  useEffect(() => {
    if (!selectedBranch || !startDateStr || isLocked) return;
    const draftKey = `draft_${selectedBranch}_${startDateStr}`;
    const draft = localStorage.getItem(draftKey);
    if (draft) {
      try {
        const { selections: s, notes: n } = JSON.parse(draft);
        if (s) setSelections(s);
        if (n) setNotes(n);
      } catch {}
    }
  }, [selectedBranch, startDateStr, isLocked]);

  // Auto-save draft to localStorage whenever selections or notes change
  useEffect(() => {
    if (!selectedBranch || !startDateStr || isLocked) return;
    const draftKey = `draft_${selectedBranch}_${startDateStr}`;
    localStorage.setItem(draftKey, JSON.stringify({ selections, notes }));
  }, [selections, notes, selectedBranch, startDateStr, isLocked]);

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

  useEffect(() => { fetchStaff(); }, []);

  // Fetch saved schedules for this week to detect cross-branch conflicts
  useEffect(() => {
    if (!startDateStr) return;
    const fetchSavedSchedules = async () => {
      try {
        const res = await fetch('/api/get-schedules');
        const data = await res.json();
        if (!data.success) return;
        const map: Record<string, Record<string, Set<string>>> = {};
        data.schedules.forEach((s: any) => {
          if (s.startDate !== startDateStr || s.branch === selectedBranch) return;
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
      } catch {}
    };
    fetchSavedSchedules();
  }, [startDateStr, selectedBranch]);

  // Format Helper
  const getDateForDay = (dayName: string) => {
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

  const clearAllForDay = (day: string) => {
    if (isLocked) return;
    if (window.confirm(`Are you sure you want to clear all selections for ${day}?`)) {
      setSelections((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((key) => { if (key.startsWith(`${day}-`)) delete next[key]; });
        return next;
      });
      setNotes((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((key) => { if (key.startsWith(`${day}-`)) delete next[key]; });
        return next;
      });
    }
  };

  const clearManagerForDay = (day: string) => {
    if (isLocked) return;
    setSelections((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => { if (key.startsWith(`${day}-`) && key.endsWith(`-MANAGER`)) delete next[key]; });
      return next;
    });
  };

  const clearColumnForDay = (day: string, columnId: string) => {
    if (isLocked) return;
    setSelections((prev) => {
      const next = { ...prev };
      getTimeSlotsForDay(day, selectedBranch).forEach((slot) => { delete next[`${day}-${slot}-${columnId}`]; });
      return next;
    });
  };

  const handleNameSelect = (day: string, targetTime: string, columnId: string, name: string) => {
    if (isLocked) return;
    
    setSelections((prev) => {
      const next = { ...prev };
      if (!name) {
        delete next[`${day}-${targetTime}-${columnId}`];
      } else {
        next[`${day}-${targetTime}-${columnId}`] = name;
      }
      return next;
    });
  };

  const handleNoteChange = (day: string, time: string, value: string) => {
    if (isLocked) return;
    setNotes((prev) => ({ ...prev, [`${day}-${time}-notes`]: value }));
  };

  const calculateStaffHours = () => {
    const managerNames = new Set(Object.values(branchManagerData).flat());
    const selectedInSlots = Object.values(selections).filter(val => val !== "" && val !== "None" && !managerNames.has(val));
    const nonManagerStaff = activeStaffList.filter(name => !managerNames.has(name));
    const uniqueEmployeesToTrack = Array.from(new Set([...nonManagerStaff, ...selectedInSlots]));

    const staffStats: Record<string, { coachHrs: number; execHrs: number; total: number }> = {};
    uniqueEmployeesToTrack.forEach(emp => { staffStats[emp] = { coachHrs: 0, execHrs: 0, total: 0 }; });

    getWorkingDaysForBranch(selectedBranch).forEach((day) => {
      const isWeekend = day === "Saturday" || day === "Sunday";
      const dailyTarget = isWeekend ? 10.5 : 5.0;

      uniqueEmployeesToTrack.forEach((emp) => {
        let coachingHoursForDay = 0;
        let workedThatDay = false;

        getTimeSlotsForDay(day, selectedBranch).forEach((slot) => {
          if (isOpeningClosingSlot(slot, selectedBranch)) return;
          COLUMNS.forEach((col) => {
            if (selections[`${day}-${slot}-${col.id}`] === emp) {
              workedThatDay = true;
              if (col.type === "coach") {
                  coachingHoursForDay += isAdminSlot(slot, selectedBranch) ? 0.25 : 1.25;
              }
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

  const handleFinalSubmit = async () => {
    if (!window.confirm("Submit final schedule? This will lock the original record and save it to the database.")) return;

    // Build the data packet
    const snapshot = {
      id: `${selectedBranch}_${startDateStr}`, 
      branch: selectedBranch,
      startDate: startDateStr,
      endDate: endDateStr,
      selections: { ...selections }, 
      notes: { ...notes },
      originalSelections: { ...selections }, 
      originalNotes: { ...notes },
      status: "Finalized",
      originalAuthor: (session?.user as any)?.branchName || "Admin User", 
    };

    try {
      // Send it to your existing API route folder!
      const response = await fetch('/api/save-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot)
      });

      if (!response.ok) throw new Error("Failed to save");

      // Clear the draft now that it's been finalized
      localStorage.removeItem(`draft_${selectedBranch}_${startDateStr}`);
      alert("Schedule Finalized and Saved to Database! 🚀");
      router.push("/manpower-schedule");
      
    } catch (error) {
      console.error(error);
      alert("Uh oh! Something went wrong while saving to the database.");
    }
  };

  const handleAddEmployee = async () => {
    if (!newEmployeeName.trim()) { setAddEmployeeError("Name cannot be empty."); return; }
    setIsAddingEmployee(true);
    setAddEmployeeError("");
    try {
      const res = await fetch('/api/branch-staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newEmployeeName.trim(), branch: selectedBranch }),
      });
      const data = await res.json();
      if (!res.ok) { setAddEmployeeError(data.error || "Failed to add employee."); return; }
      await fetchStaff();
      setNewEmployeeName("");
      setShowAddEmployeeModal(false);
    } catch {
      setAddEmployeeError("Something went wrong. Please try again.");
    } finally {
      setIsAddingEmployee(false);
    }
  };

  const branchSpecificStaff = branchStaffData[selectedBranch] || [];
  const activeStaffList = Array.from(new Set([...SHARED_EMPLOYEES, ...branchSpecificStaff]));

  // Safely check role for UI tweaks
  const userRole = (session?.user as any)?.role || "USER";

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      
      {/* SIDEBAR */}
      <Sidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen(p => !p)} />

      {/* MAIN CONTENT */}
      <main className="flex-1 h-screen flex flex-col overflow-hidden relative" style={{ zoom: 0.9 }}>
        
        {/* Sticky Header Area */}
        <div className="shrink-0 w-full mx-auto px-4 md:px-6 pt-4 md:pt-6 z-50 bg-slate-50">
          
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex justify-between items-center mb-6 relative">
            <div className="flex items-center gap-6">
                

                <button
                  onClick={() => router.push('/manpower-schedule')}
                  className="bg-blue-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-md hover:bg-blue-600 transition-colors"
                >
                  <span className="text-xl">👥</span>
                  <span className="text-base font-black uppercase tracking-wide leading-none">HRMS</span>
                </button>
                
                <div className="h-8 w-px bg-slate-300"></div>
                
                <h1 className="text-lg font-black uppercase tracking-wide text-slate-800 leading-none m-0 flex items-center gap-4">
                  <span>Plan New Week {hasConfirmedBranch && `- ${selectedBranch}`}</span>
                  
                  {hasConfirmedWeek && startDateStr && endDateStr && (
                    <span className="text-sm bg-slate-100 text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg font-bold tracking-widest uppercase">
                      {format(parseISO(startDateStr), "dd MMM yyyy")} - {format(parseISO(endDateStr), "dd MMM yyyy")}
                    </span>
                  )}
                </h1>
            </div>

            <div className="flex items-center gap-3">
              {hasConfirmedBranch && hasConfirmedWeek && !isLocked && (
                <button
                  onClick={() => { setShowAddEmployeeModal(true); setNewEmployeeName(""); setAddEmployeeError(""); }}
                  className="bg-green-600 text-white px-5 py-3 rounded-xl font-black uppercase text-sm tracking-wide hover:bg-green-700 transition-colors shadow-sm flex items-center gap-2"
                >
                  + Add Employee
                </button>
              )}
              {/* ONLY show "Change Branch" if they are NOT a Branch Manager */}
              {hasConfirmedBranch && !hasConfirmedWeek && userRole !== "BRANCH_MANAGER" && (
                <button
                  onClick={() => setHasConfirmedBranch(false)}
                  className="bg-slate-200 text-slate-700 hover:bg-slate-300 px-6 py-3 rounded-xl font-bold uppercase transition-colors shadow-sm"
                >
                  ← Change Branch
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Scrolling Internal Area */}
        <div className="flex-1 overflow-y-auto w-full mx-auto px-4 md:px-6 pb-20">
          
          {!hasConfirmedBranch ? (
            
            // STEP 1: SELECT BRANCH (Branch Managers will instantly skip this!)
            <div className="flex flex-col items-center justify-center min-h-[65vh] w-full">
              <div className="w-full max-w-md bg-white p-10 rounded-[2rem] shadow-xl border border-slate-100 text-center text-slate-800">
                <h2 className="text-3xl font-black text-slate-800 mb-8 uppercase tracking-tight">Select Branch</h2>
                <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} className="w-full p-4 border-2 border-slate-200 rounded-xl bg-slate-50 mb-6 font-bold text-slate-700 outline-none focus:border-blue-500 transition-colors">
                  <option value="">-- Choose Branch --</option>
                  {ALL_BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                <button disabled={!selectedBranch} onClick={() => setHasConfirmedBranch(true)} className="w-full py-4 bg-green-600 text-white font-black rounded-xl hover:bg-green-700 disabled:bg-slate-300 uppercase tracking-widest transition-colors shadow-md">
                  Continue
                </button>
              </div>
            </div>

          ) : !hasConfirmedWeek ? (

            // STEP 2: SELECT WEEK
            <div className="flex flex-col items-center justify-center min-h-[65vh] w-full text-slate-800">
              <WeekSelector onConfirm={(wd) => router.push(`/manpower-schedule/plan-new-week?${wd}`)} />
            </div>

          ) : (

            // STEP 3: THE ACTUAL TABLES
            <div className="space-y-10">
              {isLocked && (
                 <div className="bg-slate-800 text-white p-4 rounded-xl flex justify-between items-center shadow-xl">
                   <span className="font-bold uppercase tracking-widest text-sm">🔒 Archived Record (Read-Only)</span>
                   <button onClick={() => setIsLocked(false)} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-black text-xs uppercase hover:bg-blue-500">Edit</button>
                 </div>
              )}

              {getWorkingDaysForBranch(selectedBranch).map((day) => {
                const isEditing = !!editingDays[day] && !isLocked;
                const daySlots = getTimeSlotsForDay(day, selectedBranch);
                return (
                  <div key={day} className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
                    
                    <header className="bg-white p-4 border-b flex justify-between items-center relative">
                      <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center">
                        <h2 className="text-xl font-black uppercase text-slate-800 m-0 leading-none">{day}</h2>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                          {getDateForDay(day)}
                        </span>
                      </div>
                      
                      <div className="flex-1"></div>
                      
                      <div className="flex items-center gap-4 relative z-10">
                        {!isLocked && isEditing && (
                          <button onClick={() => clearAllForDay(day)} className="text-red-500 font-bold uppercase text-xs hover:underline">Clear All</button>
                        )}
                        {isEditing ? 
                          <button onClick={() => setEditingDays(p => ({...p, [day]: false}))} className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-bold text-xs uppercase shadow-sm transition-colors">Save Day</button> :
                          <button onClick={() => setEditingDays(p => ({...p, [day]: true}))} className="text-blue-600 border-2 border-blue-600 hover:bg-blue-50 px-6 py-2 rounded-lg font-bold text-xs uppercase transition-colors">Edit Day</button>
                        }
                      </div>
                    </header>
                    
                    <div className="overflow-x-auto relative">
                      <table className="w-full border-collapse" style={{ minWidth: '2100px' }}>
                        <thead className="bg-[#2D3F50] text-white text-[10px] uppercase tracking-widest">
                          <tr>
                            <th className="p-3 text-left w-[180px] sticky left-0 z-20 bg-[#2D3F50] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)] border-r border-slate-600">
                              Time Slot
                            </th>
                            <th className="p-3 text-center border-l border-slate-600 w-[180px] bg-slate-700 border-b-4 border-b-emerald-400">
                              <div className="flex flex-col items-center gap-1">
                                <span>Manager on Duty</span>
                                {!isLocked && isEditing && (
                                  <select
                                    value={managerReplacementBranch[day] || ""}
                                    onChange={(e) => setManagerReplacementBranch(prev => ({ ...prev, [day]: e.target.value }))}
                                    className="text-[8px] bg-slate-600 text-white border-none rounded px-1 py-0.5 w-full appearance-none text-center"
                                  >
                                    <option value="">Own Branch</option>
                                    {ALL_BRANCHES.filter(b => b !== selectedBranch).map(b => (
                                      <option key={b} value={b}>{b}</option>
                                    ))}
                                  </select>
                                )}
                                {!isLocked && isEditing && (
                                  <button onClick={() => clearManagerForDay(day)} className="text-[8px] text-orange-300 font-bold hover:text-white uppercase px-2 py-0.5 rounded transition-colors bg-slate-600">CLEAR</button>
                                )}
                              </div>
                            </th>
                            {COLUMNS.map(col => (
                              <th key={col.id} className={`p-3 text-center border-l border-slate-600 w-[150px] ${col.type === 'exec' ? 'bg-slate-700 border-b-4 border-b-blue-400' : ''}`}>
                                <div className="flex flex-col items-center gap-1">
                                  <span>{col.label}</span>
                                  {!isLocked && isEditing && (
                                    <>
                                      <select
                                        value={columnReplacementBranch[`${day}-${col.id}`] || ""}
                                        onChange={(e) => setColumnReplacementBranch(prev => ({ ...prev, [`${day}-${col.id}`]: e.target.value }))}
                                        className="text-[8px] bg-slate-600 text-white border-none rounded px-1 py-0.5 w-full appearance-none text-center"
                                      >
                                        <option value="">Own Branch</option>
                                        {ALL_BRANCHES.filter(b => b !== selectedBranch).map(b => (
                                          <option key={b} value={b}>{b}</option>
                                        ))}
                                      </select>
                                      <button onClick={() => clearColumnForDay(day, col.id)} className="text-[8px] text-orange-300 font-bold hover:text-white uppercase px-2 py-0.5 rounded transition-colors bg-slate-600">CLEAR</button>
                                    </>
                                  )}
                                </div>
                              </th>
                            ))}
                            <th className="p-3 text-center border-l border-slate-600 w-[250px]">Notes/Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {daySlots.map((slot, slotIndex) => {
                            const isOpenClose = isOpeningClosingSlot(slot, selectedBranch);
                            // --- KEY CHANGE: check if manager dropdown applies to this slot ---
                            const showManagerDropdown = isManagerOnDutySlot(slot, selectedBranch, day);
                            const managerKey = `${day}-${slot}-MANAGER`;
                            const managerVal = selections[managerKey] || "";

                            return (
                            <tr key={slot} className={`border-b transition-colors group ${isOpenClose ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                              <td className={`p-3 font-bold border-r border-slate-200 text-xs sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] transition-colors text-slate-900 ${isOpenClose ? 'bg-blue-100 group-hover:bg-blue-100' : 'bg-slate-50 group-hover:bg-slate-100'}`}>
                                  {slot}
                              </td>

                              {/* ---- MANAGER ON DUTY CELL ---- */}
                              {!isOpenClose && (
                                <td className="p-2 border-l align-middle bg-emerald-50 w-[180px]">
                                  {showManagerDropdown ? (
                                    // Show dropdown only for slots where manager is on duty
                                    <select
                                      disabled={!isEditing}
                                      value={managerVal}
                                      onChange={(e) => handleNameSelect(day, slot, "MANAGER", e.target.value)}
                                      className={`w-full p-2 rounded text-center font-bold text-xs appearance-none transition-all ${
                                        managerVal
                                          ? getEmployeeColor(managerVal)
                                          : 'border border-emerald-200 bg-white text-slate-700'
                                      }`}
                                      style={{
                                        backgroundImage: `url("${managerVal ? SELECT_ARROW_WHITE : SELECT_ARROW_DARK}")`,
                                        backgroundPosition: "right 0.3rem center",
                                        backgroundSize: "8px",
                                        backgroundRepeat: "no-repeat"
                                      }}
                                    >
                                      <option value="">-- Select --</option>
                                      {(branchManagerData[managerReplacementBranch[day] || selectedBranch] || []).map(e => {
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
                                    // Empty cell — manager not on duty for this slot (e.g. 08:30PM onwards)
                                    <div className="w-full h-[34px] rounded bg-emerald-100/50 border border-dashed border-emerald-200 flex items-center justify-center">
                                      <span className="text-[9px] text-emerald-300 font-bold uppercase tracking-wider">—</span>
                                    </div>
                                  )}
                                </td>
                              )}

                              {isOpenClose ? (
                                <td colSpan={COLUMNS.length + 2} className="p-2 border-l text-center">
                                  <span className="inline-flex items-center gap-2 bg-blue-600 text-white text-xs font-black px-4 py-1.5 rounded-full uppercase tracking-widest">
                                    All Staff — Executive ({slotIndex === 0 ? "Opening" : "Closing"})
                                  </span>
                                </td>
                              ) : (
                                <>
                                  {COLUMNS.map(col => {
                                    const val = selections[`${day}-${slot}-${col.id}`] || "";
                                    const replacementBranch = columnReplacementBranch[`${day}-${col.id}`];
                                    const colStaffList = replacementBranch
                                      ? (branchStaffData[replacementBranch] || [])
                                      : activeStaffList;
                                    // Block names used in same slot across any column type (cross-type per-slot conflict)
                                    const namesInSameSlot = new Set(
                                      COLUMNS.filter(c => c.id !== col.id)
                                        .map(c => selections[`${day}-${slot}-${c.id}`])
                                        .filter(Boolean)
                                    );
                                    // Block names used in same column type across any slot (same-role dedup)
                                    const namesInSameType = new Set(
                                      COLUMNS.filter(c => c.id !== col.id && c.type === col.type)
                                        .flatMap(c => daySlots.map(s => selections[`${day}-${s}-${c.id}`]))
                                        .filter(Boolean)
                                    );
                                    const namesUsedInOtherColumns = new Set([
                                      ...namesInSameSlot,
                                      ...namesInSameType,
                                      // Also block whoever is selected as manager for this slot
                                      ...(managerVal ? [managerVal] : []),
                                    ]);

                                    return (
                                      <td key={col.id} className={`p-1.5 border-l ${col.type === 'exec' ? 'bg-slate-50' : ''}`}>
                                        <select disabled={!isEditing} value={val} onChange={(e) => handleNameSelect(day, slot, col.id, e.target.value)}
                                          className={`w-full p-2 rounded appearance-none text-center font-bold transition-all text-xs ${val ? getEmployeeColor(val) : 'bg-white border border-slate-200 text-slate-400 hover:bg-slate-50'}`}
                                          style={{ backgroundImage: `url("${val ? SELECT_ARROW_WHITE : SELECT_ARROW_DARK}")`, backgroundPosition: "right 0.3rem center", backgroundSize: "8px", backgroundRepeat: "no-repeat" }}>
                                          <option value="">None</option>
                                          {colStaffList.map(e => {
                                            const usedInCol = namesUsedInOtherColumns.has(e);
                                            // find which branch already has this employee scheduled on this specific day
                                            const conflictBranch = replacementBranch
                                              ? Object.entries(scheduledElsewhere).find(([, dayMap]) => dayMap[day]?.has(e))?.[0]
                                              : undefined;
                                            const isConflict = !!conflictBranch;
                                            return (
                                              <option key={e} value={e} disabled={usedInCol || isConflict} className="text-slate-800 font-bold">
                                                {isConflict ? `${e} (at ${conflictBranch})` : e}
                                              </option>
                                            );
                                          })}
                                        </select>
                                      </td>
                                    );
                                  })}
                                  <td className="p-1.5 border-l w-[250px] bg-white">
                                    <textarea disabled={!isEditing} value={notes[`${day}-${slot}-notes`] || ""} onChange={(e) => handleNoteChange(day, slot, e.target.value)}
                                      placeholder="Add remarks..." className="w-full p-2 text-xs border border-slate-200 rounded bg-white resize-none h-[38px] overflow-y-auto outline-none focus:border-blue-500 transition-all font-medium italic text-slate-600 block" />
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

              <SummaryTable title="Weekly Hours Summary" data={calculateStaffHours()} />

              {!isLocked && (
                <div className="mt-16 text-center pb-10">
                   <button onClick={handleFinalSubmit} className="bg-green-600 hover:bg-green-700 text-white px-20 py-5 rounded-2xl text-xl font-black shadow-xl uppercase tracking-widest transition-transform hover:scale-105">
                      🚀 Final Submit & Archive
                   </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ADD EMPLOYEE MODAL */}
      {showAddEmployeeModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white p-8 rounded-[2rem] shadow-2xl border border-slate-100 w-full max-w-sm flex flex-col gap-5">
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight text-center">Add Employee</h2>
            <div className="text-xs text-slate-500 text-center font-bold uppercase tracking-widest bg-slate-50 border border-slate-200 rounded-xl px-4 py-2">
              Branch: {selectedBranch}
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black uppercase text-slate-500">Full Name</label>
              <input
                type="text"
                value={newEmployeeName}
                onChange={(e) => { setNewEmployeeName(e.target.value); setAddEmployeeError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddEmployee(); }}
                placeholder="e.g. Ahmad Bin Ali"
                className="w-full p-3 border-2 border-slate-200 rounded-xl bg-slate-50 font-bold text-slate-700 outline-none focus:border-green-500 transition-colors"
                autoFocus
              />
              {addEmployeeError && (
                <p className="text-xs text-red-500 font-bold">{addEmployeeError}</p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAddEmployeeModal(false)}
                className="flex-1 py-3 bg-slate-200 text-slate-700 font-black rounded-xl hover:bg-slate-300 uppercase tracking-widest text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddEmployee}
                disabled={isAddingEmployee}
                className="flex-1 py-3 bg-green-600 text-white font-black rounded-xl hover:bg-green-700 disabled:bg-slate-300 uppercase tracking-widest text-sm transition-colors"
              >
                {isAddingEmployee ? "Saving..." : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PlanNewWeekPageWrapper() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <PlanNewWeekPage />
    </Suspense>
  );
}
