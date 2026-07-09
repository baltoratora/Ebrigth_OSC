"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import {
  ArrowLeft, MapPin, Calendar, User, Briefcase, Building2, Hash,
  CheckCircle2, AlertCircle, RefreshCw, Loader2, Users, CalendarX, Timer,
  X, Send, Clock3, ShieldCheck, ShieldX,
} from "lucide-react";

import Sidebar from "./Sidebar";
import { isEmployee } from "@/lib/roles";
import StatCard from "./ui/StatCard";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "./ui/Tooltip";
import {
  slotForDate,
  scheduleForDate,
  hasSchedule,
  checkInStatus as evalCheckIn,
  checkOutStatus as evalCheckOut,
  type CheckInStatus,
  type CheckOutStatus,
  type ScheduleVersion,
} from "@/lib/working-hours";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BranchStaffMember {
  id: number;
  name: string | null;
  employeeId: string | null;
  department: string | null;
  branch: string | null;
  role: string | null;
  email: string | null;
  location: string | null;
  workingHours: unknown;
}

interface LogEntry {
  date: string;
  empName: string;
  clockInTime: string | null;
  clockOutTime: string | null;
}

interface DayRow {
  no: number;
  date: string;
  dayLabel: string;
  clockIn: string | null;
  clockOut: string | null;
  hoursWorked: number | null;
  attendance: "Present" | "Rest Day" | "Off Day" | "No Data";
  inStatus: CheckInStatus | null;
  outStatus: CheckOutStatus | null;
  leaveType: string | null; // AL / MC / etc when on leave that day
}

interface Justification {
  date: string;
  reason: string | null;
  evidenceUrl: string | null;
  status: "pending" | "approved" | "rejected";
  reviewedBy: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];

function parseDateUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function dayLabel(dateStr: string): string {
  return DAYS[parseDateUTC(dateStr).getUTCDay()];
}

function isWeekend(dateStr: string): boolean {
  const d = parseDateUTC(dateStr).getUTCDay();
  return d === 0 || d === 1;
}

