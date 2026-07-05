"use client";

import { useState } from "react";
import { X, UserPlus, Loader2 } from "lucide-react";
import { createRecruit, EMPLOYMENT_TYPES, type EmploymentType } from "@/app/recruitment/_actions";

const FIELD =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white";

/**
 * Manually add a candidate opportunity. Collects the candidate name + an
 * employment type (Internship / Part Time / Full Time) plus optional contact
 * details, then calls the createRecruit server action. On success the parent
 * refreshes the board so the new card shows in the first stage.
 */
export function AddOpportunityModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [employmentType, setEmploymentType] = useState<EmploymentType>("Full Time");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [branch, setBranch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) { setError("Candidate name is required"); return; }
    setBusy(true);
    setError(null);
    const res = await createRecruit({ name, employmentType, phone, email, branch });
    setBusy(false);
    if (!res.ok) { setError(res.error ?? "Could not add opportunity"); return; }
    onCreated();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
            <UserPlus className="h-4 w-4 text-emerald-600" /> Add Opportunity
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Candidate name <span className="text-rose-500">*</span>
            </label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className={FIELD} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Employment type <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {EMPLOYMENT_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setEmploymentType(t)}
                  className={`rounded-lg border px-2 py-2 text-sm font-medium transition ${
                    employmentType === t
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-400 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "border-slate-300 bg-white text-slate-600 hover:border-emerald-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" className={FIELD} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Branch</label>
              <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="Optional" className={FIELD} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Optional" className={FIELD} />
          </div>

          {error && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !name.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Add candidate
          </button>
        </div>
      </div>
    </div>
  );
}
