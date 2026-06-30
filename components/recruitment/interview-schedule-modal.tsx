"use client";

import { useState } from "react";
import { CalendarDays, Loader2, X } from "lucide-react";
import { scheduleInterview } from "@/app/recruitment/_interview-actions";

/**
 * Drag-to-"Interview Date (ID)" popup: pick a date + time (and optional location)
 * for the candidate's interview. Confirm schedules it and moves the card into ID;
 * Cancel (or backdrop) aborts — the card stays where it was.
 */
export function InterviewScheduleModal({
  recruitId,
  recruitName,
  onScheduled,
  onClose,
}: {
  recruitId: string;
  recruitName: string;
  onScheduled: () => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!date || !time) { setErr("Pick a date and time."); return; }
    setBusy(true);
    setErr(null);
    const res = await scheduleInterview(recruitId, date, time, { location: location || null, note: note || null });
    setBusy(false);
    if (!res.ok) { setErr(res.error ?? "Failed to schedule"); return; }
    onScheduled();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
            <CalendarDays className="h-4 w-4 text-indigo-600 dark:text-indigo-400" /> Schedule interview
          </h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Interview for <span className="font-medium text-slate-800 dark:text-slate-200">{recruitName}</span>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Time</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={INPUT} />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Location (optional)</span>
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. HQ / Online" className={INPUT} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Note (optional)</span>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className={INPUT} />
          </label>
          {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
          <button onClick={onClose} disabled={busy} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">
            Cancel
          </button>
          <button onClick={submit} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Schedule
          </button>
        </div>
      </div>
    </div>
  );
}

const INPUT =
  "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white";
