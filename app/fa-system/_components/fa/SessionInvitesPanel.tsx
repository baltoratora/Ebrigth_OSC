"use client";

import { Clock, X, Phone, UserPlus } from "lucide-react";
import { useFAStore } from "@fa/_lib/store";
import { EmptyState } from "@fa/_components/shared/EmptyState";
import { StatusPill } from "@fa/_components/fa/StatusPill";
import { InvitationStatusSelector } from "@fa/_components/fa/InvitationStatusSelector";
import { Invitation, InvitationStatus, Session, Student, hasBacklog, resolveStudentById, countsAsAttended } from "@fa/_types";

export function SessionInvitesPanel({
  session, quota, invitations, canInvite, isLocked, onOpenInvite, onStatusChange, onRemove,
}: {
  session: Session;
  quota: number;
  invitations: Invitation[];
  canInvite: boolean;
  /** When true the event is closed/ongoing/completed — ALL actions are disabled. */
  isLocked?: boolean;
  onOpenInvite: () => void;
  onStatusChange: (id: string, status: InvitationStatus) => void;
  onRemove: (inv: Invitation) => void;
}) {
  // Treat missing isLocked as false (backwards-compat)
  const locked = isLocked ?? !canInvite;
  const students = useFAStore(s => s.students);
  // `quota` from the page is marketing's confirm target. Invite cap is 3× that.
  const inviteCap = quota * 3;
  const remaining = inviteCap - invitations.length;
  const confirmed = invitations.filter(i => i.status === "confirmed" || countsAsAttended(i.status)).length;

  function getStudent(id: string): Student | undefined {
    return resolveStudentById(students, id);
  }

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
          <div className="text-sm text-ink-500 mt-1">
            <strong className="text-ink-900">{invitations.length}</strong> of <strong className="text-ink-900">{inviteCap}</strong> invites used ·
            <strong className="text-ink-900 ml-1">{confirmed}</strong> of <strong className="text-ink-900">{quota}</strong> confirmed
          </div>
        </div>
        {canInvite && !locked && remaining > 0 && (
          <button onClick={onOpenInvite} className="fa-btn-primary">
            <UserPlus className="w-4 h-4" /> Invite ({remaining} open)
          </button>
        )}
      </div>

      {invitations.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="No students invited yet"
          description={`You have ${inviteCap} invite slot${inviteCap !== 1 ? "s" : ""} to fill (target: ${quota} confirmed) for this session.`}
          action={canInvite && !locked ? (
            <button onClick={onOpenInvite} className="fa-btn-primary">
              <UserPlus className="w-4 h-4" /> Invite students
            </button>
          ) : null}
        />
      ) : (
        <div className="fa-card overflow-hidden">
          <table className="fa-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Grade</th>
                <th>Credit</th>
                <th>Backlog</th>
                <th>Parent</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invitations.map(inv => {
                const student = getStudent(inv.studentId);
                // Orphaned invitation: the student record was removed from
                // studentrecords after the invite was created. Show it (with a
                // remove button) instead of silently hiding it — otherwise the
                // "invites used" count won't match the visible rows and a BM
                // has no way to clear the stale invite.
                if (!student) {
                  return (
                    <tr key={inv.id} className="bg-amber-50/40">
                      <td>
                        <div className={`font-medium ${inv.studentNameSnapshot ? "text-ink-900" : "text-danger"}`}>
                          {inv.studentNameSnapshot || "Unknown student"}
                        </div>
                        <div className="text-xs text-ink-400">#{inv.studentId} · {inv.studentNameSnapshot ? "unlinked record" : "not in records"}</div>
                      </td>
                      <td>
                        <span className="font-mono text-sm">{inv.targetGrade ? `G${inv.targetGrade}` : "—"}</span>
                      </td>
                      <td><span className="text-xs text-ink-400">—</span></td>
                      <td><span className="text-xs text-ink-400">—</span></td>
                      <td><span className="text-xs text-ink-400">—</span></td>
                      <td>
                        <InvitationStatusSelector
                          value={inv.status}
                          onChange={(s) => onStatusChange(inv.id, s)}
                          disabled={locked}
                        />
                      </td>
                      <td>
                        <button
                          onClick={() => !locked && onRemove(inv)}
                          disabled={locked}
                          className={`fa-btn-ghost p-1.5 ${!locked ? "text-ink-400 hover:text-danger" : "text-ink-200 cursor-not-allowed"}`}
                          title={!locked ? "Remove stale invite" : "Event locked — read only"}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                }
                const backlog = hasBacklog(student);
                return (
                  <tr key={inv.id}>
                    <td>
                      <div className="font-medium text-ink-900">{student.name}</div>
                      <div className="text-xs text-ink-400">#{student.id}</div>
                    </td>
                    <td>
                      <span className="font-mono text-sm">G{inv.targetGrade ?? student.grade}</span>
                    </td>
                    <td>
                      <span className="text-xs text-ink-400">—</span>
                    </td>
                    <td>
                      {backlog ? (
                        <StatusPill tone="warning" showDot={false}>Has backlog</StatusPill>
                      ) : (
                        <span className="text-xs text-ink-400">On time</span>
                      )}
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
                        disabled={locked}
                      />
                    </td>
                    <td>
                      <button
                        onClick={() => !locked && onRemove(inv)}
                        disabled={locked}
                        className={`fa-btn-ghost p-1.5 ${!locked ? "text-ink-400 hover:text-danger" : "text-ink-200 cursor-not-allowed"}`}
                        title={!locked ? "Remove" : "Event locked — read only"}
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

