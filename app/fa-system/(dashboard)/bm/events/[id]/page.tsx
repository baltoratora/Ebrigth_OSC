"use client";

import { useState, useMemo, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, CalendarDays, MapPin, Clock, Users,
  AlertCircle, ChevronRight, RefreshCw,
} from "lucide-react";
import { useFAStore } from "@fa/_lib/store";
import { useCurrentUser } from "@fa/_hooks/useCurrentUser";
import { AppShell } from "@fa/_components/shared/AppShell";
import { EventStatusPill, StatusPill } from "@fa/_components/fa/StatusPill";
import { ConfirmDialog } from "@fa/_components/shared/ConfirmDialog";
import { EmptyState } from "@fa/_components/shared/EmptyState";
import { BMEventStatCard } from "@fa/_components/fa/BMEventStatCard";
import { SessionInvitesPanel } from "@fa/_components/fa/SessionInvitesPanel";
import { InviteStudentsModal } from "@fa/_components/fa/InviteStudentsModal";
import { BRANCHES, Invitation, countsAsConfirmed } from "@fa/_types";
import { addDays, parseISO } from "date-fns";
import { formatDateRange } from "@fa/_lib/date";

export default function BMEventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = useCurrentUser();

  // MKT users browsing the BM section see the marketing detail page instead
  // (it already has all-branch data; the BM page needs a branch context).
  useEffect(() => {
    if (user?.role === "MKT") {
      router.replace(`/fa-system/marketing/events/${id}`);
    }
  }, [user, router, id]);

  const allEvents      = useFAStore(s => s.events);
  const allSessions    = useFAStore(s => s.sessions);
  const allQuotas      = useFAStore(s => s.quotas);
  const allInvitations = useFAStore(s => s.invitations);

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
  const inviteStudent = useFAStore(s => s.inviteStudent);
  const updateInvitationStatus = useFAStore(s => s.updateInvitationStatus);
  const removeInvitation = useFAStore(s => s.removeInvitation);
  const loadEvents = useFAStore(s => s.loadEvents);
  const eventsLoading = useFAStore(s => s.eventsLoading);

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [invitationToRemove, setInvitationToRemove] = useState<Invitation | null>(null);
  const [justRefreshed, setJustRefreshed] = useState(false);

  // Manual refresh — re-fetches every event/session/quota/invitation row
  // from the server. Used when the BM has made changes in another tab or
  // when an invite count looks stale (e.g. after Marketing edits a quota).
  async function handleRefresh() {
    await loadEvents();
    setJustRefreshed(true);
    setTimeout(() => setJustRefreshed(false), 1500);
  }

  // Only sessions where this BM's branch has a quota — must be above early returns
  const bmSessions = useMemo(() => {
    if (!user?.branch) return [];
    return sessions.filter(s =>
      quotas.some(q => q.sessionId === s.id && q.branch === user.branch)
    );
  }, [sessions, quotas, user?.branch]);

  const sessionsByDay = useMemo(() => {
    const groups: Record<number, typeof bmSessions> = {};
    bmSessions.forEach(s => {
      groups[s.dayNumber] ??= [];
      groups[s.dayNumber].push(s);
    });
    return groups;
  }, [bmSessions]);

  if (!user || user.role !== "BM" || !user.branch) return null;
  if (!event) {
    return (
      <AppShell>
        <div className="text-center py-20">
          <h1 className="fa-display text-3xl text-ink-900">Event not found</h1>
          <Link href="/fa-system/bm" className="fa-btn-primary mt-4 inline-flex">
            Back to events
          </Link>
        </div>
      </AppShell>
    );
  }

  const branch = BRANCHES.find(b => b.code === user.branch)!;

  // Selected session details
  const selectedSession = bmSessions.find(s => s.id === selectedSessionId);
  const selectedQuota = selectedSession
    ? quotas.find(q => q.sessionId === selectedSession.id && q.branch === user.branch)
    : null;
  const sessionInvitations = selectedSession
    ? invitations.filter(i => i.sessionId === selectedSession.id && i.branch === user.branch)
    : [];

  const totalBranchQuota = bmSessions.reduce((sum, s) => {
    const q = quotas.find(qq => qq.sessionId === s.id && qq.branch === user.branch);
    return sum + (q?.quota || 0);
  }, 0);
  // Marketing sets a confirm target (quota). BMs may invite up to 3× that
  // because we expect ~1 in 3 students to actually confirm.
  const totalBranchInviteCap = totalBranchQuota * 3;
  // Only count invitations in sessions this BM can actually see (i.e.
  // sessions where their branch has a quota). Walk-ins or legacy invites
  // tied to a session whose quota was later removed would otherwise inflate
  // the "Invited" stat above what the per-session breakdown sums to.
  // NOTE: plain const, NOT useMemo — this runs *after* the early returns above
  // (`return null` for non-BM users, "Event not found", etc.). A hook here would
  // change the hook count between renders and crash with "Rendered fewer hooks
  // than expected" when switching from branch view to marketing view.
  const bmSessionIds = new Set(bmSessions.map(s => s.id));
  const totalBranchInvitations = invitations.filter(
    i => i.branch === user.branch && bmSessionIds.has(i.sessionId)
  ).length;
  const totalBranchConfirmed = invitations.filter(
    i => i.branch === user.branch
      && bmSessionIds.has(i.sessionId)
      && countsAsConfirmed(i.status)
  ).length;

  // canInvite: BMs can only add/change/remove invitations while the event is open.
  // Any other status (closed, ongoing, completed, draft) is fully locked for BMs.
  const isLocked = event.status !== "open";
  const canInvite = event.status === "open";

  const dateDisplay = formatDateRange(event.startDate, event.endDate);

  return (
    <AppShell>
      <Link href="/fa-system/bm" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-brand-900 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to events
      </Link>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <EventStatusPill status={event.status} />
          <span className="text-xs text-ink-400">· {branch.name} ({branch.code})</span>
        </div>
        <h1 className="fa-display text-4xl text-ink-900">{event.name}</h1>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-ink-500 mt-2">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="w-4 h-4" /> {dateDisplay}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="w-4 h-4" /> {event.venue}
          </span>
        </div>
      </div>

      {/* Branch summary */}
      <div className="flex items-center justify-between mb-3">
        <div
          className="fa-mono text-[10px] uppercase text-ink-400"
          style={{ letterSpacing: "0.12em" }}
        >
          Your branch · {branch.code}
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={eventsLoading}
          title="Re-fetch invite counts and session data from the server"
          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-[6px] border transition-all ${
            justRefreshed
              ? "border-success bg-success-soft text-success"
              : "border-ivory-300 bg-white text-ink-600 hover:border-gold-400 hover:bg-gold-50"
          } ${eventsLoading ? "opacity-60 cursor-wait" : "cursor-pointer"}`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${eventsLoading ? "animate-spin" : ""}`} />
          {eventsLoading ? "Refreshing…" : justRefreshed ? "Refreshed" : "Refresh"}
        </button>
      </div>
      <div className="grid grid-cols-4 gap-4 mb-8">
        <BMEventStatCard label="Your sessions" value={bmSessions.length} />
        <BMEventStatCard label="Total slots" value={totalBranchQuota} />
        <BMEventStatCard label="Invited" value={`${totalBranchInvitations} / ${totalBranchInviteCap}`} />
        <BMEventStatCard label="Confirmed" value={`${totalBranchConfirmed} / ${totalBranchQuota}`} />
      </div>

      {isLocked && (
        <div className={`fa-card p-4 mb-6 border-l-4 flex items-start gap-3 ${
          event.status === "closed"
            ? "border-l-warning bg-warning-soft/30"
            : event.status === "ongoing" || event.status === "completed"
              ? "border-l-ink-300 bg-ivory-100"
              : "border-l-ink-200 bg-ivory-50"
        }`}>
          <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
          <div className="text-sm text-ink-600">
            {event.status === "closed" && (
              <>The invitation window has <strong className="text-ink-900">closed</strong>. This event is locked — you can view your students but cannot invite, confirm, decline, or remove anyone.</>
            )}
            {event.status === "ongoing" && (
              <>This event is <strong className="text-ink-900">currently ongoing</strong>. The invitation window is closed — attendance is being taken by marketing.</>
            )}
            {event.status === "completed" && (
              <>This event has <strong className="text-ink-900">completed</strong>. All records are read-only.</>
            )}
          </div>
        </div>
      )}

      {bmSessions.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No sessions assigned to your branch"
          description="Marketing hasn't allocated any quotas for your branch in this event yet. Check back later."
        />
      ) : (
        <div className="grid lg:grid-cols-[320px_1fr] gap-6">
          {/* Left: session picker */}
          <div>
            <div className="sticky top-4 space-y-4">
              <h2 className="fa-display text-lg text-ink-900">Sessions</h2>

              {Array.from({ length: event.numberOfDays }, (_, i) => i + 1).map(dayNum => {
                const daySessions = sessionsByDay[dayNum] || [];
                if (daySessions.length === 0) return null;
                const dayDate = addDays(parseISO(event.startDate), dayNum - 1);
                return (
                  <div key={dayNum}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded bg-brand-900 text-white flex items-center justify-center text-xs font-semibold">
                        D{dayNum}
                      </div>
                      <div className="text-xs text-ink-500">
                        {dayDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {daySessions.map(session => {
                        const quota = quotas.find(q => q.sessionId === session.id && q.branch === user.branch)!;
                        const inviteCap = quota.quota * 3;
                        const invited = invitations.filter(
                          i => i.sessionId === session.id && i.branch === user.branch
                        ).length;
                        const isSelected = session.id === selectedSessionId;
                        const isFull = invited >= inviteCap;
                        return (
                          <button
                            key={session.id}
                            onClick={() => setSelectedSessionId(session.id)}
                            className={`w-full text-left p-3 rounded-[10px] border transition-all ${
                              isSelected
                                ? "bg-brand-50 border-brand-600 ring-2 ring-brand-100"
                                : "bg-white border-ivory-300 hover:border-ink-300"
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <Clock className="w-3 h-3 text-ink-400" />
                              <span className="text-sm font-medium text-ink-900">
                                {session.startTime} – {session.endTime}
                              </span>
                              {isSelected && <ChevronRight className="w-3.5 h-3.5 text-brand-700 ml-auto" />}
                            </div>
                            {session.label && (
                              <div className="text-xs text-ink-500 mb-1.5">{session.label}</div>
                            )}
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className={isFull ? "text-success font-medium" : "text-ink-500"}>
                                {invited} / {inviteCap} invite{inviteCap !== 1 ? "s" : ""}
                              </span>
                              {isFull ? (
                                <StatusPill tone="success" showDot={false}>Full</StatusPill>
                              ) : (
                                <span className="text-warning font-medium">
                                  {inviteCap - invited} open
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: invitation list for selected session */}
          <div>
            {!selectedSession ? (
              <div className="fa-card p-12 text-center">
                <div className="w-14 h-14 rounded-full bg-ivory-200 text-ink-400 flex items-center justify-center mx-auto mb-4">
                  <Users className="w-6 h-6" />
                </div>
                <h3 className="fa-display text-xl text-ink-900">Pick a session</h3>
                <p className="text-sm text-ink-500 mt-1">
                  Select a session on the left to view and manage invitations.
                </p>
              </div>
            ) : (
              <SessionInvitesPanel
                session={selectedSession}
                quota={selectedQuota!.quota}
                invitations={sessionInvitations}
                canInvite={canInvite}
                isLocked={isLocked}
                onOpenInvite={() => setInviteModalOpen(true)}
                onStatusChange={(id, status) => updateInvitationStatus(id, status, user.id)}
                onRemove={(inv) => setInvitationToRemove(inv)}
              />
            )}
          </div>
        </div>
      )}

      {/* Only open invite modal if not locked — belt-and-suspenders guard */}
      {!isLocked && inviteModalOpen && selectedSession && (
        <InviteStudentsModal
          open={inviteModalOpen}
          onClose={() => setInviteModalOpen(false)}
          session={selectedSession}
          quota={selectedQuota!.quota}
          currentInvitations={sessionInvitations}
          allInvitationsForEvent={invitations.filter(i => i.branch === user.branch)}
          onInvite={(picks) => {
            picks.forEach(({ studentId, targetGrade }) => {
              inviteStudent({
                eventId: event.id,
                sessionId: selectedSession.id,
                studentId,
                branch: user.branch!,
                targetGrade,
                invitedBy: user.id,
                // Allow exceeding the marketing-set confirm target (the
                // quota field) up to 3× of it. The modal enforces the cap.
                allowOverQuota: true,
              });
            });
            setInviteModalOpen(false);
          }}
        />
      )}

      {/* Remove dialog — only reachable when not locked, but guard anyway */}
      {!isLocked && (
        <ConfirmDialog
          open={!!invitationToRemove}
          onClose={() => setInvitationToRemove(null)}
          onConfirm={() => {
            if (invitationToRemove) removeInvitation(invitationToRemove.id);
            setInvitationToRemove(null);
          }}
          title="Remove this invitation?"
          description="The student will no longer be invited to this session. You can re-invite them later if needed."
          confirmLabel="Remove"
          danger
        />
      )}
    </AppShell>
  );
}
