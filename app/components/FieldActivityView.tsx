"use client";

import { useState, useEffect, useCallback } from "react";

interface FieldActivityEntry {
  rowId: string;
  employeeId: string;
  name: string;
  role: string | null;
  branch: string;
  status: string | null;
  reason: string | null;
  reasonNote: string | null;
}
interface Person {
  employeeId: string;
  name: string;
  role: string | null;
}

const REASONS = ["Showcase", "Roadshow", "Site Visit", "Others"];
const STATUS_LABEL: Record<string, string> = { present: "Present", absent: "Absent" };
const STATUS_TONE: Record<string, string> = {
  present: "bg-emerald-100 text-emerald-700",
  absent: "bg-red-100 text-red-700",
};

function todayKL(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

// Manual add-list for staff out doing something away from any single branch
// (Showcase, Roadshow, Site Visit, …). Independent of the FA (Feeder Academy)
// events system — this is its own register, same paper-logbook model as
// Attendance Manual (tick Present/Absent once, then locked), and once ticked
// it flows into Attendance Summary / Attendance Report the same way an
// Attendance Manual entry does. Shared by the standalone
// /attendance/field-activity page and the Attendance Manual hub's card.
export default function FieldActivityView({ date }: { date: string }) {
  const [entries, setEntries] = useState<FieldActivityEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, "present" | "absent">>({});

  // Add-employee picker: source branch → name → reason (+ note if "Others").
  const [addOpen, setAddOpen] = useState(false);
  const [allBranches, setAllBranches] = useState<string[]>([]);
  const [addSourceBranch, setAddSourceBranch] = useState("");
  const [addPeople, setAddPeople] = useState<Person[]>([]);
  const [addPeopleLoading, setAddPeopleLoading] = useState(false);
  const [addEmployeeId, setAddEmployeeId] = useState("");
  const [addReason, setAddReason] = useState("");
  const [addReasonNote, setAddReasonNote] = useState("");
  const [addBusy, setAddBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    fetch(`/api/field-activity?date=${date}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `Failed to load (HTTP ${r.status})`);
        return d;
      })
      .then((d) => setEntries(d.entries ?? []))
      .catch((err) => {
        setEntries([]);
        setLoadError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => setLoading(false));
  }, [date]);

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
      const res = await fetch("/api/field-activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", date, employeeId, status }),
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

  async function removeEntry(rowId: string, name: string) {
    if (!confirm(`Remove ${name} from Field Activity for this day?`)) return;
    try {
      await fetch(`/api/field-activity?id=${encodeURIComponent(rowId)}`, { method: "DELETE" });
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
    setAddReason("");
    setAddReasonNote("");
    if (allBranches.length === 0) {
      fetch("/api/field-activity/branches")
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
    fetch(`/api/field-activity/people?branch=${encodeURIComponent(b)}`)
      .then((r) => (r.ok ? r.json() : { people: [] }))
      .then((d) => setAddPeople(d.people ?? []))
      .catch(() => setAddPeople([]))
      .finally(() => setAddPeopleLoading(false));
  }

  async function submitAdd() {
    if (!addEmployeeId || !addReason) return;
    setAddBusy(true);
    try {
      const res = await fetch("/api/field-activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add", date, employeeId: addEmployeeId, reason: addReason,
          reasonNote: addReason === "Others" ? addReasonNote.trim() || null : null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Failed to add");
      setAddOpen(false);
      setToast("Added to Field Activity");
      load();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setAddBusy(false);
    }
  }

  const filteredEntries = entries.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Search name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[160px] max-w-xs"
        />
        <button
          onClick={openAdd}
          className="px-3 py-2 rounded-lg bg-white border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          + Add employee
        </button>
        <div className="text-xs text-gray-400 ml-auto">
          Not tied to any single branch.
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-sm text-gray-400">Loading…</div>
      ) : loadError ? (
        <div className="p-12 text-center text-sm text-red-600 bg-red-50 rounded-2xl border border-red-200">
          <div className="font-semibold">Failed to load</div>
          <div className="mt-1">{loadError}</div>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="p-12 text-center text-sm text-gray-400 bg-white rounded-2xl border border-gray-200">
          No one added to Field Activity for this date yet.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs uppercase text-gray-500">
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Branch</th>
                <th className="px-4 py-3 font-semibold">Reason</th>
                <th className="px-4 py-3 font-semibold">Attendance</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((e) => (
                <tr key={e.rowId} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-gray-900">{e.name}</td>
                  <td className="px-4 py-3 text-gray-600">
                    <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-gray-100">{e.branch}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {e.reason}
                    {e.reason === "Others" && e.reasonNote && (
                      <span className="text-gray-400"> — {e.reasonNote}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {e.status ? (
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold ${STATUS_TONE[e.status] ?? "bg-gray-100 text-gray-500"}`}>
                        🔒 {STATUS_LABEL[e.status] ?? e.status}
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => pick(e.employeeId, "present")}
                          disabled={savingId === e.employeeId}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                            pending[e.employeeId] === "present"
                              ? "bg-emerald-600 text-white border-emerald-600"
                              : "bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                          }`}
                        >
                          Present
                        </button>
                        <button
                          onClick={() => pick(e.employeeId, "absent")}
                          disabled={savingId === e.employeeId}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                            pending[e.employeeId] === "absent"
                              ? "bg-red-600 text-white border-red-600"
                              : "bg-white text-red-700 border-red-300 hover:bg-red-50"
                          }`}
                        >
                          Absent
                        </button>
                        <button
                          onClick={() => saveStatus(e.employeeId)}
                          disabled={!pending[e.employeeId] || savingId === e.employeeId}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-900 text-white disabled:opacity-30"
                        >
                          {savingId === e.employeeId ? "Saving…" : "Save"}
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => removeEntry(e.rowId, e.name)}
                      title="Remove from Field Activity"
                      className="text-gray-400 hover:text-red-500"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add-employee popup — pick a branch, a name, then a reason. */}
      {addOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !addBusy && setAddOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900">Add to Field Activity</h3>
            <p className="text-xs text-gray-500 mt-1">For staff out at a showcase, roadshow, site visit, etc.</p>

            <label className="block mt-4 text-xs font-semibold text-gray-600">Branch</label>
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

            <label className="block mt-3 text-xs font-semibold text-gray-600">Reason</label>
            <select
              value={addReason}
              onChange={(e) => setAddReason(e.target.value)}
              disabled={addBusy}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Select a reason…</option>
              {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>

            {addReason === "Others" && (
              <>
                <label className="block mt-3 text-xs font-semibold text-gray-600">Details</label>
                <input
                  type="text"
                  value={addReasonNote}
                  onChange={(e) => setAddReasonNote(e.target.value)}
                  disabled={addBusy}
                  placeholder="Briefly describe the activity…"
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </>
            )}

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
                disabled={addBusy || !addEmployeeId || !addReason}
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
