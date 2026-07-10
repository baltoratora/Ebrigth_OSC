"use client";

import { useState, useMemo } from "react";
import { CalendarDays, Clock, Users, ChevronRight, MapPin, Filter, GripVertical, UserPlus, Check, Download, Search, X } from "lucide-react";
import { addDays, parseISO } from "date-fns";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useFAStore } from "@fa/_lib/store";
import { useCurrentUser } from "@fa/_hooks/useCurrentUser";
import { AppShell } from "@fa/_components/shared/AppShell";
import { EventStatusPill } from "@fa/_components/fa/StatusPill";
import { EventPickerGrid } from "@fa/_components/fa/EventPickerGrid";
import { AttendanceRoster } from "@fa/_components/fa/AttendanceRoster";
import { ConfirmDialog } from "@fa/_components/shared/ConfirmDialog";
import { WalkInModal } from "@fa/_components/fa/WalkInModal";
import { getDisplayOrder, mergeFilteredReorder } from "@fa/_lib/sessionOrder";
import { BRANCHES, BranchCode, Session, resolveStudentById, countsAsAttended } from "@fa/_types";
import { downloadCSV } from "@fa/_lib/csv";
import { buildEventAttendanceCsv } from "@fa/_lib/eventAttendanceCsv";

const SESSION_DROPPABLE_PREFIX = "session:";

type PendingTransfer = {
  invitationId: string;
  studentName: string;
  targetSessionId: string;
  targetSessionLabel: string;
};

