"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, CalendarDays, MapPin, Plus, Pencil, Trash2,
  Clock, Users, Copy, Download,
} from "lucide-react";
import { useFAStore } from "@fa/_lib/store";
import { useCurrentUser } from "@fa/_hooks/useCurrentUser";
import { AppShell } from "@fa/_components/shared/AppShell";
import { EventStatusPill } from "@fa/_components/fa/StatusPill";
import { ConfirmDialog } from "@fa/_components/shared/ConfirmDialog";
import { EmptyState } from "@fa/_components/shared/EmptyState";
import { EditEventModal } from "@fa/_components/fa/EditEventModal";
import { MarketingEventStatCard } from "@fa/_components/fa/MarketingEventStatCard";
import { StatusActionBar } from "@fa/_components/fa/StatusActionBar";
import { InvitationWindowStatus } from "@fa/_components/fa/InvitationWindowStatus";
import { SessionFormModal } from "@fa/_components/fa/SessionFormModal";
import { BulkSessionEditorModal } from "@fa/_components/fa/BulkSessionEditorModal";
import { QuotaModal } from "@fa/_components/fa/QuotaModal";
import { MarketingSessionInvitesModal } from "@fa/_components/fa/MarketingSessionInvitesModal";
import { EventInvitationListCard } from "@fa/_components/fa/EventInvitationListCard";
import { EventStatus, Session, countsAsConfirmed } from "@fa/_types";
import { addDays, parseISO } from "date-fns";
import { formatDateRange } from "@fa/_lib/date";
import { buildEventAttendanceCsv } from "@fa/_lib/eventAttendanceCsv";
import { downloadCSV } from "@fa/_lib/csv";

