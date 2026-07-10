"use client";

import { useMemo, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { Modal } from "@pcm/_components/shared/Modal";
import { useFAStore } from "@pcm/_lib/store";
import { StatusPill } from "@pcm/_components/fa/StatusPill";
import {
  BRANCHES,
  Invitation,
  InvitationStatus,
  Session,
} from "@pcm/_types";

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
  no_show: "No show",
  rescheduled: "Reschedule",
};

export function MarketingSessionInvitesModal({
  open, onClose, session,
}: {
  open: boolean;
  onClose: () => void;
  session: Session;
}) {
  const students = useFAStore(s => s.students);
  const users = useFAStore(s => s.users);
  const allInvitations = useFAStore(s => s.invitations);
  const allQuotas = useFAStore(s => s.quotas);
  const allSessions = useFAStore(s => s.sessions);
  const moveInvitationToSession = useFAStore(s => s.moveInvitationToSession);

  // Other sessions in the same event (different day/time) — destinations
  // when reassigning a confirmed student via the per-row Move dropdown.
  const otherSessionsInEvent = useMemo(
    () => allSessions
      .filter(s => s.eventId === session.eventId && s.id !== session.id)
      .sort((a, b) => a.dayNumber - b.dayNumber || a.sessionNumber - b.sessionNumber),
    [allSessions, session.eventId, session.id]
  );

  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  async function handleMove(invitationId: string, targetSessionId: string) {
    setMovingId(invitationId);
    setMoveError(null);
    try {
      await moveInvitationToSession(invitationId, targetSessionId);
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : "Move failed");
    } finally {
      setMovingId(null);
    }
  }

  const sessionInvites = useMemo(
    () => allInvitations.filter(i => i.sessionId === session.id),
    [allInvitations, session.id]
  );

  const sessionQuotas = useMemo(
    () => allQuotas.filter(q => q.sessionId === session.id),
    [allQuotas, session.id]
  );

  // Group invitations by branch. Branches with a quota but no invites still
  // show as a row so Academy can see who hasn't started inviting yet.
  const groupedByBranch = useMemo(() => {
    const branchSet = new Set<string>();
    sessionInvites.forEach(i => branchSet.add(i.branch));
    sessionQuotas.forEach(q => branchSet.add(q.branch));
    return [...branchSet]
      .map(code => {
        const branch = BRANCHES.find(b => b.code === code);
        const invites = sessionInvites.filter(i => i.branch === code);
        const quota = sessionQuotas.find(q => q.branch === code)?.quota ?? 0;
        return { code, branch, invites, quota };
      })
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [sessionInvites, sessionQuotas]);

  const totals = {
    quota: sessionQuotas.reduce((sum, q) => sum + q.quota, 0),
    invited: sessionInvites.length,
    confirmed: sessionInvites.filter(i => i.status === "confirmed" || i.status === "attended").length,
  };

  function studentLabel(invitation: Invitation) {
    const student = students.find(s => s.id === invitation.studentId);
    if (!student) return { name: "(unknown student)", grade: null, credit: null };
    return { name: student.name, grade: student.grade, credit: student.credit };
  }

  function inviterName(userId: string) {
    return users.find(u => u.id === userId)?.name ?? userId;
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Live invitations — Day ${session.dayNumber} · Session ${session.sessionNumber}`}
      description={`${session.startTime}–${session.endTime}${session.label ? ` · ${session.label}` : ""}`}
      size="xl"
    >
      {moveError && (
        <div className="text-xs text-danger bg-danger-soft rounded-md px-3 py-2 mb-3" role="alert">
          {moveError}
        </div>
      )}
      <div className="flex items-center gap-6 mb-4 pb-4 border-b border-ivory-300 text-sm">
        <div>
          <span className="text-ink-400 mr-1">Total slots:</span>
          <span className="fa-mono font-semibold text-ink-900">{totals.quota}</span>
        </div>
        <div>
          <span className="text-ink-400 mr-1">Invited:</span>
          <span className="fa-mono font-semibold text-ink-900">{totals.invited}</span>
        </div>
        <div>
          <span className="text-ink-400 mr-1">Confirmed:</span>
          <span className="fa-mono font-semibold text-success">{totals.confirmed}</span>
        </div>
      </div>

      <div className="max-h-[60vh] overflow-y-auto space-y-4">
        {groupedByBranch.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-400">
            No quotas assigned and no invitations yet.
          </div>
        ) : (
          groupedByBranch.map(({ code, branch, invites, quota }) => (
            <div key={code} className="fa-card p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-ink-700 bg-ivory-200 px-2 py-0.5 rounded">
                    {code}
                  </span>
                  <span className="text-sm text-ink-900">{branch?.name ?? code}</span>
                </div>
                <div className="text-xs text-ink-500">
                  <span className="fa-mono font-semibold text-ink-900">{invites.length}</span>
                  <span className="text-ink-400"> / {quota} slot{quota !== 1 ? "s" : ""}</span>
                </div>
              </div>
              {invites.length === 0 ? (
                <div className="text-xs text-ink-400 italic">
                  Branch hasn&apos;t invited anyone yet.
                </div>
              ) : (
                <div className="space-y-1">
                  {invites.map(inv => {
                    const s = studentLabel(inv);
                    const canMove =
                      inv.status === "invited" ||
                      inv.status === "confirmed" ||
                      inv.status === "declined";
                    const isMoving = movingId === inv.id;
                    return (
                      <div
                        key={inv.id}
                        className="flex items-center gap-3 text-sm py-1.5 px-2 -mx-2 rounded hover:bg-ivory-100"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-ink-900 font-medium">{s.name}</span>
                            {s.grade !== null && (
                              <span className="font-mono text-xs text-ink-400">
                                G{s.grade}·C{s.credit}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-ink-400 mt-0.5">
                            Invited by {inviterName(inv.invitedBy)}
                          </div>
                        </div>
                        <StatusPill tone={STATUS_TONE[inv.status]} showDot={false}>
                          {STATUS_LABEL[inv.status]}
                        </StatusPill>
                        {canMove && otherSessionsInEvent.length > 0 && (
                          <div className="relative">
                            <select
                              aria-label={`Move ${s.name} to a different session`}
                              value=""
                              disabled={isMoving}
                              onChange={e => {
                                const target = e.target.value;
                                if (target) handleMove(inv.id, target);
                              }}
                              className="fa-btn-ghost text-[11px] pl-6 pr-1.5 py-1 appearance-none cursor-pointer disabled:opacity-50"
                              title="Move to another session/day"
                              style={{ minWidth: "92px" }}
                            >
                              <option value="">{isMoving ? "Moving…" : "Move to…"}</option>
                              {otherSessionsInEvent.map(os => (
                                <option key={os.id} value={os.id}>
                                  Day {os.dayNumber} · S{os.sessionNumber} ({os.startTime})
                                </option>
                              ))}
                            </select>
                            <ArrowRightLeft className="w-3 h-3 absolute left-1.5 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="flex justify-end pt-4 mt-4 border-t border-ivory-300">
        <button onClick={onClose} className="fa-btn-secondary">Close</button>
      </div>
    </Modal>
  );
}
