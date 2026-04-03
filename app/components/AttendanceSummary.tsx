"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import SubAccountSwitcher from "./SubAccountSwitcher";
import Sidebar from "./Sidebar";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Employee {
  name: string;     // full name from CSV e.g. "KEVIN KHOO"
  dept: string;
  position: string;
  eid: string;
  scannerRef: string; // derived from EID last col: parts[1]+parts[0].slice(0,2)+parts[2] e.g. "22030001"
}

interface RawScanEvent {
  employeeNoString: string;
  time: string;
}

interface AttendanceRecord {
  // Keyed by employeeNoString so each person has exactly one row per day
  empNo: string;
  name: string;
  dept: string;
  position: string;
  checkInTime: Date;
  checkInStr: string;
  checkInStatus: "On Time" | "Late";
  checkOutTime: Date | null;
  checkOutStr: string | null;
  checkOutStatus: "Normal" | "Left Early" | null;
  scanCount: number; // total scans from device today
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const cols: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      cols.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cols.push(current.trim());
  return cols.map((col) => col.replace(/^"|"$/g, ""));
}

function parseCSV(text: string): Employee[] {
  const lines = text.trim().split("\n");
  // Row 0 = blank/meta, Row 1 = headers — skip both
  return lines
    .slice(2)
    .map((line) => {
      const cols = parseCSVLine(line);
      if (cols.length < 4) return null;
      const eid = cols[cols.length - 1] ?? "";
      const parts = eid.trim().split(" ");
      const scannerRef = parts.length === 3 ? parts[1] + parts[0].substring(0, 2) + parts[2] : "";
      return {
        name: cols[0] ?? "",
        dept: cols[1] ?? "",
        position: cols[3] ?? "",
        eid,
        scannerRef,
      } as Employee;
    })
    .filter((e): e is Employee => !!e && e.name !== "");
}

// ─── Status helpers ────────────────────────────────────────────────────────────

function timeToSeconds(t: string): number {
  const [h, m, s] = t.split(":").map(Number);
  return h * 3600 + m * 60 + (s ?? 0);
}

function getCheckInStatus(timeStr: string): "On Time" | "Late" {
  return timeToSeconds(timeStr) <= timeToSeconds("09:00:00") ? "On Time" : "Late";
}

