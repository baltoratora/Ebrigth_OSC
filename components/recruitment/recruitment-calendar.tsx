"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CalendarDays, Loader2, Pencil, Trash2, X, Clock, Plus } from "lucide-react";
import { updateInterview, deleteInterview, scheduleInterview } from "@/app/recruitment/_interview-actions";
import { RecruitPicker, type RecruitOpt } from "@/components/recruitment/recruit-picker";

interface Event {
  id: string;
  recruitId: string;
  recruitName: string;
  stageName: string;
  scheduledAt: string; // ISO, naive-KL-as-UTC
  location: string | null;
  note: string | null;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// scheduledAt is naive-KL-as-UTC, so read the wall-clock straight off the UTC parts.
function dayKey(iso: string) {
  return iso.slice(0, 10); // YYYY-MM-DD
}
function timeLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}
function dateInput(iso: string) {
  return iso.slice(0, 10);
}
function timeInput(iso: string) {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

const INPUT =
  "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white";

export function RecruitmentCalendar({ events, recruits }: { events: Event[]; recruits: RecruitOpt[] }) {
  const router = useRouter();
  // "Today" in KL for default view + highlight.
  const klNow = new Date(Date.now() + 8 * 3600 * 1000);
  const [year, setYear] = useState(klNow.getUTCFullYear());
  const [month, setMonth] = useState(klNow.getUTCMonth()); // 0-11
  const todayKey = klNow.toISOString().slice(0, 10);
  const [selected, setSelected] = useState<string | null>(todayKey);
  const [editing, setEditing] = useState<Event | null>(null);
  const [creatingFor, setCreatingFor] = useState<string | null>(null); // dayKey

  const byDay = useMemo(() => {
    const m = new Map<string, Event[]>();
    for (const e of events) {
      const k = dayKey(e.scheduledAt);
      const list = m.get(k) ?? [];
      list.push(e);
      m.set(k, list);
    }
    for (const list of m.values()) list.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    return m;
  }, [events]);

  // Build the month grid (Monday-first).
  const cells = useMemo(() => {
    const first = new Date(Date.UTC(year, month, 1));
    const firstDow = (first.getUTCDay() + 6) % 7; // 0 = Monday
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const out: { key: string | null; day: number | null }[] = [];
    for (let i = 0; i < firstDow; i++) out.push({ key: null, day: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      out.push({ key, day: d });
    }
    while (out.length % 7 !== 0) out.push({ key: null, day: null });
    return out;
  }, [year, month]);

  function prevMonth() {
    setMonth((m) => (m === 0 ? (setYear((y) => y - 1), 11) : m - 1));
  }
  function nextMonth() {
    setMonth((m) => (m === 11 ? (setYear((y) => y + 1), 0) : m + 1));
  }

  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-GB", {
    month: "long", year: "numeric", timeZone: "UTC",
  });
  const selectedEvents = selected ? byDay.get(selected) ?? [] : [];

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
      {/* Month grid */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">{monthLabel}</h2>
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800" aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={() => { setYear(klNow.getUTCFullYear()); setMonth(klNow.getUTCMonth()); setSelected(todayKey); }} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              Today
            </button>
            <button onClick={nextMonth} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800" aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-slate-400">
          {WEEKDAYS.map((d) => <div key={d} className="py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((c, i) => {
            if (!c.key) return <div key={i} className="min-h-[84px] rounded-lg bg-slate-50/50 dark:bg-slate-800/20" />;
            const dayEvents = byDay.get(c.key) ?? [];
            const isToday = c.key === todayKey;
            const isSel = c.key === selected;
            return (
              <button
                key={c.key}
                onClick={() => setSelected(c.key)}
                className={`flex min-h-[84px] flex-col gap-1 rounded-lg border p-1.5 text-left transition ${
                  isSel
                    ? "border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-400 dark:border-emerald-500 dark:bg-emerald-950/30"
                    : "border-slate-100 hover:border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
                }`}
              >
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${isToday ? "bg-emerald-600 font-bold text-white" : "font-medium text-slate-600 dark:text-slate-300"}`}>
                  {c.day}
                </span>
                <span className="flex flex-col gap-0.5">
                  {dayEvents.slice(0, 2).map((e) => (
                    <span key={e.id} className="truncate rounded bg-indigo-100 px-1 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300" title={`${timeLabel(e.scheduledAt)} · ${e.recruitName}`}>
                      {timeLabel(e.scheduledAt)} {e.recruitName}
                    </span>
                  ))}
                  {dayEvents.length > 2 && (
                    <span className="px-1 text-[10px] font-semibold text-slate-400">+{dayEvents.length - 2} more</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Day events panel */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <CalendarDays className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            {selected ? new Date(selected + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", timeZone: "UTC" }) : "Select a date"}
          </h3>
          {selected && (
            <button
              onClick={() => setCreatingFor(selected)}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
              title="Schedule an interview on this day"
            >
              <Plus className="h-3.5 w-3.5" /> Schedule
            </button>
          )}
        </div>
        {selectedEvents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center dark:border-slate-700">
            <p className="text-sm text-slate-400">No interviews on this day.</p>
            {selected && (
              <button onClick={() => setCreatingFor(selected)} className="mt-2 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                + Schedule an interview
              </button>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {selectedEvents.map((e) => (
              <li key={e.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{e.recruitName}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <Clock className="h-3 w-3" /> {timeLabel(e.scheduledAt)}
                      {e.location ? ` · ${e.location}` : ""}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">{e.stageName}</p>
                  </div>
                  <button onClick={() => setEditing(e)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800" title="Edit date/time">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editing && (
        <EditInterviewModal
          event={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
      {creatingFor && (
        <CreateInterviewModal
          day={creatingFor}
          recruits={recruits}
          onClose={() => setCreatingFor(null)}
          onSaved={() => { setCreatingFor(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function EditInterviewModal({ event, onClose, onSaved }: { event: Event; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(dateInput(event.scheduledAt));
  const [time, setTime] = useState(timeInput(event.scheduledAt));
  const [location, setLocation] = useState(event.location ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true); setErr(null);
    const res = await updateInterview(event.id, date, time, { location: location || null });
    setBusy(false);
    if (!res.ok) { setErr(res.error ?? "Failed"); return; }
    onSaved();
  }
  async function remove() {
    if (!window.confirm("Remove this interview?")) return;
    setBusy(true); setErr(null);
    const res = await deleteInterview(event.id);
    setBusy(false);
    if (!res.ok) { setErr(res.error ?? "Failed"); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Edit interview</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">{event.recruitName}</p>
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
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Location</span>
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} className={INPUT} />
          </label>
          {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{err}</p>}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
          <button onClick={remove} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-3 py-1.5 text-sm text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40">
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
          <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateInterviewModal({ day, recruits, onClose, onSaved }: { day: string; recruits: RecruitOpt[]; onClose: () => void; onSaved: () => void }) {
  const [recruitId, setRecruitId] = useState<string | null>(null);
  const [date, setDate] = useState(day);
  const [time, setTime] = useState("10:00");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!recruitId) { setErr("Pick a candidate."); return; }
    if (!date || !time) { setErr("Pick a date and time."); return; }
    setBusy(true); setErr(null);
    const res = await scheduleInterview(recruitId, date, time, { location: location || null });
    setBusy(false);
    if (!res.ok) { setErr(res.error ?? "Failed"); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
            <CalendarDays className="h-4 w-4 text-indigo-600 dark:text-indigo-400" /> Schedule interview
          </h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Candidate</span>
            <RecruitPicker recruits={recruits} value={recruitId} onChange={setRecruitId} />
          </label>
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
          <p className="text-[11px] text-slate-400">Scheduling moves the candidate into the “Interview Date (ID)” stage.</p>
          {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
          <button onClick={onClose} disabled={busy} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
          <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Schedule
          </button>
        </div>
      </div>
    </div>
  );
}
