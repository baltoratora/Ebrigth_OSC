"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Clock, CheckCircle2, XCircle, GripVertical, DollarSign, Video, Send, Pencil, Eye, CalendarClock, Ban } from "lucide-react";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useFAStore } from "@pcm/_lib/store";
import { useCurrentUser } from "@pcm/_hooks/useCurrentUser";
import { StatusPill } from "@pcm/_components/fa/StatusPill";
import { InvitationDetailModal } from "@pcm/_components/fa/InvitationDetailModal";
import { RescheduleModal } from "@pcm/_components/fa/RescheduleModal";
import { BRANCHES, Invitation, Student, resolveStudentById, arrivalLabel, PACKAGE_OPTIONS, PackageOption } from "@pcm/_types";

export function AttendanceRoster({
  session, orderedInvitations, pendingConfirmationsCount, canEdit, canDrag, academyView = false,
}: {
  session: { dayNumber: number; sessionNumber: number; startTime: string; endTime: string; label?: string };
  /** Pre-filtered, pre-ordered list of invitations the page wants displayed.
   *  Page owns ordering (applies sessionOrder + branch filter + status filter)
   *  so the roster and the dnd-kit handler always see the same sequence. */
  orderedInvitations: Invitation[];
  pendingConfirmationsCount: number;
  canEdit: boolean;
  /** When true, render drag handles and wire up dnd-kit sortable rows. MKT-only. */
  canDrag: boolean;
  /** Academy view: hide the Parent column and tighten cell padding so the
   *  wider roster (Type + Paid + Video columns) fits without scrolling. */
  academyView?: boolean;
}) {
  const user = useCurrentUser();
  const students = useFAStore(s => s.students);
  const updateStatus = useFAStore(s => s.updateInvitationStatus);
  const setInvitationPaid = useFAStore(s => s.setInvitationPaid);
  const setInvitationVideoSent = useFAStore(s => s.setInvitationVideoSent);

  // Row-end Edit (branch) / Detail (academy) modal + the reschedule flow it
  // hands off to. Academy gets a read-only detail; branch can edit.
  const [detailInv, setDetailInv] = useState<Invitation | null>(null);
  const [rescheduleInv, setRescheduleInv] = useState<Invitation | null>(null);

  const attended = orderedInvitations.filter(i => i.status === "attended").length;
  const noShow = orderedInvitations.filter(i => i.status === "no_show").length;
  const awaiting = orderedInvitations.filter(i => i.status === "confirmed").length;

  // Academy is strictly read-only; the branch can click everything.
  const interactive = canEdit && !academyView;

  function setAttendance(invId: string, status: "attended" | "no_show" | "confirmed") {
    if (!interactive) return;
    updateStatus(invId, status, user?.id);
  }

  const sortableIds = orderedInvitations.map(i => i.id);

  return (
    <div>
      {/* Header */}
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
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="fa-display text-2xl text-success">{attended}</div>
            <div className="text-xs text-ink-400 uppercase tracking-wider">Attended</div>
          </div>
          <div className="text-right">
            <div className="fa-display text-2xl text-danger">{noShow}</div>
            <div className="text-xs text-ink-400 uppercase tracking-wider">No show</div>
          </div>
          <div className="text-right">
            <div className="fa-display text-2xl text-ink-600">{awaiting}</div>
            <div className="text-xs text-ink-400 uppercase tracking-wider">Awaiting</div>
          </div>
        </div>
      </div>

      {/* Unconfirmed warning */}
      {pendingConfirmationsCount > 0 && (
        <div className="fa-card p-3 mb-4 border-l-4 border-l-warning bg-warning-soft/30 flex items-center gap-3">
          <span className="text-sm text-ink-600">
            <strong className="text-ink-900">{pendingConfirmationsCount}</strong> invitation{pendingConfirmationsCount !== 1 ? "s" : ""} still pending parent confirmation and not shown below.
          </span>
        </div>
      )}

      {orderedInvitations.length === 0 ? (
        <div className="fa-card p-8 text-center text-sm text-ink-400">
          No confirmed students for this session yet.
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-ivory-300 shadow-sm overflow-hidden">
          {/* Invitations-style header band */}
          <div className="bg-gradient-to-r from-violet-50 to-indigo-50 px-5 py-3 border-b border-ivory-300 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-violet-900">
              {session.label || `Session ${session.sessionNumber}`}
              <span className="text-violet-400 font-normal"> · Day {session.dayNumber} · {session.startTime}–{session.endTime}</span>
            </h3>
            <span className="text-[11px] text-ink-400">
              {orderedInvitations.length} student{orderedInvitations.length !== 1 ? "s" : ""}
            </span>
          </div>
          <table
            className={`fa-table ${
              academyView
                ? "[&_th]:px-2 [&_td]:px-2 [&_th]:py-2.5 [&_td]:py-2.5 text-[13px]"
                : ""
            }`}
          >
            <thead>
              <tr>
                <th className="w-10 text-right">#</th>
                {canDrag && <th className="w-8" aria-label="Drag" />}
                <th>Student</th>
                <th>Branch</th>
                <th>Grade</th>
                <th>Type</th>
                <th>Parent</th>
                <th>Confirmation</th>
                <th className="text-right">Attendance</th>
                <th>Paid</th>
                <th>Video to Parent</th>
                <th className="text-right">{academyView ? "Detail" : "Edit"}</th>
              </tr>
            </thead>
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              <tbody>
                {orderedInvitations.map((inv, idx) => {
                  // Fall back to the denormalised name/grade/parent fields on
                  // the invitation row so a missing Heidi record doesn't make
                  // a confirmed student vanish from the roster.
                  const looked = resolveStudentById(students, inv.studentId);
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
                  return (
                    <SortableInvitationRow
                      key={inv.id}
                      inv={inv}
                      student={student}
                      position={idx + 1}
                      interactive={interactive}
                      canDrag={canDrag}
                      academyView={academyView}
                      onAttended={() => setAttendance(inv.id, "attended")}
                      onNoShow={() => setAttendance(inv.id, "no_show")}
                      onReset={() => setAttendance(inv.id, "confirmed")}
                      onReschedule={() => setRescheduleInv(inv)}
                      onSetPaid={(paid, pkg) => void setInvitationPaid(inv.id, paid, pkg)}
                      onToggleVideo={() => void setInvitationVideoSent(inv.id, !inv.videoSentToParent)}
                      onOpenDetail={() => setDetailInv(inv)}
                    />
                  );
                })}
              </tbody>
            </SortableContext>
          </table>
        </div>
      )}

      {/* Row-end detail / edit modal (+ the reschedule flow it hands off to) */}
      <InvitationDetailModal
        open={detailInv !== null}
        onClose={() => setDetailInv(null)}
        invitation={detailInv}
        session={session}
        editable={!academyView && canEdit}
        onReschedule={(inv) => { setDetailInv(null); setRescheduleInv(inv); }}
      />
      <RescheduleModal
        open={rescheduleInv !== null}
        onClose={() => setRescheduleInv(null)}
        invitation={rescheduleInv}
      />
    </div>
  );
}

