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
  ALL_COLUMNS, getColumnsForDay, TRAINING_DAY_HOURS, BRANCH_SLOTS_CONFIG,
  getTimeSlotsForDay, isAdminSlot, getStaffColorByIndex,
  getWorkingDaysForBranch, isOpeningClosingSlot,
  isManagerOnDutySlot, isOnlineCoachOnly, getManagerExtrasForDay,
  SELECT_ARROW_WHITE, SELECT_ARROW_DARK
} from "@/lib/manpowerUtils";
import { isBranchManager } from "@/lib/roles";
import { isInTraining } from "@/lib/training";

function isEndingSoon(endDate: string | undefined): boolean {
  if (!endDate) return false;
  const end = new Date(endDate);
  if (isNaN(end.getTime())) return false;
  const threeMonthsFromNow = new Date();
  threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
  return end < threeMonthsFromNow;
}

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
const SummaryTable = ({ title, data, trainingMap = {} }: { title: string, data: any[], trainingMap?: Record<string, { start?: string; end?: string }> }) => {
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
                  <td className="border border-slate-300 px-3 py-3 font-black text-slate-800">{nameWithBadge(row.name, trainingMap[row.name])}</td>
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
  const [trainingMap, setTrainingMap] = useState<Record<string, { start?: string; end?: string }>>({});
  const [endDateMap, setEndDateMap] = useState<Record<string, string>>({});
  const [employeeIdMap, setEmployeeIdMap] = useState<Record<string, string>>({});
  const [homeBranchMap, setHomeBranchMap] = useState<Record<string, string>>({});
  const [columnReplacementBranch, setColumnReplacementBranch] = useState<Record<string, string>>({});
  const [managerReplacementBranch, setManagerReplacementBranch] = useState<Record<string, string>>({});
  const [selectedDay, setSelectedDay] = useState<string>("");
  // branch → set of employee names already assigned in their saved schedule for this week
  const [scheduledElsewhere, setScheduledElsewhere] = useState<Record<string, Record<string, Set<string>>>>({});

  // --- ADD EMPLOYEE MODAL ---
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [newEmployeePosition, setNewEmployeePosition] = useState("Part Time");
  const [addEmployeeError, setAddEmployeeError] = useState("");
  const [isAddingEmployee, setIsAddingEmployee] = useState(false);

  // --- NEW AUTOMATION FOR BRANCH MANAGERS ---
  useEffect(() => {
    if (session?.user) {
      const userRole = (session.user as any).role;
      const userBranch = (session.user as any).branchName;

      // If they are a branch manager, skip the selection screen immediately!
      if (isBranchManager(userRole) && userBranch) {
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
    const res = await fetch('/api/branch-staff?include=all');
    const staffList = await res.json();
    if (!Array.isArray(staffList)) return;
    const grouped: Record<string, string[]> = {};
    const managers: Record<string, string[]> = {};
    const tmap: Record<string, { start?: string; end?: string }> = {};
    const emap: Record<string, string> = {};
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
      if (s.endDate) {
        emap[s.name] = s.endDate;
      }
      if (s.employeeId) {
        idmap[s.name] = s.employeeId;
      }
    });
    setBranchStaffData(grouped);
    setBranchManagerData(managers);
    setTrainingMap(tmap);
    setEndDateMap(emap);
    setEmployeeIdMap(idmap);
    setHomeBranchMap(hmap);
  };

  useEffect(() => { fetchStaff(); }, []);

  // Set initial selected day when branch is confirmed
  useEffect(() => {
    if (hasConfirmedBranch && selectedBranch) {
      const days = getWorkingDaysForBranch(selectedBranch);
      if (days.length > 0) setSelectedDay(d => d && days.includes(d) ? d : days[0]);
    }
  }, [hasConfirmedBranch, selectedBranch]);

  // Fetch saved schedules for this week to detect cross-branch conflicts
  useEffect(() => {
    if (!startDateStr) return;
    const fetchSavedSchedules = async () => {
      try {
        const res = await fetch('/api/schedules');
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
            dayMap[dayName].add((val as string).toUpperCase());
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
        // Clear only this specific slot
        delete next[`${day}-${targetTime}-${columnId}`];
      } else {
        // Training is a whole-day assignment: never write a trainee into a
        // coach/exec/manager column for the same day, or someone already
        // doing coach/exec/manager work into a training column. The dropdowns
        // disable these options; this guards the write itself.
        const daySlots = getTimeSlotsForDay(day, selectedBranch);
        const targetIsTraining = columnId.startsWith("training");
        const dayConflict = daySlots.some((slot) =>
          ALL_COLUMNS.some((c) => {
            if (next[`${day}-${slot}-${c.id}`] !== name) return false;
            if (c.id === columnId) return false;
            return targetIsTraining ? c.type !== "training" : c.type === "training";
          }) || (targetIsTraining && next[`${day}-${slot}-MANAGER`] === name)
        );
        if (dayConflict) return prev;
        // Auto-fill ALL non-opening/closing slots in this column
        daySlots.forEach((slot) => {
          if (!isOpeningClosingSlot(slot, selectedBranch)) {
            if (columnId === "MANAGER") {
              // Skip slot if name is already in any coach/exec column for this slot
              const usedAsStaff = ALL_COLUMNS.some(c => next[`${day}-${slot}-${c.id}`] === name);
              if (usedAsStaff) return;
            } else {
              // Skip slot if name is already the manager for this slot
              if (next[`${day}-${slot}-MANAGER`] === name) return;
              // Skip slot if name is already in any other coach/exec column for this slot
              const usedInOtherColumn = ALL_COLUMNS.filter(c => c.id !== columnId).some(c => next[`${day}-${slot}-${c.id}`] === name);
              if (usedInOtherColumn) return;
            }
            next[`${day}-${slot}-${columnId}`] = name;
          }
        });
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
        let trainingSlotHoursForDay = 0;
        let workedThatDay = false;
        let inTrainingThatDay = false;

        getTimeSlotsForDay(day, selectedBranch).forEach((slot) => {
          if (isOpeningClosingSlot(slot, selectedBranch)) return;
          ALL_COLUMNS.forEach((col) => {
            if (selections[`${day}-${slot}-${col.id}`] !== emp) return;
            workedThatDay = true;
            const slotDuration = isAdminSlot(slot, selectedBranch) ? 0.25 : 1.25;
            // A training assignment makes the whole day a flat training day
            // (TRAINING_DAY_HOURS) — handled below.
            if (col.type === "training") {
              inTrainingThatDay = true;
              trainingSlotHoursForDay += slotDuration;
              return;
            }
            if (col.type === "coach" || col.type === "star_coach") coachingHoursForDay += slotDuration;
          });
        });

        if (!workedThatDay) return;

        if (inTrainingThatDay) {
          // Training day: a flat TRAINING_DAY_HOURS day, shown as slot hours
          // (coach) plus the remainder (exec) — the same split the manpower
          // cost report shows, where the day is paid at the flat training rate.
          const dayCoachHrs = coachingHoursForDay + trainingSlotHoursForDay;
          staffStats[emp].coachHrs += dayCoachHrs;
          staffStats[emp].execHrs += Math.max(0, TRAINING_DAY_HOURS - dayCoachHrs);
          staffStats[emp].total = staffStats[emp].coachHrs + staffStats[emp].execHrs;
          return;
        }

        // Online coaches (home branch = Online) have no exec hours —
        // coaching hours only. Keyed on the coach's HOME branch, not this
        // schedule's branch: when an online coach covers another branch they
        // still hold the class online, so the rule follows them there.
        // Day-aware for Pooja (physical-style on Saturdays only).
        const coachOnly = isOnlineCoachOnly(homeBranchMap[emp] ?? selectedBranch, employeeIdMap[emp], day);
        staffStats[emp].coachHrs += coachingHoursForDay;
        if (!coachOnly) {
          staffStats[emp].execHrs += Math.max(0, dailyTarget - coachingHoursForDay);
        }
        staffStats[emp].total = staffStats[emp].coachHrs + staffStats[emp].execHrs;
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
      const response = await fetch('/api/schedules', {
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
        body: JSON.stringify({ name: newEmployeeName.trim(), branch: selectedBranch, position: newEmployeePosition }),
      });
      const data = await res.json();
      if (!res.ok) { setAddEmployeeError(data.error || "Failed to add employee."); return; }
      await fetchStaff();
      setNewEmployeeName("");
      setNewEmployeePosition("Part Time");
      setShowAddEmployeeModal(false);
    } catch {
      setAddEmployeeError("Something went wrong. Please try again.");
    } finally {
      setIsAddingEmployee(false);
    }
  };

  const branchSpecificStaff = branchStaffData[selectedBranch] || [];
  const activeStaffList = Array.from(new Set([...SHARED_EMPLOYEES, ...branchSpecificStaff]));

  const dayHasData = (day: string) => Object.keys(selections).some(k => k.startsWith(`${day}-`));

  const getStaffColor = (name: string) => getStaffColorByIndex(name, activeStaffList);

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
              {/* ONLY show "Change Branch" if they are NOT a Branch Manager */}
              {hasConfirmedBranch && !hasConfirmedWeek && !isBranchManager(userRole) && (
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
            <div className="space-y-6">
              {isLocked && (
                 <div className="bg-slate-800 text-white p-4 rounded-xl flex justify-between items-center shadow-xl">
                   <span className="font-bold uppercase tracking-widest text-sm">🔒 Archived Record (Read-Only)</span>
                   <button onClick={() => setIsLocked(false)} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-black text-xs uppercase hover:bg-blue-500">Edit</button>
                 </div>
              )}

              {/* DAY TAB BUTTONS */}
              <div className="flex gap-2 flex-wrap">
                {getWorkingDaysForBranch(selectedBranch).map((day) => {
                  const isActive = selectedDay === day;
                  const hasData = dayHasData(day);
                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDay(day)}
                      className={`relative px-6 py-3 rounded-xl font-black uppercase text-sm tracking-wide transition-all shadow-sm ${
                        isActive
                          ? "bg-[#2D3F50] text-white shadow-lg scale-105"
                          : hasData
                          ? "bg-blue-50 text-blue-700 border-2 border-blue-300 hover:bg-blue-100"
                          : "bg-white text-slate-500 border-2 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {day.slice(0, 3)}
                      {hasData && (
                        <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${isActive ? "bg-green-400" : "bg-blue-500"}`} />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* SINGLE DAY TABLE */}
              {selectedDay && (() => {
                const day = selectedDay;
                const isEditing = !!editingDays[day] && !isLocked;
                const daySlots = getTimeSlotsForDay(day, selectedBranch);
                const dayColumns = getColumnsForDay(day, selectedBranch);
                // A name in a training column is in training the WHOLE day, so
                // block them from coach/exec/manager dropdowns today — and
                // block anyone already doing coach/exec/manager work today
                // from being picked as the trainee.
                const trainingNamesForDay = new Set<string>();
                const workingNamesForDay = new Set<string>();
                daySlots.forEach((s) => {
                  ALL_COLUMNS.forEach((c) => {
                    const v = selections[`${day}-${s}-${c.id}`];
                    if (!v || v === "None") return;
                    (c.type === "training" ? trainingNamesForDay : workingNamesForDay).add(v);
                  });
                  const mgr = selections[`${day}-${s}-MANAGER`];
                  if (mgr && mgr !== "None") workingNamesForDay.add(mgr);
                });
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
                            {dayColumns.map(col => (
                              <th key={col.id} className={`p-3 text-center border-l border-slate-600 w-[150px] ${col.type === 'exec' ? 'bg-slate-700 border-b-4 border-b-blue-400' : col.type === 'training' ? 'bg-yellow-600 border-b-4 border-b-yellow-400' : col.type === 'star_coach' ? 'bg-purple-700 border-b-4 border-b-purple-400' : ''}`}>
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
                                          ? getStaffColor(managerVal)
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
                                      {[...(branchManagerData[managerReplacementBranch[day] || selectedBranch] || []), ...(managerReplacementBranch[day] ? [] : getManagerExtrasForDay(selectedBranch, day))].map(e => {
                                        const mgReplacementBranch = managerReplacementBranch[day];
                                        const conflictBranch = mgReplacementBranch
                                          ? Object.entries(scheduledElsewhere).find(([, dayMap]) => dayMap[day]?.has(e.toUpperCase()))?.[0]
                                          : undefined;
                                        const isConflict = !!conflictBranch;
                                        const isAssignedAsStaff = ALL_COLUMNS.some(c => selections[`${day}-${slot}-${c.id}`] === e);
                                        // A trainee is in training the whole day — can't be manager on duty.
                                        const inTrainingToday = e !== managerVal && trainingNamesForDay.has(e);
                                        const isDisabled = isConflict || isAssignedAsStaff || inTrainingToday;
                                        const endingSoon = isEndingSoon(endDateMap[e]);
                                        return (
                                          <option key={e} value={e} disabled={isDisabled} style={endingSoon ? { color: '#dc2626' } : undefined}>
                                            {isConflict ? `${e} (at ${conflictBranch})` : isAssignedAsStaff ? `${e} (assigned as staff)` : inTrainingToday ? `${e} (in training today)` : `${e}${isInTraining(trainingMap[e]?.start, trainingMap[e]?.end) ? ' 🎓' : ''}`}
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
                                <td colSpan={dayColumns.length + 2} className="p-2 border-l text-center">
                                  <span className="inline-flex items-center gap-2 bg-blue-600 text-white text-xs font-black px-4 py-1.5 rounded-full uppercase tracking-widest">
                                    All Staff — Executive ({slotIndex === 0 ? "Opening" : "Closing"})
                                  </span>
                                </td>
                              ) : (
                                <>
                                  {dayColumns.map(col => {
                                    const val = selections[`${day}-${slot}-${col.id}`] || "";
                                    const replacementBranch = columnReplacementBranch[`${day}-${col.id}`];
                                    const colStaffList = replacementBranch
                                      ? (branchStaffData[replacementBranch] || [])
                                      : activeStaffList;
                                    // Only block names already selected in another column for THIS SAME SLOT
                                    const namesUsedInOtherColumns = new Set([
                                      ...ALL_COLUMNS.filter(c => c.id !== col.id)
                                        .map(c => selections[`${day}-${slot}-${c.id}`])
                                        .filter(Boolean),
                                      ...(managerVal ? [managerVal] : []),
                                    ]);

                                    return (
                                      <td key={col.id} className={`p-1.5 border-l ${col.type === 'exec' ? 'bg-slate-50' : col.type === 'training' ? 'bg-yellow-50' : col.type === 'star_coach' ? 'bg-purple-50' : ''}`}>
                                        <select disabled={!isEditing} value={val} onChange={(e) => handleNameSelect(day, slot, col.id, e.target.value)}
                                          className={`w-full p-2 rounded appearance-none text-center font-bold transition-all text-xs ${val ? getStaffColor(val) : 'bg-white border border-slate-200 text-slate-400 hover:bg-slate-50'}`}
                                          style={{ backgroundImage: `url("${val ? SELECT_ARROW_WHITE : SELECT_ARROW_DARK}")`, backgroundPosition: "right 0.3rem center", backgroundSize: "8px", backgroundRepeat: "no-repeat" }}>
                                          <option value="">None</option>
                                          {colStaffList.map(e => {
                                            const usedInCol = namesUsedInOtherColumns.has(e);
                                            // find which branch already has this employee scheduled on this specific day
                                            const conflictBranch = replacementBranch
                                              ? Object.entries(scheduledElsewhere).find(([, dayMap]) => dayMap[day]?.has(e.toUpperCase()))?.[0]
                                              : undefined;
                                            const isConflict = !!conflictBranch;
                                            // Training is a whole-day assignment: a trainee can't take
                                            // coach/exec work today, and someone already working today
                                            // can't be the trainee. (Their own current cell stays enabled
                                            // so the selection can be changed/cleared.)
                                            const inTrainingToday = col.type !== "training" && e !== val && trainingNamesForDay.has(e);
                                            const workingToday = col.type === "training" && e !== val && workingNamesForDay.has(e);
                                            const endingSoon = isEndingSoon(endDateMap[e]);
                                            return (
                                              <option key={e} value={e} disabled={usedInCol || isConflict || inTrainingToday || workingToday} className={endingSoon ? "font-bold" : "text-slate-800 font-bold"} style={endingSoon ? { color: '#dc2626' } : undefined}>
                                                {isConflict ? `${e} (at ${conflictBranch})`
                                                  : inTrainingToday ? `${e} (in training today)`
                                                  : workingToday ? `${e} (working today)`
                                                  : `${e}${isInTraining(trainingMap[e]?.start, trainingMap[e]?.end) ? ' 🎓' : ''}`}
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
              })()}

              <SummaryTable title="Weekly Hours Summary" data={calculateStaffHours()} trainingMap={trainingMap} />

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
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black uppercase text-slate-500">Role</label>
              <select
                value={newEmployeePosition}
                onChange={(e) => setNewEmployeePosition(e.target.value)}
                className="w-full p-3 border-2 border-slate-200 rounded-xl bg-slate-50 font-bold text-slate-700 outline-none focus:border-green-500 transition-colors"
              >
                <option value="Part Time">Part Time</option>
                <option value="Full Time">Full Time</option>
                <option value="Branch Manager">Branch Manager</option>
              </select>
              {newEmployeePosition === "Branch Manager" && (
                <p className="text-[10px] text-emerald-600 font-bold bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  This person will be set as Manager on Duty for {selectedBranch}.
                </p>
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