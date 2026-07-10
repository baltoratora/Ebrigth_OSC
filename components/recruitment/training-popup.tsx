"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, X, Loader2, UserCheck, UserX } from "lucide-react";
import {
  fetchPendingTrainingWork,
  confirmAttendance,
  pickRescheduleDate,
} from "@/app/recruitment/_training-actions";

interface Confirmation { id: string; name: string; stageShort: string; stageName: string; enteredAt: string }
interface Reschedule { id: string; name: string; returnCode: string; returnName: string }

function daysAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 3600 * 1000));
  return d <= 0 ? "today" : `${d} day${d === 1 ? "" : "s"} ago`;
}

/**
 * Fires when HR opens the Recruitment module: if any lead has been sitting in a
 * training stage for 3+ days, HR confirms attendance here (attend → advance,
 * no-show → Reschedule). Training no-shows awaiting a date are picked here too.
 * Reappears on next open until every item is actioned.
 */
export function TrainingPopup() {
  const router = useRouter();
  const [confirmations, setConfirmations] = useState<Confirmation[]>([]);
  const [reschedules, setReschedules] = useState<Reschedule[]>([]);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load(reveal: boolean) {
    const res = await fetchPendingTrainingWork();
    const has = res.ok && (res.confirmations.length > 0 || res.reschedulePicks.length > 0);
    setConfirmations(res.confirmations);
    setReschedules(res.reschedulePicks);
    if (reveal && has) setOpen(true);
    if (!has) setOpen(false);
  }

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onConfirm(id: string, attended: boolean) {
    setBusyId(id);
    const res = await confirmAttendance(id, attended);
    setBusyId(null);
    if (res.ok) { await load(false); router.refresh(); }
  }

  async function onPick(id: string, date: string) {
    if (!date) return;
    setBusyId(id);
    const res = await pickRescheduleDate(id, date);
    setBusyId(null);
    if (res.ok) { await load(false); router.refresh(); }
  }

  if (!open) return null;
  const total = confirmations.length + reschedules.length;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm sm:p-8">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 bg-linear-to-br from-emerald-50 to-teal-50 px-5 py-4 dark:border-slate-800 dark:from-emerald-950/30 dark:to-slate-900">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
            <CalendarClock className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Training attendance — {total} to action
          </h2>
          <button onClick={() => setOpen(false)} aria-label="Later" className="rounded-lg p-1 text-slate-400 hover:bg-white/60 hover:text-slate-700 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[65vh] space-y-5 overflow-y-auto px-5 py-4">
          {/* Attendance to confirm */}
          {confirmations.length > 0 && (
            <section>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Confirm attendance</h3>
              <ul className="space-y-2">
                {confirmations.map((c) => (
                  <li key={c.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{c.name}</p>
                        <p className="text-[11px] text-slate-400">{c.stageName} · entered {daysAgo(c.enteredAt)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          onClick={() => onConfirm(c.id, true)}
                          disabled={busyId === c.id}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {busyId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />} Attended
                        </button>
                        <button
                          onClick={() => onConfirm(c.id, false)}
                          disabled={busyId === c.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
                        >
                          <UserX className="h-3.5 w-3.5" /> No-show
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Reschedule dates to pick */}
          {reschedules.length > 0 && (
            <section>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Pick reschedule date</h3>
              <ul className="space-y-2">
                {reschedules.map((r) => (
                  <RescheduleRow key={r.id} r={r} busy={busyId === r.id} onPick={onPick} />
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-100 px-5 py-3 dark:border-slate-800">
          <button onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            Later
          </button>
        </div>
      </div>
    </div>
  );
}

function RescheduleRow({ r, busy, onPick }: { r: Reschedule; busy: boolean; onPick: (id: string, date: string) => void }) {
  const [date, setDate] = useState("");
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{r.name}</p>
        <p className="text-[11px] text-slate-400">No-show · returns to {r.returnName}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
        />
        <button
          onClick={() => onPick(r.id, date)}
          disabled={busy || !date}
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Set
        </button>
      </div>
    </li>
  );
}
