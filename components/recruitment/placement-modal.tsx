"use client";

import { useEffect, useState } from "react";
import { Building2, Loader2, X } from "lucide-react";
import {
  getPlacementOptions, getRecruitPlacement, type PlacementInput,
} from "@/app/recruitment/_actions";
import { HQ_BRANCH, isHqBranch } from "@/lib/recruitment/placement";

/**
 * Drag-to-placement popup (Trial / Probation / Intern / Full Time / Part Timer /
 * Hired): pick Branch → (Department, only for HQ) → Position. Confirm captures
 * the detail and moves the card; Cancel (or backdrop) aborts — the card stays
 * where it was. Prefills from the candidate's existing placement so a manual
 * Trial → Probation move carries the earlier choices over.
 */
export function PlacementModal({
  recruitId,
  recruitName,
  stageName,
  onConfirm,
  onClose,
}: {
  recruitId: string;
  recruitName: string;
  stageName: string;
  onConfirm: (input: PlacementInput) => void;
  onClose: () => void;
}) {
  const [branches, setBranches] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [positions, setPositions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [branch, setBranch] = useState("");
  const [department, setDepartment] = useState("");
  const [position, setPosition] = useState("");
  const [customPosition, setCustomPosition] = useState("");
  const [err, setErr] = useState<string | null>(null);

  // Load option lists + prefill from the candidate's current placement.
  useEffect(() => {
    let alive = true;
    (async () => {
      const [opts, current] = await Promise.all([
        getPlacementOptions(),
        getRecruitPlacement(recruitId),
      ]);
      if (!alive) return;
      setBranches(opts.branches);
      setDepartments(opts.departments);
      setPositions(opts.positions);
      if (current.ok) {
        if (current.branch) setBranch(current.branch);
        if (current.department) setDepartment(current.department);
        if (current.position) {
          // If the existing position isn't one of the employee-derived options,
          // route it through the "Other" free-text field so it's preserved.
          if (opts.positions.includes(current.position)) setPosition(current.position);
          else { setPosition("__other__"); setCustomPosition(current.position); }
        }
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [recruitId]);

  const hq = isHqBranch(branch);
  const effectivePosition = position === "__other__" ? customPosition.trim() : position;

  function submit() {
    if (!branch) { setErr("Choose a branch."); return; }
    if (hq && !department) { setErr("Choose a department for HQ."); return; }
    if (!effectivePosition) { setErr("Choose or enter a position."); return; }
    setErr(null);
    onConfirm({
      branch,
      department: hq ? department : null,
      position: effectivePosition,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
            <Building2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Assign placement
          </h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Moving <span className="font-medium text-slate-800 dark:text-slate-200">{recruitName}</span> to{" "}
            <span className="font-medium text-emerald-700 dark:text-emerald-300">{stageName}</span>
          </p>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading options…
            </div>
          ) : (
            <>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Branch</span>
                <select
                  value={branch}
                  onChange={(e) => { setBranch(e.target.value); if (!isHqBranch(e.target.value)) setDepartment(""); }}
                  className={INPUT}
                >
                  <option value="">Select branch…</option>
                  {branches.map((b) => (
                    <option key={b} value={b}>{b === HQ_BRANCH ? "HQ (Head Office)" : b}</option>
                  ))}
                </select>
              </label>

              {/* Department — only for HQ. */}
              {hq && (
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Department</span>
                  <select value={department} onChange={(e) => setDepartment(e.target.value)} className={INPUT}>
                    <option value="">Select department…</option>
                    {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </label>
              )}

              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Position</span>
                <select value={position} onChange={(e) => setPosition(e.target.value)} className={INPUT}>
                  <option value="">Select position…</option>
                  {positions.map((p) => <option key={p} value={p}>{p}</option>)}
                  <option value="__other__">Other…</option>
                </select>
              </label>
              {position === "__other__" && (
                <input
                  type="text"
                  value={customPosition}
                  onChange={(e) => setCustomPosition(e.target.value)}
                  placeholder="Type the position"
                  className={INPUT}
                  autoFocus
                />
              )}

              {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{err}</p>}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Confirm move
          </button>
        </div>
      </div>
    </div>
  );
}

const INPUT =
  "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white";