function SortableInvitationRow({
  inv, student, position, interactive, canDrag, academyView,
  onAttended, onNoShow, onReset, onReschedule, onSetPaid, onToggleVideo, onOpenDetail,
}: {
  inv: Invitation;
  student: Student;
  position: number;
  /** True only when the viewer may change things (branch, non-draft event).
   *  Academy is always read-only. */
  interactive: boolean;
  canDrag: boolean;
  academyView: boolean;
  onAttended: () => void;
  onNoShow: () => void;
  onReset: () => void;
  onReschedule: () => void;
  onSetPaid: (paid: boolean, pkg?: PackageOption | null) => void;
  onToggleVideo: () => void;
  onOpenDetail: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: inv.id,
    disabled: !canDrag,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    background: isDragging ? "var(--color-ivory-100)" : undefined,
  };
  const branchInfo = BRANCHES.find(b => b.code === inv.branch);

  return (
    <tr ref={setNodeRef} style={style} {...attributes}>
      <td className="text-right fa-mono text-ink-500">{position}</td>
      {canDrag && (
        <td>
          <button
            type="button"
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-ink-400 hover:text-ink-700 p-1 rounded touch-none"
            aria-label={`Drag ${student.name} to reorder or move to another session`}
            title="Drag to reorder or transfer"
          >
            <GripVertical className="w-4 h-4" />
          </button>
        </td>
      )}
      <td>
        <div className="font-medium text-ink-900">{student.name}</div>
        <div className="text-xs text-ink-400">#{student.id}</div>
        {arrivalLabel(inv.arrivalWindow, inv.arrivalTime) && (
          <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-violet-700" title="Expected arrival">
            <Clock className="w-3 h-3" />
            {arrivalLabel(inv.arrivalWindow, inv.arrivalTime)}
          </div>
        )}
      </td>
      <td>
        <span className="font-mono text-xs font-semibold text-ink-700 bg-ivory-200 px-2 py-0.5 rounded" title={branchInfo?.name}>
          {inv.branch}
        </span>
      </td>
      <td className="font-mono text-sm">G{inv.targetGrade ?? student.grade}</td>
      <td>
        {/* Read-only mirror of the branch view's Type — set when inviting,
            shown here for reference only (no flip control). */}
        <span
          className={`inline-block px-2 py-1 rounded-md text-[10px] font-bold uppercase text-white ${
            inv.inviteType === "renewal"
              ? "bg-gradient-to-r from-cyan-500 to-teal-500"
              : "bg-gradient-to-r from-violet-500 to-fuchsia-500"
          }`}
          style={{ letterSpacing: "0.06em" }}
          title="Set in the branch invite view — read-only here"
        >
          {inv.inviteType === "renewal" ? "Renewal" : "Progress"}
        </span>
      </td>
      <td>
        <div className="text-sm text-ink-900">{student.parentName}</div>
        <div className="text-xs text-ink-400 font-mono">{student.parentPhone}</div>
      </td>
      <td>
        {inv.confirmedAt ? (
          <StatusPill tone="success" showDot={false}>
            <CheckCircle2 className="w-3 h-3 inline mr-1" />
            Confirmed
          </StatusPill>
        ) : (
          <span className="text-xs text-ink-400">—</span>
        )}
      </td>
      <td>
        <div className="flex items-center gap-1 justify-end flex-wrap">
          <button
            onClick={onAttended}
            disabled={!interactive}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              inv.status === "attended"
                ? "bg-success-soft text-success ring-1 ring-success/30"
                : "text-ink-500 hover:bg-ivory-200"
            } ${!interactive ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
            Present
          </button>
          <button
            onClick={onNoShow}
            disabled={!interactive}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              inv.status === "no_show"
                ? "bg-danger-soft text-danger ring-1 ring-danger/30"
                : "text-ink-500 hover:bg-ivory-200"
            } ${!interactive ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            <XCircle className="w-3.5 h-3.5 inline mr-1" />
            Absent
          </button>
          {interactive && (
            <button
              onClick={onReschedule}
              className="px-2.5 py-1.5 rounded text-xs font-medium text-violet-700 hover:bg-violet-50 transition-colors"
              title="Reschedule to another session"
            >
              <CalendarClock className="w-3.5 h-3.5 inline mr-1" />
              Reschedule
            </button>
          )}
          {(inv.status === "attended" || inv.status === "no_show") && interactive && (
            <button
              onClick={onReset}
              className="text-xs text-ink-400 hover:text-ink-700 px-2"
              title="Reset to awaiting"
            >
              Reset
            </button>
          )}
        </div>
      </td>
      <td>
        {/* Paid applies to RENEWAL students (regardless of attendance).
            Progress students never pay here, so they show a dim placeholder. */}
        {inv.inviteType === "renewal" ? (
          <PaidCell inv={inv} interactive={interactive} onSetPaid={onSetPaid} />
        ) : (
          <span className="text-ink-300 italic text-xs">—</span>
        )}
      </td>
      <td>
        {/* Absence follow-up. The control only "sends" once a video link has
            been pasted (in Edit/Detail): no link → can't send; link → Send;
            already sent → Sent. */}
        <VideoToParentCell inv={inv} interactive={interactive} onToggleVideo={onToggleVideo} />
      </td>
      <td className="text-right">
        <button
          type="button"
          onClick={onOpenDetail}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border border-ivory-300 text-ink-600 hover:bg-ivory-100 hover:text-ink-900 transition-colors"
          title={academyView ? "View student detail" : "Edit invitation"}
        >
          {academyView ? <Eye className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
          {academyView ? "Detail" : "Edit"}
        </button>
      </td>
    </tr>
  );
}

/* ── Paid cell ──────────────────────────────────────────────────────────────
 * Renewal students only. Marking as PAID requires picking which package
 * (3M/6M/12M/18M/24M) in the same action — a small popover, not a plain
 * toggle. Marking back to unpaid is a direct click (server clears the
 * package automatically). Already-paid shows "Paid · 6M" etc.
 */
function PaidCell({
  inv, interactive, onSetPaid,
}: {
  inv: Invitation;
  interactive: boolean;
  onSetPaid: (paid: boolean, pkg?: PackageOption | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  // The roster table sits in an `overflow-hidden` wrapper (for its rounded
  // corners) — an absolutely-positioned popover would get clipped the moment
  // it runs past that boundary (only "Package / 3M" visible, the rest cut
  // off). Portal it to <body> instead, positioned from the button's actual
  // screen coordinates, so it always renders on top and in full regardless
  // of any ancestor's overflow.
  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setCoords({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  if (inv.paid) {
    return (
      <button
        type="button"
        onClick={() => interactive && onSetPaid(false)}
        disabled={!interactive}
        title="Paid — click to mark unpaid"
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold uppercase transition-all bg-emerald-100 text-emerald-700 border border-emerald-300 hover:bg-emerald-200 ${!interactive ? "opacity-60 cursor-not-allowed" : ""}`}
        style={{ letterSpacing: "0.06em" }}
      >
        <DollarSign className="w-3 h-3" />
        Paid{inv.package ? ` · ${inv.package}` : ""}
      </button>
    );
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => interactive && setOpen(v => !v)}
        disabled={!interactive}
        title="Mark this renewal student as paid"
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold uppercase transition-all bg-ivory-100 text-ink-500 border border-ivory-300 hover:bg-ivory-200 ${!interactive ? "opacity-60 cursor-not-allowed" : ""}`}
        style={{ letterSpacing: "0.06em" }}
      >
        <DollarSign className="w-3 h-3" />
        Unpaid
      </button>
      {open && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-50 rounded-lg bg-white border border-ivory-300 shadow-xl p-1.5"
          style={{ width: 120, top: coords.top, left: coords.left }}
        >
          <div className="text-[9px] uppercase tracking-wider text-ink-400 font-semibold px-1.5 pt-0.5 pb-1">
            Package
          </div>
          {PACKAGE_OPTIONS.map(pkg => (
            <button
              key={pkg}
              type="button"
              onClick={() => { setOpen(false); onSetPaid(true, pkg); }}
              className="w-full text-left px-2 py-1.5 rounded text-xs font-semibold text-ink-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
            >
              {pkg}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

/* ── Video-to-Parent cell ───────────────────────────────────────────────────
 * Only relevant for absent (no_show) students. The Send action unlocks once a
 * link has been pasted in Edit/Detail:
 *   no link            → "No link" (disabled — paste one first)
 *   link, not sent     → "Send"    (opens the link + marks sent)
 *   link, sent         → "Sent"    (click to undo, branch only)
 * Academy sees the state read-only.
 */
function VideoToParentCell({
  inv, interactive, onToggleVideo,
}: {
  inv: Invitation;
  interactive: boolean;
  onToggleVideo: () => void;
}) {
  if (inv.status !== "no_show") {
    return <span className="text-ink-300 italic text-xs">—</span>;
  }

  const link = (inv.videoLink ?? "").trim();
  const hasLink = link.length > 0;
  const sent = inv.videoSentToParent;

  // No link yet → can't send. Show a muted, disabled chip.
  if (!hasLink) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold uppercase bg-ivory-100 text-ink-400 border border-ivory-300 cursor-not-allowed"
        style={{ letterSpacing: "0.06em" }}
        title="Paste a video link in Edit/Detail first, then you can send it."
      >
        <Ban className="w-3 h-3" /> No link
      </span>
    );
  }

  function handleClick() {
    if (!interactive) return;
    if (!sent) {
      // "Send" — open the link so staff can forward it, then mark as sent.
      try { window.open(link, "_blank", "noopener,noreferrer"); } catch { /* ignore */ }
      onToggleVideo();
    } else {
      // Undo
      onToggleVideo();
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!interactive}
      title={sent ? "Sent to parent — click to undo" : "Send the make-up video link to the parent"}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold uppercase transition-all ${
        sent
          ? "bg-sky-100 text-sky-700 border border-sky-300 hover:bg-sky-200"
          : "bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100"
      } ${!interactive ? "opacity-60 cursor-not-allowed" : ""}`}
      style={{ letterSpacing: "0.06em" }}
    >
      {sent ? <Video className="w-3 h-3" /> : <Send className="w-3 h-3" />}
      {sent ? "Sent" : "Send"}
    </button>
  );
}
