"use client";

import { useState, useMemo } from "react";
import { useFAStore } from "@fa/_lib/store";
import { useCurrentUser } from "@fa/_hooks/useCurrentUser";
import { AppShell } from "@fa/_components/shared/AppShell";
import { ConfirmProofModal } from "@fa/_components/fa/ConfirmProofModal";
import { SchedulePracticeModal } from "@fa/_components/fa/SchedulePracticeModal";
import { BRANCHES, BranchCode, Invitation, resolveStudentById } from "@fa/_types";
import { CalendarClock, Search, Video, Image as ImageIcon, Pencil, Phone } from "lucide-react";
import { format, parseISO } from "date-fns";

/**
 * "Practice" — every CONFIRMED student across all events/sessions, in one
 * place, so nobody has to hunt through each event's roster to see who still
 * needs a practice session scheduled or a proof submitted.
 *
 * A student appears here the moment they're confirmed. Scheduling a practice
 * date/time is entirely OPTIONAL — it never gates whether they show up in
 * this list (per explicit product requirement: no condition on the time).
 *
 * Branch Managers can edit (schedule practice, add/edit video+proof) for
 * their own branch only. Marketing sees every branch, read-only — same
 * viewing rights they already have elsewhere in FA system.
 */
export default function PracticePage() {
  const user = useCurrentUser();
  const invitations = useFAStore(s => s.invitations);
  const students = useFAStore(s => s.students);
  const events = useFAStore(s => s.events);
  const sessions = useFAStore(s => s.sessions);
  const attachInvitationProof = useFAStore(s => s.attachInvitationProof);
  const scheduleInvitationPractice = useFAStore(s => s.scheduleInvitationPractice);

  const isBM = user?.role === "BM";
  const canEdit = isBM; // Marketing is view-only, same as elsewhere in FA system.

  const [branchFilter, setBranchFilter] = useState<BranchCode | "all">(
    isBM && user?.branch ? user.branch : "all"
  );
  const effectiveBranchFilter: BranchCode | "all" = isBM ? (user?.branch ?? "all") : branchFilter;
  const [eventId, setEventId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [editProofFor, setEditProofFor] = useState<{ inv: Invitation; name: string } | null>(null);
  const [schedulingFor, setSchedulingFor] = useState<{ inv: Invitation; name: string } | null>(null);

  const eventById = useMemo(() => new Map(events.map(e => [e.id, e])), [events]);
  const sessionById = useMemo(() => new Map(sessions.map(s => [s.id, s])), [sessions]);

  const rows = useMemo(() => {
    let list = invitations.filter(i => i.status === "confirmed");
    list = list.filter(i => effectiveBranchFilter === "all" || i.branch === effectiveBranchFilter);
    if (eventId !== "all") list = list.filter(i => i.eventId === eventId);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(i => {
        const student = resolveStudentById(students, i.studentId);
        const name = student?.name ?? i.studentNameSnapshot ?? "";
        return (
          name.toLowerCase().includes(q) ||
          i.studentId.toLowerCase().includes(q) ||
          (student?.parentName ?? "").toLowerCase().includes(q)
        );
      });
    }
    // Nearest scheduled practice first; unscheduled last; then by name.
    return list.sort((a, b) => {
      if (a.practiceDate && b.practiceDate) return a.practiceDate.localeCompare(b.practiceDate);
      if (a.practiceDate) return -1;
      if (b.practiceDate) return 1;
      return (a.studentNameSnapshot ?? "").localeCompare(b.studentNameSnapshot ?? "");
    });
  }, [invitations, students, effectiveBranchFilter, eventId, search]);

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [events],
  );

  const scheduledCount = rows.filter(r => r.practiceDate).length;

  return (
    <AppShell>
      {/* Hero */}
      <div className="mb-6 relative overflow-hidden rounded-2xl p-6
                      bg-gradient-to-r from-indigo-600 to-blue-600 text-white">
        <CalendarClock className="absolute -right-4 -top-6 w-32 h-32 text-white/10" aria-hidden="true" />
        <div className="fa-mono text-[10px] uppercase text-white/80 mb-1" style={{ letterSpacing: "0.14em" }}>
          FA · Practice sessions
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Practice</h1>
        <p className="text-white/80 text-sm mt-1.5">
          {rows.length} confirmed student{rows.length !== 1 ? "s" : ""} · {scheduledCount} with a practice scheduled
          {!canEdit && <> · view only</>}
        </p>
      </div>

      {/* Filters */}
      <div className="rounded-xl bg-white border border-ivory-300 shadow-sm p-3 mb-4 flex flex-wrap items-center gap-3">
        <select
          className="fa-input text-xs"
          style={{ minWidth: "260px", height: "30px", paddingTop: "0.15rem", paddingBottom: "0.15rem" }}
          value={eventId}
          onChange={e => setEventId(e.target.value)}
        >
          <option value="all">All events</option>
          {sortedEvents.map(ev => (
            <option key={ev.id} value={ev.id}>
              {ev.name} ({format(parseISO(ev.startDate), "d MMM")})
            </option>
          ))}
        </select>
        {!isBM && (
          <select
            className="fa-input text-xs"
            style={{ minWidth: "180px", height: "30px", paddingTop: "0.15rem", paddingBottom: "0.15rem" }}
            value={branchFilter}
            onChange={e => setBranchFilter(e.target.value as BranchCode | "all")}
          >
            <option value="all">All branches</option>
            {BRANCHES.map(b => (
              <option key={b.code} value={b.code}>{b.code} — {b.name}</option>
            ))}
          </select>
        )}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400" />
          <input
            className="fa-input fa-input-icon-left text-xs"
            style={{ height: "30px", paddingTop: "0.15rem", paddingBottom: "0.15rem" }}
            placeholder="Search student name, ID, or parent…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* List */}
      <div className="rounded-2xl bg-white border border-ivory-300 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 px-5 py-3 border-b border-ivory-300">
          <h2 className="text-sm font-semibold text-indigo-900">Confirmed students</h2>
        </div>
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-400">
            No confirmed students match these filters.
          </div>
        ) : (
          <table className="fa-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Branch</th>
                <th>Grade</th>
                <th>Parent</th>
                <th>Practice</th>
                <th>Video / Proof</th>
                {canEdit && <th></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(inv => {
                const student = resolveStudentById(students, inv.studentId);
                const name = student?.name ?? inv.studentNameSnapshot ?? "(unknown)";
                const event = eventById.get(inv.eventId);
                const session = sessionById.get(inv.sessionId);
                const hasVideo = !!inv.videoLink;
                const hasProof = !!inv.proofUrl;
                const proofComplete = hasVideo && hasProof;
                return (
                  <tr key={inv.id}>
                    <td>
                      <div className="font-medium text-ink-900">{name}</div>
                      <div className="text-xs text-ink-400">
                        #{inv.studentId}
                        {event && (
                          <> · {event.name}{session && ` · D${session.dayNumber} S${session.sessionNumber}`}</>
                        )}
                      </div>
                    </td>
                    <td>
                      <span
                        className="fa-mono text-[10px] uppercase px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-bold"
                        style={{ letterSpacing: "0.06em" }}
                      >
                        {inv.branch}
                      </span>
                    </td>
                    <td className="font-mono text-sm">G{inv.targetGrade || student?.grade || "?"}</td>
                    <td>
                      <div className="text-sm text-ink-700">{student?.parentName ?? "—"}</div>
                      {student?.parentPhone && (
                        <div className="text-xs text-ink-400 font-mono flex items-center gap-1">
                          <Phone className="w-3 h-3" /> {student.parentPhone}
                        </div>
                      )}
                    </td>
                    <td>
                      {inv.practiceDate ? (
                        <div className="text-sm text-ink-900">
                          {format(parseISO(inv.practiceDate), "d MMM yyyy")}
                          {inv.practiceTime && <span className="text-ink-400"> · {inv.practiceTime}</span>}
                        </div>
                      ) : (
                        <span className="text-xs text-ink-400 italic">Not scheduled</span>
                      )}
                      {canEdit && (
                        <button
                          onClick={() => setSchedulingFor({ inv, name })}
                          className="block mt-0.5 text-[11px] font-semibold text-indigo-600 hover:underline"
                        >
                          {inv.practiceDate ? "Reschedule" : "Schedule"}
                        </button>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            proofComplete ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
                          }`}
                        >
                          {proofComplete ? "Submitted" : "Pending"}
                        </span>
                        {hasVideo && (
                          <a
                            href={inv.videoLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-brand-700 hover:underline"
                            title="Testing video"
                          >
                            <Video className="w-3 h-3" /> Video
                          </a>
                        )}
                        {hasProof && (
                          <a
                            href={inv.proofUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-brand-700 hover:underline"
                            title="View proof"
                          >
                            <ImageIcon className="w-3 h-3" /> Proof
                          </a>
                        )}
                        {canEdit && (
                          <button
                            onClick={() => setEditProofFor({ inv, name })}
                            className="text-[11px] font-semibold text-indigo-600 hover:underline"
                          >
                            {proofComplete ? "Edit" : "+ Add"}
                          </button>
                        )}
                      </div>
                    </td>
                    {canEdit && (
                      <td className="text-right">
                        <button
                          onClick={() => setEditProofFor({ inv, name })}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border border-ivory-300 bg-white text-ink-700 hover:bg-ivory-100"
                          title="Edit video / proof"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editProofFor && canEdit && (
        <ConfirmProofModal
          open
          onClose={() => setEditProofFor(null)}
          studentName={editProofFor.name}
          initialVideoLink={editProofFor.inv.videoLink ?? ""}
          initialProofUrl={editProofFor.inv.proofUrl ?? ""}
          onSave={async ({ videoLink, base64Data }) => {
            await attachInvitationProof(editProofFor.inv.id, {
              videoLink,
              base64Data,
              studentId: editProofFor.inv.studentId,
              branch: editProofFor.inv.branch,
            });
          }}
        />
      )}

      {schedulingFor && canEdit && (
        <SchedulePracticeModal
          open
          onClose={() => setSchedulingFor(null)}
          studentName={schedulingFor.name}
          initialDate={schedulingFor.inv.practiceDate ?? ""}
          initialTime={schedulingFor.inv.practiceTime ?? ""}
          onSave={async ({ practiceDate, practiceTime }) => {
            await scheduleInvitationPractice(schedulingFor.inv.id, { practiceDate, practiceTime });
          }}
        />
      )}
    </AppShell>
  );
}
