"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useFAStore } from "@pcm/_lib/store";
import { useCurrentUser } from "@pcm/_hooks/useCurrentUser";
import { AppShell } from "@pcm/_components/shared/AppShell";
import { ArrowLeft, CalendarDays, Sparkles, Megaphone, Users, FileText } from "lucide-react";
import { addDays, format, parseISO, differenceInCalendarDays } from "date-fns";
import { BRANCHES, BranchCode } from "@pcm/_types";

// PCM events can run for any number of days (1–14). Capped so the visual
// day strip doesn't get out of hand.
const MAX_DAYS = 14;

function fmtIso(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export default function NewEventPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const createEvent = useFAStore(s => s.createEvent);
  const createSession = useFAStore(s => s.createSession);
  const setQuota = useFAStore(s => s.setQuota);

  // Default: next Monday → next Friday (academy can change anything).
  const defaultStart = useMemo(() => {
    const today = new Date();
    const wd = today.getDay() === 0 ? 7 : today.getDay();
    const offset = ((8 - wd) % 7) || 7;
    return fmtIso(addDays(today, offset));
  }, []);
  const defaultEnd = useMemo(
    () => fmtIso(addDays(parseISO(defaultStart), 4)),
    [defaultStart],
  );

  const [name, setName]             = useState("");
  const [startDate, setStartDate]   = useState(defaultStart);
  const [endDate, setEndDate]       = useState(defaultEnd);
  const [invOpen, setInvOpen]       = useState("");
  const [invClose, setInvClose]     = useState("");
  const [notes, setNotes]           = useState("");
  const [skipQuotas, setSkipQuotas] = useState(false);
  // Default session window (used for the auto-created first session)
  const [sessionStart, setSessionStart] = useState("18:00");
  const [sessionEnd,   setSessionEnd]   = useState("19:00");
  const [sessionDay,   setSessionDay]   = useState(1);
  const [quotas, setQuotas] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const b of BRANCHES) init[b.code] = "";
    return init;
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!user || user.role !== "MKT") return null;

  // Derived values
  const startD = startDate ? parseISO(startDate) : null;
  const endD   = endDate   ? parseISO(endDate)   : null;
  const numberOfDays =
    startD && endD ? Math.max(1, differenceInCalendarDays(endD, startD) + 1) : 1;
  const tooManyDays = numberOfDays > MAX_DAYS;
  const datesValid =
    startD && endD && endD.getTime() >= startD.getTime() && !tooManyDays;

  // Visual day strip cells (cap to MAX_DAYS so we don't blow out the layout)
  const stripDays = useMemo(() => {
    if (!datesValid || !startD) return [];
    return Array.from({ length: Math.min(numberOfDays, MAX_DAYS) }, (_, i) => addDays(startD, i));
  }, [datesValid, startD, numberOfDays]);

  const totalQuota = Object.values(quotas).reduce(
    (sum, v) => sum + (Number(v) || 0), 0
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim())            return setError("Event name is required.");
    if (!startDate || !endDate)  return setError("Start and end dates are required.");
    if (!datesValid)             return setError(
      tooManyDays
        ? `Events can span at most ${MAX_DAYS} days.`
        : "End date must be on or after start date.",
    );
    if (!invOpen || !invClose)   return setError("Invitation open and close dates are required.");
    if (new Date(invClose) < new Date(invOpen))   return setError("Invitation close must be on or after open.");
    if (new Date(invClose) > new Date(startDate)) return setError("Invitations must close before the event starts.");
    if (!skipQuotas && sessionStart >= sessionEnd) return setError("Default session end time must be after start.");

    if (!startD || !endD || !user) return;

    setSubmitting(true);
    try {
      const created = await createEvent({
        name: name.trim(),
        month: startD.getMonth() + 1,
        year: startD.getFullYear(),
        venue: "",   // PCM doesn't use venue — kept blank for schema compat
        startDate,
        endDate,
        numberOfDays,
        invitationOpenDate: invOpen,
        invitationCloseDate: invClose,
        status: "draft",
        createdBy: user.id,
        notes: notes.trim() || undefined,
      });

      // If the academy didn't skip the quick-quota step, auto-create one
      // default session and apply the per-branch quotas in one go.
      if (!skipQuotas && totalQuota > 0) {
        const session = await createSession({
          eventId: created.id,
          dayNumber: sessionDay,
          sessionNumber: 1,
          startTime: sessionStart,
          endTime: sessionEnd,
        });
        for (const b of BRANCHES) {
          const n = Number(quotas[b.code]) || 0;
          if (n > 0) await setQuota(session.id, b.code as BranchCode, n);
        }
      }

      router.push(`/pcm-system/academy/events/${created.id}`);
    } catch (err) {
      console.error("[new pcm event] failed:", err);
      setError("Could not create event. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <Link
        href="/pcm-system/academy"
        className="inline-flex items-center gap-1.5 text-sm text-ink-600 hover:text-ink-900 mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Back to events
      </Link>

      {/* ── Hero header with gradient ────────────────────────────── */}
      <div className="mb-8 relative overflow-hidden rounded-3xl p-8 shadow-lg
                      bg-gradient-to-br from-violet-600 via-fuchsia-600 to-pink-600">
        <Sparkles className="absolute -right-6 -top-6 w-40 h-40 text-white/10" aria-hidden="true" />
        <div
          className="fa-mono text-[10px] uppercase text-white/80 mb-2"
          style={{ letterSpacing: "0.14em" }}
        >
          New PCM event
        </div>
        <h1 className="text-5xl font-black text-white tracking-tight leading-tight">
          Schedule a PCM week
        </h1>
        <p className="text-white/80 text-sm mt-3 max-w-xl">
          Pick the dates, set how long invitations stay open, then assign
          quotas per branch — all in one go.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* ── Section 1: When? ────────────────────────────────── */}
          <section className="rounded-2xl bg-white shadow-md overflow-hidden border border-violet-100">
            <div className="bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                <CalendarDays className="w-5 h-5 text-white" />
              </div>
              <div>
                <div
                  className="fa-mono text-[10px] uppercase text-white/80"
                  style={{ letterSpacing: "0.14em" }}
                >
                  Step 1
                </div>
                <h2 className="text-xl font-bold text-white">When &amp; what</h2>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="fa-label">Event name</label>
                <input
                  className="fa-input"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. PCM Week 21 — Junior Showcase"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="fa-label">Start date</label>
                  <input
                    type="date"
                    className="fa-input"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="fa-label">End date</label>
                  <input
                    type="date"
                    className="fa-input"
                    value={endDate}
                    min={startDate}
                    onChange={e => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              {datesValid && (
                <div>
                  <div
                    className="fa-mono text-[10px] uppercase text-violet-600 mb-2"
                    style={{ letterSpacing: "0.1em" }}
                  >
                    {numberOfDays} day{numberOfDays !== 1 ? "s" : ""} scheduled
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {stripDays.map((d, i) => {
                      const dow = d.getDay();
                      const isWeekend = dow === 0 || dow === 6;
                      return (
                        <div
                          key={i}
                          className={`px-3 py-2 rounded-xl border-2 text-center transition-all ${
                            isWeekend
                              ? "border-pink-200 bg-pink-50 text-pink-700"
                              : "border-violet-200 bg-violet-50 text-violet-700"
                          }`}
                          style={{ minWidth: "62px" }}
                        >
                          <div
                            className="fa-mono text-[9px] uppercase font-bold"
                            style={{ letterSpacing: "0.08em" }}
                          >
                            {format(d, "EEE")}
                          </div>
                          <div className="text-lg font-black leading-none mt-0.5">
                            {format(d, "d")}
                          </div>
                          <div className="fa-mono text-[9px] mt-0.5 opacity-70">
                            {format(d, "MMM")}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {tooManyDays && (
                <p className="text-xs text-rose-600">
                  PCM events are capped at {MAX_DAYS} days. Shorten the range.
                </p>
              )}
            </div>
          </section>

          {/* ── Section 2: Invitations ─────────────────────────── */}
          <section className="rounded-2xl bg-white shadow-md overflow-hidden border border-cyan-100">
            <div className="bg-gradient-to-r from-cyan-500 to-teal-500 px-6 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                <Megaphone className="w-5 h-5 text-white" />
              </div>
              <div>
                <div
                  className="fa-mono text-[10px] uppercase text-white/80"
                  style={{ letterSpacing: "0.14em" }}
                >
                  Step 2
                </div>
                <h2 className="text-xl font-bold text-white">Invitation window</h2>
              </div>
            </div>
            <div className="p-6">
              <p className="text-sm text-ink-500 mb-4">
                When Branch Managers can invite their students.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="fa-label">Open</label>
                  <input
                    type="date"
                    className="fa-input"
                    value={invOpen}
                    onChange={e => setInvOpen(e.target.value)}
                  />
                </div>
                <div>
                  <label className="fa-label">Close</label>
                  <input
                    type="date"
                    className="fa-input"
                    value={invClose}
                    min={invOpen}
                    max={startDate}
                    onChange={e => setInvClose(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* ── Section 3: Quotas ─────────────────────────────── */}
          <section className="rounded-2xl bg-white shadow-md overflow-hidden border border-rose-100">
            <div className="bg-gradient-to-r from-rose-500 to-orange-500 px-6 py-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div
                    className="fa-mono text-[10px] uppercase text-white/80"
                    style={{ letterSpacing: "0.14em" }}
                  >
                    Step 3
                  </div>
                  <h2 className="text-xl font-bold text-white">Branch quotas</h2>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-white/90 cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipQuotas}
                  onChange={e => setSkipQuotas(e.target.checked)}
                  className="rounded"
                />
                Skip — set later
              </label>
            </div>
            {!skipQuotas && (
              <div className="p-6 space-y-5">
                {/* Default session window */}
                <div className="rounded-xl bg-gradient-to-r from-amber-50 to-rose-50 border border-rose-200 p-4">
                  <div
                    className="fa-mono text-[10px] uppercase text-rose-600 mb-2"
                    style={{ letterSpacing: "0.1em" }}
                  >
                    These quotas apply to one default session
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="fa-label">On day</label>
                      <select
                        className="fa-input"
                        value={sessionDay}
                        onChange={e => setSessionDay(Number(e.target.value))}
                      >
                        {Array.from({ length: numberOfDays }, (_, i) => i + 1).map(d => (
                          <option key={d} value={d}>
                            Day {d}{stripDays[d - 1] ? ` (${format(stripDays[d - 1], "EEE d MMM")})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="fa-label">Start</label>
                      <input
                        type="time"
                        className="fa-input"
                        value={sessionStart}
                        onChange={e => setSessionStart(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="fa-label">End</label>
                      <input
                        type="time"
                        className="fa-input"
                        value={sessionEnd}
                        onChange={e => setSessionEnd(e.target.value)}
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-rose-700 mt-2">
                    You can add more sessions, edit times, and change quotas after the event is created.
                  </p>
                </div>

                {/* Per-branch quota inputs */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {BRANCHES.map((b, idx) => {
                    // Slight color rotation so the grid feels alive instead of monochrome
                    const palettes = [
                      "border-violet-200 focus-within:border-violet-500 bg-violet-50/40",
                      "border-cyan-200   focus-within:border-cyan-500   bg-cyan-50/40",
                      "border-rose-200   focus-within:border-rose-500   bg-rose-50/40",
                      "border-emerald-200 focus-within:border-emerald-500 bg-emerald-50/40",
                      "border-amber-200  focus-within:border-amber-500  bg-amber-50/40",
                    ];
                    const cls = palettes[idx % palettes.length];
                    return (
                      <label
                        key={b.code}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 transition-colors ${cls}`}
                      >
                        <span
                          className="fa-mono text-[10px] uppercase font-bold text-ink-700 flex-shrink-0"
                          style={{ minWidth: "32px", letterSpacing: "0.06em" }}
                        >
                          {b.code}
                        </span>
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          className="fa-input flex-1 text-center"
                          style={{ paddingLeft: "0.5rem", paddingRight: "0.5rem" }}
                          value={quotas[b.code]}
                          onChange={e =>
                            setQuotas(q => ({ ...q, [b.code]: e.target.value.replace(/[^0-9]/g, "") }))
                          }
                          placeholder="0"
                        />
                      </label>
                    );
                  })}
                </div>

                <div className="text-right">
                  <span
                    className="fa-mono text-[11px] uppercase text-rose-600 font-bold"
                    style={{ letterSpacing: "0.08em" }}
                  >
                    Total · {totalQuota} student{totalQuota !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            )}
          </section>

          {/* ── Section 4: Notes ──────────────────────────────── */}
          <section className="rounded-2xl bg-white shadow-md overflow-hidden border border-emerald-100">
            <div className="bg-gradient-to-r from-emerald-500 to-lime-500 px-6 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <div
                  className="fa-mono text-[10px] uppercase text-white/80"
                  style={{ letterSpacing: "0.14em" }}
                >
                  Optional
                </div>
                <h2 className="text-xl font-bold text-white">Notes</h2>
              </div>
            </div>
            <div className="p-6">
              <textarea
                className="fa-input min-h-[80px] resize-y"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Anything the team should know about this week…"
              />
            </div>
          </section>

          {error && (
            <div className="rounded-xl bg-rose-50 border-2 border-rose-200 text-rose-700 px-4 py-3 text-sm font-medium">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Link href="/pcm-system/academy" className="fa-btn-secondary">Cancel</Link>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-3 rounded-xl text-white font-bold shadow-lg
                         bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-600
                         hover:from-violet-700 hover:via-fuchsia-700 hover:to-pink-700
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all"
            >
              {submitting ? "Creating…" : "Create event"}
            </button>
          </div>
        </div>

        {/* ── Right: live preview ──────────────────────────────── */}
        <aside className="space-y-4">
          <div className="rounded-2xl bg-white shadow-md overflow-hidden border border-indigo-100 sticky top-4">
            <div className="bg-gradient-to-r from-indigo-500 to-violet-500 px-5 py-3">
              <h3 className="text-sm font-bold text-white">Preview</h3>
            </div>
            <dl className="p-5 space-y-3">
              <div>
                <dt
                  className="fa-mono text-[10px] uppercase text-violet-600 font-bold"
                  style={{ letterSpacing: "0.12em" }}
                >
                  Name
                </dt>
                <dd className="font-bold text-ink-900 mt-0.5">{name || "—"}</dd>
              </div>
              <div>
                <dt
                  className="fa-mono text-[10px] uppercase text-cyan-600 font-bold"
                  style={{ letterSpacing: "0.12em" }}
                >
                  Dates
                </dt>
                <dd className="fa-mono text-sm text-ink-800 mt-0.5">
                  {datesValid && startD && endD
                    ? `${format(startD, "d MMM")} → ${format(endD, "d MMM yyyy")} (${numberOfDays} day${numberOfDays !== 1 ? "s" : ""})`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt
                  className="fa-mono text-[10px] uppercase text-teal-600 font-bold"
                  style={{ letterSpacing: "0.12em" }}
                >
                  Invitations
                </dt>
                <dd className="fa-mono text-sm text-ink-800 mt-0.5">
                  {invOpen && invClose ? `${invOpen} → ${invClose}` : "—"}
                </dd>
              </div>
              {!skipQuotas && (
                <div>
                  <dt
                    className="fa-mono text-[10px] uppercase text-rose-600 font-bold"
                    style={{ letterSpacing: "0.12em" }}
                  >
                    Quota
                  </dt>
                  <dd className="text-sm text-ink-800 mt-0.5">
                    {totalQuota > 0
                      ? `${totalQuota} student${totalQuota !== 1 ? "s" : ""} across ${Object.values(quotas).filter(v => Number(v) > 0).length} branch${Object.values(quotas).filter(v => Number(v) > 0).length !== 1 ? "es" : ""}`
                      : "Not set"}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </aside>
      </form>
    </AppShell>
  );
}