function getCheckOutStatus(timeStr: string): "Normal" | "Left Early" {
  return timeToSeconds(timeStr) >= timeToSeconds("18:00:00") ? "Normal" : "Left Early";
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-MY", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-MY", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ─── Core logic: build one row per employee from raw scan events ───────────────
//
// Rules:
//   • 1st scan (chronologically) = Check In — NEVER overwritten
//   • 2nd scan onward = Check Out, always updating to the LATEST scan time
//     (so an accidental early scan gets corrected by the real departure scan)

function buildAttendanceLogs(
  rawEvents: RawScanEvent[],
  employees: Employee[]
): AttendanceRecord[] {
  // Group events by employeeNoString
  const groups = new Map<string, Date[]>();
  for (const event of rawEvents) {
    const t = new Date(event.time);
    if (isNaN(t.getTime())) continue;
    if (!groups.has(event.employeeNoString)) groups.set(event.employeeNoString, []);
    groups.get(event.employeeNoString)!.push(t);
  }

  const records: AttendanceRecord[] = [];

  for (const [empNo, times] of groups) {
    const sorted = [...times].sort((a, b) => a.getTime() - b.getTime());
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const hasCheckOut = sorted.length > 1;

    const checkInStr = formatTime(first);
    const checkOutStr = hasCheckOut ? formatTime(last) : null;

    // Look up employee directly by scannerRef derived from CSV EID column
    const emp = employees.find((e) => e.scannerRef === empNo);

    records.push({
      empNo,
      name: emp?.name ?? "Unknown",
      dept: emp?.dept ?? "—",
      position: emp?.position ?? "—",
      checkInTime: first,
      checkInStr,
      checkInStatus: getCheckInStatus(checkInStr),
      checkOutTime: hasCheckOut ? last : null,
      checkOutStr,
      checkOutStatus: checkOutStr ? getCheckOutStatus(checkOutStr) : null,
      scanCount: sorted.length,
    });
  }

  // Sort: most recent check-in first
  return records.sort((a, b) => b.checkInTime.getTime() - a.checkInTime.getTime());
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AttendanceSummary() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [logs, setLogs] = useState<AttendanceRecord[]>([]);
  const [scannerStatus, setScannerStatus] = useState<"idle" | "ok" | "error">("idle");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Stable ref so the polling interval always sees the latest employees
  const employeesRef = useRef<Employee[]>([]);
  useEffect(() => { employeesRef.current = employees; }, [employees]);

  // ── Load employee CSV ──────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/employees.csv")
      .then((r) => r.text())
      .then((text) => setEmployees(parseCSV(text)))
      .catch(() => console.error("Failed to load employees.csv"));
  }, []);

  // ── Poll /api/test-scanner every 5 seconds ─────────────────────────────────
  const fetchScans = useCallback(async () => {
    try {
      const res = await fetch("/api/test-scanner");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw: RawScanEvent[] = await res.json();
      const built = buildAttendanceLogs(raw, employeesRef.current);
      setLogs(built);
      setScannerStatus("ok");
      setLastUpdated(formatTime(new Date()));
    } catch {
      setScannerStatus("error");
    }
  }, []);

  useEffect(() => {
    fetchScans();
    const interval = setInterval(fetchScans, 5000);
    return () => clearInterval(interval);
  }, [fetchScans]);

  // ── End-of-day reset (clears display; scanner resets naturally at midnight) ─
  const handleReset = useCallback(() => {
    if (!window.confirm("Clear the displayed attendance records? The scanner's own data is unaffected.")) return;
    setLogs([]);
  }, []);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const checkedInCount = logs.filter((r) => r.checkOutStr === null).length;
  const checkedOutCount = logs.filter((r) => r.checkOutStr !== null).length;

  return (
    <div className="flex min-h-screen bg-blue-50">
      <Sidebar sidebarOpen={sidebarOpen} onCollapse={() => setSidebarOpen(!sidebarOpen)} />

      <div className="flex-1 flex flex-col">
        {/* ── Header ── */}
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-6 flex items-center gap-4 flex-wrap">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-gray-100 rounded transition-colors"
              title="Toggle Sidebar"
            >
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <SubAccountSwitcher />
            <button onClick={() => router.back()} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">
              ← Back
            </button>
            <h1 className="text-3xl font-bold text-blue-800">Attendance Dashboard</h1>

            <div className="ml-auto flex items-center gap-3">
              <button
                onClick={handleReset}
                className="px-4 py-2 bg-red-50 border border-red-200 text-red-700 text-sm font-medium rounded-lg hover:bg-red-100 transition-colors"
              >
                End of Day Reset
              </button>

              {/* Scanner connection pill */}
              {scannerStatus === "ok" && (
                <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-sm text-green-700 font-medium">Scanner Connected</span>
                </div>
              )}
              {scannerStatus === "error" && (
                <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-sm text-red-700 font-medium">Scanner Offline</span>
                </div>
              )}
              {scannerStatus === "idle" && (
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                  <span className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" />
                  <span className="text-sm text-gray-500 font-medium">Connecting…</span>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-8 w-full">
          {/* ── Stat Cards ── */}
          <div className="grid grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-xl shadow-md p-6 flex flex-col items-center">
              <p className="text-4xl font-bold text-blue-600">{logs.length}</p>
              <p className="text-sm text-gray-500 mt-1 font-medium">Employees Scanned</p>
            </div>
            <div className="bg-white rounded-xl shadow-md p-6 flex flex-col items-center">
              <p className="text-4xl font-bold text-green-600">{checkedInCount}</p>
              <p className="text-sm text-gray-500 mt-1 font-medium">Currently In</p>
            </div>
            <div className="bg-white rounded-xl shadow-md p-6 flex flex-col items-center">
              <p className="text-4xl font-bold text-orange-500">{checkedOutCount}</p>
              <p className="text-sm text-gray-500 mt-1 font-medium">Checked Out</p>
            </div>
          </div>

          {/* ── Info Banner ── */}
          <div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-xl flex items-start gap-3">
            <svg className="w-5 h-5 text-indigo-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 9V7a5 5 0 00-10 0v2a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2z" />
            </svg>
            <div className="text-sm text-indigo-700">
              <strong>Thumbprint Scanner Active.</strong> Each employee's row updates automatically every 5 seconds.
              &nbsp;1st scan = <strong>Check-In</strong>. All subsequent scans update <strong>Check-Out</strong> to the latest time
              — so an accidental early tap is always corrected by the final departure scan.
              {lastUpdated && (
                <span className="ml-2 text-indigo-400">Last synced: {lastUpdated}</span>
              )}
            </div>
          </div>

          {/* ── Attendance Table ── */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-800">Today&apos;s Attendance</h2>
              <span className="text-xs text-gray-400">
                {logs.length} employee{logs.length !== 1 ? "s" : ""} · auto-refreshes every 5s
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-blue-600 text-white">
                    <th className="px-4 py-3 text-left text-sm font-semibold">Employee</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Dept / Role</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Date</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Check In</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">In Status</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Check Out</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Out Status</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Scans</th>
                  </tr>
                </thead>
                <tbody>
                  {scannerStatus === "idle" ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-16 text-center text-gray-400 text-sm">
                        Connecting to thumbprint scanner…
                      </td>
                    </tr>
                  ) : scannerStatus === "error" ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-16 text-center text-red-400 text-sm">
                        Could not reach the scanner at 192.168.100.147. Check power and network.
                      </td>
                    </tr>
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-16 text-center text-gray-400 text-sm">
                        No scans recorded today yet. Waiting for first thumbprint…
                      </td>
                    </tr>
                  ) : (
                    logs.map((record) => (
                      <tr
                        key={record.empNo}
                        className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-gray-800">{record.name}</p>
                          <p className="text-xs font-mono text-gray-400">{record.empNo}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          <span className="font-medium">{record.dept}</span>
                          {record.position !== "—" && (
                            <>
                              <span className="mx-1 text-gray-300">·</span>
                              <span>{record.position}</span>
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {formatDate(record.checkInTime)}
                        </td>
                        <td className="px-4 py-3 text-sm font-mono font-semibold text-green-700">
                          {record.checkInStr}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            record.checkInStatus === "On Time"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-700"
                          }`}>
                            {record.checkInStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm font-mono font-semibold text-orange-600">
                          {record.checkOutStr ?? <span className="text-gray-300 font-normal">—</span>}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {record.checkOutStatus ? (
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              record.checkOutStatus === "Normal"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-yellow-100 text-yellow-700"
                            }`}>
                              {record.checkOutStatus}
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700">
                              Checked In
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-center text-gray-500">
                          <span className="px-2 py-0.5 bg-gray-100 rounded-full text-xs font-mono">
                            {record.scanCount}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Registered Employee Reference (collapsible) ── */}
          <details className="mt-6 bg-white rounded-xl shadow-md overflow-hidden">
            <summary className="px-6 py-4 text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-50 select-none">
              Registered Employees ({employees.length}) — click to expand
            </summary>
            <div className="overflow-x-auto border-t border-gray-100">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Scanner ID</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Dept</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Position</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e) => (
                    <tr key={e.scannerRef} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2 text-xs font-mono text-gray-600">{e.scannerRef}</td>
                      <td className="px-4 py-2 text-sm text-gray-800 font-medium">{e.name}</td>
                      <td className="px-4 py-2 text-sm text-gray-600">{e.dept}</td>
                      <td className="px-4 py-2 text-sm text-gray-600">{e.position}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </main>
      </div>
    </div>
  );
}
