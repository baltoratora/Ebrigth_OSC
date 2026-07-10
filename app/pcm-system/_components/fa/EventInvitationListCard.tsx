"use client";

import { useMemo, useState } from "react";
import { Users, Search, Download } from "lucide-react";
import { useFAStore } from "@pcm/_lib/store";
import { StatusPill } from "@pcm/_components/fa/StatusPill";
import { BRANCHES, FAEvent, InvitationStatus } from "@pcm/_types";
import { downloadCSV } from "@pcm/_lib/csv";

const STATUS_TONE: Record<InvitationStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  invited: "info",
  confirmed: "success",
  attended: "success",
  declined: "danger",
  no_show: "warning",
  rescheduled: "warning",
};

const STATUS_LABEL: Record<InvitationStatus, string> = {
  invited: "Invited",
  confirmed: "Confirmed",
  attended: "Attended",
  declined: "Declined",
  no_show: "Absent",
  rescheduled: "Reschedule",
};

type StatusGroup = "confirmed" | "all";

interface EventInvitationListCardProps {
  event: FAEvent;
}

/** Whole-event invitation roster. By default shows confirmed-or-attended
 *  students grouped by branch, with day/session info on each row so MKT can
 *  see at a glance who's coming. Toggle to "All" to also see invited /
 *  declined / absent. CSV export uses the same filtered view. */
