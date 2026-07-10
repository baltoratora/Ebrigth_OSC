"use client";

import { useState, useMemo, useEffect } from "react";
import { CalendarDays, Users, MapPin, Search, UserPlus, Check, Download, ClipboardCheck, GripVertical } from "lucide-react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { addDays, parseISO, format } from "date-fns";
import { useFAStore } from "@pcm/_lib/store";
import { useCurrentUser } from "@pcm/_hooks/useCurrentUser";
import { AppShell } from "@pcm/_components/shared/AppShell";
import { EventStatusPill } from "@pcm/_components/fa/StatusPill";
import { AttendanceRoster } from "@pcm/_components/fa/AttendanceRoster";
import { WalkInModal } from "@pcm/_components/fa/WalkInModal";
import { getDisplayOrder, mergeFilteredReorder } from "@pcm/_lib/sessionOrder";
import { BRANCHES, BranchCode, Invitation, Session, resolveStudentById } from "@pcm/_types";
import { downloadCSV } from "@pcm/_lib/csv";
import { buildEventAttendanceCsv } from "@pcm/_lib/eventAttendanceCsv";

type AttStatusFilter = "all" | "confirmed" | "attended" | "no_show" | "invited";

export default function AttendancePage() {
  const user = useCurrentUser();
  const events = useFAStore(s => s.events);
  const sessions = useFAStore(s => s.sessions);
  const invitations = useFAStore(s => s.invitations);
  const students = useFAStore(s => s.students);
  const users = useFAStore(s => s.users);
  const sessionOrderMap = useFAStore(s => s.sessionOrder);
  const setSessionOrder = useFAStore(s => s.setSessionOrder);

  // Invitations-style filters
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | "all">("all");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [branchFilter, setBranchFilter] = useState<BranchCode | "all">("all");
  const [statusFilter, setStatusFilter] = useState<AttStatusFilter>("all");
  const [search, setSearch] = useState("");

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInBanner, setWalkInBanner] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Relevant events — every status except draft, newest first.
  const relevantEvents = useMemo(
    () => events.filter(e => e.status !== "draft").sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [events]
  );
  const selectedEvent = relevantEvents.find(e => e.id === selectedEventId) ?? null;

  const eventSessions = useMemo(
    () => selectedEvent
      ? sessions.filter(s => s.eventId === selectedEvent.id)
          .sort((a, b) => a.dayNumber - b.dayNumber || a.sessionNumber - b.sessionNumber)
      : [],
    [selectedEvent, sessions]
  );
  const filteredSessions = useMemo(
    () => eventSessions.filter(s => selectedDay === "all" || s.dayNumber === selectedDay),
    [eventSessions, selectedDay]
  );
  // Default the event to the newest one once data lands.
  useEffect(() => {
    if (!selectedEventId && relevantEvents[0]) setSelectedEventId(relevantEvents[0].id);
  }, [relevantEvents, selectedEventId]);

  // Keep a valid session selected as event/day filters change. "all" stays valid.
  useEffect(() => {
    if (filteredSessions.length === 0) {
      if (selectedSessionId !== null) setSelectedSessionId(null);
    } else if (selectedSessionId !== "all" && !filteredSessions.some(s => s.id === selectedSessionId)) {
      setSelectedSessionId(filteredSessions[0].id);
    }
  }, [filteredSessions, selectedSessionId]);

  const visibleBranchFilter = user?.role === "BM" ? user.branch : branchFilter;
  const canDrag = user?.role === "MKT";

  // The calendar date (→ weekday) for a 1-based day number of the selected event.
  const dayDateOf = (dayNumber: number): Date | null =>
    selectedEvent ? addDays(parseISO(selectedEvent.startDate), dayNumber - 1) : null;

  // Which sessions to render: "all" → every session in the current day filter;
  // a concrete id → just that one; null → none.
  const sessionsToRender = useMemo<Session[]>(() => {
    if (filteredSessions.length === 0) return [];
    if (selectedSessionId === "all") return filteredSessions;
    const one = filteredSessions.find(s => s.id === selectedSessionId);
    return one ? [one] : [];
  }, [filteredSessions, selectedSessionId]);

  // Build the ordered + filtered roster (branch + status + search) for a session.
  function orderedFor(session: Session): Invitation[] {
    const fullOrder = getDisplayOrder(session.id, invitations, sessionOrderMap);
    const q = search.trim().toLowerCase();
    const byId = new Map(
      invitations
        .filter(i =>
          i.sessionId === session.id &&
          i.status !== "declined" &&
          (visibleBranchFilter === "all" || i.branch === visibleBranchFilter) &&
          (statusFilter === "all" || i.status === statusFilter) &&
          (q === "" || (() => {
            const st = resolveStudentById(students, i.studentId);
            const name = (st?.name ?? i.studentName ?? "").toLowerCase();
            return name.includes(q) || i.studentId.toLowerCase().includes(q);
          })())
        )
        .map(i => [i.id, i] as const)
    );
    const out: Invitation[] = [];
    const seen = new Set<string>();
    for (const id of fullOrder) {
      const inv = byId.get(id);
      if (inv) { out.push(inv); seen.add(id); }
    }
    const newcomers = Array.from(byId.values())
      .filter(i => !seen.has(i.id))
      .sort((a, b) => {
        if (a.branch !== b.branch) return a.branch.localeCompare(b.branch);
        const sa = resolveStudentById(students, a.studentId);
        const sb = resolveStudentById(students, b.studentId);
        return (sa?.name || "").localeCompare(sb?.name || "");
      });
    return [...out, ...newcomers];
  }

  // Ordered roster per rendered session (recomputed each render — a day has only
  // a handful of sessions, so this stays cheap).
  const orderedBySession = new Map<string, Invitation[]>();
  for (const s of sessionsToRender) orderedBySession.set(s.id, orderedFor(s));

  function pendingFor(session: { id: string }): number {
    return invitations.filter(i =>
      i.sessionId === session.id && i.status === "invited" &&
      (visibleBranchFilter === "all" || i.branch === visibleBranchFilter)
    ).length;
  }

  // Aggregate counts across every rendered session for the summary line.
  const counts = (() => {
    let rows = 0, attended = 0, absent = 0, awaiting = 0;
    for (const list of orderedBySession.values()) {
      rows += list.length;
      attended += list.filter(i => i.status === "attended").length;
      absent += list.filter(i => i.status === "no_show").length;
      awaiting += list.filter(i => i.status === "confirmed").length;
    }
    return { rows, attended, absent, awaiting };
  })();

  const activeInvitation = activeDragId ? invitations.find(i => i.id === activeDragId) ?? null : null;
  const activeStudent = activeInvitation ? resolveStudentById(students, activeInvitation.studentId) ?? null : null;

  function handleDragStart(event: DragStartEvent) { setActiveDragId(String(event.active.id)); }
  function handleDragCancel() { setActiveDragId(null); }
  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;
    // Reorder within the dragged item's own session (cross-session drops are
    // ignored — overId won't be in that session's visible list).
    const inv = invitations.find(i => i.id === activeId);
    if (!inv) return;
    const sessId = inv.sessionId;
    const visibleIds = (orderedBySession.get(sessId) ?? []).map(i => i.id);
    const oldIndex = visibleIds.indexOf(activeId);
    const newIndex = visibleIds.indexOf(overId);
    if (oldIndex === -1 || newIndex === -1) return;
    const newVisibleOrder = arrayMove(visibleIds, oldIndex, newIndex);
    const fullOrder = getDisplayOrder(sessId, invitations, sessionOrderMap);
    const mergedFullOrder = mergeFilteredReorder(fullOrder, visibleIds, newVisibleOrder);
    setSessionOrder(sessId, mergedFullOrder);
  }

  function handleDownloadCSV() {
    if (!selectedEvent) return;
    const { filename, rows } = buildEventAttendanceCsv({ event: selectedEvent, sessions: eventSessions, invitations, students, users });
    downloadCSV(filename, rows);
  }

  if (!user) return null;

  const numberOfDays = selectedEvent?.numberOfDays ?? 0;
  const preferredDay = typeof selectedDay === "number" ? selectedDay : (sessionsToRender[0]?.dayNumber ?? null);
  const canEdit = user.role === "MKT" || (!!selectedEvent && selectedEvent.status !== "draft");

  return (
    <AppShell>
      {/* Hero */}
      <div className="mb-6 relative overflow-hidden rounded-2xl p-6 bg-gradient-to-r from-violet-600 to-indigo-600 text-white">
        <ClipboardCheck className="absolute -right-4 -top-6 w-32 h-32 text-white/10" aria-hidden="true" />
        <div className="fa-mono text-[10px] uppercase text-white/80 mb-1" style={{ letterSpacing: "0.14em" }}>
          PCM · Attendance
        </div>
        <h1 className="fa-display text-3xl md:text-4xl leading-tight">Attendance</h1>
        <p className="text-white/80 mt-1 text-sm">Track who showed up during the event.</p>
      </div>

      {/* Filter bar — Invitations-style */}
      <div className="rounded-2xl bg-white border border-ivory-300 shadow-sm p-4 mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="fa-mono text-[10px] uppercase text-ink-400 inline-flex items-center gap-1.5" style={{ letterSpacing: "0.1em" }}>
            <CalendarDays className="w-3.5 h-3.5" /> Event
          </span>
          <select
            className="fa-input flex-1 min-w-[260px] py-2 text-sm font-medium"
            value={selectedEventId ?? ""}
            onChange={e => { setSelectedEventId(e.target.value || null); setSelectedDay("all"); }}
          >
            {relevantEvents.length === 0 && <option value="">No events</option>}
            {relevantEvents.map(ev => (
              <option key={ev.id} value={ev.id}>{ev.name}</option>
            ))}
          </select>

          <span className="fa-mono text-[10px] uppercase text-ink-400" style={{ letterSpacing: "0.1em" }}>Day</span>
          <select
            className="fa-input w-44 py-2 text-sm"
            value={selectedDay === "all" ? "all" : String(selectedDay)}
            onChange={e => setSelectedDay(e.target.value === "all" ? "all" : Number(e.target.value))}
          >
            <option value="all">All days</option>
            {Array.from({ length: numberOfDays }, (_, i) => i + 1).map(d => {
              const dt = dayDateOf(d);
              return (
                <option key={d} value={d}>
                  {dt ? format(dt, "EEEE · d MMM") : `Day ${d}`}
                </option>
              );
            })}
          </select>

          <select
            className="fa-input min-w-[240px] py-2 text-sm"
            value={selectedSessionId ?? ""}
            onChange={e => setSelectedSessionId(e.target.value || null)}
          >
            {filteredSessions.length === 0 ? (
              <option value="">No sessions</option>
            ) : (
              <option value="all">All sessions</option>
            )}
            {filteredSessions.map(s => {
              const dt = dayDateOf(s.dayNumber);
              const wd = dt ? format(dt, "EEE, d MMM") : `Day ${s.dayNumber}`;
              return (
                <option key={s.id} value={s.id}>
                  {wd} · Session {s.sessionNumber} · {s.startTime}–{s.endTime}
                </option>
              );
            })}
          </select>

          {user.role === "MKT" && (
            <select
              className="fa-input min-w-[170px] py-2 text-sm"
              value={branchFilter}
              onChange={e => setBranchFilter(e.target.value as BranchCode | "all")}
            >
              <option value="all">All branches</option>
              {BRANCHES.map(b => (
                <option key={b.code} value={b.code}>{b.code} — {b.name}</option>
              ))}
            </select>
          )}
        </div>

        <select
          className="fa-input w-full py-2 text-sm"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as AttStatusFilter)}
        >
          <option value="all">All statuses</option>
          <option value="confirmed">Confirmed (awaiting)</option>
          <option value="attended">Attended</option>
          <option value="no_show">Absent</option>
          <option value="invited">Pending confirmation</option>
        </select>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name or ID…"
            className="fa-input w-full pl-9 py-2 text-sm"
          />
        </div>

        {/* Counts line */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {selectedEvent && <EventStatusPill status={selectedEvent.status} />}
          <span><strong className="text-ink-900">{counts.rows}</strong> <span className="text-ink-400">rows</span></span>
          <span className="text-emerald-700"><strong>{counts.attended}</strong> attended</span>
          <span className="text-red-600"><strong>{counts.absent}</strong> absent</span>
          <span className="text-ink-600"><strong>{counts.awaiting}</strong> awaiting</span>
          {selectedEvent && (
            <span className="ml-auto text-ink-400 inline-flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {selectedEvent.venue}
            </span>
          )}
        </div>
      </div>

      {/* Action row — Walk-in + CSV (MKT only) */}
      {user.role === "MKT" && selectedEvent && (
        <div className="rounded-2xl bg-white border border-ivory-300 shadow-sm px-4 py-3 mb-4 flex items-center gap-2">
          <span className="fa-mono text-[10px] uppercase text-ink-400 mr-1" style={{ letterSpacing: "0.1em" }}>Actions</span>
          <button onClick={() => setWalkInOpen(true)} className="fa-btn-secondary inline-flex items-center gap-1.5" title="Add a walk-in student">
            <UserPlus className="w-4 h-4" /> Walk-in
          </button>
          {invitations.some(i => i.eventId === selectedEvent.id) && (
            <button onClick={handleDownloadCSV} className="fa-btn-secondary inline-flex items-center gap-1.5" title="Download attendance CSV">
              <Download className="w-4 h-4" /> Download CSV
            </button>
          )}
        </div>
      )}

      {/* Walk-in success banner */}
      {walkInBanner && (
        <div className="rounded-2xl bg-success-soft border border-success/30 px-4 py-3 mb-4 flex items-center gap-2 fa-toast-in" role="status" aria-live="polite">
          <Check className="w-4 h-4 text-success flex-shrink-0" />
          <span className="text-sm text-ink-700">{walkInBanner}</span>
        </div>
      )}

      {/* Roster(s) — one per rendered session ("All sessions" stacks them) */}
      {sessionsToRender.length === 0 ? (
        <div className="rounded-2xl bg-white border border-ivory-300 shadow-sm p-12 text-center">
          <div className="w-14 h-14 rounded-full bg-ivory-200 text-ink-400 flex items-center justify-center mx-auto mb-4">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="fa-display text-xl text-ink-900">No sessions</h3>
          <p className="text-sm text-ink-500 mt-1">This event / day has no sessions scheduled.</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragCancel={handleDragCancel}
          onDragEnd={handleDragEnd}
        >
          <div className="space-y-8">
            {sessionsToRender.map(s => (
              <AttendanceRoster
                key={s.id}
                session={s}
                orderedInvitations={orderedBySession.get(s.id) ?? []}
                pendingConfirmationsCount={pendingFor(s)}
                canEdit={canEdit}
                canDrag={canDrag}
                academyView={user.role === "MKT"}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeStudent && activeInvitation ? (
              <div className="rounded-xl px-4 py-2.5 shadow-lg flex items-center gap-3 bg-ivory-50 border border-gold-300">
                <GripVertical className="w-4 h-4 text-ink-400" />
                <div>
                  <div className="text-sm font-medium text-ink-900">{activeStudent.name}</div>
                  <div className="text-xs text-ink-400 font-mono">{activeInvitation.branch}</div>
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Walk-in modal */}
      {selectedEvent && walkInOpen && user.role === "MKT" && (
        <WalkInModal
          open={walkInOpen}
          onClose={() => setWalkInOpen(false)}
          event={selectedEvent}
          preferredDay={preferredDay}
          onSuccess={(studentName) => {
            setWalkInBanner(`${studentName} added as walk-in.`);
            window.setTimeout(() => setWalkInBanner(null), 3000);
          }}
        />
      )}
    </AppShell>
  );
}
