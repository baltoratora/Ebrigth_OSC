"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellRing, UserPlus, CalendarClock, X } from "lucide-react";

// Mirrors lib/recruitment/data.ts RecNotifications (kept local to avoid pulling
// a server-only module into the client bundle).
interface Notifications {
  newToday: { id: string; name: string; stageName: string; at: string }[];
  interviewsToday: { id: string; recruitId: string; recruitName: string; scheduledAt: string; location: string | null }[];
  interviewsThisWeek: { id: string; recruitId: string; recruitName: string; scheduledAt: string }[];
  counts: { newToday: number; interviewsToday: number; interviewsThisWeek: number };
}

const PUSH_KEY = "rec-push-enabled"; // sessionStorage → resets when tab/browser closes
const SEEN_KEY = "rec-push-seen"; // ids already pushed this session
const POLL_MS = 60_000;

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}

export function NotificationBell() {
  const [data, setData] = useState<Notifications | null>(null);
  const [open, setOpen] = useState(false);
  // Push toggle lives in sessionStorage so it auto-resets when the tab/browser
  // is closed (per spec). Default OFF every fresh session.
  const [push, setPush] = useState(false);
  const seenRef = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);

  // Hydrate toggle + seen set from sessionStorage on mount.
  useEffect(() => {
    setPush(sessionStorage.getItem(PUSH_KEY) === "1");
    try {
      seenRef.current = new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) || "[]"));
    } catch { seenRef.current = new Set(); }
  }, []);

  const fireBrowserNotifications = useCallback((d: Notifications) => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const seen = seenRef.current;
    const out: { key: string; title: string; body: string }[] = [];
    for (const c of d.newToday) {
      const k = `cand:${c.id}`;
      if (!seen.has(k)) out.push({ key: k, title: "New candidate", body: `${c.name} · ${c.stageName}` });
    }
    for (const i of d.interviewsToday) {
      const k = `intvToday:${i.id}`;
      if (!seen.has(k)) out.push({ key: k, title: "Interview today", body: `${i.recruitName} at ${timeLabel(i.scheduledAt)}` });
    }
    // On the very first poll of a session, register existing items as "seen"
    // WITHOUT firing — so we only push things that appear AFTER you opened the
    // tab (avoids a burst of old notifications on load). Exception: today's
    // interviews still get a single heads-up on first load.
    for (const o of out) {
      const isInterviewToday = o.key.startsWith("intvToday:");
      if (!firstLoad.current || isInterviewToday) {
        try { new Notification(o.title, { body: o.body }); } catch { /* ignore */ }
      }
      seen.add(o.key);
    }
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seen)));
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/recruitment/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const d: Notifications = await res.json();
      setData(d);
      if (sessionStorage.getItem(PUSH_KEY) === "1") fireBrowserNotifications(d);
      firstLoad.current = false;
    } catch { /* offline / transient — ignore */ }
  }, [fireBrowserNotifications]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => clearInterval(t);
  }, [poll]);

  async function togglePush() {
    if (!push) {
      if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") return; // user declined → leave it off
      }
      sessionStorage.setItem(PUSH_KEY, "1");
      setPush(true);
    } else {
      sessionStorage.removeItem(PUSH_KEY);
      setPush(false);
    }
  }

  const todayCount = (data?.counts.newToday ?? 0) + (data?.counts.interviewsToday ?? 0);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        aria-label="Notifications"
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
      >
        {todayCount > 0 ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        {todayCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {todayCount > 99 ? "99+" : todayCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Today</h3>
              <button onClick={() => setOpen(false)} aria-label="Close" className="rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {/* New candidates */}
              <Section title="New candidates" count={data?.counts.newToday ?? 0}>
                {(data?.newToday ?? []).slice(0, 8).map((c) => (
                  <Row key={c.id} icon={<UserPlus className="h-3.5 w-3.5 text-emerald-600" />} title={c.name} subtitle={c.stageName} />
                ))}
              </Section>
              {/* Interviews today */}
              <Section title="Interviews today" count={data?.counts.interviewsToday ?? 0}>
                {(data?.interviewsToday ?? []).map((i) => (
                  <Row key={i.id} icon={<CalendarClock className="h-3.5 w-3.5 text-indigo-600" />} title={i.recruitName} subtitle={`${timeLabel(i.scheduledAt)}${i.location ? " · " + i.location : ""}`} />
                ))}
              </Section>
              {(data && todayCount === 0) && (
                <p className="px-4 py-6 text-center text-sm text-slate-400">Nothing for today.</p>
              )}
            </div>

            {/* Footer: week summary + push toggle */}
            <div className="space-y-2 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {data?.counts.interviewsThisWeek ?? 0} interview{(data?.counts.interviewsThisWeek ?? 0) === 1 ? "" : "s"} this week
              </p>
              <label className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Push notifications</span>
                <button
                  type="button"
                  onClick={togglePush}
                  role="switch"
                  aria-checked={push}
                  className={`relative h-5 w-9 rounded-full transition ${push ? "bg-emerald-600" : "bg-slate-300 dark:bg-slate-700"}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${push ? "left-4.5" : "left-0.5"}`} />
                </button>
              </label>
              <p className="text-[10px] text-slate-400">Resets when you close the tab.</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <div className="border-b border-slate-50 py-1 last:border-0 dark:border-slate-800/50">
      <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{title} · {count}</p>
      {children}
    </div>
  );
}

function Row({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-1.5">
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-sm text-slate-800 dark:text-slate-200">{title}</p>
        <p className="truncate text-[11px] text-slate-400">{subtitle}</p>
      </div>
    </div>
  );
}
