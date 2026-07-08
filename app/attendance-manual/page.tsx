"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import Sidebar from "@/app/components/Sidebar";
import UserHeader from "@/app/components/UserHeader";
import { isAdmin, isHOD, isHR, isAcademy } from "@/lib/roles";

interface StaffAttendance {
  rowId: string | null;
  employeeId: string;
  name: string;
  role: string | null;
  homeBranch: string | null;
  isAdhoc: boolean;
  status: string | null;
}
interface Person {
  employeeId: string;
  name: string;
  role: string | null;
}

const STATUS_TONE: Record<string, string> = {
  present: "bg-emerald-100 text-emerald-700",
  absent: "bg-red-100 text-red-700",
  leave: "bg-indigo-100 text-indigo-700",
  mia: "bg-orange-100 text-orange-700",
  late: "bg-amber-100 text-amber-700",
};
const STATUS_LABEL: Record<string, string> = {
  present: "Present",
  absent: "Absent",
  leave: "Leave",
  mia: "MIA",
  late: "Late",
};

function todayKL(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

export default function AttendanceManualPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: unknown } | undefined)?.role;
  const branchName = (session?.user as { branchName?: string | null } | undefined)?.branchName ?? null;
  const canSeeAllBranches = isAdmin(role) || isHOD(role) || isHR(role) || isAcademy(role);
  // Super Admin / Admin / HR (isAdmin covers all three) can edit any day.
  // Everyone else at the branch (BM, HOD) can only edit TODAY — older days
  // are view-only for them, enforced again server-side.
  const canEditAnyDate = isAdmin(role);

  // Collapsed by default, same as every other dashboard page (Attendance
  // Summary etc.) — starting it open also forced the mobile drawer open on
  // load, which is what caused the "two shades of white" look on phones
  // (white sidebar drawer sitting on top of the gray-50 page background).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [branch, setBranch] = useState<string>(canSeeAllBranches ? "" : (branchName ?? ""));
  const [date, setDate] = useState<string>(todayKL());
  const [staff, setStaff] = useState<StaffAttendance[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Local, unsaved pick per row (present/absent) — nothing is written until
  // "Save" is clicked, and once saved a row locks for good (no further edits).
  const [pending, setPending] = useState<Record<string, "present" | "absent">>({});

  // Add-employee (replacement) picker: pick a source branch, then a name.
  const [addOpen, setAddOpen] = useState(false);
  const [allBranches, setAllBranches] = useState<string[]>([]);
  const [addSourceBranch, setAddSourceBranch] = useState("");
  const [addPeople, setAddPeople] = useState<Person[]>([]);
  const [addPeopleLoading, setAddPeopleLoading] = useState(false);
  const [addEmployeeId, setAddEmployeeId] = useState("");
  const [addBusy, setAddBusy] = useState(false);

  const dateLabel = new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
  const canEdit = canEditAnyDate || date === todayKL();

  useEffect(() => {
    if (!canSeeAllBranches) return;
    fetch("/api/attendance-manual/branches")
      .then((r) => (r.ok ? r.json() : { branches: [] }))
      .then((d) => setBranches(d.branches ?? []))
      .catch(() => setBranches([]));
  }, [canSeeAllBranches]);

  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!branch) { setStaff([]); return; }
    setLoading(true);
    setLoadError(null);
    fetch(`/api/attendance-manual?branch=${encodeURIComponent(branch)}&date=${date}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `Failed to load (HTTP ${r.status})`);
        return d;
      })
      .then((d) => setStaff(d.staff ?? []))
      .catch((err) => {
        setStaff([]);
        setLoadError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => setLoading(false));
  }, [branch, date]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  function pick(employeeId: string, status: "present" | "absent") {
    setPending((p) => ({ ...p, [employeeId]: status }));
  }

  async function saveStatus(employeeId: string) {
    const status = pending[employeeId];
    if (!status) return;
    setSavingId(employeeId);
    try {
      const res = await fetch("/api/attendance-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", branch, date, employeeId, status }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Failed to save");
      setPending((p) => { const n = { ...p }; delete n[employeeId]; return n; });
      setToast(`Saved as ${STATUS_LABEL[status]}`);
      load();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingId(null);
    }
  }

  async function removeAdhoc(rowId: string, name: string) {
    if (!confirm(`Remove ${name} from this day's list entirely?`)) return;
    try {
      await fetch(`/api/attendance-manual?id=${encodeURIComponent(rowId)}`, { method: "DELETE" });
      setToast(`Removed ${name}`);
      load();
    } catch {
      setToast("Failed to remove");
    }
  }

  function openAdd() {
    setAddOpen(true);
    setAddSourceBranch("");
    setAddPeople([]);
    setAddEmployeeId("");
    if (allBranches.length === 0) {
      fetch("/api/attendance-manual/branches?includeHqSt=1")
        .then((r) => (r.ok ? r.json() : { branches: [] }))
        .then((d) => setAllBranches(d.branches ?? []))
        .catch(() => setAllBranches([]));
    }
  }

  function pickAddSourceBranch(b: string) {
    setAddSourceBranch(b);
    setAddEmployeeId("");
    setAddPeople([]);
    if (!b) return;
    setAddPeopleLoading(true);
    fetch(`/api/attendance-manual/people?branch=${encodeURIComponent(b)}`)
      .then((r) => (r.ok ? r.json() : { people: [] }))
      .then((d) => setAddPeople(d.people ?? []))
      .catch(() => setAddPeople([]))
      .finally(() => setAddPeopleLoading(false));
  }

  async function submitAdd() {
    if (!addEmployeeId) return;
    setAddBusy(true);
    try {
      const res = await fetch("/api/attendance-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", branch, date, employeeId: addEmployeeId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Failed to add");
      setAddOpen(false);
      setToast("Added to this day's list");
      load();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setAddBusy(false);
    }
  }

  const filteredStaff = staff.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen((p) => !p)} />
      <div className="flex-1 flex flex-col">
        <header className="bg-slate-900 text-white shrink-0 relative">
          <div className="relative flex flex-wrap justify-between items-center gap-3 pl-16 pr-4 py-6 sm:px-10 sm:py-8">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight uppercase">
                Attendance <span className="text-green-400">Manual</span>
              </h1>
              <p className="text-slate-400 font-medium text-sm tracking-widest mt-0.5">{dateLabel.toUpperCase()}</p>
            </div>
            <UserHeader
              userName={(session?.user as { name?: string } | undefined)?.name || "User"}
              userEmail={session?.user?.email || ""}
            />
          </div>
        </header>

        <main className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-8">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            {canSeeAllBranches ? (
              <select
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Select a branch…</option>
                {branches.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            ) : (
              <div className="px-3 py-2 rounded-lg bg-white border border-gray-200 text-sm font-semibold text-gray-700">
                {branchName ?? "—"}
              </div>
            )}
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="search"
              placeholder="Search name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[160px] max-w-xs"
            />
            {branch && canEdit && (
              <button
                onClick={openAdd}
                className="px-3 py-2 rounded-lg bg-white border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                + Add employee
              </button>
            )}
            <div className="text-xs text-gray-400 ml-auto">
              Independent from the scanner.
            </div>
          </div>

          {branch && !canEdit && (
            <div className="mb-4 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-700">
              View only — only Super Admin / HR can edit a previous day. Today&apos;s register is still open to you.
            </div>
          )}

          {!branch ? (
            <div className="p-12 text-center text-sm text-gray-400 bg-white rounded-2xl border border-gray-200">
              Pick a branch to see this day&apos;s roster.
            </div>
          ) : loading ? (
            <div className="p-12 text-center text-sm text-gray-400">Loading…</div>
          ) : loadError ? (
            <div className="p-12 text-center text-sm text-red-600 bg-red-50 rounded-2xl border border-red-200">
              <div className="font-semibold">Failed to load</div>
              <div className="mt-1">{loadError}</div>
            </div>
          ) : filteredStaff.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400 bg-white rounded-2xl border border-gray-200">
              No one is scheduled to work at this branch on this date.
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs uppercase text-gray-500">
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">Branch</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Attendance</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStaff.map((s) => (
                    <tr key={s.rowId ?? s.employeeId} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {s.name}
                        {s.isAdhoc && (
                          <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">added</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {s.homeBranch && s.homeBranch !== branch ? (
                          <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-gray-100">{s.homeBranch}</span>
                        ) : (
                          <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-gray-100">{branch}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{s.role ?? "—"}</td>
                      <td className="px-4 py-3">
                        {s.status ? (
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold ${STATUS_TONE[s.status] ?? "bg-gray-100 text-gray-500"}`}>
                            🔒 {STATUS_LABEL[s.status] ?? s.status}
                          </span>
                        ) : !canEdit ? (
                          <span className="text-xs text-gray-400">— Not marked —</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => pick(s.employeeId, "present")}
                              disabled={savingId === s.employeeId}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                                pending[s.employeeId] === "present"
                                  ? "bg-emerald-600 text-white border-emerald-600"
                                  : "bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                              }`}
                            >
                              Present
                            </button>
                            <button
                              onClick={() => pick(s.employeeId, "absent")}
                              disabled={savingId === s.employeeId}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                                pending[s.employeeId] === "absent"
                                  ? "bg-red-600 text-white border-red-600"
                                  : "bg-white text-red-700 border-red-300 hover:bg-red-50"
                              }`}
                            >
                              Absent
                            </button>
                            <button
                              onClick={() => saveStatus(s.employeeId)}
                              disabled={!pending[s.employeeId] || savingId === s.employeeId}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-900 text-white disabled:opacity-30"
                            >
                              {savingId === s.employeeId ? "Saving…" : "Save"}
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {s.isAdhoc && s.rowId && canEdit && (
                          <button
                            onClick={() => removeAdhoc(s.rowId as string, s.name)}
                            title="Remove from this day's list"
                            className="text-gray-400 hover:text-red-500"
                          >
                            ✕
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      {/* Add-employee popup — pick a source branch, then a name from it. */}
      {addOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !addBusy && setAddOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900">Add employee for this day</h3>
            <p className="text-xs text-gray-500 mt-1">For a replacement/extra working at {branch} who isn&apos;t already listed.</p>

            <label className="block mt-4 text-xs font-semibold text-gray-600">Branch (where they normally work)</label>
            <select
              value={addSourceBranch}
              onChange={(e) => pickAddSourceBranch(e.target.value)}
              disabled={addBusy}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Select a branch…</option>
              {allBranches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>

            <label className="block mt-3 text-xs font-semibold text-gray-600">Name</label>
            <select
              value={addEmployeeId}
              onChange={(e) => setAddEmployeeId(e.target.value)}
              disabled={addBusy || !addSourceBranch || addPeopleLoading}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">{addPeopleLoading ? "Loading…" : "Select an employee…"}</option>
              {addPeople.map((p) => (
                <option key={p.employeeId} value={p.employeeId}>{p.name}{p.role ? ` — ${p.role}` : ""}</option>
              ))}
            </select>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setAddOpen(false)}
                disabled={addBusy}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold border border-gray-300 text-gray-600 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submitAdd}
                disabled={addBusy || !addEmployeeId}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-gray-900 text-white disabled:opacity-50"
              >
                {addBusy ? "Adding…" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-full shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