export function EventInvitationListCard({ event }: EventInvitationListCardProps) {
  const allInvitations = useFAStore(s => s.invitations);
  const allSessions    = useFAStore(s => s.sessions);
  const students       = useFAStore(s => s.students);

  const [filter, setFilter] = useState<StatusGroup>("confirmed");
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState<string>("all");

  const sessionById = useMemo(
    () => new Map(allSessions.filter(s => s.eventId === event.id).map(s => [s.id, s])),
    [allSessions, event.id]
  );
  const studentById = useMemo(() => new Map(students.map(s => [s.id, s])), [students]);
  const branchNameByCode = useMemo(
    () => Object.fromEntries(BRANCHES.map(b => [b.code, b.name])) as Record<string, string>,
    []
  );

  const rows = useMemo(() => {
    return allInvitations
      .filter(i => i.eventId === event.id)
      .filter(i => {
        if (filter === "confirmed") {
          return i.status === "confirmed" || i.status === "attended";
        }
        return true;
      })
      .filter(i => branchFilter === "all" || i.branch === branchFilter)
      .filter(i => {
        if (!search) return true;
        const student = studentById.get(i.studentId);
        const q = search.toLowerCase();
        return (
          (student?.name ?? "").toLowerCase().includes(q) ||
          (student?.parentName ?? "").toLowerCase().includes(q) ||
          i.studentId.toLowerCase().includes(q)
        );
      })
      .map(i => ({
        invitation: i,
        student: studentById.get(i.studentId) ?? null,
        session: sessionById.get(i.sessionId) ?? null,
      }))
      .sort((a, b) => {
        const branchCmp = a.invitation.branch.localeCompare(b.invitation.branch);
        if (branchCmp !== 0) return branchCmp;
        const dayCmp = (a.session?.dayNumber ?? 0) - (b.session?.dayNumber ?? 0);
        if (dayCmp !== 0) return dayCmp;
        const sessCmp = (a.session?.sessionNumber ?? 0) - (b.session?.sessionNumber ?? 0);
        if (sessCmp !== 0) return sessCmp;
        return (a.student?.name ?? "").localeCompare(b.student?.name ?? "");
      });
  }, [allInvitations, event.id, filter, branchFilter, search, sessionById, studentById]);

  // Counts shown in the filter buttons — always reflect the full event,
  // unfiltered by branch/search, so users see the real totals.
  const allEventInvites = useMemo(
    () => allInvitations.filter(i => i.eventId === event.id),
    [allInvitations, event.id]
  );
  const confirmedCount = allEventInvites.filter(
    i => i.status === "confirmed" || i.status === "attended"
  ).length;

  // Unique branches present in this event (so the dropdown isn't 20 long).
  const branchesPresent = useMemo(() => {
    const codes = new Set(allEventInvites.map(i => i.branch));
    return BRANCHES.filter(b => codes.has(b.code));
  }, [allEventInvites]);

  function handleDownload() {
    const header = [
      "Branch code", "Branch name", "Student name", "Student ID",
      "Grade", "Credit", "Day", "Session #", "Session time",
      "Status", "Parent name", "Parent phone",
    ];
    const csvRows = rows.map(({ invitation, student, session }) => [
      invitation.branch,
      branchNameByCode[invitation.branch] ?? "",
      student?.name ?? "",
      invitation.studentId,
      student?.grade ?? "",
      student?.credit ?? "",
      session?.dayNumber ?? "",
      session?.sessionNumber ?? "",
      session ? `${session.startTime}-${session.endTime}` : "",
      STATUS_LABEL[invitation.status],
      student?.parentName ?? "",
      student?.parentPhone ?? "",
    ]);
    const safeName = event.name.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
    const suffix = filter === "confirmed" ? "confirmed" : "all";
    downloadCSV(`FA_${safeName}_${suffix}_list.csv`, [header, ...csvRows]);
  }

  return (
    <section className="mb-8">
      <div className="flex items-center gap-3 mb-3">
        <Users className="w-5 h-5 text-gold-500" />
        <h2 className="fa-display text-2xl text-ink-900">Invitation list</h2>
        <span className="fa-mono text-[11px] text-ink-400">
          ({rows.length} shown · {confirmedCount} confirmed across the event)
        </span>
      </div>

      <div className="fa-card overflow-hidden">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-ivory-300 bg-ivory-50">
          <div className="flex items-center gap-1 bg-white border border-ivory-300 rounded-md p-0.5">
            <button
              type="button"
              onClick={() => setFilter("confirmed")}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                filter === "confirmed"
                  ? "bg-success-soft text-success"
                  : "text-ink-500 hover:text-ink-900"
              }`}
            >
              Confirmed only
            </button>
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                filter === "all"
                  ? "bg-ink-900 text-ivory-50"
                  : "text-ink-500 hover:text-ink-900"
              }`}
            >
              All statuses
            </button>
          </div>

          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search student, parent, or ID"
              className="fa-input pl-7 py-1.5 text-xs w-full"
            />
          </div>

          {branchesPresent.length > 1 && (
            <select
              value={branchFilter}
              onChange={e => setBranchFilter(e.target.value)}
              className="fa-input py-1.5 text-xs w-40"
            >
              <option value="all">All branches</option>
              {branchesPresent.map(b => (
                <option key={b.code} value={b.code}>{b.code} — {b.name}</option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={handleDownload}
            disabled={rows.length === 0}
            className="fa-btn-ghost text-xs ml-auto disabled:opacity-50 disabled:cursor-not-allowed"
            title="Download the visible list as CSV"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-400">
            {filter === "confirmed"
              ? "No confirmed students yet."
              : "No invitations yet for this event."}
          </div>
        ) : (
          <table className="fa-table">
            <thead>
              <tr>
                <th>Branch</th>
                <th>Student</th>
                <th className="text-center">Day</th>
                <th className="text-center">Session</th>
                <th>Time</th>
                <th>Parent</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ invitation, student, session }) => (
                <tr key={invitation.id}>
                  <td>
                    <span className="font-mono text-xs font-semibold text-ink-700 bg-ivory-200 px-2 py-0.5 rounded">
                      {invitation.branch}
                    </span>
                  </td>
                  <td>
                    <div className="text-sm text-ink-900 font-medium">{student?.name ?? "(unknown)"}</div>
                    <div className="text-[11px] text-ink-400 font-mono">
                      G{student?.grade ?? "?"}·C{student?.credit ?? "?"}
                    </div>
                  </td>
                  <td className="text-center font-mono text-sm">
                    {session?.dayNumber ?? "—"}
                  </td>
                  <td className="text-center font-mono text-sm">
                    {session?.sessionNumber ?? "—"}
                  </td>
                  <td className="font-mono text-xs text-ink-600">
                    {session ? `${session.startTime}–${session.endTime}` : "—"}
                  </td>
                  <td>
                    <div className="text-sm text-ink-700">{student?.parentName ?? "—"}</div>
                    <div className="text-[11px] text-ink-400 font-mono">{student?.parentPhone ?? ""}</div>
                  </td>
                  <td>
                    <StatusPill tone={STATUS_TONE[invitation.status]} showDot={false}>
                      {STATUS_LABEL[invitation.status]}
                    </StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
