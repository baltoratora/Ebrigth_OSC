"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { useFAStore } from "@pcm/_lib/store";
import { useCurrentUser } from "@pcm/_hooks/useCurrentUser";
import { AppShell } from "@pcm/_components/shared/AppShell";
import { EventStatusPill } from "@pcm/_components/fa/StatusPill";
import { EmptyState } from "@pcm/_components/shared/EmptyState";
import { CalendarDays, MapPin, Search, AlertCircle } from "lucide-react";
import { BRANCHES, EventStatus, allowedBranchCodes } from "@pcm/_types";

import { MONTHS } from "@pcm/_lib/constants";
import { formatDateRange } from "@pcm/_lib/date";

export default function BMEventsPage() {
  const user = useCurrentUser();
  const events = useFAStore(s => s.events);
  const sessions = useFAStore(s => s.sessions);
  const quotas = useFAStore(s => s.quotas);
  const invitations = useFAStore(s => s.invitations);

  const [search, setSearch] = useState("");
  const [yearFilter, setYear] = useState<number | "all">("all");
  const [statusFilter, setStatus] = useState<EventStatus | "all">("all");

  // Only show events that are not draft — BMs shouldn't see drafts
  const visibleEvents = useMemo(
    () => events.filter(e => e.status !== "draft"),
    [events]
  );

  const years = useMemo(
    () => Array.from(new Set(visibleEvents.map(e => e.year))).sort((a, b) => b - a),
    [visibleEvents]
  );

  // For each event, compute branch-specific (BM) or aggregated (MKT-viewing) stats.
  const eventStats = useMemo(() => {
    if (!user) return [];
    // null = all branches (MKT); BM = own branch; RM = every branch in region.
    const allowed = allowedBranchCodes(user);
    const inScope = (b: string) => allowed === null || allowed.includes(b);
    return visibleEvents.map(event => {
      const eventSessions = sessions.filter(s => s.eventId === event.id);
      const sessionIds = new Set(eventSessions.map(s => s.id));
      const scopedQuotas = quotas.filter(q =>
        sessionIds.has(q.sessionId) && inScope(q.branch)
      );
      const totalQuota = scopedQuotas.reduce((sum, q) => sum + q.quota, 0);
      const scopedInvitations = invitations.filter(i =>
        i.eventId === event.id && inScope(i.branch)
      );
      const confirmedCount = scopedInvitations.filter(
        i => i.status === "confirmed" || i.status === "attended"
      ).length;
      return {
        event,
        totalQuota,
        invited: scopedInvitations.length,
        confirmed: confirmedCount,
        remaining: totalQuota - scopedInvitations.length,
      };
    });
  }, [visibleEvents, sessions, quotas, invitations, user]);

  const filtered = useMemo(() => {
    return eventStats
      .filter(({ event }) => yearFilter === "all" ? true : event.year === yearFilter)
      .filter(({ event }) => statusFilter === "all" ? true : event.status === statusFilter)
      .filter(({ event }) =>
        !search
          ? true
          : event.name.toLowerCase().includes(search.toLowerCase()) ||
            event.venue.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => b.event.startDate.localeCompare(a.event.startDate));
  }, [eventStats, yearFilter, statusFilter, search]);

  if (!user || (user.role !== "BM" && user.role !== "MKT" && user.role !== "RM")) return null;
  if (user.role === "BM" && !user.branch) return null;
  const branch = user.branch ? BRANCHES.find(b => b.code === user.branch) : null;
  const isMktView = user.role === "MKT";
  const scopeLabel = user.role === "MKT"
    ? "All branches (Admin view)"
    : user.role === "RM"
      ? `Region ${user.region} (${allowedBranchCodes(user)?.length ?? 0} branches)`
      : branch?.name;

  // Highlight events that need action
  const actionNeeded = filtered.filter(
    ({ event, remaining, totalQuota }) =>
      event.status === "open" && totalQuota > 0 && remaining > 0
  );

  return (
    <AppShell>
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="text-xs uppercase tracking-wider font-semibold text-ink-400 mb-1">
            PCM · {scopeLabel}
          </div>
          <h1 className="fa-display text-4xl text-ink-900">Events</h1>
          <p className="text-ink-500 mt-1">
            {isMktView
              ? "Read-only view of all branches' Pro-Class Mastery activity."
              : "Pro-Class Mastery events assigned to your branch."}
          </p>
        </div>
      </div>

      {/* Action needed banner */}
      {actionNeeded.length > 0 && (
        <div className="fa-card p-4 mb-6 border-l-4 border-l-warning bg-warning-soft/30">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-medium text-ink-900">
                {actionNeeded.length} event{actionNeeded.length > 1 ? "s" : ""} need{actionNeeded.length === 1 ? "s" : ""} your attention
              </div>
              <div className="text-sm text-ink-600 mt-0.5">
                {actionNeeded.map(a => a.event.name).join(" · ")}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="fa-card p-4 mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="fa-label">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
              <input
                className="fa-input fa-input-icon-left"
                placeholder="Event name or venue…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="w-32">
            <label className="fa-label">Year</label>
            <select className="fa-input" value={yearFilter} onChange={e => setYear(e.target.value === "all" ? "all" : Number(e.target.value))}>
              <option value="all">All</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="w-40">
            <label className="fa-label">Status</label>
            <select className="fa-input" value={statusFilter} onChange={e => setStatus(e.target.value as EventStatus | "all")}>
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="ongoing">Ongoing</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Events list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No events match"
          description="When marketing opens events for your branch, they'll appear here."
        />
      ) : (
        <div className="grid gap-3">
          {filtered.map(({ event, totalQuota, invited, confirmed, remaining }) => {
            const startD = new Date(event.startDate);
            const dateDisplay = formatDateRange(event.startDate, event.endDate);

            const noQuota = totalQuota === 0;
            const needsAction = event.status === "open" && totalQuota > 0 && remaining > 0;

            return (
              <Link
                key={event.id}
                href={isMktView ? `/pcm-system/academy/events/${event.id}` : `/pcm-system/bm/events/${event.id}`}
                className={`fa-card-hover p-5 block ${needsAction ? "border-warning/40" : ""}`}
              >
                <div className="flex items-center gap-5">
                  <div className="flex-shrink-0 text-center min-w-[80px]">
                    <div className="text-xs uppercase tracking-wider font-semibold text-brand-900">
                      {MONTHS[event.month - 1].slice(0, 3)}
                    </div>
                    <div className="fa-display text-3xl leading-none text-ink-900 mt-1">
                      {startD.getDate()}
                    </div>
                    <div className="text-xs text-ink-400 mt-1">{event.year}</div>
                  </div>

                  <div className="w-px h-12 bg-ivory-300" />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="fa-display text-lg text-ink-900 truncate">{event.name}</h3>
                      <EventStatusPill status={event.status} />
                      {needsAction && (
                        <span className="text-xs font-medium text-warning">
                          {remaining} slot{remaining !== 1 ? "s" : ""} remaining
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="w-3.5 h-3.5" />
                        {dateDisplay}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5" />
                        {event.venue}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-5 flex-shrink-0">
                    {noQuota ? (
                      <div className="text-xs text-ink-400 italic">
                        No quota assigned
                      </div>
                    ) : (
                      <>
                        <div className="text-right">
                          <div className="fa-display text-xl text-ink-900">
                            {invited}<span className="text-ink-300 text-base"> / {totalQuota}</span>
                          </div>
                          <div className="text-xs text-ink-400 uppercase tracking-wider">Invited</div>
                        </div>
                        <div className="text-right">
                          <div className="fa-display text-xl text-ink-900">{confirmed}</div>
                          <div className="text-xs text-ink-400 uppercase tracking-wider">Confirmed</div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