export default function MarketingEventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const user    = useCurrentUser();

  const allEvents      = useFAStore(s => s.events);
  const allSessions    = useFAStore(s => s.sessions);
  const allQuotas      = useFAStore(s => s.quotas);
  const allInvitations = useFAStore(s => s.invitations);
  const allStudents    = useFAStore(s => s.students);
  const allUsers       = useFAStore(s => s.users);

  const event = useMemo(() => allEvents.find(e => e.id === id), [allEvents, id]);
  const sessions = useMemo(
    () => allSessions.filter(x => x.eventId === id)
      .sort((a, b) => a.dayNumber - b.dayNumber || a.sessionNumber - b.sessionNumber),
    [allSessions, id]
  );
  const quotas      = allQuotas;
  const invitations = useMemo(
    () => allInvitations.filter(i => i.eventId === id),
    [allInvitations, id]
  );

  const updateEvent   = useFAStore(s => s.updateEvent);
  const deleteEvent   = useFAStore(s => s.deleteEvent);
  const createSession = useFAStore(s => s.createSession);
  const updateSession = useFAStore(s => s.updateSession);
  const deleteSession = useFAStore(s => s.deleteSession);
  const setQuota      = useFAStore(s => s.setQuota);

  const [sessionModalOpen,  setSessionModalOpen]  = useState(false);
  const [editingSession,    setEditingSession]     = useState<Session | null>(null);
  const [defaultDayForNew,  setDefaultDayForNew]   = useState<1 | 2 | 3 | undefined>(undefined);
  const [bulkModalOpen,     setBulkModalOpen]     = useState(false);
  const [editingEventOpen,  setEditingEventOpen]   = useState(false);
  const [deleteEventOpen,   setDeleteEventOpen]    = useState(false);
  const [sessionToDelete,   setSessionToDelete]    = useState<Session | null>(null);
  const [quotaModalSession, setQuotaModalSession]  = useState<Session | null>(null);
  const [liveInvitesSession, setLiveInvitesSession] = useState<Session | null>(null);
  const [copyingDay,        setCopyingDay]         = useState<number | null>(null);

  const sessionsByDay = useMemo(() => {
    const groups: Record<number, typeof sessions> = {};
    sessions.forEach(s => { groups[s.dayNumber] ??= []; groups[s.dayNumber].push(s); });
    return groups;
  }, [sessions]);

  if (!user || user.role !== "MKT") return null;
  if (!event) {
    return (
      <AppShell>
        <div className="text-center py-20">
          <h1 className="fa-display text-3xl text-ink-900">Event not found</h1>
          <Link href="/fa-system/marketing" className="fa-btn-primary mt-4 inline-flex">Back to events</Link>
        </div>
      </AppShell>
    );
  }

  const totalQuota     = quotas.filter(q => sessions.some(s => s.id === q.sessionId)).reduce((sum, q) => sum + q.quota, 0);
  const totalInvited   = invitations.length;
  const totalConfirmed = invitations.filter(i => countsAsConfirmed(i.status)).length;

  // The top-level "Add session" entry point now opens the day-by-day bulk
  // editor instead of the single-session form. The per-day "+ Add to Day N"
  // shortcut still uses the single-session form for quick one-off adds.
  function openCreateSession() { setBulkModalOpen(true); }
  function openCreateSessionForDay(day: 1 | 2 | 3) {
    setEditingSession(null);
    setDefaultDayForNew(day);
    setSessionModalOpen(true);
  }
  function openEditSession(s: Session) { setEditingSession(s); setSessionModalOpen(true); }
  const eventId = event.id;
  function handleDeleteEvent() { deleteEvent(eventId); router.push("/fa-system/marketing"); }
  function handleStatusChange(newStatus: EventStatus) { updateEvent(eventId, { status: newStatus }); }

  // Copy every session from `fromDay` into `toDay` (same times, label, and
  // branch quotas). Existing sessions on `toDay` keep their numbers; new ones
  // pick up the next available numbers. Anything that clashes is skipped
  // (the user can edit afterwards).
  async function copyDayTo(fromDay: number, toDay: number) {
    if (fromDay === toDay) return;
    setCopyingDay(toDay);
    try {
      const sourceSessions = sessions.filter(s => s.dayNumber === fromDay);
      const existingOnTarget = sessions.filter(s => s.dayNumber === toDay);
      let nextNumber = existingOnTarget.reduce((max, s) => Math.max(max, s.sessionNumber), 0) + 1;

      for (const src of sourceSessions) {
        // Skip if a session on the target day already overlaps this time slot.
        const overlap = existingOnTarget.some(
          s => src.startTime < s.endTime && src.endTime > s.startTime
        );
        if (overlap) continue;

        const created = await createSession({
          eventId,
          dayNumber: toDay as 1 | 2 | 3,
          sessionNumber: nextNumber++,
          startTime: src.startTime,
          endTime: src.endTime,
          label: src.label,
        });

        // Copy the branch quotas attached to the source session.
        const srcQuotas = quotas.filter(q => q.sessionId === src.id);
        for (const q of srcQuotas) {
          await setQuota(created.id, q.branch, q.quota);
        }
      }
    } finally {
      setCopyingDay(null);
    }
  }

  const dateDisplay = formatDateRange(event.startDate, event.endDate);

  return (
    <AppShell>
      {/* Back link */}
      <Link href="/fa-system/marketing" className="inline-flex items-center gap-1.5 text-sm text-ink-600 hover:text-ink-900 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to events
      </Link>

      {/* ── Masthead ── */}
      <div className="mb-8 fa-enter">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-3">
              <EventStatusPill status={event.status} />
              <span className="fa-mono text-[11px] text-ink-400">
                Created {new Date(event.createdAt).toLocaleDateString()}
              </span>
            </div>
            <div
              className="fa-mono text-[10px] uppercase text-gold-600 mb-2"
              style={{ letterSpacing: "0.12em" }}
            >
              Event detail
            </div>
            <h1 className="fa-display-italic text-6xl text-ink-900 mb-3">{event.name}</h1>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-ink-500">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-gold-500" />
                <span className="fa-mono">{dateDisplay} · {event.numberOfDays} day{event.numberOfDays > 1 ? "s" : ""}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-gold-500" />
                {event.venue}
              </span>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0 mt-1">
            {invitations.length > 0 && (
              <button
                onClick={() => {
                  const { filename, rows } = buildEventAttendanceCsv({
                    event,
                    sessions,
                    invitations,
                    students: allStudents,
                    users: allUsers,
                  });
                  downloadCSV(filename, rows);
                }}
                className="fa-btn-secondary"
                title="Download every invitation across all days as a CSV (opens in Excel)"
              >
                <Download className="w-4 h-4" /> Attendance CSV
              </button>
            )}
            <button onClick={() => setEditingEventOpen(true)} className="fa-btn-secondary">
              <Pencil className="w-4 h-4" /> Edit
            </button>
            <button
              onClick={() => setDeleteEventOpen(true)}
              className="fa-btn-ghost hover:text-danger hover:bg-danger-soft"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        <hr className="border-0 border-t border-gold-200 mt-6" />
      </div>

      {/* ── Status action bar ── */}
      <StatusActionBar
        status={event.status}
        sessionCount={sessions.length}
        onStatusChange={handleStatusChange}
      />

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-4 gap-4 mb-6 fa-enter fa-delay-1">
        <MarketingEventStatCard label="Sessions"    value={sessions.length} />
        <MarketingEventStatCard
          label="Total slots"
          value={totalQuota}
          subtle={`across ${quotas.filter(q => sessions.some(s => s.id === q.sessionId)).length} quota assignments`}
        />
        <MarketingEventStatCard label="Invited"   value={totalInvited} />
        <MarketingEventStatCard label="Confirmed" value={totalConfirmed} />
      </div>

      {/* ── Invitation window ── */}
      <div className="fa-card p-5 mb-6 fa-enter fa-delay-2">
        <div className="flex items-center justify-between">
          <div>
            <div
              className="fa-mono text-[10px] uppercase text-gold-600 mb-1"
              style={{ letterSpacing: "0.12em" }}
            >
              Invitation window
            </div>
            <div className="fa-mono text-sm text-ink-800">
              {new Date(event.invitationOpenDate).toLocaleDateString()} → {new Date(event.invitationCloseDate).toLocaleDateString()}
            </div>
          </div>
          <InvitationWindowStatus event={event} />
        </div>
      </div>

      {/* ── Sessions ── */}
      <div className="flex items-center justify-between mb-5 fa-enter fa-delay-3">
        <div>
          <div
            className="fa-mono text-[10px] uppercase text-gold-600 mb-1"
            style={{ letterSpacing: "0.12em" }}
          >
            Sessions
          </div>
          <h2 className="fa-display text-2xl text-ink-900">Sessions</h2>
          <p className="text-sm text-ink-500 mt-0.5">
            Organize your event into time slots across {event.numberOfDays} day{event.numberOfDays > 1 ? "s" : ""}.
          </p>
        </div>
        <button onClick={openCreateSession} className="fa-btn-primary">
          <Plus className="w-4 h-4" /> Add session
        </button>
      </div>

      {sessions.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="No sessions yet"
          description="Add at least one session before you can assign branch quotas and open the event for invitations."
          action={
            <button onClick={openCreateSession} className="fa-btn-primary">
              <Plus className="w-4 h-4" /> Add session
            </button>
          }
        />
      ) : (
        <div className="space-y-6">
          {Array.from({ length: event.numberOfDays }, (_, i) => i + 1).map(dayNum => {
            const daySessions = sessionsByDay[dayNum] || [];
            const dayDate = addDays(parseISO(event.startDate), dayNum - 1);
            const daySlotTotal = daySessions.reduce((sum, s) => {
              const sq = quotas.filter(q => q.sessionId === s.id).reduce((t, q) => t + q.quota, 0);
              return sum + sq;
            }, 0);
            // Other days that have at least one session — candidates for "Copy from".
            const copySourceDays = Array.from(
              { length: event.numberOfDays },
              (_, i) => i + 1
            ).filter(d => d !== dayNum && (sessionsByDay[d]?.length ?? 0) > 0);
            const isCopyTarget = copyingDay === dayNum;

            return (
              <div key={dayNum}>
                {/* Day header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-[10px] bg-ink-900 text-ivory-50 flex items-center justify-center fa-mono text-sm font-semibold flex-shrink-0">
                    D{dayNum}
                  </div>
                  <div>
                    <h3 className="fa-display text-lg text-ink-900">Day {dayNum}</h3>
                    <div className="fa-mono text-[11px] text-ink-400">
                      {dayDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                    </div>
                  </div>
                  <div className="flex-1 h-px bg-gold-200 ml-2" />
                  <span className="fa-mono text-[11px] text-ink-400">
                    {daySessions.length} session{daySessions.length !== 1 ? "s" : ""}
                    {daySlotTotal > 0 && <> · {daySlotTotal} slot{daySlotTotal !== 1 ? "s" : ""}</>}
                  </span>
                  {/* Per-day actions */}
                  <div className="flex items-center gap-1.5">
                    {copySourceDays.length > 0 && (
                      <div className="relative">
                        <select
                          aria-label={`Copy sessions to Day ${dayNum}`}
                          disabled={isCopyTarget}
                          value=""
                          onChange={(e) => {
                            const from = Number(e.target.value);
                            if (from > 0) copyDayTo(from, dayNum);
                          }}
                          className="fa-btn-ghost text-xs pl-7 pr-2 py-1 appearance-none cursor-pointer disabled:opacity-50"
                          style={{ minWidth: "115px" }}
                        >
                          <option value="">{isCopyTarget ? "Copying…" : "Copy from…"}</option>
                          {copySourceDays.map(d => (
                            <option key={d} value={d}>From Day {d}</option>
                          ))}
                        </select>
                        <Copy className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => openCreateSessionForDay(dayNum as 1 | 2 | 3)}
                      className="fa-btn-ghost text-xs"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add to Day {dayNum}
                    </button>
                  </div>
                </div>

                {daySessions.length === 0 ? (
                  <div className="fa-card p-6 text-center fa-mono text-sm text-ink-400 border-dashed border-gold-200">
                    No sessions on day {dayNum} yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {daySessions.map(session => {
                      const sessionQuotas  = quotas.filter(q => q.sessionId === session.id);
                      const sessionInvites = invitations.filter(i => i.sessionId === session.id);
                      const totalSessionQuota = sessionQuotas.reduce((sum, q) => sum + q.quota, 0);
                      return (
                        <div key={session.id} className="fa-card-hover p-4">
                          <div className="flex items-center gap-4">
                            {/* Session number block */}
                            <div className="flex-shrink-0 text-center" style={{ minWidth: "64px" }}>
                              <div
                                className="fa-mono text-[9px] uppercase text-gold-600"
                                style={{ letterSpacing: "0.12em" }}
                              >
                                Session
                              </div>
                              <div className="fa-mono font-semibold text-[28px] text-ink-900 leading-none mt-0.5">
                                {session.sessionNumber}
                              </div>
                            </div>

                            <div className="w-px h-10 bg-gold-200" />

                            {/* Session details — clickable to open live invitations modal */}
                            <button
                              type="button"
                              onClick={() => setLiveInvitesSession(session)}
                              className="flex-1 min-w-0 text-left rounded-md -mx-2 px-2 py-1 hover:bg-ivory-100/70 transition-colors"
                              aria-label={`View live invitations for Day ${session.dayNumber} Session ${session.sessionNumber}`}
                            >
                              <div className="flex items-center gap-2">
                                <Clock className="w-3.5 h-3.5 text-ink-400 flex-shrink-0" />
                                <span className="fa-mono text-sm text-ink-900">
                                  {session.startTime} – {session.endTime}
                                </span>
                                {session.label && (
                                  <span className="text-sm text-ink-500">· {session.label}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-1.5">
                                <span className="fa-mono text-[11px] text-ink-500">
                                  <span className="text-ink-800 font-semibold">{sessionQuotas.length}</span> branch{sessionQuotas.length !== 1 ? "es" : ""}
                                </span>
                                <span className="text-ink-300">·</span>
                                <span className="fa-mono text-[11px] text-ink-500">
                                  <span className="text-ink-800 font-semibold">{totalSessionQuota}</span> slot{totalSessionQuota !== 1 ? "s" : ""}
                                </span>
                                <span className="text-ink-300">·</span>
                                <span className="fa-mono text-[11px] text-ink-500">
                                  <span className="text-ink-800 font-semibold">{sessionInvites.length}</span> invited
                                </span>
                              </div>
                              {sessionQuotas.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {sessionQuotas.slice(0, 10).map(q => (
                                    <span
                                      key={q.id}
                                      className="fa-mono text-[10px] uppercase px-1.5 py-0.5 rounded-[4px] bg-ivory-100 text-ink-700 border border-gold-200"
                                    >
                                      {q.branch}:{q.quota}
                                    </span>
                                  ))}
                                  {sessionQuotas.length > 10 && (
                                    <span className="fa-mono text-[10px] px-1.5 py-0.5 text-ink-400">
                                      +{sessionQuotas.length - 10} more
                                    </span>
                                  )}
                                </div>
                              )}
                            </button>

                            {/* Actions */}
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button onClick={() => setQuotaModalSession(session)} className="fa-btn-ghost text-xs">
                                <Users className="w-3.5 h-3.5" /> Quotas
                              </button>
                              <button onClick={() => openEditSession(session)} className="fa-btn-ghost p-2" title="Edit">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setSessionToDelete(session)}
                                className="fa-btn-ghost p-2 hover:text-danger hover:bg-danger-soft"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Whole-event invitation list ── */}
      <div className="mt-10">
        <EventInvitationListCard event={event} />
      </div>

      {/* ── Modals ── */}
      {sessionModalOpen && (
        <SessionFormModal
          open={sessionModalOpen}
          onClose={() => { setSessionModalOpen(false); setEditingSession(null); setDefaultDayForNew(undefined); }}
          session={editingSession}
          eventId={event.id}
          maxDays={event.numberOfDays}
          existingSessions={sessions}
          defaultDayNumber={defaultDayForNew}
          onSave={(data) => {
            if (editingSession) updateSession(editingSession.id, data);
            else createSession({ ...data, eventId: event.id });
            setSessionModalOpen(false);
            setEditingSession(null);
            setDefaultDayForNew(undefined);
          }}
        />
      )}

      {bulkModalOpen && (
        <BulkSessionEditorModal
          open={bulkModalOpen}
          onClose={() => setBulkModalOpen(false)}
          event={event}
          existingSessions={sessions}
          onCreate={async (data) => {
            await createSession({ ...data, eventId: event.id });
          }}
        />
      )}

      {editingEventOpen && (
        <EditEventModal
          open={editingEventOpen}
          onClose={() => setEditingEventOpen(false)}
          event={event}
          onSave={(patch) => { updateEvent(event.id, patch); setEditingEventOpen(false); }}
        />
      )}

      <ConfirmDialog
        open={deleteEventOpen}
        onClose={() => setDeleteEventOpen(false)}
        onConfirm={handleDeleteEvent}
        title="Delete this event?"
        description="This permanently deletes the event, all its sessions, quotas, and invitations. This action cannot be undone."
        confirmText="delete"
        confirmLabel="Delete event"
        danger
      />

      <ConfirmDialog
        open={!!sessionToDelete}
        onClose={() => setSessionToDelete(null)}
        onConfirm={() => { if (sessionToDelete) deleteSession(sessionToDelete.id); setSessionToDelete(null); }}
        title="Delete this session?"
        description={`This removes session ${sessionToDelete?.sessionNumber} on day ${sessionToDelete?.dayNumber}, along with its quotas and any invitations.`}
        confirmLabel="Delete session"
        danger
      />

      {quotaModalSession && (
        <QuotaModal
          open={!!quotaModalSession}
          onClose={() => setQuotaModalSession(null)}
          session={quotaModalSession}
        />
      )}

      {liveInvitesSession && (
        <MarketingSessionInvitesModal
          open={!!liveInvitesSession}
          onClose={() => setLiveInvitesSession(null)}
          session={liveInvitesSession}
        />
      )}
    </AppShell>
  );
}
