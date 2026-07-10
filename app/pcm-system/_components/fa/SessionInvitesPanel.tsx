"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Clock, X, Phone, UserPlus, ClipboardCheck, FileText } from "lucide-react";
import { useFAStore } from "@pcm/_lib/store";
import { EmptyState } from "@pcm/_components/shared/EmptyState";
import { StatusPill } from "@pcm/_components/fa/StatusPill";
import { InvitationStatusSelector } from "@pcm/_components/fa/InvitationStatusSelector";
import { Invitation, InvitationStatus, Session, Student, hasBacklog } from "@pcm/_types";

interface Coach {
  id: string;
  name: string;
  role: string | null;
}

export function SessionInvitesPanel({
  session, quota, invitations, canInvite, onOpenInvite, onStatusChange, onRemove,
}: {
  session: Session;
  quota: number;
  invitations: Invitation[];
  canInvite: boolean;
  onOpenInvite: () => void;
  onStatusChange: (id: string, status: InvitationStatus) => void;
  onRemove: (inv: Invitation) => void;
}) {
  const students = useFAStore(s => s.students);
  const assignCoach = useFAStore(s => s.assignCoachToInvitation);
  const updateInviteType = useFAStore(s => s.updateInviteType);
  const reports = useFAStore(s => s.reports);
  // Build a quick "does an invitation have a saved report?" lookup so the
  // table can colour rows green when filled and amber when still pending.
  const reportByInvitationId = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const r of reports) m.set(r.invitationId, true);
    return m;
  }, [reports]);
  // Branch of the first invitation — every invitation in a per-branch
  // session comes from the same branch, so this is safe even before the
  // student lookup. Used to scope the coach picker to the BM's branch.
  const branch = invitations[0]?.branch;

  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [coachesError, setCoachesError] = useState<string | null>(null);

  useEffect(() => {
    if (!branch) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/pcm/coaches?branch=${encodeURIComponent(branch)}`, { cache: "no-store" });
        if (!res.ok) {
          setCoachesError(`Could not load coaches (HTTP ${res.status})`);
          return;
        }
        const data = (await res.json()) as { coaches: Coach[] };
        if (!cancelled) setCoaches(data.coaches);
      } catch (err) {
        if (!cancelled) setCoachesError(err instanceof Error ? err.message : "load failed");
      }
    })();
    return () => { cancelled = true; };
  }, [branch]);

  // pcm-style quota math
  const inviteCap = quota * 3;
  const remaining = inviteCap - invitations.length;
  const confirmed = invitations.filter(i => i.status === "confirmed" || i.status === "attended").length;
  const progressCount = invitations.filter(i => i.inviteType === "progress").length;
  const renewalCount  = invitations.filter(i => i.inviteType === "renewal").length;

  const studentsById = useMemo(() => {
    const m = new Map<string, Student>();
    for (const s of students) m.set(s.id, s);
    return m;
  }, [students]);

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs uppercase tracking-wider font-semibold text-brand-900">
              Day {session.dayNumber} · Session {session.sessionNumber}
            </span>
            <Clock className="w-3 h-3 text-ink-300" />
            <span className="text-sm text-ink-500">
              {session.startTime}–{session.endTime}
            </span>
          </div>
          <h2 className="fa-display text-2xl text-ink-900">
            {session.label || `Session ${session.sessionNumber}`}
          </h2>
          <div className="text-sm text-ink-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              <strong className="text-ink-900">{invitations.length}</strong> of <strong className="text-ink-900">{inviteCap}</strong> invites
            </span>
            <span className="text-ink-300">·</span>
            <span>
              <strong className="text-ink-900">{confirmed}</strong> of <strong className="text-ink-900">{quota}</strong> confirmed
            </span>
            {invitations.length > 0 && (
              <>
                <span className="text-ink-300">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white bg-gradient-to-r from-violet-500 to-fuchsia-500">
                    PROG {progressCount}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white bg-gradient-to-r from-cyan-500 to-teal-500">
                    RENEW {renewalCount}
                  </span>
                </span>
              </>
            )}
          </div>
        </div>
        {canInvite && remaining > 0 && (
          <button onClick={onOpenInvite} className="fa-btn-primary">
            <UserPlus className="w-4 h-4" /> Invite ({remaining} open)
          </button>
        )}
      </div>

      {coachesError && (
        <div className="mb-3 rounded-[8px] bg-amber-50 border border-amber-200 text-amber-700 text-xs px-3 py-2">
          {coachesError}. Coach selection will be unavailable until this resolves.
        </div>
      )}

      {invitations.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="No students invited yet"
          description={`You have ${inviteCap} invite slot${inviteCap !== 1 ? "s" : ""} to fill (target: ${quota} confirmed) for this session.`}
          action={canInvite ? (
            <button onClick={onOpenInvite} className="fa-btn-primary">
              <UserPlus className="w-4 h-4" /> Invite students
            </button>
          ) : null}
        />
      ) : (
        <div className="fa-card overflow-x-auto">
          <table className="fa-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Grade</th>
                <th>Type</th>
                <th>Coach</th>
                <th>Parent</th>
                <th>Status</th>
                <th>Report</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invitations.map(inv => {
                // Fall back to the denormalised name attached to the
                // invitation row when /api/pcm/students dropped this
                // record — better to render a usable row than to silently
                // hide the BM's invite.
                const looked = studentsById.get(inv.studentId);
                const student: Student = looked ?? {
                  id: inv.studentId,
                  name: inv.studentName ?? `#${inv.studentId} (not in roster)`,
                  branch: inv.branch,
                  grade: inv.studentGrade ?? inv.targetGrade ?? 0,
                  ageCategory: "Junior",
                  credit: 1,
                  faHistory: {},
                  parentName: inv.studentParentName ?? "",
                  parentPhone: inv.studentParentPhone ?? "",
                  enrolmentDate: "",
                  active: false,
                  archived: false,
                };
                const backlog = hasBacklog(student);
                const isProgress = inv.inviteType === "progress";
                const reportFilled = reportByInvitationId.get(inv.id) === true;
                return (
                  <tr
                    key={inv.id}
                    // Color the whole row by report status so the BM sees at
                    // a glance who still needs their assessment filled in.
                    // Soft tints only — avoids fighting the existing row
                    // hover/zebra styles.
                    className={reportFilled
                      ? "bg-emerald-50/40 hover:bg-emerald-50"
                      : "bg-amber-50/40 hover:bg-amber-50"
                    }>
                    <td>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-ink-900">{student.name}</span>
                        {backlog && (
                          <StatusPill tone="warning" showDot={false}>backlog</StatusPill>
                        )}
                      </div>
                      <div className="text-xs text-ink-400">#{student.id}</div>
                    </td>
                    <td>
                      <span className="font-mono text-sm">G{inv.targetGrade ?? student.grade}</span>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() =>
                          void updateInviteType(inv.id, isProgress ? "renewal" : "progress")
                        }
                        title="Click to flip between Progress and Renewal"
                        className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase text-white cursor-pointer transition-transform hover:scale-105 ${
                          isProgress
                            ? "bg-gradient-to-r from-violet-500 to-fuchsia-500"
                            : "bg-gradient-to-r from-cyan-500 to-teal-500"
                        }`}
                        style={{ letterSpacing: "0.06em" }}
                      >
                        {isProgress ? "Progress" : "Renewal"}
                      </button>
                    </td>
                    <td>
                      <select
                        className="fa-input text-xs"
                        style={{ minWidth: "140px", paddingTop: "0.35rem", paddingBottom: "0.35rem" }}
                        value={inv.coachId ?? ""}
                        onChange={(e) => {
                          const id = e.target.value || null;
                          const coach = id ? coaches.find(c => c.id === id) : null;
                          void assignCoach(inv.id, id, coach ? coach.name : null);
                        }}
                        disabled={coaches.length === 0}
                      >
                        <option value="">— Unassigned —</option>
                        {coaches.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name}{c.role ? ` · ${c.role}` : ""}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className="text-sm text-ink-900">{student.parentName}</div>
                      <div className="text-xs text-ink-400 font-mono flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {student.parentPhone}
                      </div>
                    </td>
                    <td>
                      <InvitationStatusSelector
                        value={inv.status}
                        onChange={(s) => onStatusChange(inv.id, s)}
                        disabled={!canInvite && inv.status !== "confirmed" && inv.status !== "invited"}
                      />
                    </td>
                    <td>
                      <Link
                        href={`/pcm-system/shared/reports/${inv.id}`}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                          reportFilled
                            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border border-emerald-300"
                            : "bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-300"
                        }`}
                        title={reportFilled ? "Report filled — click to view / edit" : "No report yet — click to fill"}
                      >
                        {reportFilled
                          ? <><ClipboardCheck className="w-3 h-3" /> Filled</>
                          : <><FileText className="w-3 h-3" /> Fill report</>
                        }
                      </Link>
                    </td>
                    <td>
                      <button
                        onClick={() => onRemove(inv)}
                        className="fa-btn-ghost p-1.5 text-ink-400 hover:text-danger"
                        title="Remove"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
