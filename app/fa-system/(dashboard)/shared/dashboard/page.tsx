"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useFAStore } from "@fa/_lib/store";
import { useCurrentUser } from "@fa/_hooks/useCurrentUser";
import { AppShell } from "@fa/_components/shared/AppShell";
import { EventStatusPill } from "@fa/_components/fa/StatusPill";
import { EmptyState } from "@fa/_components/shared/EmptyState";
import {
  CalendarDays, MapPin, Users, CheckCircle2, XCircle,
  Filter, BarChart3
} from "lucide-react";
import { BRANCHES, BranchCode, countsAsConfirmed, countsAsAttended } from "@fa/_types";

export default function DashboardPage() {
  const user = useCurrentUser();
  const events = useFAStore(s => s.events);
  const sessions = useFAStore(s => s.sessions);
  const quotas = useFAStore(s => s.quotas);
  const invitations = useFAStore(s => s.invitations);

  const [yearFilter, setYearFilter] = useState<number | "all">("all");
  const [eventFilter, setEventFilter] = useState<string | "all">("all");
  const [branchFilter, setBranchFilter] = useState<BranchCode | "all">(
    user?.role === "BM" && user.branch ? user.branch : "all"
  );

  // BMs are forced to their branch
  const effectiveBranch = user?.role === "BM" ? user.branch! : branchFilter;

  const years = useMemo(
    () => Array.from(new Set(events.map(e => e.year))).sort((a, b) => b - a),
    [events]
  );

  // Events that match the year filter — populates the event dropdown.
  const eventsForFilter = useMemo(
    () => events
      .filter(e => yearFilter === "all" || e.year === yearFilter)
      .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [events, yearFilter]
  );

  // If the selected event no longer matches the year filter, drop it.
  useEffect(() => {
    if (eventFilter !== "all" && !eventsForFilter.some(e => e.id === eventFilter)) {
      setEventFilter("all");
    }
  }, [eventFilter, eventsForFilter]);

  // Per-event stats
  const eventStats = useMemo(() => {
    return events
      .filter(e => yearFilter === "all" ? true : e.year === yearFilter)
      .filter(e => eventFilter === "all" ? true : e.id === eventFilter)
      .map(event => {
        const eventSessions = sessions.filter(s => s.eventId === event.id);
        const sessionIds = new Set(eventSessions.map(s => s.id));
        let relevantQuotas = quotas.filter(q => sessionIds.has(q.sessionId));
        let relevantInvs = invitations.filter(i => i.eventId === event.id);
        if (effectiveBranch !== "all") {
          relevantQuotas = relevantQuotas.filter(q => q.branch === effectiveBranch);
          relevantInvs = relevantInvs.filter(i => i.branch === effectiveBranch);
        }
        const totalQuota = relevantQuotas.reduce((sum, q) => sum + q.quota, 0);
        const invited = relevantInvs.length;
        const confirmed = relevantInvs.filter(
          i => countsAsConfirmed(i.status)
        ).length;
        const attended = relevantInvs.filter(i => countsAsAttended(i.status)).length;
        const noShow = relevantInvs.filter(i => i.status === "no_show").length;
        const declined = relevantInvs.filter(i => i.status === "declined").length;
        return {
          event,
          sessions: eventSessions.length,
          totalQuota,
          invited,
          confirmed,
          attended,
          noShow,
          declined,
          fillRate: totalQuota > 0 ? invited / totalQuota : 0,
          attendanceRate: confirmed > 0 ? attended / confirmed : 0,
        };
      })
      .sort((a, b) => b.event.startDate.localeCompare(a.event.startDate));
  }, [events, sessions, quotas, invitations, yearFilter, eventFilter, effectiveBranch]);

  // Totals across all shown events
  const totals = useMemo(() => {
    return eventStats.reduce(
      (acc, s) => ({
        events: acc.events + 1,
        sessions: acc.sessions + s.sessions,
        slots: acc.slots + s.totalQuota,
        invited: acc.invited + s.invited,
        confirmed: acc.confirmed + s.confirmed,
        attended: acc.attended + s.attended,
        noShow: acc.noShow + s.noShow,
      }),
      { events: 0, sessions: 0, slots: 0, invited: 0, confirmed: 0, attended: 0, noShow: 0 }
    );
  }, [eventStats]);

  // ── Attendance rate widget data ──
  // Denominator per spec: attended + absent only (post-event marked).
  // Derived from `totals` so it follows the existing year + branch filter scope.
  // Note: invitation status "no_show" is kept in the DB enum — only UI labels
  // and the rate calculation flip from absence-oriented to attendance-oriented.
  const totalAttendanceMarked = totals.attended + totals.noShow;
  const overallAttendanceRate = totalAttendanceMarked > 0
    ? totals.attended / totalAttendanceMarked
    : 0;

  // Per-branch breakdown for the attendance rate section. Visible to both
  // roles — BM is locked to their branch via `effectiveBranch`, MKT respects
  // the active branch filter. Branches with no post-event data are hidden in
  // the all-branches view; in the single-branch view we always render that
  // one row.
  const attendanceByBranch = useMemo(() => {
    const eventIds = new Set(
      events
        .filter(e => yearFilter === "all" || e.year === yearFilter)
        .filter(e => eventFilter === "all" || e.id === eventFilter)
        .map(e => e.id)
    );
    const branches = effectiveBranch === "all"
      ? BRANCHES
      : BRANCHES.filter(b => b.code === effectiveBranch);
    return branches
      .map(b => {
        const bInvs = invitations.filter(
          i => eventIds.has(i.eventId) && i.branch === b.code
        );
        const invited = bInvs.length;
        const confirmed = bInvs.filter(
          i => countsAsConfirmed(i.status)
        ).length;
        const attended = bInvs.filter(i => countsAsAttended(i.status)).length;
        const absent = bInvs.filter(i => i.status === "no_show").length;
        const attendanceMarked = attended + absent;
        const attendanceRate = attendanceMarked > 0 ? attended / attendanceMarked : 0;
        return { branch: b, invited, confirmed, attended, absent, attendanceMarked, attendanceRate };
      })
      .filter(row => effectiveBranch !== "all" || row.attendanceMarked > 0)
      // Worst performers (lowest attendance) surface first, so MKT can act on them.
      .sort((a, b) => a.attendanceRate - b.attendanceRate || b.invited - a.invited);
  }, [events, invitations, yearFilter, eventFilter, effectiveBranch]);

  // Breakdown by branch for the current filter (MKT only, when branch=all)
  const branchBreakdown = useMemo(() => {
    if (!user || user.role === "BM" || branchFilter !== "all") return null;
    const eventIds = new Set(
      events
        .filter(e => yearFilter === "all" ? true : e.year === yearFilter)
        .filter(e => eventFilter === "all" ? true : e.id === eventFilter)
        .map(e => e.id)
    );
    const sessionIds = new Set(sessions.filter(s => eventIds.has(s.eventId)).map(s => s.id));
    return BRANCHES.map(b => {
      const bQuotas = quotas.filter(q => sessionIds.has(q.sessionId) && q.branch === b.code);
      const bInvs = invitations.filter(i => eventIds.has(i.eventId) && i.branch === b.code);
      const totalQuota = bQuotas.reduce((sum, q) => sum + q.quota, 0);
      const invited = bInvs.length;
      const confirmed = bInvs.filter(i => countsAsConfirmed(i.status)).length;
      const attended = bInvs.filter(i => countsAsAttended(i.status)).length;
      return {
        branch: b,
        totalQuota,
        invited,
        confirmed,
        attended,
        fillRate: totalQuota > 0 ? invited / totalQuota : 0,
        attendanceRate: confirmed > 0 ? attended / confirmed : 0,
      };
    }).filter(b => b.totalQuota > 0).sort((a, b) => b.attended - a.attended);
  }, [events, sessions, quotas, invitations, yearFilter, eventFilter, branchFilter, user]);

  if (!user) return null;

  return (
    <AppShell>
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="text-xs uppercase tracking-wider font-semibold text-ink-400 mb-1">
            FA Shared
          </div>
          <h1 className="fa-display text-4xl text-ink-900">Dashboard</h1>
          <p className="text-ink-500 mt-1">
            Overview of Foundation Appraisal performance across all events.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="fa-card p-4 mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <label className="fa-label">Year</label>
            <select className="fa-input" value={yearFilter} onChange={e => setYearFilter(e.target.value === "all" ? "all" : Number(e.target.value))}>
              <option value="all">All years</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="w-64">
            <label className="fa-label">Event</label>
            <select
              className="fa-input"
              value={eventFilter}
              onChange={e => setEventFilter(e.target.value)}
              disabled={eventsForFilter.length === 0}
            >
              <option value="all">All events</option>
              {eventsForFilter.map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          {user.role === "MKT" && (
            <div className="w-52">
              <label className="fa-label">Branch</label>
              <select className="fa-input" value={branchFilter} onChange={e => setBranchFilter(e.target.value as BranchCode | "all")}>
                <option value="all">All branches</option>
                {BRANCHES.map(b => (
                  <option key={b.code} value={b.code}>{b.code} — {b.name}</option>
                ))}
              </select>
            </div>
          )}
          {user.role === "BM" && (
            <div className="text-sm text-ink-500 flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Showing data for your branch: <strong className="text-ink-900 ml-1">{BRANCHES.find(b => b.code === user.branch)?.name}</strong>
            </div>
          )}
        </div>
      </div>

      {/* High-level KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KPICard
          icon={CalendarDays}
          label="Events"
          value={totals.events}
          accent="brand"
        />
        <KPICard
          icon={Users}
          label="Invited"
          value={totals.invited}
          subtle={totals.slots > 0 ? `${Math.round(totals.invited / totals.slots * 100)}% of ${totals.slots} slots` : undefined}
        />
        <KPICard
          icon={CheckCircle2}
          label="Attended"
          value={totals.attended}
          subtle={totals.confirmed > 0 ? `${Math.round(totals.attended / totals.confirmed * 100)}% of confirmed` : undefined}
          accent="success"
        />
        <KPICard
          icon={XCircle}
          label="Absent"
          value={totals.noShow}
          subtle={totals.confirmed > 0 ? `${Math.round(totals.noShow / totals.confirmed * 100)}% of confirmed` : undefined}
          accent="danger"
        />
      </div>

      {/* Attendance rate widget */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="fa-display text-2xl text-ink-900">Attendance rate</h2>
        </div>

        {totalAttendanceMarked === 0 ? (
          <div className="fa-card p-8 text-center text-sm text-ink-400">
            Attendance not recorded yet.
          </div>
        ) : (
          <>
            {/* Stat card */}
            <div className="fa-card p-6 mb-4">
              <div className="text-xs uppercase tracking-wider font-semibold text-ink-400">
                Overall attendance rate
              </div>
              <div className="flex items-baseline gap-4 mt-2">
                <div className={`fa-display text-5xl leading-none ${attendanceRateColor(overallAttendanceRate)}`}>
                  {(overallAttendanceRate * 100).toFixed(1)}%
                </div>
                <div className="text-sm text-ink-500">
                  <span className="text-success font-semibold">{totals.attended}</span> attended of{" "}
                  <span className="text-ink-900 font-semibold">{totalAttendanceMarked}</span> marked
                </div>
              </div>
            </div>

            {/* Per-branch breakdown */}
            <div className="fa-card overflow-hidden">
              <table className="fa-table">
                <thead>
                  <tr>
                    <th>Branch</th>
                    <th className="text-center">Invited</th>
                    <th className="text-center">Confirmed</th>
                    <th className="text-center">Attended</th>
                    <th className="text-center">Absent</th>
                    <th className="text-center">Attendance rate</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceByBranch.map(row => (
                    <tr key={row.branch.code}>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-ink-700 bg-ivory-200 px-2 py-0.5 rounded">
                            {row.branch.code}
                          </span>
                          <span className="text-ink-900">{row.branch.name}</span>
                        </div>
                      </td>
                      <td className="text-center font-mono">{row.invited}</td>
                      <td className="text-center font-mono">{row.confirmed}</td>
                      <td className="text-center font-mono text-success font-medium">{row.attended}</td>
                      <td className="text-center font-mono text-danger font-medium">{row.absent}</td>
                      <td className="text-center font-mono">
                        {row.attendanceMarked > 0 ? (
                          <span className={`font-semibold ${attendanceRateColor(row.attendanceRate)}`}>
                            {(row.attendanceRate * 100).toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-ink-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Per-event table */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="fa-display text-2xl text-ink-900">By event</h2>
          <span className="text-xs text-ink-400">{eventStats.length} event{eventStats.length !== 1 ? "s" : ""}</span>
        </div>

        {eventStats.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="No data for this filter"
            description="Try selecting a different year or branch."
          />
        ) : (
          <div className="fa-card overflow-hidden">
            <table className="fa-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th className="text-center">Slots</th>
                  <th className="text-center">Invited</th>
                  <th className="text-center">Confirmed</th>
                  <th className="text-center">Attended</th>
                  <th className="text-center">Fill rate</th>
                </tr>
              </thead>
              <tbody>
                {eventStats.map(({ event, sessions, totalQuota, invited, confirmed, attended, noShow, fillRate }) => {
                  const link = user.role === "MKT"
                    ? `/fa-system/marketing/events/${event.id}`
                    : `/fa-system/bm/events/${event.id}`;
                  return (
                    <tr key={event.id}>
                      <td>
                        <Link href={link} className="block hover:text-brand-900 transition-colors">
                          <div className="font-medium text-ink-900">{event.name}</div>
                          <div className="text-xs text-ink-400 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3" />
                            {event.venue}
                            <span className="mx-1">·</span>
                            <span>{sessions} session{sessions !== 1 ? "s" : ""}</span>
                          </div>
                        </Link>
                      </td>
                      <td className="text-sm text-ink-600">
                        {new Date(event.startDate).toLocaleDateString(undefined, {
                          day: "numeric", month: "short", year: "numeric"
                        })}
                      </td>
                      <td>
                        <EventStatusPill status={event.status} />
                      </td>
                      <td className="text-center font-mono">{totalQuota}</td>
                      <td className="text-center font-mono">{invited}</td>
                      <td className="text-center font-mono">{confirmed}</td>
                      <td className="text-center font-mono">
                        <span className="text-success font-medium">{attended}</span>
                        {noShow > 0 && <span className="text-danger text-xs"> / {noShow} absent</span>}
                      </td>
                      <td className="text-center">
                        <FillRateBar rate={fillRate} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Branch breakdown (MKT only) */}
      {branchBreakdown && branchBreakdown.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="fa-display text-2xl text-ink-900">By branch</h2>
            <span className="text-xs text-ink-400">{branchBreakdown.length} active branches</span>
          </div>
          <div className="fa-card overflow-hidden">
            <table className="fa-table">
              <thead>
                <tr>
                  <th>Branch</th>
                  <th className="text-center">Slots</th>
                  <th className="text-center">Invited</th>
                  <th className="text-center">Confirmed</th>
                  <th className="text-center">Attended</th>
                  <th className="text-center">Fill rate</th>
                  <th className="text-center">Attendance rate</th>
                </tr>
              </thead>
              <tbody>
                {branchBreakdown.map(b => (
                  <tr key={b.branch.code}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-ink-700 bg-ivory-200 px-2 py-0.5 rounded">
                          {b.branch.code}
                        </span>
                        <span className="text-ink-900">{b.branch.name}</span>
                      </div>
                    </td>
                    <td className="text-center font-mono">{b.totalQuota}</td>
                    <td className="text-center font-mono">{b.invited}</td>
                    <td className="text-center font-mono">{b.confirmed}</td>
                    <td className="text-center font-mono text-success font-medium">{b.attended}</td>
                    <td className="text-center"><FillRateBar rate={b.fillRate} /></td>
                    <td className="text-center"><FillRateBar rate={b.attendanceRate} tone="success" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  );
}

// ----------------------------------------------------------------------------
function KPICard({
  icon: Icon, label, value, subtle, accent,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  subtle?: string;
  accent?: "brand" | "success" | "danger";
}) {
  const accentClasses = {
    brand:   "bg-brand-50 text-brand-900",
    success: "bg-success-soft text-success",
    danger:  "bg-danger-soft text-danger",
  };
  const c = accent ? accentClasses[accent] : "bg-ivory-200 text-ink-600";
  return (
    <div className="fa-card p-5 text-center">
      <div className={`w-9 h-9 rounded-[10px] ${c} flex items-center justify-center mb-3 mx-auto`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-xs uppercase tracking-wider font-semibold text-ink-400">{label}</div>
      <div className="fa-display text-3xl text-ink-900 mt-1">{value}</div>
      {subtle && <div className="text-xs text-ink-400 mt-1">{subtle}</div>}
    </div>
  );
}

function FillRateBar({ rate, tone = "brand" }: { rate: number; tone?: "brand" | "success" }) {
  const pct = Math.min(100, Math.round(rate * 100));
  const color = tone === "success" ? "bg-success" : "bg-brand-700";
  return (
    <div className="inline-flex items-center gap-2 w-28">
      <div className="flex-1 h-1.5 bg-ivory-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-ink-600 w-8 text-right">{pct}%</span>
    </div>
  );
}

// Attendance-rate thresholds (inverse of the old absence thresholds):
// >90% green, 75–90% amber, <75% red.
function attendanceRateColor(rate: number): string {
  if (rate > 0.90) return "text-success";
  if (rate >= 0.75) return "text-warning";
  return "text-danger";
}
