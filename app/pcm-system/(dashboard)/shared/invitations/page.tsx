"use client";

import { useMemo, useState } from "react";
import { useFAStore } from "@pcm/_lib/store";
import { useCurrentUser } from "@pcm/_hooks/useCurrentUser";
import { AppShell } from "@pcm/_components/shared/AppShell";
import { BranchCode, FAEvent, Invitation, arrivalLabel } from "@pcm/_types";
import {
  Users, Download, Copy, Check, ListOrdered, Search,
  CalendarDays,
} from "lucide-react";
import { addDays, format, parseISO } from "date-fns";
import { BranchMultiSelect } from "@pcm/_components/fa/BranchMultiSelect";

type StatusFilter = "all" | "invited" | "confirmed" | "attended" | "rescheduled" | "declined" | "no_show";
type TypeFilter   = "all" | "progress" | "renewal";
type ExportFormat = "text" | "csv";

export default function InvitationsListPage() {
  const user = useCurrentUser();
  const events = useFAStore(s => s.events);
  const sessions = useFAStore(s => s.sessions);
  const invitations = useFAStore(s => s.invitations);
  const students = useFAStore(s => s.students);

  // BMs are locked to their branch (set automatically). Academy picks any
  // combination via the multi-select. An empty set means "all branches"
  // (no filter), keeping the no-op case cheap and the type simple.
  const [eventId, setEventId]   = useState<string>("");   // empty = pick one
  const [selectedBranches, setSelectedBranches] = useState<Set<BranchCode>>(() => {
    if (user?.role === "BM" && user.branch) return new Set([user.branch]);
    return new Set();
  });
  const [status, setStatus]     = useState<StatusFilter>("all");
  const [type, setType]         = useState<TypeFilter>("all");
  /** Day filter — "all" or 1..numberOfDays of the selected event. */
  const [day, setDay]           = useState<number | "all">("all");
  /** Specific session ID filter — "all" or a concrete session.
   *  Resets to "all" whenever event or day changes. */
  const [sessionFilter, setSessionFilter] = useState<string>("all");
  const [search, setSearch]     = useState("");
  const [copied, setCopied]     = useState(false);

  // BM users are locked to their own branch; the multi-select isn't even
  // rendered for them. `branchAllowed` returns true when an invitation's
  // branch is in scope for the current filter.
  const branchAllowed = (b: BranchCode): boolean => {
    if (user?.role === "BM") return user.branch === b;
    return selectedBranches.size === 0 || selectedBranches.has(b);
  };

  // Sort events by date desc so the newest one is the natural default.
  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [events],
  );

  // Default the event selector to the most-recent event once data lands.
  if (!eventId && sortedEvents[0]) {
    // setState during render is fine here because it's idempotent — only
    // runs once until user actively picks a different event.
    setEventId(sortedEvents[0].id);
  }

  const event: FAEvent | undefined = useMemo(
    () => events.find(e => e.id === eventId),
    [events, eventId],
  );

  // Maps to make rendering cheap
  const studentsById = useMemo(() => {
    const m = new Map<string, typeof students[number]>();
    for (const s of students) m.set(s.id, s);
    return m;
  }, [students]);
  const sessionsById = useMemo(() => {
    const m = new Map<string, typeof sessions[number]>();
    for (const s of sessions) m.set(s.id, s);
    return m;
  }, [sessions]);

  // Sessions inside the picked event — used both by the row filter (when
  // session/day are narrowed) and by the Session dropdown options.
  const eventSessions = useMemo(
    () => sessions
      .filter(s => s.eventId === eventId)
      .sort((a, b) => a.dayNumber - b.dayNumber || a.sessionNumber - b.sessionNumber),
    [sessions, eventId],
  );

  // Sessions narrowed by the active Day picker — drives the Session dropdown.
  const sessionsForDay = useMemo(() => {
    if (day === "all") return eventSessions;
    return eventSessions.filter(s => s.dayNumber === day);
  }, [eventSessions, day]);

  // Filter + sort the row set
  const rows = useMemo(() => {
    if (!event) return [];
    let list: Invitation[] = invitations.filter(i => i.eventId === event.id);
    list = list.filter(i => branchAllowed(i.branch));
    if (status !== "all") list = list.filter(i => i.status === status);
    if (type !== "all")   list = list.filter(i => i.inviteType === type);
    if (day !== "all") {
      list = list.filter(i => {
        const s = sessionsById.get(i.sessionId);
        return s ? s.dayNumber === day : false;
      });
    }
    if (sessionFilter !== "all") {
      list = list.filter(i => i.sessionId === sessionFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(i => {
        const s = studentsById.get(i.studentId);
        if (!s) return false;
        return (
          s.name.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          (i.coachName ?? "").toLowerCase().includes(q)
        );
      });
    }
    return list.sort((a, b) => {
      // Order by (branch, day, session, student name) so messages read sensibly.
      if (a.branch !== b.branch) return a.branch.localeCompare(b.branch);
      const sa = sessionsById.get(a.sessionId);
      const sb = sessionsById.get(b.sessionId);
      if (sa && sb) {
        if (sa.dayNumber !== sb.dayNumber) return sa.dayNumber - sb.dayNumber;
        if (sa.sessionNumber !== sb.sessionNumber) return sa.sessionNumber - sb.sessionNumber;
      }
      const na = studentsById.get(a.studentId)?.name ?? "";
      const nb = studentsById.get(b.studentId)?.name ?? "";
      return na.localeCompare(nb);
    });
  }, [event, invitations, selectedBranches, user?.role, user?.branch, status, type, day, sessionFilter, search, studentsById, sessionsById]);

  // ─── Export helpers ────────────────────────────────────────────────

  function buildText(): string {
    if (!event) return "";
    const lines: string[] = [];
    lines.push(`📋 ${event.name}`);
    lines.push(`${format(parseISO(event.startDate), "d MMM")} – ${format(parseISO(event.endDate), "d MMM yyyy")}`);
    if (user?.role === "BM" && user.branch) {
      lines.push(`Branch: ${user.branch}`);
    } else if (selectedBranches.size > 0 && selectedBranches.size < 20) {
      lines.push(`Branches: ${Array.from(selectedBranches).sort().join(", ")}`);
    }
    lines.push("");
    // Group by (branch, day) so a WhatsApp message reads "ST, Mon: …"
    let lastHeader = "";
    let idx = 0;
    for (const inv of rows) {
      const sess = sessionsById.get(inv.sessionId);
      const student = studentsById.get(inv.studentId);
      const dayLabel = sess && event
        ? format(addDays(parseISO(event.startDate), sess.dayNumber - 1), "EEEE")
        : `Day ${sess?.dayNumber ?? "?"}`;
      const header = `${inv.branch} · ${dayLabel} ${sess?.startTime ?? ""}–${sess?.endTime ?? ""}`;
      if (header !== lastHeader) {
        if (lastHeader) lines.push("");
        lines.push(`▸ ${header}`);
        lastHeader = header;
        idx = 0;
      }
      idx++;
      const grade = `G${inv.targetGrade ?? student?.grade ?? inv.studentGrade ?? "?"}`;
      const tpe = inv.inviteType === "renewal" ? "RENEW" : "PROG";
      const coach = inv.coachName ? ` · Coach ${inv.coachName}` : "";
      const arr = arrivalLabel(inv.arrivalWindow, inv.arrivalTime);
      const arrival = arr ? ` · ⏰ ${arr}` : "";
      const name = student?.name ?? inv.studentName ?? `#${inv.studentId} (not in roster)`;
      lines.push(`  ${idx}. ${name} (${grade}, ${tpe})${coach}${arrival}`);
    }
    if (rows.length === 0) lines.push("(no invitations match these filters)");
    return lines.join("\n");
  }

  function buildCsv(): string {
    const header = [
      "Event", "Branch", "Day", "Session", "Start", "End",
      "Student ID", "Student Name", "Grade", "Type", "Status", "Coach", "Arrival",
    ];
    const escape = (s: string) => {
      const needsQuote = /[",\n]/.test(s);
      return needsQuote ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(",")];
    if (!event) return lines.join("\n");
    for (const inv of rows) {
      const sess = sessionsById.get(inv.sessionId);
      const student = studentsById.get(inv.studentId);
      lines.push([
        event.name,
        inv.branch,
        sess && event
          ? `${format(addDays(parseISO(event.startDate), sess.dayNumber - 1), "EEE")} (Day ${sess.dayNumber})`
          : "",
        sess?.sessionNumber.toString() ?? "",
        sess?.startTime ?? "",
        sess?.endTime ?? "",
        student?.id ?? inv.studentId,
        student?.name ?? inv.studentName ?? "(not in roster)",
        `G${inv.targetGrade ?? student?.grade ?? inv.studentGrade ?? "?"}`,
        inv.inviteType,
        inv.status,
        inv.coachName ?? "",
        arrivalLabel(inv.arrivalWindow, inv.arrivalTime),
      ].map(escape).join(","));
    }
    return lines.join("\n");
  }

  async function handleCopy() {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(buildText());
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function handleDownload(fmt: ExportFormat) {
    if (!event) return;
    const content = fmt === "csv" ? buildCsv() : buildText();
    const mime = fmt === "csv" ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8";
    const ext = fmt === "csv" ? "csv" : "txt";
    const safeName = event.name.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60);
    const fname = `pcm-invitations-${safeName}.${ext}`;
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Counts for context strip
  const counts = useMemo(() => {
    const c = { invited: 0, confirmed: 0, attended: 0, absent: 0, rescheduled: 0, progress: 0, renewal: 0 };
    for (const i of rows) {
      c.invited++;
      if (i.status === "confirmed" || i.status === "attended") c.confirmed++;
      if (i.status === "attended") c.attended++;
      if (i.status === "no_show" || i.status === "declined") c.absent++;
      if (i.status === "rescheduled") c.rescheduled++;
      if (i.inviteType === "progress") c.progress++;
      if (i.inviteType === "renewal")  c.renewal++;
    }
    return c;
  }, [rows]);

  return (
    <AppShell>
      {/* Hero */}
      <div className="mb-6 relative overflow-hidden rounded-2xl p-6
                      bg-gradient-to-r from-violet-600 to-indigo-600 text-white">
        <ListOrdered className="absolute -right-4 -top-6 w-32 h-32 text-white/10" aria-hidden="true" />
        <div className="fa-mono text-[10px] uppercase text-white/80 mb-1" style={{ letterSpacing: "0.14em" }}>
          PCM · Invitation list
        </div>
        <h1 className="text-3xl font-bold tracking-tight">All invited students</h1>
        <p className="text-white/80 text-sm mt-1.5">
          Filter, then copy as text for WhatsApp or download as CSV.
        </p>
      </div>

      {/* Filters */}
      <div className="rounded-xl bg-white border border-ivory-300 shadow-sm p-3 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-violet-500" />
            <span className="fa-mono text-[10px] uppercase text-ink-500" style={{ letterSpacing: "0.12em" }}>
              Event
            </span>
            <select
              className="fa-input text-xs"
              style={{ minWidth: "240px", height: "30px", paddingTop: "0.15rem", paddingBottom: "0.15rem" }}
              value={eventId}
              onChange={e => {
                setEventId(e.target.value);
                // Snap day + session filters back to "all" — keeping them
                // would silently filter out everything since the picks
                // belong to the previous event's sessions.
                setDay("all");
                setSessionFilter("all");
              }}
            >
              {sortedEvents.length === 0 && <option value="">(no events)</option>}
              {sortedEvents.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {ev.name} ({format(parseISO(ev.startDate), "d MMM")})
                </option>
              ))}
            </select>
          </div>

          {/* Day + Session pickers — narrow within the chosen event. */}
          {event && (
            <div className="flex items-center gap-2">
              <span
                className="fa-mono text-[10px] uppercase text-ink-500"
                style={{ letterSpacing: "0.12em" }}
              >
                Day
              </span>
              <select
                className="fa-input text-xs"
                style={{ height: "30px", paddingTop: "0.15rem", paddingBottom: "0.15rem" }}
                value={day === "all" ? "all" : String(day)}
                onChange={e => {
                  const v = e.target.value;
                  setDay(v === "all" ? "all" : Number(v));
                  setSessionFilter("all");
                }}
              >
                <option value="all">All days</option>
                {Array.from({ length: event.numberOfDays }, (_, i) => i + 1).map(d => {
                  // Render "Wed, 21 May" instead of bare "Day 1" so academy
                  // doesn't have to mentally map day-numbers to weekdays.
                  const date = addDays(parseISO(event.startDate), d - 1);
                  return (
                    <option key={d} value={d}>
                      {format(date, "EEEE, d MMM")}
                    </option>
                  );
                })}
              </select>
              <select
                className="fa-input text-xs"
                style={{ minWidth: "200px", height: "30px", paddingTop: "0.15rem", paddingBottom: "0.15rem" }}
                value={sessionFilter}
                onChange={e => setSessionFilter(e.target.value)}
              >
                <option value="all">
                  {day === "all"
                    ? "All sessions"
                    : `All sessions on ${format(addDays(parseISO(event.startDate), Number(day) - 1), "EEEE")}`
                  }
                </option>
                {sessionsForDay.map(s => {
                  const date = addDays(parseISO(event.startDate), s.dayNumber - 1);
                  return (
                    <option key={s.id} value={s.id}>
                      {format(date, "EEE")} · S{s.sessionNumber} · {s.startTime}–{s.endTime}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {user?.role !== "BM" && (
            <BranchMultiSelect
              selected={selectedBranches}
              onChange={setSelectedBranches}
            />
          )}

          <select
            className="fa-input text-xs"
            style={{ height: "30px", paddingTop: "0.15rem", paddingBottom: "0.15rem" }}
            value={status}
            onChange={e => setStatus(e.target.value as StatusFilter)}
          >
            <option value="all">All statuses</option>
            <option value="invited">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="attended">Attended</option>
            <option value="rescheduled">Rescheduled</option>
            <option value="declined">Declined</option>
            <option value="no_show">No-show</option>
          </select>

          <select
            className="fa-input text-xs"
            style={{ height: "30px", paddingTop: "0.15rem", paddingBottom: "0.15rem" }}
            value={type}
            onChange={e => setType(e.target.value as TypeFilter)}
          >
            <option value="all">All types</option>
            <option value="progress">Progress</option>
            <option value="renewal">Renewal</option>
          </select>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400" />
            <input
              className="fa-input fa-input-icon-left text-xs"
              style={{ height: "30px", paddingTop: "0.15rem", paddingBottom: "0.15rem" }}
              placeholder="Search name, ID, coach…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 pt-3 border-t border-ivory-300 text-xs text-ink-500">
          <span><strong className="text-ink-900">{counts.invited}</strong> rows</span>
          <span><strong className="text-indigo-700">{counts.confirmed}</strong> confirmed</span>
          <span><strong className="text-emerald-700">{counts.attended}</strong> attended</span>
          <span><strong className="text-rose-600">{counts.absent}</strong> absent</span>
          <span><strong className="text-amber-700">{counts.rescheduled}</strong> rescheduled</span>
          <span className="text-ink-300">·</span>
          <span><strong className="text-violet-700">{counts.progress}</strong> progress</span>
          <span><strong className="text-cyan-700">{counts.renewal}</strong> renewal</span>
        </div>
      </div>

      {/* Export bar */}
      <div className="rounded-xl bg-white border border-ivory-300 shadow-sm p-3 mb-4 flex flex-wrap items-center gap-2">
        <span className="fa-mono text-[10px] uppercase text-ink-500 mr-1" style={{ letterSpacing: "0.12em" }}>
          Export
        </span>
        <button
          type="button"
          onClick={handleCopy}
          disabled={rows.length === 0}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-violet-200 bg-violet-50 text-violet-700 text-xs font-semibold hover:bg-violet-100 hover:border-violet-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied!" : "Copy as text"}
        </button>
        <button
          type="button"
          onClick={() => handleDownload("text")}
          disabled={rows.length === 0}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-cyan-200 bg-cyan-50 text-cyan-700 text-xs font-semibold hover:bg-cyan-100 hover:border-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <Download className="w-3.5 h-3.5" />
          Download .txt
        </button>
        <button
          type="button"
          onClick={() => handleDownload("csv")}
          disabled={rows.length === 0}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 hover:border-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <Download className="w-3.5 h-3.5" />
          Download .csv
        </button>
        <span className="ml-auto text-[11px] text-ink-400">
          Text format is grouped by branch + session — paste straight into a WhatsApp group.
        </span>
      </div>

      {/* The actual list */}
      <div className="rounded-2xl bg-white border border-ivory-300 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-violet-50 to-indigo-50 px-5 py-3 border-b border-ivory-300">
          <h2 className="text-sm font-semibold text-violet-900">
            {event ? event.name : "Pick an event above"}
          </h2>
          {event && (
            <div className="text-[11px] text-ink-500 mt-0.5">
              {format(parseISO(event.startDate), "d MMM yyyy")} → {format(parseISO(event.endDate), "d MMM yyyy")}
            </div>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="p-10 text-center">
            <div className="w-12 h-12 rounded-full bg-ivory-100 mx-auto mb-3 flex items-center justify-center">
              <Users className="w-5 h-5 text-ink-400" />
            </div>
            <div className="text-sm text-ink-500">No invitations match these filters.</div>
          </div>
        ) : (
          <table className="fa-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Branch</th>
                <th>Day · Session</th>
                <th>Time</th>
                <th>Student</th>
                <th>Grade</th>
                <th>Type</th>
                <th>Status</th>
                <th>Coach</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((inv, idx) => {
                const sess = sessionsById.get(inv.sessionId);
                // Prefer the loaded Student object, but fall back to the
                // denormalised name/grade attached to the invitation row
                // (LEFT-JOINed server-side) so we still get a real name even
                // when /api/pcm/students dropped the record during validation.
                const student = studentsById.get(inv.studentId);
                const displayName  = student?.name ?? inv.studentName ?? null;
                const displayGrade = inv.targetGrade ?? student?.grade ?? inv.studentGrade ?? null;
                const isProgress = inv.inviteType === "progress";
                return (
                  <tr key={inv.id}>
                    <td className="text-xs text-ink-400 font-mono">{idx + 1}</td>
                    <td>
                      <span
                        className="fa-mono text-[10px] uppercase px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-bold"
                        style={{ letterSpacing: "0.06em" }}
                      >
                        {inv.branch}
                      </span>
                    </td>
                    <td className="font-mono text-xs">
                      {sess && event
                        ? `${format(addDays(parseISO(event.startDate), sess.dayNumber - 1), "EEE")} · S${sess.sessionNumber}`
                        : `D${sess?.dayNumber} · S${sess?.sessionNumber}`}
                    </td>
                    <td className="font-mono text-xs text-ink-500">{sess?.startTime}–{sess?.endTime}</td>
                    <td>
                      {displayName ? (
                        <>
                          <div className="font-medium text-ink-900">{displayName}</div>
                          <div className="text-xs text-ink-400">#{inv.studentId}</div>
                        </>
                      ) : (
                        <>
                          <div className="font-medium text-amber-700 italic">Student not in roster</div>
                          <div className="text-xs text-ink-400">#{inv.studentId}</div>
                        </>
                      )}
                    </td>
                    <td className="font-mono text-sm">G{displayGrade ?? "?"}</td>
                    <td>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase text-white ${
                          isProgress
                            ? "bg-gradient-to-r from-violet-500 to-fuchsia-500"
                            : "bg-gradient-to-r from-cyan-500 to-teal-500"
                        }`}
                        style={{ letterSpacing: "0.06em" }}
                      >
                        {isProgress ? "Progress" : "Renewal"}
                      </span>
                    </td>
                    <td>
                      <span className="font-mono text-xs uppercase tracking-wide text-ink-600">{inv.status}</span>
                    </td>
                    <td className="text-xs text-ink-700">{inv.coachName ?? <span className="text-ink-400 italic">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
