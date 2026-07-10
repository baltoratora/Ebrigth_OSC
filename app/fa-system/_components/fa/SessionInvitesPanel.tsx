"use client";

import { useState } from "react";
import { Clock, X, Phone, UserPlus, Video, Image as ImageIcon } from "lucide-react";
import { useFAStore } from "@fa/_lib/store";
import { EmptyState } from "@fa/_components/shared/EmptyState";
import { StatusPill } from "@fa/_components/fa/StatusPill";
import { InvitationStatusSelector } from "@fa/_components/fa/InvitationStatusSelector";
import { ConfirmProofModal } from "@fa/_components/fa/ConfirmProofModal";
import { SchedulePracticeModal } from "@fa/_components/fa/SchedulePracticeModal";
import { Invitation, InvitationStatus, Session, Student, hasBacklog, resolveStudentById, countsAsAttended, countsAsConfirmed } from "@fa/_types";

export function SessionInvitesPanel({
  session, quota, invitations, canInvite, isLocked, onOpenInvite, onStatusChange, onAttachProof, onSchedulePractice, onRemove,
}: {
  session: Session;
  quota: number;
  invitations: Invitation[];
  canInvite: boolean;
  /** When true the event is closed/ongoing/completed — ALL actions are disabled. */
  isLocked?: boolean;
  onOpenInvite: () => void;
  onStatusChange: (id: string, status: InvitationStatus) => void;
  /** Attach a testing video link and/or proof image to a confirmed invitation.
   *  Triggered manually via the "+Add video / proof" / "Edit" control. */
  onAttachProof?: (
    invId: string,
    args: { videoLink: string; base64Data: string | null; studentId: string; branch: string }
  ) => Promise<void>;
  /** After a BM confirms, they're prompted (optionally, skippable) to schedule
   *  a practice-session date/time. When provided, clicking "Confirmed"
   *  confirms immediately AND opens this scheduling popup. Neither field is
   *  required — the student shows in the Practice sidebar either way. */
  onSchedulePractice?: (
    invId: string,
    args: { practiceDate: string | null; practiceTime: string | null }
  ) => Promise<void>;
  onRemove: (inv: Invitation) => void;
}) {
  // Treat missing isLocked as false (backwards-compat)
  const locked = isLocked ?? !canInvite;
  const students = useFAStore(s => s.students);
  // Manual video/proof editor (via the "+Add"/"Edit" control in the column).
  const [editProofFor, setEditProofFor] = useState<{ inv: Invitation; name: string } | null>(null);
  // Practice-schedule popup, auto-opened right after confirming.
  const [schedulingFor, setSchedulingFor] = useState<{ inv: Invitation; name: string } | null>(null);

  // Confirm immediately, then pop the (skippable) practice-schedule prompt.
  // Other transitions (Pending / Declined / attendance) pass straight through.
  function handleStatusChange(inv: Invitation, name: string, status: InvitationStatus) {
    onStatusChange(inv.id, status);
    if (status === "confirmed" && onSchedulePractice) {
      setSchedulingFor({ inv, name });
    }
  }
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
                <th>Video / Proof</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invitations.map(inv => {
                const student = getStudent(inv.studentId);
                // Once confirmed, the student needs BOTH a testing video link
                // and a proof image. Tint the WHOLE row red until both are
                // present, then green — so a branch can't confirm and forget.
                const requiresProof = countsAsConfirmed(inv.status);
                const proofComplete = !!(inv.videoLink && inv.proofUrl);
                const proofTone = requiresProof
                  ? (proofComplete ? "bg-success-soft" : "bg-danger-soft")
                  : "";
                // Orphaned invitation: the student record was removed from
                // studentrecords after the invite was created. Show it (with a
                // remove button) instead of silently hiding it — otherwise the
                // "invites used" count won't match the visible rows and a BM
                // has no way to clear the stale invite.
                if (!student) {
                  return (
                    <tr key={inv.id} className={proofTone || "bg-amber-50/40"}>
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
                          onChange={(s) => handleStatusChange(inv, inv.studentNameSnapshot || "this student", s)}
                          disabled={locked}
                        />
                      </td>
                      <td>
                        <ProofCell
                          inv={inv}
                          locked={locked || !onAttachProof}
                          onEdit={() => setEditProofFor({ inv, name: inv.studentNameSnapshot || "this student" })}
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
                  <tr key={inv.id} className={proofTone}>
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
                        onChange={(s) => handleStatusChange(inv, student.name, s)}
                        disabled={locked}
                      />
                    </td>
                    <td>
                      <ProofCell
                        inv={inv}
                        locked={locked || !onAttachProof}
                        onEdit={() => setEditProofFor({ inv, name: student.name })}
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

      {editProofFor && onAttachProof && (
        <ConfirmProofModal
          open
          onClose={() => setEditProofFor(null)}
          studentName={editProofFor.name}
          initialVideoLink={editProofFor.inv.videoLink ?? ""}
          initialProofUrl={editProofFor.inv.proofUrl ?? ""}
          onSave={async ({ videoLink, base64Data }) => {
            await onAttachProof(editProofFor.inv.id, {
              videoLink,
              base64Data,
              studentId: editProofFor.inv.studentId,
              branch: editProofFor.inv.branch,
            });
          }}
        />
      )}

      {schedulingFor && onSchedulePractice && (
        <SchedulePracticeModal
          open
          onClose={() => setSchedulingFor(null)}
          studentName={schedulingFor.name}
          initialDate={schedulingFor.inv.practiceDate ?? ""}
          initialTime={schedulingFor.inv.practiceTime ?? ""}
          onSave={async ({ practiceDate, practiceTime }) => {
            await onSchedulePractice(schedulingFor.inv.id, { practiceDate, practiceTime });
          }}
        />
      )}
    </div>
  );
}

/**
 * "Video / Proof" cell. Only relevant once the student is CONFIRMED — before
 * that it stays empty ("—"). After confirming, the WHOLE ROW is tinted RED until
 * BOTH the testing video link and proof image are added, then GREEN (see
 * proofTone in the row map). This cell just holds the clickable links + an
 * Add/Edit button so a branch can't confirm and forget. Read-only when locked.
 */
function ProofCell({
  inv, locked, onEdit,
}: { inv: Invitation; locked: boolean; onEdit: () => void }) {
  // Nothing to do until the student is confirmed.
  if (!countsAsConfirmed(inv.status)) {
    return <span className="text-xs text-ink-400">—</span>;
  }
  const hasVideo = !!inv.videoLink;
  const hasProof = !!inv.proofUrl;
  const complete = hasVideo && hasProof;

  return (
    <div className="inline-flex items-center gap-2">
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
          title="Proof of testing before the event"
        >
          <ImageIcon className="w-3 h-3" /> Proof
        </a>
      )}
      {complete ? (
        !locked && (
          <button onClick={onEdit} className="text-[11px] text-ink-600 hover:text-brand-700">
            Edit
          </button>
        )
      ) : !locked ? (
        <button onClick={onEdit} className="text-[11px] font-semibold text-danger hover:underline">
          {hasVideo || hasProof ? "Complete proof" : "+ Add video / proof"}
        </button>
      ) : (
        <span className="text-[11px] font-medium text-danger">Missing proof</span>
      )}
    </div>
  );
}