export default function AttendancePage() {
  const user = useCurrentUser();
  const events = useFAStore(s => s.events);
  const sessions = useFAStore(s => s.sessions);
  const invitations = useFAStore(s => s.invitations);
  const students = useFAStore(s => s.students);
  const users = useFAStore(s => s.users);
  const sessionOrderMap = useFAStore(s => s.sessionOrder);
  const setSessionOrder = useFAStore(s => s.setSessionOrder);
  const moveInvitationToSession = useFAStore(s => s.moveInvitationToSession);

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [branchFilter, setBranchFilter] = useState<BranchCode | "all">("all");
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [pendingTransfer, setPendingTransfer] = useState<PendingTransfer | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInBanner, setWalkInBanner] = useState<string | null>(null);
  const [nameQuery, setNameQuery] = useState("");

  // Pointer sensor with a small activation distance prevents click-as-drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Relevant events — every status except draft. Marketing/BMs need
  // to tick attendance for open events too (walk-ins, pre-arrivals,
  // students who arrive before invitations close), not just after the
  // event is marked completed. Matches the PCM attendance flow.
  const relevantEvents = useMemo(() => {
    return events
      .filter(e => e.status !== "draft")
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, [events]);

  const selectedEvent = relevantEvents.find(e => e.id === selectedEventId);
  const eventSessions = selectedEvent
    ? sessions.filter(s => s.eventId === selectedEvent.id)
        .sort((a, b) => a.dayNumber - b.dayNumber || a.sessionNumber - b.sessionNumber)
    : [];
  const daySessions = eventSessions.filter(s => s.dayNumber === selectedDay);
  const selectedSession = daySessions.find(s => s.id === selectedSessionId);

  // BMs only see their branch — MKT sees all
  const visibleBranchFilter = user?.role === "BM" ? user.branch : branchFilter;

  // Drag-and-drop is MKT-only per spec.
  const canDrag = user?.role === "MKT";

  // Compute the ordered, filtered roster for the selected session. This is the
  // single source of truth for both the displayed table and the dnd-kit
  // handler — so reorders/transfers always operate on the visible sequence.
  const fullSessionOrder = useMemo(
    () => selectedSession ? getDisplayOrder(selectedSession.id, invitations, sessionOrderMap) : [],
    [selectedSession, invitations, sessionOrderMap]
  );

  const orderedInvitations = useMemo(() => {
    if (!selectedSession) return [];
    const byId = new Map(
      invitations
        .filter(i =>
          i.sessionId === selectedSession.id &&
          i.status !== "declined" &&
          i.status !== "invited" &&
          (visibleBranchFilter === "all" || i.branch === visibleBranchFilter)
        )
        .map(i => [i.id, i] as const)
    );
    const out = [];
    const seen = new Set<string>();
    for (const id of fullSessionOrder) {
      const inv = byId.get(id);
      if (inv) { out.push(inv); seen.add(id); }
    }
    // Newcomers fall back to branch + student name (matches pre-feature default)
    const newcomers = Array.from(byId.values())
      .filter(i => !seen.has(i.id))
      .sort((a, b) => {
        if (a.branch !== b.branch) return a.branch.localeCompare(b.branch);
        const sa = resolveStudentById(students, a.studentId);
        const sb = resolveStudentById(students, b.studentId);
        return (sa?.name || "").localeCompare(sb?.name || "");
      });
    const combined = [...out, ...newcomers];

    // ── Grade 5 priority ──────────────────────────────────────────────────
    // Grade 5 students are always lifted to the top of every session roster.
    // Relative order within Grade 5 and within the remaining grades is kept
    // exactly as-is (manual drag order + newcomer fallback both respected).
    const grade5    = combined.filter(i => (i.targetGrade ?? 0) === 5);
    const nonGrade5 = combined.filter(i => (i.targetGrade ?? 0) !== 5);
    return [...grade5, ...nonGrade5];
  }, [selectedSession, invitations, fullSessionOrder, visibleBranchFilter, students]);

  const pendingConfirmationsCount = useMemo(() => {
    if (!selectedSession) return 0;
    return invitations.filter(i =>
      i.sessionId === selectedSession.id &&
      i.status === "invited" &&
      (visibleBranchFilter === "all" || i.branch === visibleBranchFilter)
    ).length;
  }, [invitations, selectedSession, visibleBranchFilter]);

  // Event-wide name search. Matches every invitation in the selected event by
  // student name (or id) so an attendance-taker can locate a student without
  // knowing which day/session they're in, then jump straight to that session.
  // Independent of the roster/dnd order, so searching never disturbs ordering.
  const searchResults = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    if (!q || !selectedEvent) return [];
    const sessById = new Map(eventSessions.map(s => [s.id, s]));
    return invitations
      .filter(i =>
        sessById.has(i.sessionId) &&
        i.status !== "declined" && i.status !== "invited" &&
        (visibleBranchFilter === "all" || i.branch === visibleBranchFilter)
      )
      .map(i => {
        const student = resolveStudentById(students, i.studentId);
        return { inv: i, student, name: student?.name || i.studentNameSnapshot || `#${i.studentId}`, session: sessById.get(i.sessionId)! };
      })
      .filter(r => r.name.toLowerCase().includes(q) || String(r.inv.studentId).toLowerCase().includes(q))
      .sort((a, b) =>
        a.session.dayNumber - b.session.dayNumber ||
        a.session.sessionNumber - b.session.sessionNumber ||
        a.name.localeCompare(b.name)
      );
  }, [nameQuery, selectedEvent, eventSessions, invitations, students, visibleBranchFilter]);

  const isSearching = nameQuery.trim().length > 0;

  const activeInvitation = activeDragId
    ? invitations.find(i => i.id === activeDragId) ?? null
    : null;
  const activeStudent = activeInvitation
    ? resolveStudentById(students, activeInvitation.studentId) ?? null
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id));
  }

  function handleDragCancel() {
    setActiveDragId(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || !selectedSession) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    if (overId.startsWith(SESSION_DROPPABLE_PREFIX)) {
      // Cross-session transfer
      const targetSessionId = overId.slice(SESSION_DROPPABLE_PREFIX.length);
      const inv = invitations.find(i => i.id === activeId);
      if (!inv || inv.sessionId === targetSessionId) return;
      const target = sessions.find(s => s.id === targetSessionId);
      const student = resolveStudentById(students, inv.studentId);
      if (!target || !student) return;
      setPendingTransfer({
        invitationId: activeId,
        studentName: student.name,
        targetSessionId,
        targetSessionLabel: target.label
          ? `${target.label} (Day ${target.dayNumber} · Session ${target.sessionNumber})`
          : `Day ${target.dayNumber} · Session ${target.sessionNumber}`,
      });
      return;
    }

    // Reorder within the same session
    if (activeId === overId) return;
    const visibleIds = orderedInvitations.map(i => i.id);
    const oldIndex = visibleIds.indexOf(activeId);
    const newIndex = visibleIds.indexOf(overId);
    if (oldIndex === -1 || newIndex === -1) return;
    const newVisibleOrder = arrayMove(visibleIds, oldIndex, newIndex);
    const mergedFullOrder = mergeFilteredReorder(fullSessionOrder, visibleIds, newVisibleOrder);
    setSessionOrder(selectedSession.id, mergedFullOrder);
  }

  function confirmTransfer() {
    if (!pendingTransfer) return;
    moveInvitationToSession(pendingTransfer.invitationId, pendingTransfer.targetSessionId);
    setPendingTransfer(null);
  }

  function handleDownloadCSV() {
    if (!selectedEvent) return;
    const { filename, rows } = buildEventAttendanceCsv({
      event: selectedEvent,
      sessions: eventSessions,
      invitations,
      students,
      users,
    });
    downloadCSV(filename, rows);
  }

  if (!user) return null;

  return (
    <AppShell>
      <div className="mb-8">
        <div className="text-xs uppercase tracking-wider font-semibold text-ink-400 mb-1">
          FA Shared
        </div>
        <h1 className="fa-display text-4xl text-ink-900">Attendance</h1>
        <p className="text-ink-500 mt-1">
          Track who showed up during the event.
        </p>
      </div>

      {/* Event picker */}
      {!selectedEventId ? (
        <EventPickerGrid
          events={relevantEvents}
          onSelect={(id) => {
            setSelectedEventId(id);
            setSelectedDay(1);
            setSelectedSessionId(null);
          }}
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragCancel={handleDragCancel}
          onDragEnd={handleDragEnd}
        >
          {/* Event header bar */}
          <div className="fa-card p-4 mb-6 flex items-center gap-4">
            <button
              onClick={() => { setSelectedEventId(null); setSelectedSessionId(null); }}
              className="fa-btn-ghost text-sm"
            >
              ← Change event
            </button>
            <div className="w-px h-8 bg-ivory-300" />
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h2 className="fa-display text-lg text-ink-900">{selectedEvent?.name}</h2>
                {selectedEvent && <EventStatusPill status={selectedEvent.status} />}
              </div>
              <div className="text-xs text-ink-400 flex items-center gap-3 mt-0.5">
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="w-3 h-3" />
                  {selectedEvent && new Date(selectedEvent.startDate).toLocaleDateString()}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {selectedEvent?.venue}
                </span>
              </div>
            </div>
            {user.role === "MKT" && (
              <>
                {invitations.some(i => i.eventId === selectedEvent?.id) && (
                  <button
                    onClick={handleDownloadCSV}
                    className="fa-btn-secondary flex-shrink-0"
                    title="Download all invitations + attendance for this event as a CSV (opens in Excel)"
                  >
                    <Download className="w-4 h-4" /> Download CSV
                  </button>
                )}
                <button
                  onClick={() => setWalkInOpen(true)}
                  className="fa-btn-primary flex-shrink-0"
                  title="Add a walk-in student to this event"
                >
                  <UserPlus className="w-4 h-4" /> Walk-in
                </button>
              </>
            )}
          </div>

          {/* Walk-in success banner */}
          {walkInBanner && (
            <div
              className="fa-card p-3 mb-4 bg-success-soft border-success/30 flex items-center gap-2 fa-toast-in"
              role="status"
              aria-live="polite"
            >
              <Check className="w-4 h-4 text-success flex-shrink-0" />
              <span className="text-sm text-ink-700">{walkInBanner}</span>
            </div>
          )}

          {/* Day tabs */}
          <div className="flex items-center gap-1 mb-4 bg-ivory-200 p-1 rounded-lg w-fit">
            {selectedEvent && Array.from({ length: selectedEvent.numberOfDays }, (_, i) => i + 1).map(d => {
              const dayDate = addDays(parseISO(selectedEvent.startDate), d - 1);
              return (
                <button
                  key={d}
                  onClick={() => { setSelectedDay(d); setSelectedSessionId(null); }}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    selectedDay === d ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-900"
                  }`}
                >
                  Day {d}
                  <span className="text-xs text-ink-400 ml-1.5">
                    {dayDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Filters: name search (all roles) + branch (MKT only) */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative">
              <Search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={nameQuery}
                onChange={e => setNameQuery(e.target.value)}
                placeholder="Search student name…"
                className="fa-input w-72 py-1.5 pl-9 pr-8 text-sm"
                aria-label="Search student by name"
              />
              {isSearching && (
                <button
                  onClick={() => setNameQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
                  aria-label="Clear search"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {user.role === "MKT" && (
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-ink-400" />
                <span className="text-xs text-ink-400">Branch:</span>
                <select
                  className="fa-input w-48 py-1.5 text-sm"
                  value={branchFilter}
                  onChange={e => setBranchFilter(e.target.value as BranchCode | "all")}
                >
                  <option value="all">All branches</option>
                  {BRANCHES.map(b => (
                    <option key={b.code} value={b.code}>{b.code} — {b.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {isSearching ? (
            /* ── Event-wide name search results ── */
            <div className="fa-card overflow-hidden">
              <div className="px-4 py-3 border-b border-ivory-300 text-sm text-ink-500">
                <strong className="text-ink-900">{searchResults.length}</strong> result{searchResults.length !== 1 ? "s" : ""} for “{nameQuery.trim()}” across this event
              </div>
              {searchResults.length === 0 ? (
                <div className="p-8 text-center text-sm text-ink-400">
                  No student matches that name in this event.
                </div>
              ) : (
                <table className="fa-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Branch</th>
                      <th>Grade</th>
                      <th>When</th>
                      <th>Attendance</th>
                      <th className="text-right">Go</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.map(r => {
                      const dayDate = selectedEvent ? addDays(parseISO(selectedEvent.startDate), r.session.dayNumber - 1) : null;
                      const statusLabel =
                        r.inv.status === "attended" ? "Present"
                        : r.inv.status === "walk_in" ? "Walk-in"
                        : r.inv.status === "no_show" ? "Absent"
                        : r.inv.status === "confirmed" ? "Awaiting"
                        : r.inv.status;
                      const tone =
                        countsAsAttended(r.inv.status) ? "success"
                        : r.inv.status === "no_show" ? "danger" : "ink-500";
                      return (
                        <tr
                          key={r.inv.id}
                          className="cursor-pointer hover:bg-ivory-100"
                          onClick={() => { setSelectedDay(r.session.dayNumber); setSelectedSessionId(r.session.id); setNameQuery(""); }}
                        >
                          <td>
                            <div className="font-medium text-ink-900">{r.name}</div>
                            <div className="text-xs text-ink-400">#{r.inv.studentId}</div>
                          </td>
                          <td>
                            <span className="font-mono text-xs font-semibold text-ink-700 bg-ivory-200 px-2 py-0.5 rounded">{r.inv.branch}</span>
                          </td>
                          <td className="font-mono text-sm">G{r.inv.targetGrade ?? r.student?.grade ?? "—"}</td>
                          <td className="text-sm text-ink-600">
                            Day {r.session.dayNumber}
                            {dayDate && <span className="text-ink-400"> · {dayDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
                            <span className="text-ink-400"> · Session {r.session.sessionNumber}</span>
                          </td>
                          <td>
                            <span className={`text-xs font-medium ${tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-ink-500"}`}>
                              {statusLabel}
                            </span>
                          </td>
                          <td className="text-right">
                            <ChevronRight className="w-4 h-4 text-ink-400 inline" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
          <div className="grid lg:grid-cols-[320px_1fr] gap-6">
            {/* Session list */}
            <div>
              <h3 className="fa-display text-base text-ink-900 mb-3">Sessions on day {selectedDay}</h3>
              {daySessions.length === 0 ? (
                <div className="fa-card p-4 text-sm text-ink-400 text-center">
                  No sessions scheduled.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {daySessions.map(session => (
                    <DroppableSessionButton
                      key={session.id}
                      session={session}
                      isSelected={session.id === selectedSessionId}
                      isDragSource={activeInvitation?.sessionId === session.id}
                      canDropTarget={canDrag && activeDragId !== null}
                      onSelect={() => setSelectedSessionId(session.id)}
                      attended={invitations.filter(i =>
                        i.sessionId === session.id &&
                        countsAsAttended(i.status) &&
                        (visibleBranchFilter === "all" || i.branch === visibleBranchFilter)
                      ).length}
                      confirmed={invitations.filter(i =>
                        i.sessionId === session.id &&
                        (i.status === "confirmed" || countsAsAttended(i.status)) &&
                        (visibleBranchFilter === "all" || i.branch === visibleBranchFilter)
                      ).length}
                      inviteCount={invitations.filter(i =>
                        i.sessionId === session.id &&
                        (visibleBranchFilter === "all" || i.branch === visibleBranchFilter)
                      ).length}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Roster */}
            <div>
              {!selectedSession ? (
                <div className="fa-card p-12 text-center">
                  <div className="w-14 h-14 rounded-full bg-ivory-200 text-ink-400 flex items-center justify-center mx-auto mb-4">
                    <Users className="w-6 h-6" />
                  </div>
                  <h3 className="fa-display text-xl text-ink-900">Pick a session</h3>
                  <p className="text-sm text-ink-500 mt-1">
                    Select a session on the left to take attendance.
                  </p>
                </div>
              ) : (
                <AttendanceRoster
                  session={selectedSession}
                  orderedInvitations={orderedInvitations}
                  pendingConfirmationsCount={pendingConfirmationsCount}
                  canEdit={user.role === "MKT" || selectedEvent?.status === "ongoing"}
                  canDrag={canDrag}
                />
              )}
            </div>
          </div>
          )}

          {/* Drag overlay — visual feedback while dragging */}
          <DragOverlay dropAnimation={null}>
            {activeStudent && activeInvitation ? (
              <div className="fa-card px-4 py-2.5 shadow-lg flex items-center gap-3 bg-ivory-50 border border-gold-300">
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

      {/* Walk-in modal — MKT only, requires a selected event */}
      {selectedEvent && walkInOpen && user.role === "MKT" && (
        <WalkInModal
          open={walkInOpen}
          onClose={() => setWalkInOpen(false)}
          event={selectedEvent}
          preferredDay={selectedDay}
          onSuccess={(studentName) => {
            setWalkInBanner(`${studentName} added as walk-in.`);
            window.setTimeout(() => setWalkInBanner(null), 3000);
          }}
        />
      )}

      {/* Cross-session transfer confirm */}
      <ConfirmDialog
        open={pendingTransfer !== null}
        onClose={() => setPendingTransfer(null)}
        onConfirm={confirmTransfer}
        title={pendingTransfer ? `Move ${pendingTransfer.studentName} to ${pendingTransfer.targetSessionLabel}?` : ""}
        description="The student's invitation will move to the new session. The session quota for the source session frees up; the destination session's count goes up by 1."
        confirmLabel="Move"
      />
    </AppShell>
  );
}

/* ── Droppable session button ───────────────────────────────────────────── */

function DroppableSessionButton({
  session, isSelected, isDragSource, canDropTarget, onSelect,
  attended, confirmed, inviteCount,
}: {
  session: Session;
  isSelected: boolean;
  /** True when the current drag originated from this session — prevents the
   *  user's own session from being highlighted as a transfer target. */
  isDragSource: boolean;
  /** True when a drag is in progress and the user has MKT role. Used to gate
   *  the highlight ring even if `useDroppable` returns isOver. */
  canDropTarget: boolean;
  onSelect: () => void;
  attended: number;
  confirmed: number;
  inviteCount: number;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `session:${session.id}`,
    disabled: !canDropTarget || isDragSource,
  });
  const showDropTarget = canDropTarget && !isDragSource;
  const isDropOver = isOver && showDropTarget;

  return (
    <button
      ref={setNodeRef}
      onClick={onSelect}
      className={`w-full text-left p-3 rounded-[10px] border transition-all ${
        isDropOver
          ? "bg-gold-100 border-gold-500 ring-4 ring-gold-300/40"
          : isSelected
            ? "bg-brand-50 border-brand-600 ring-2 ring-brand-100"
            : showDropTarget
              ? "bg-white border-dashed border-gold-300 hover:border-gold-400"
              : "bg-white border-ivory-300 hover:border-ink-300"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <Clock className="w-3 h-3 text-ink-400" />
        <span className="text-sm font-medium text-ink-900">
          {session.startTime} – {session.endTime}
        </span>
        {isSelected && !isDropOver && <ChevronRight className="w-3.5 h-3.5 text-brand-700 ml-auto" />}
        {isDropOver && (
          <span className="ml-auto fa-mono text-[10px] uppercase text-gold-700" style={{ letterSpacing: "0.1em" }}>
            Drop to move
          </span>
        )}
      </div>
      {session.label && (
        <div className="text-xs text-ink-500 mb-1.5">{session.label}</div>
      )}
      <div className="flex items-center justify-between gap-2 text-xs text-ink-500">
        <span>
          <strong className="text-ink-900">{attended}</strong>
          <span className="text-ink-300"> / {confirmed}</span> attended
        </span>
        <span className="text-ink-400">
          {inviteCount} invite{inviteCount !== 1 ? "s" : ""}
        </span>
      </div>
    </button>
  );
}