function parseTimeToMinutes(t: string | null): number | null {
  if (!t) return null;
  const parts = t.split(":");
  if (parts.length < 2) return null;
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

function minutesToHours(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function padDate(n: number): string {
  return String(n).padStart(2, "0");
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AttendanceReport() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { data: session } = useSession();
  const role = (session?.user as { role?: unknown } | undefined)?.role;
  // FT/PT viewing their OWN report: no branch/name picker — just their record,
  // and they can submit a reason on a No Record day for HR to review.
  const selfMode = isEmployee(role);

  const now = new Date();
  const [selectedYear, setSelectedYear]   = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  const [locations, setLocations] = useState<string[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [staff, setStaff] = useState<BranchStaffMember[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // Leave (AL / MC / etc) for the selected employee + month, keyed by YYYY-MM-DD.
  const [leaveByDate, setLeaveByDate] = useState<Map<string, string>>(new Map());

  // Dated working-hours history for the selected employee. When present, each
  // day is judged by the version active on that date (so changing this week's
  // hours never re-judges past weeks). Empty → fall back to the single current
  // workingHours for every date (unchanged behaviour for staff without history).
  const [scheduleVersions, setScheduleVersions] = useState<ScheduleVersion[]>([]);

  // Self-submitted No-Record justifications for the selected employee + month,
  // keyed by YYYY-MM-DD. Only meaningful in selfMode.
  const [justByDate, setJustByDate] = useState<Map<string, Justification>>(new Map());
  const [justifyTarget, setJustifyTarget] = useState<string | null>(null); // date, or null when closed
  const [justifyReason, setJustifyReason] = useState("");
  const [justifyFile, setJustifyFile] = useState<File | null>(null);
  const [justifySaving, setJustifySaving] = useState(false);
  const [justifyError, setJustifyError] = useState<string | null>(null);

  useEffect(() => {
    if (selfMode) return; // self-service skips the branch picker entirely
    fetch("/api/branch-locations")
      .then(r => r.json())
      .then(d => {
        const locs: string[] = d.locations ?? [];
        setLocations(locs);
        if (locs.length > 0) setSelectedLocation(locs[0]);
      })
      .catch(console.error);
  }, [selfMode]);

  // Self-service: fetch just the caller's own BranchStaff record once.
  useEffect(() => {
    if (!selfMode) return;
    fetch(`/api/branch-locations?location=self`)
      .then(r => r.json())
      .then(d => {
        const members: BranchStaffMember[] = d.staff ?? [];
        setStaff(members);
        setSelectedStaffId(members[0]?.id ?? null);
        setLogs([]);
      })
      .catch(console.error);
  }, [selfMode]);

  useEffect(() => {
    if (selfMode) return;
    if (!selectedLocation) return;
    fetch(`/api/branch-locations?location=${encodeURIComponent(selectedLocation)}`)
      .then(r => r.json())
      .then(d => {
        const members: BranchStaffMember[] = d.staff ?? [];
        setStaff(members);
        setSelectedStaffId(members[0]?.id ?? null);
        setLogs([]);
      })
      .catch(console.error);
  }, [selfMode, selectedLocation]);

  const selectedStaff = staff.find(s => s.id === selectedStaffId) ?? null;

  // ── Part A — bug fix: prefer stable empNo over fragile name-token search ──
  const fetchLogs = useCallback(async () => {
    if (!selectedStaff) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        month: String(selectedMonth),
        year:  String(selectedYear),
      });
      if (selectedStaff.employeeId) {
        params.set("empNo", selectedStaff.employeeId);
      } else if (selectedStaff.name) {
        params.set("staffName", selectedStaff.name);
      } else {
        setLogs([]); setLoading(false); return;
      }
      const res = await fetch(`/api/attendance-logs?${params.toString()}`);
      const data: LogEntry[] = await res.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [selectedStaff, selectedMonth, selectedYear]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // ── Pull this employee's leave for the month (keyed by date) ────────────────
  useEffect(() => {
    const empNo = selectedStaff?.employeeId;
    if (!empNo) { setLeaveByDate(new Map()); return; }
    fetch(`/api/leave-status?month=${selectedMonth}&year=${selectedYear}`)
      .then(r => (r.ok ? r.json() : { leaves: [] }))
      .then((d: { leaves?: { empNo: string; date: string; type: string }[] }) => {
        const map = new Map<string, string>();
        (d.leaves ?? []).forEach(l => { if (l.empNo === empNo) map.set(l.date, l.type); });
        setLeaveByDate(map);
      })
      .catch(() => setLeaveByDate(new Map()));
  }, [selectedStaff, selectedMonth, selectedYear]);

  // ── Pull this employee's dated schedule history ─────────────────────────────
  useEffect(() => {
    const id = selectedStaff?.id;
    if (!id) { setScheduleVersions([]); return; }
    fetch(`/api/staff-schedule?branchStaffId=${id}`)
      .then(r => (r.ok ? r.json() : { versions: [] }))
      .then((d: { versions?: ScheduleVersion[] }) => setScheduleVersions(d.versions ?? []))
      .catch(() => setScheduleVersions([]));
  }, [selectedStaff]);

  // ── Self-service: pull this employee's justification submissions for the
  //    month (pending/approved/rejected), keyed by date ───────────────────────
  const fetchJustifications = useCallback(() => {
    const empNo = selfMode ? selectedStaff?.employeeId : null;
    if (!empNo) { setJustByDate(new Map()); return; }
    fetch(`/api/attendance-justification?empNo=${encodeURIComponent(empNo)}&month=${selectedMonth}&year=${selectedYear}`)
      .then(r => (r.ok ? r.json() : { justifications: [] }))
      .then((d: { justifications?: Justification[] }) => {
        const map = new Map<string, Justification>();
        (d.justifications ?? []).forEach(j => map.set(j.date, j));
        setJustByDate(map);
      })
      .catch(() => setJustByDate(new Map()));
  }, [selfMode, selectedStaff, selectedMonth, selectedYear]);
  useEffect(() => { fetchJustifications(); }, [fetchJustifications]);

  const openJustify = useCallback((date: string) => {
    if (!selfMode) return;
    const existing = justByDate.get(date);
    if (existing?.status === "approved") return; // already settled, nothing to do
    setJustifyTarget(date);
    setJustifyReason(existing?.reason ?? "");
    setJustifyFile(null);
    setJustifyError(null);
  }, [selfMode, justByDate]);

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read the file"));
      reader.readAsDataURL(file);
    });

  const submitJustification = useCallback(async () => {
    if (!justifyTarget) return;
    if (!justifyReason.trim() && !justifyFile) {
      setJustifyError("Add a reason or attach evidence.");
      return;
    }
    setJustifySaving(true);
    setJustifyError(null);
    try {
      let evidenceBase64: string | undefined;
      let evidenceName: string | undefined;
      let evidenceMime: string | undefined;
      if (justifyFile) {
        evidenceBase64 = await fileToBase64(justifyFile);
        evidenceName = justifyFile.name;
        evidenceMime = justifyFile.type || "application/octet-stream";
      }
      const res = await fetch("/api/attendance-justification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "self",
          date: justifyTarget,
          reason: justifyReason.trim() || null,
          evidenceBase64, evidenceName, evidenceMime,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { error?: string }).error || "Failed to submit");
      }
      setJustifyTarget(null);
      setJustifyReason("");
      setJustifyFile(null);
      fetchJustifications();
    } catch (e) {
      setJustifyError((e as Error).message);
    } finally {
      setJustifySaving(false);
    }
  }, [justifyTarget, justifyReason, justifyFile, fetchJustifications]);

  // ── Build day rows for entire month ────────────────────────────────────────
  const rows: DayRow[] = [];
  const totalDays = getDaysInMonth(selectedYear, selectedMonth);

  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${selectedYear}-${padDate(selectedMonth)}-${padDate(d)}`;
    const log = logs.find(l => l.date === dateStr);

    let hoursWorked: number | null = null;
    if (log?.clockInTime && log?.clockOutTime) {
      const inMins = parseTimeToMinutes(log.clockInTime);
      const outMins = parseTimeToMinutes(log.clockOutTime);
      if (inMins !== null && outMins !== null && outMins > inMins) {
        hoursWorked = outMins - inMins;
      }
    }

    // A day only counts as "Present" when BOTH a clock-in AND a clock-out
    // exist — this keeps Days Present in step with Total Hours (which also
    // needs both scans). A lone scan (in without out, or vice-versa) is an
    // incomplete day: it drops through to "No Record" on a working day, or
    // "Rest Day" on a scheduled day off.
    const hasBothScans = !!(log?.clockInTime && log?.clockOutTime);

    // Which schedule applied on THIS date? With history, use the version active
    // on the date; otherwise fall back to the single current workingHours.
    // A date earlier than the first version resolves to undefined → no schedule
    // → no Late/Early badge (this is what stops past weeks being re-judged).
    const activeSchedule = scheduleVersions.length > 0
      ? scheduleForDate(scheduleVersions, dateStr)
      : selectedStaff?.workingHours;

    // Late / Left Early, driven by the schedule that applied on this weekday.
    // Only meaningful on days they actually scanned.
    const slot = slotForDate(activeSchedule, dateStr);
    const inStatus  = log?.clockInTime ? evalCheckIn(slot, log.clockInTime) : null;
    const outStatus = evalCheckOut(slot, log?.clockOutTime ?? null);

    // Off-day detection: when a schedule applied that day, a null slot means a
    // rest day; otherwise fall back to the default Sun/Mon weekend.
    const restDay = hasSchedule(activeSchedule)
      ? slot === null
      : isWeekend(dateStr);

    rows.push({
      no: d,
      date: dateStr,
      dayLabel: dayLabel(dateStr),
      clockIn: log?.clockInTime ?? null,
      clockOut: log?.clockOutTime ?? null,
      hoursWorked,
      attendance: hasBothScans ? "Present" : restDay && hasSchedule(activeSchedule) ? "Off Day" : restDay ? "Rest Day" : "No Data",
      inStatus,
      outStatus,
      leaveType: leaveByDate.get(dateStr) ?? null,
    });
  }

  const presentCount = rows.filter(r => r.attendance === "Present").length;
  // A day covered by leave is a legitimate absence, not a missing scan.
  const noDataCount  = rows.filter(r => r.attendance === "No Data" && !r.leaveType).length;
  const leaveCount   = rows.filter(r => !!r.leaveType).length;
  const totalMinutes = rows.reduce((sum, r) => sum + (r.hoursWorked ?? 0), 0);

  // Schedule-driven tallies for the selected employee/month.
  const scheduleSet    = hasSchedule(selectedStaff?.workingHours);
  const lateCount      = rows.filter(r => r.inStatus === "Late").length;
  const leftEarlyCount = rows.filter(r => r.outStatus === "Left Early").length;

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/50 to-indigo-50/30">
      <TooltipProvider delayDuration={150}>
      <Sidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen(p => !p)} />

      <div className="flex-1 flex flex-col">
        {/* ── Header ── */}
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <button onClick={() => router.back()}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Attendance Report</h1>
                  <p className="text-sm text-gray-500 mt-0.5">Monthly attendance breakdown · Pulled live from scanner logs</p>
                </div>
              </div>
              {loading && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border bg-blue-50 text-blue-700 border-blue-200">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Loading…
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-8 w-full">
          {/* ── Stat Cards ── */}
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <StatCard
              label="Days Present"
              value={presentCount}
              icon={CheckCircle2}
              tone="green"
              tooltip={`Working days the employee scanned in during ${MONTHS[selectedMonth - 1]} ${selectedYear}.`}
            />
            <StatCard
              label="No Record"
              value={noDataCount}
              icon={CalendarX}
              tone="red"
              tooltip="Working days with no scanner record. May indicate leave, sick day, or a missed scan."
            />
            <StatCard
              label="On Leave"
              value={leaveCount}
              icon={Calendar}
              tone="blue"
              tooltip="Days this employee was on leave (AL / MC / etc) this month."
            />
            <StatCard
              label="Total Hours"
              value={Math.round(totalMinutes / 60)}
              icon={Timer}
              tone="orange"
              subtitle={totalMinutes > 0 ? minutesToHours(totalMinutes) : "—"}
              tooltip="Sum of all clock-in to clock-out durations this month."
            />
          </motion.div>

          {/* ── Two-column body: filter card + table card ── */}
          <motion.div
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
          >
            <div className="lg:col-span-4">
              {/* Filter card */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden sticky top-6">
                <div className="px-5 py-4 border-b border-gray-200">
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-6 bg-blue-500 rounded-full" />
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">{selfMode ? "Your Attendance" : "Employee"}</h2>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {selfMode ? "Your own report — pick the period" : "Pick the staff member and period"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  {selfMode ? (
                    selectedStaff && (
                      <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-200">
                        <User className="w-4 h-4 text-blue-500 shrink-0" />
                        <span className="text-sm font-semibold text-gray-800">{selectedStaff.name}</span>
                      </div>
                    )
                  ) : (
                  <>
                  {/* Branch */}
                  <div>
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                      <MapPin className="w-3 h-3" /> Branch
                    </label>
                    <select value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all cursor-pointer">
                      {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                    </select>
                  </div>

                  {/* Name */}
                  <div>
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                      <User className="w-3 h-3" /> Name
                    </label>
                    <select value={selectedStaffId ?? ""} onChange={e => setSelectedStaffId(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all cursor-pointer">
                      {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  </>
                  )}

                  {/* Read-only details */}
                  {selectedStaff && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-[11px] text-gray-500"><Hash className="w-3 h-3" /> Employee ID</span>
                        <span className="text-xs font-mono font-semibold text-gray-800">{selectedStaff.employeeId || "—"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-[11px] text-gray-500"><Building2 className="w-3 h-3" /> Department</span>
                        <span className="text-xs font-medium text-gray-800 truncate">{selectedStaff.department || selectedStaff.branch || "—"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-[11px] text-gray-500"><Briefcase className="w-3 h-3" /> Role</span>
                        <span className="text-xs font-medium text-gray-800 truncate">{selectedStaff.role || "—"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-[11px] text-gray-500"><MapPin className="w-3 h-3" /> Location</span>
                        <span className="text-xs font-medium text-gray-800">{selectedStaff.location || "—"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-[11px] text-gray-500"><Timer className="w-3 h-3" /> Schedule</span>
                        {scheduleSet ? (
                          <span className="text-xs font-medium text-emerald-700">Set</span>
                        ) : (
                          <span className="text-xs font-medium text-amber-600">Not set</span>
                        )}
                      </div>
                      {scheduleSet && (
                        <div className="flex items-center gap-2 pt-2 border-t border-gray-200 flex-wrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-600 ring-1 ring-red-200">
                            <AlertCircle className="w-3 h-3" /> {lateCount} late
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-600 ring-1 ring-amber-200">
                            <Timer className="w-3 h-3" /> {leftEarlyCount} left early
                          </span>
                          {leaveCount > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-50 text-violet-600 ring-1 ring-violet-200">
                              <Calendar className="w-3 h-3" /> {leaveCount} leave
                            </span>
                          )}
                        </div>
                      )}
                      {!scheduleSet && (
                        <p className="text-[10px] text-amber-600 leading-snug pt-1 border-t border-gray-200">
                          No working hours configured — set them in the Staff Directory to track Late / Left Early.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Period */}
                  <div className="pt-3 border-t border-gray-200">
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                      <Calendar className="w-3 h-3" /> Period
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}
                        className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all cursor-pointer">
                        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                      </select>
                      <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
                        className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all cursor-pointer">
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-8">
              {/* Table card */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-6 bg-blue-500 rounded-full" />
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">{MONTHS[selectedMonth - 1]} {selectedYear}</h2>
                      <p className="text-xs text-gray-500 mt-0.5">{selectedStaff?.name ?? "Select an employee"}</p>
                    </div>
                  </div>
                  <button onClick={fetchLogs}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-3 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">No.</th>
                        <th className="px-3 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Day</th>
                        <th className="px-3 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                        <th className="px-3 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Clock In</th>
                        <th className="px-3 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Clock Out</th>
                        <th className="px-3 py-3 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Duration</th>
                        <th className="px-3 py-3 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 && !loading ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-16">
                            <div className="flex flex-col items-center gap-3 text-center">
                              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                                <Users className="w-5 h-5 text-gray-400" />
                              </div>
                              <p className="text-sm font-medium text-gray-700">
                                {staff.length === 0
                                  ? "Select a branch to load employees…"
                                  : "No working days in this period."}
                              </p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        rows.map(row => {
                          const isRestDayRow = row.attendance === "Rest Day" || row.attendance === "Off Day";
                          const isNoData     = row.attendance === "No Data";
                          const isToday      = row.date === todayStr;
                          const just = selfMode ? justByDate.get(row.date) : undefined;
                          const canClickToJustify = selfMode && isNoData && !row.leaveType && just?.status !== "approved";
                          return (
                            <Tooltip key={row.date}>
                              <TooltipTrigger asChild>
                                <tr className={`border-b border-gray-100 transition-colors cursor-default ${
                                  isToday      ? "bg-blue-50/50 border-l-2 border-l-blue-400" :
                                  isRestDayRow ? "bg-gray-50/50" :
                                  isNoData     ? "hover:bg-rose-50/30" :
                                                 "hover:bg-blue-50/40"
                                }`}>
                                  <td className="px-3 py-3 text-xs font-mono text-gray-400">{row.no}</td>
                                  <td className={`px-3 py-3 text-sm font-semibold ${isRestDayRow ? "text-gray-400" : "text-blue-600"}`}>{row.dayLabel}</td>
                                  <td className="px-3 py-3 text-sm text-gray-700">{row.date.split("-").reverse().join("/")}</td>
                                  <td className="px-3 py-3 text-sm font-mono font-semibold">
                                    {row.clockIn ? (
                                      <span className="inline-flex items-center gap-1.5">
                                        <span className={row.inStatus === "Late" ? "text-red-600" : "text-green-700"}>{row.clockIn}</span>
                                        {row.inStatus === "Late" && (
                                          <span className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold bg-red-50 text-red-600 ring-1 ring-red-200">LATE</span>
                                        )}
                                      </span>
                                    ) : <span className="text-gray-300 font-normal">—</span>}
                                  </td>
                                  <td className="px-3 py-3 text-sm font-mono font-semibold">
                                    {row.clockOut ? (
                                      <span className="inline-flex items-center gap-1.5">
                                        <span className={row.outStatus === "Left Early" ? "text-amber-600" : "text-orange-600"}>{row.clockOut}</span>
                                        {row.outStatus === "Left Early" && (
                                          <span className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold bg-amber-50 text-amber-600 ring-1 ring-amber-200">EARLY</span>
                                        )}
                                      </span>
                                    ) : <span className="text-gray-300 font-normal">—</span>}
                                  </td>
                                  <td className="px-3 py-3 text-sm text-center text-gray-700">
                                    {row.hoursWorked !== null ? minutesToHours(row.hoursWorked) : <span className="text-gray-300">—</span>}
                                  </td>
                                  <td className="px-3 py-3 text-center">
                                    {row.attendance === "Rest Day" ? (
                                      <span className="text-gray-300">—</span>
                                    ) : row.attendance === "Off Day" ? (
                                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500 ring-1 ring-slate-200">
                                        Off Day
                                      </span>
                                    ) : row.attendance === "Present" ? (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-green-50 text-green-700 ring-1 ring-green-200">
                                        <CheckCircle2 className="w-3 h-3" /> Present
                                      </span>
                                    ) : row.leaveType ? (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-violet-50 text-violet-700 ring-1 ring-violet-200">
                                        <Calendar className="w-3 h-3" /> {row.leaveType}
                                      </span>
                                    ) : just?.status === "approved" ? (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                                        <ShieldCheck className="w-3 h-3" /> Justified
                                      </span>
                                    ) : just?.status === "pending" ? (
                                      <button
                                        onClick={() => openJustify(row.date)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100 transition-colors"
                                      >
                                        <Clock3 className="w-3 h-3" /> Pending review
                                      </button>
                                    ) : just?.status === "rejected" ? (
                                      <button
                                        onClick={() => openJustify(row.date)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100 transition-colors"
                                      >
                                        <ShieldX className="w-3 h-3" /> Rejected — resubmit
                                      </button>
                                    ) : canClickToJustify ? (
                                      <button
                                        onClick={() => openJustify(row.date)}
                                        title="Submit a reason for HR to review"
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100 transition-colors"
                                      >
                                        <AlertCircle className="w-3 h-3" /> No Record
                                      </button>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 ring-1 ring-rose-200">
                                        <AlertCircle className="w-3 h-3" /> No Record
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              </TooltipTrigger>
                              <TooltipContent side="left" align="center" className="!max-w-[260px]">
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between gap-3 pb-1.5 border-b border-gray-100">
                                    <span className="text-sm font-semibold text-gray-900">{row.dayLabel}, {row.date.split("-").reverse().join("/")}</span>
                                    {isToday && <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide">Today</span>}
                                  </div>
                                  <div className="grid grid-cols-[80px_1fr] gap-x-2 gap-y-0.5 text-[11px]">
                                    <span className="text-gray-500">Clock in</span>
                                    <span className="font-mono font-medium text-green-700">{row.clockIn ?? "—"}</span>
                                    <span className="text-gray-500">Clock out</span>
                                    <span className="font-mono font-medium text-orange-600">{row.clockOut ?? "—"}</span>
                                    <span className="text-gray-500">Duration</span>
                                    <span className="font-medium text-gray-800">{row.hoursWorked !== null ? minutesToHours(row.hoursWorked) : "—"}</span>
                                    <span className="text-gray-500">Status</span>
                                    <span className={`font-semibold ${
                                      row.attendance === "Present"  ? "text-green-700" :
                                      row.attendance === "Rest Day" ? "text-gray-400" :
                                      row.attendance === "Off Day"  ? "text-slate-500" :
                                      row.leaveType                  ? "text-violet-700" :
                                                                       "text-rose-700"
                                    }`}>{
                                      row.attendance === "Present"  ? "Present" :
                                      row.attendance === "Rest Day" ? "—" :
                                      row.attendance === "Off Day"  ? "Off Day" :
                                      row.leaveType                  ? `On leave (${row.leaveType})` :
                                                                       "No Record"
                                    }</span>
                                  </div>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <p className="mt-3 text-[11px] text-gray-400 text-center">
                Pulled live from scanner logs · Hours = clock-in to clock-out ·{" "}
                <span className="text-red-500 font-semibold">LATE</span> = in &gt;1 min after start ·{" "}
                <span className="text-amber-500 font-semibold">EARLY</span> = out before scheduled end ·{" "}
                <span className="text-violet-500 font-semibold">AL/MC</span> = on leave
              </p>
            </div>
          </motion.div>
        </main>
      </div>

      {/* Self-service justify modal — FT/PT submitting a reason for a No
          Record day. Goes to HR as "pending"; HR approves/rejects it. */}
      {justifyTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !justifySaving && setJustifyTarget(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-gray-900">Submit a reason</h3>
              </div>
              <button
                onClick={() => !justifySaving && setJustifyTarget(null)}
                className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="text-sm">
                <p className="font-semibold text-gray-900">
                  {new Date(justifyTarget + "T00:00:00").toLocaleDateString("en-GB", {
                    weekday: "long", day: "2-digit", month: "long", year: "numeric",
                  })}
                </p>
                <p className="text-xs text-gray-500">No scanner record found for this day.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Reason</label>
                <textarea
                  value={justifyReason}
                  onChange={e => setJustifyReason(e.target.value)}
                  rows={3}
                  placeholder="e.g. Forgot to scan, scanner was down, approved WFH…"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Evidence (optional)</label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={e => setJustifyFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-xs text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {justifyFile && <p className="text-[11px] text-gray-500 mt-1 truncate">{justifyFile.name}</p>}
              </div>
              <p className="text-[11px] text-gray-400">
                This goes to HR for approval — you&apos;ll see &quot;Pending review&quot; until they decide.
              </p>
              {justifyError && <p className="text-xs text-rose-600">{justifyError}</p>}
            </div>
            <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-end gap-2">
              <button
                onClick={() => setJustifyTarget(null)}
                disabled={justifySaving}
                className="px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submitJustification}
                disabled={justifySaving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
              >
                {justifySaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {justifySaving ? "Submitting…" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
      </TooltipProvider>
    </div>
  );
}
