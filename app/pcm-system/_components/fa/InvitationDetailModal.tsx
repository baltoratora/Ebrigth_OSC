"use client";

import { useEffect, useState } from "react";
import { Modal } from "@pcm/_components/shared/Modal";
import { useFAStore } from "@pcm/_lib/store";
import { BRANCHES, Invitation, resolveStudentById, ArrivalWindow, arrivalLabel } from "@pcm/_types";
import { CalendarClock, CheckCircle2, XCircle, DollarSign, Video, Send, Clock } from "lucide-react";

interface Coach {
  id: string;
  name: string;
}

/**
 * Row-end detail panel for the attendance roster.
 *
 *   • Academy (editable = false) → read-only summary of the student + invite.
 *   • Branch  (editable = true)  → can flip Progress/Renewal, reassign the
 *     coach, and jump to the Reschedule flow (handled by the parent so the
 *     RescheduleModal lives at the roster level).
 */
export function InvitationDetailModal({
  open, onClose, invitation, session, editable, onReschedule,
}: {
  open: boolean;
  onClose: () => void;
  invitation: Invitation | null;
  session: { dayNumber: number; sessionNumber: number; startTime: string; endTime: string; label?: string };
  editable: boolean;
  onReschedule: (inv: Invitation) => void;
}) {
  const students = useFAStore(s => s.students);
  const updateInviteType = useFAStore(s => s.updateInviteType);
  const assignCoach = useFAStore(s => s.assignCoachToInvitation);
  const setVideoLink = useFAStore(s => s.setInvitationVideoLink);
  const setArrival = useFAStore(s => s.setInvitationArrival);

  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [linkDraft, setLinkDraft] = useState("");
  const [savingLink, setSavingLink] = useState(false);

  // Seed the link editor whenever a (different) invitation opens.
  useEffect(() => {
    if (open) setLinkDraft(invitation?.videoLink ?? "");
  }, [open, invitation]);

  // Load the branch's coaches only when an editable (branch) modal is open.
  useEffect(() => {
    if (!open || !editable || !invitation) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/pcm/coaches?branch=${encodeURIComponent(invitation.branch)}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = (await res.json()) as { coaches: Coach[] };
        if (!cancelled) setCoaches(data.coaches ?? []);
      } catch {
        /* coaches are best-effort; the select just stays empty */
      }
    })();
    return () => { cancelled = true; };
  }, [open, editable, invitation]);

  if (!invitation) return null;
  const inv = invitation;

  const student = resolveStudentById(students, inv.studentId);
  const name = student?.name ?? inv.studentName ?? `#${inv.studentId}`;
  const grade = inv.targetGrade || student?.grade || 0;
  const parentName = student?.parentName ?? inv.studentParentName ?? "—";
  const parentPhone = student?.parentPhone ?? inv.studentParentPhone ?? "—";
  const branchName = BRANCHES.find(b => b.code === inv.branch)?.name ?? inv.branch;
  const isRenewal = inv.inviteType === "renewal";

  const attendanceLabel =
    inv.status === "attended" ? "Attended"
      : inv.status === "no_show" ? "Absent"
      : inv.status === "confirmed" ? "Awaiting"
      : inv.status;

  return (
    <Modal
      open={open}
      onClose={onClose}
      kicker={editable ? "Edit invitation" : "Student detail"}
      title={name}
      description={`Day ${session.dayNumber} · Session ${session.sessionNumber} · ${session.startTime}–${session.endTime}`}
      size="md"
    >
      {/* Identity grid */}
      <div className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm mb-4">
        <span className="text-ink-400">Student ID</span>
        <span className="font-mono text-ink-700">#{inv.studentId}</span>
        <span className="text-ink-400">Branch</span>
        <span className="text-ink-800">
          <span className="font-mono text-xs font-semibold bg-ivory-200 px-2 py-0.5 rounded mr-2">{inv.branch}</span>
          {branchName}
        </span>
        <span className="text-ink-400">Grade</span>
        <span className="font-mono text-ink-800">G{grade}</span>
        <span className="text-ink-400">Parent</span>
        <span className="text-ink-800">
          {parentName}
          <span className="block text-xs text-ink-400 font-mono">{parentPhone}</span>
        </span>
      </div>

      <hr className="border-0 border-t border-ivory-300 my-4" />

      {/* Type */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-sm text-ink-500">Type</span>
        {editable ? (
          <div className="inline-flex rounded-md overflow-hidden border border-ivory-300">
            {(["progress", "renewal"] as const).map(t => {
              const active = inv.inviteType === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => { if (!active) void updateInviteType(inv.id, t); }}
                  className={`px-3 py-1.5 text-[11px] font-bold uppercase transition-colors ${
                    active
                      ? t === "renewal"
                        ? "bg-gradient-to-r from-cyan-500 to-teal-500 text-white"
                        : "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white"
                      : "bg-white text-ink-500 hover:bg-ivory-100"
                  }`}
                  style={{ letterSpacing: "0.06em" }}
                >
                  {t === "renewal" ? "Renewal" : "Progress"}
                </button>
              );
            })}
          </div>
        ) : (
          <span
            className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase text-white ${
              isRenewal
                ? "bg-gradient-to-r from-cyan-500 to-teal-500"
                : "bg-gradient-to-r from-violet-500 to-fuchsia-500"
            }`}
            style={{ letterSpacing: "0.06em" }}
          >
            {isRenewal ? "Renewal" : "Progress"}
          </span>
        )}
      </div>

      {/* Coach */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-sm text-ink-500">Coach</span>
        {editable ? (
          <select
            className="fa-input text-xs"
            style={{ minWidth: "160px", paddingTop: "0.35rem", paddingBottom: "0.35rem" }}
            value={inv.coachId ?? ""}
            disabled={coaches.length === 0}
            onChange={(e) => {
              const id = e.target.value || null;
              const coach = id ? coaches.find(c => c.id === id) : null;
              void assignCoach(inv.id, id, coach ? coach.name : null);
            }}
          >
            <option value="">— Unassigned —</option>
            {coaches.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        ) : (
          <span className="text-sm text-ink-800">{inv.coachName ?? "—"}</span>
        )}
      </div>

      {/* Arrival — when the parent comes to the branch, so responders can
          schedule without phoning the branch. Branch sets it; academy reads it. */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-sm text-ink-500">Arrival</span>
        {editable ? (
          <div className="flex items-center gap-2">
            <select
              className="fa-input text-xs"
              style={{ minWidth: "130px", paddingTop: "0.35rem", paddingBottom: "0.35rem" }}
              value={inv.arrivalWindow ?? ""}
              onChange={(e) => {
                const w = (e.target.value || null) as ArrivalWindow | null;
                void setArrival(inv.id, w, inv.arrivalTime ?? null);
              }}
            >
              <option value="">— Not set —</option>
              <option value="before_class">Before class</option>
              <option value="after_class">After class</option>
              <option value="during_class">During class</option>
            </select>
            <input
              type="text"
              defaultValue={inv.arrivalTime ?? ""}
              placeholder="e.g. 3:30 PM"
              onBlur={(e) => {
                const t = e.target.value.trim();
                if (t !== (inv.arrivalTime ?? "")) {
                  void setArrival(inv.id, inv.arrivalWindow ?? null, t === "" ? null : t);
                }
              }}
              className="fa-input text-xs"
              style={{ width: "110px", paddingTop: "0.35rem", paddingBottom: "0.35rem" }}
            />
          </div>
        ) : (
          <span className="text-sm text-ink-800">{arrivalLabel(inv.arrivalWindow, inv.arrivalTime) || "—"}</span>
        )}
      </div>

      {/* Make-up video link — absence follow-up (paste once the student is absent) */}
      {inv.status === "no_show" && (
        <div className="mt-4 rounded-[10px] border border-amber-200 bg-amber-50/40 p-3">
          <div className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold mb-1.5">
            Make-up video link
          </div>
          {editable ? (
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={linkDraft}
                onChange={(e) => setLinkDraft(e.target.value)}
                placeholder="Paste the video link to send to the parent…"
                className="fa-input flex-1 text-xs py-1.5"
              />
              <button
                type="button"
                disabled={savingLink || linkDraft.trim() === (inv.videoLink ?? "").trim()}
                onClick={async () => {
                  setSavingLink(true);
                  try {
                    await setVideoLink(inv.id, linkDraft.trim() === "" ? null : linkDraft.trim());
                  } finally {
                    setSavingLink(false);
                  }
                }}
                className="fa-btn-secondary text-xs py-1.5 disabled:opacity-50"
              >
                {savingLink ? "Saving…" : "Save"}
              </button>
            </div>
          ) : inv.videoLink ? (
            <a
              href={inv.videoLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-violet-700 underline break-all"
            >
              {inv.videoLink}
            </a>
          ) : (
            <span className="text-xs text-ink-400 italic">No link added yet.</span>
          )}
          <p className="text-[11px] text-ink-400 mt-1.5">
            Once a link is saved, the “Video to Parent” button in the list becomes a <strong>Send</strong> action.
          </p>
        </div>
      )}

      {/* Read-only status block */}
      <div className="grid grid-cols-2 gap-2 mt-4">
        <StatusTile
          label="Confirmation"
          tone={inv.confirmedAt ? "green" : "muted"}
          icon={<CheckCircle2 className="w-3.5 h-3.5" />}
          text={inv.confirmedAt ? "Confirmed" : "Not confirmed"}
        />
        <StatusTile
          label="Attendance"
          tone={inv.status === "attended" ? "green" : inv.status === "no_show" ? "red" : "muted"}
          icon={inv.status === "no_show" ? <XCircle className="w-3.5 h-3.5" /> : inv.status === "attended" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
          text={attendanceLabel}
        />
        {isRenewal && inv.status === "attended" && (
          <StatusTile
            label="Payment"
            tone={inv.paid ? "green" : "amber"}
            icon={<DollarSign className="w-3.5 h-3.5" />}
            text={inv.paid ? "Paid" : "Unpaid"}
          />
        )}
        {inv.status === "no_show" && (
          <StatusTile
            label="Video to parent"
            tone={inv.videoSentToParent ? "blue" : "amber"}
            icon={inv.videoSentToParent ? <Video className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
            text={inv.videoSentToParent ? "Sent" : "Not sent"}
          />
        )}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between gap-2 pt-4 mt-4 border-t border-ivory-300">
        {editable ? (
          <button
            type="button"
            onClick={() => onReschedule(inv)}
            className="fa-btn-secondary inline-flex items-center gap-1.5"
          >
            <CalendarClock className="w-4 h-4" />
            Reschedule…
          </button>
        ) : <span />}
        <button type="button" onClick={onClose} className="fa-btn-primary">Done</button>
      </div>
    </Modal>
  );
}

function StatusTile({
  label, tone, icon, text,
}: {
  label: string;
  tone: "green" | "red" | "amber" | "blue" | "muted";
  icon: React.ReactNode;
  text: string;
}) {
  const cls = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    red: "bg-red-50 text-red-700 border-red-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    blue: "bg-sky-50 text-sky-700 border-sky-200",
    muted: "bg-ivory-100 text-ink-500 border-ivory-300",
  }[tone];
  return (
    <div className={`rounded-[10px] border px-3 py-2 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="flex items-center gap-1.5 text-sm font-semibold mt-0.5">
        {icon}
        {text}
      </div>
    </div>
  );
}
