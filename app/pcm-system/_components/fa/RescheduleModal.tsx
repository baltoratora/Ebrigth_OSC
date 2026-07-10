"use client";

import { useState, useMemo } from "react";
import { Modal } from "@pcm/_components/shared/Modal";
import { useFAStore } from "@pcm/_lib/store";
import { Invitation, ArrivalWindow } from "@pcm/_types";
import { CalendarClock, ArrowRight, AlertTriangle, Clock } from "lucide-react";
import { addDays, format, parseISO } from "date-fns";

interface Props {
  open: boolean;
  onClose: () => void;
  invitation: Invitation | null;
  /** Optional callback fired after the reschedule succeeds. The parent can
   *  use it to refresh local state, close a toast, etc. */
  onRescheduled?: () => void;
}

/**
 * Lets the BM move a single invitation to:
 *   • a different session within the SAME event, OR
 *   • a session inside a DIFFERENT event entirely (e.g. roll to next week)
 *
 * Two pickers: Event (defaults to the invitation's current event) and
 * Session (the picker only shows sessions where this branch has at least
 * one quota — otherwise the BM can't legally schedule there).
 *
 * The current placement is shown at the top so the BM doesn't accidentally
 * pick the same session they're already in.
 *
 * Cross-event moves can fail at the DB level if the student already has an
 * invitation for the same target_grade in the destination event (the
 * (event, student, grade) unique trips). That error surfaces inline.
 */
export function RescheduleModal({ open, onClose, invitation, onRescheduled }: Props) {
  const events      = useFAStore(s => s.events);
  const sessions    = useFAStore(s => s.sessions);
  const quotas      = useFAStore(s => s.quotas);
  const invitations = useFAStore(s => s.invitations);
  const reschedule  = useFAStore(s => s.rescheduleInvitation);
  const setArrival  = useFAStore(s => s.setInvitationArrival);
  const students    = useFAStore(s => s.students);

  // Initial picks fall back to the invitation's own values. Reset when a
  // different invitation comes in via useMemo as a tiny side-effect.
  const [targetEventId, setTargetEventId]     = useState<string>("");
  const [targetSessionId, setTargetSessionId] = useState<string>("");
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Expected arrival — seeded from the invitation; the BM can update it here
  // since the coming time often changes when a student reschedules.
  const [arrivalWindow, setArrivalWindow] = useState<ArrivalWindow | "">("");
  const [arrivalTime, setArrivalTime]     = useState<string>("");

  useMemo(() => {
    if (invitation) {
      setTargetEventId(invitation.eventId);
      setTargetSessionId(invitation.sessionId);
      setArrivalWindow(invitation.arrivalWindow ?? "");
      setArrivalTime(invitation.arrivalTime ?? "");
    }
    setError(null);
  }, [invitation?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sort events newest-first.
  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [events],
  );

  // Sessions inside the picked event where this branch has a quota set.
  // No-quota sessions are still shown but flagged so the BM knows they'd
  // be writing into a session marketing never allocated for them.
  const sessionsInTarget = useMemo(() => {
    if (!invitation || !targetEventId) return [];
    return sessions
      .filter(s => s.eventId === targetEventId)
      .map(s => {
        const q = quotas.find(q => q.sessionId === s.id && q.branch === invitation.branch);
        const invited = invitations.filter(
          i => i.sessionId === s.id && i.branch === invitation.branch
        ).length;
        return { session: s, quota: q?.quota ?? 0, invited };
      })
      .sort((a, b) =>
        a.session.dayNumber - b.session.dayNumber ||
        a.session.sessionNumber - b.session.sessionNumber,
      );
  }, [sessions, quotas, invitations, targetEventId, invitation]);

  const currentEvent   = events.find(e => e.id === invitation?.eventId);
  const currentSession = sessions.find(s => s.id === invitation?.sessionId);
  const targetEvent    = events.find(e => e.id === targetEventId);
  const targetSession  = sessions.find(s => s.id === targetSessionId);
  const targetQuota    = quotas.find(q => q.sessionId === targetSessionId && q.branch === invitation?.branch);

  const sameAsCurrent: boolean =
    !!invitation &&
    targetEventId === invitation.eventId &&
    targetSessionId === invitation.sessionId;

  // The arrival (coming time) differs from what's saved on the invitation.
  const arrivalChanged: boolean =
    !!invitation &&
    ((arrivalWindow || null) !== (invitation.arrivalWindow ?? null) ||
     (arrivalTime.trim() || null) !== (invitation.arrivalTime ?? null));

  const studentName = students.find(s => s.id === invitation?.studentId)?.name ?? invitation?.studentId ?? "";

  /**
   * Given the day_number (1-indexed) of a session within an event, return
   * the actual calendar date for that session by offsetting the event's
   * start_date. Used to render "Wed 22 May" instead of the confusing
   * "Day 3" — academy feedback was that day-number alone was hard to
   * map to a weekday.
   */
  function sessionDateLabel(eventId: string | undefined, dayNumber: number, fmt: string): string {
    if (!eventId) return `Day ${dayNumber}`;
    const ev = events.find(e => e.id === eventId);
    if (!ev) return `Day ${dayNumber}`;
    const d = addDays(parseISO(ev.startDate), dayNumber - 1);
    return format(d, fmt);
  }

  async function handleConfirm() {
    if (!invitation || !targetEventId || !targetSessionId) return;
    setBusy(true);
    setError(null);
    try {
      // Only move the slot when it actually changed — re-saving the same
      // session would needlessly reset the attendance verdict.
      if (!sameAsCurrent) {
        await reschedule(invitation.id, targetEventId, targetSessionId);
      }
      // Persist the (possibly updated) coming time too — only if it changed.
      const win = arrivalWindow || null;
      const time = arrivalTime.trim() || null;
      if (win !== (invitation.arrivalWindow ?? null) || time !== (invitation.arrivalTime ?? null)) {
        await setArrival(invitation.id, win, time);
      }
      onRescheduled?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reschedule failed");
    } finally {
      setBusy(false);
    }
  }

  if (!invitation) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      kicker="Reschedule student"
      title={`Move ${studentName} to a new slot`}
      description="Pick the new event and session. Quotas don't need to match — the move always goes through."
      size="lg"
    >
      <div className="space-y-5">
        {/* Current placement */}
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
          <div
            className="fa-mono text-[10px] uppercase text-amber-700 font-bold mb-1"
            style={{ letterSpacing: "0.1em" }}
          >
            Currently
          </div>
          <div className="text-sm text-ink-900">
            <strong>{currentEvent?.name ?? "—"}</strong>
            {currentSession && (
              <>
                <span className="text-ink-400 mx-2">·</span>
                {sessionDateLabel(currentEvent?.id, currentSession.dayNumber, "EEE d MMM")}
                <span className="text-ink-400 mx-1">·</span>
                Session {currentSession.sessionNumber}
                <span className="text-ink-400 mx-1">·</span>
                <span className="font-mono">{currentSession.startTime}–{currentSession.endTime}</span>
              </>
            )}
          </div>
        </div>

        {/* New placement pickers */}
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="fa-label flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5 text-violet-500" />
              New event
            </label>
            <select
              className="fa-input"
              value={targetEventId}
              onChange={e => {
                setTargetEventId(e.target.value);
                // Snap session to the first one in the new event so the
                // BM never sees an invalid combination.
                const firstInNew = sessions
                  .filter(s => s.eventId === e.target.value)
                  .sort((a, b) => a.dayNumber - b.dayNumber || a.sessionNumber - b.sessionNumber)[0];
                setTargetSessionId(firstInNew?.id ?? "");
              }}
            >
              {sortedEvents.length === 0 && <option value="">(no events)</option>}
              {sortedEvents.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {ev.name} ({format(parseISO(ev.startDate), "d MMM")})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="fa-label">New session</label>
            {sessionsInTarget.length === 0 ? (
              <div className="rounded-lg bg-ivory-100 border border-ivory-300 text-xs text-ink-500 p-3 italic">
                The chosen event has no sessions yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto">
                {sessionsInTarget.map(({ session, quota, invited }) => {
                  const isCurrent =
                    session.id === invitation.sessionId &&
                    targetEventId === invitation.eventId;
                  const isPicked = session.id === targetSessionId;
                  const hasQuota = quota > 0;
                  const full = hasQuota && invited >= quota;
                  return (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => setTargetSessionId(session.id)}
                      className={`text-left rounded-xl border-2 p-3 transition-colors ${
                        isPicked
                          ? "border-violet-500 bg-violet-50 ring-2 ring-violet-200"
                          : "border-ivory-300 bg-white hover:border-violet-300 hover:bg-violet-50/40"
                      } ${isCurrent ? "opacity-60" : ""}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div
                          className="fa-mono text-[10px] uppercase font-bold text-violet-700"
                          style={{ letterSpacing: "0.08em" }}
                        >
                          {sessionDateLabel(targetEventId, session.dayNumber, "EEE d MMM")} · Session {session.sessionNumber}
                        </div>
                        {isCurrent && (
                          <span className="fa-mono text-[9px] uppercase text-amber-700">Current</span>
                        )}
                      </div>
                      <div className="font-mono text-sm text-ink-900">
                        {session.startTime} – {session.endTime}
                      </div>
                      <div className="text-[11px] text-ink-500 mt-1">
                        {hasQuota ? (
                          <>
                            <strong className={full ? "text-rose-600" : "text-ink-700"}>
                              {invited}
                            </strong>
                            <span className="text-ink-400"> / {quota} branch slots</span>
                            {full && <span className="text-rose-600 ml-1">· full</span>}
                          </>
                        ) : (
                          <span className="text-amber-700">No quota for this branch</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Expected arrival — when the parent is coming, so responders can
            schedule without phoning the branch. */}
        <div>
          <label className="fa-label flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-violet-500" />
            When is the parent coming?
          </label>
          <div className="flex items-center gap-2">
            <select
              className="fa-input"
              style={{ maxWidth: "180px" }}
              value={arrivalWindow}
              onChange={e => setArrivalWindow(e.target.value as ArrivalWindow | "")}
            >
              <option value="">— Not set —</option>
              <option value="before_class">Before class</option>
              <option value="after_class">After class</option>
              <option value="during_class">During class</option>
            </select>
            <input
              type="text"
              value={arrivalTime}
              onChange={e => setArrivalTime(e.target.value)}
              placeholder="exact time e.g. 3:30 PM (optional)"
              className="fa-input flex-1"
            />
          </div>
        </div>

        {/* Move summary */}
        {targetSession && (
          <div className="rounded-xl bg-violet-50 border border-violet-200 px-4 py-3 flex items-center gap-3 flex-wrap">
            <div className="text-xs text-ink-500">After save:</div>
            <span className="text-sm text-ink-900">
              {currentEvent?.name} · {currentSession ? sessionDateLabel(currentEvent?.id, currentSession.dayNumber, "EEE") : ""}·S{currentSession?.sessionNumber}
            </span>
            <ArrowRight className="w-4 h-4 text-violet-600" />
            <span className="text-sm text-ink-900 font-semibold">
              {targetEvent?.name} · {sessionDateLabel(targetEventId, targetSession.dayNumber, "EEE")}·S{targetSession.sessionNumber}
              <span className="font-mono text-ink-500 ml-1">
                ({targetSession.startTime}–{targetSession.endTime})
              </span>
            </span>
            {targetQuota && targetQuota.quota > 0 && (
              <span className="ml-auto text-[11px] text-violet-700">
                ✓ branch has {targetQuota.quota} slot{targetQuota.quota > 1 ? "s" : ""} here
              </span>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="fa-btn-secondary">Cancel</button>
          <button
            type="button"
            disabled={busy || !targetEventId || !targetSessionId || (sameAsCurrent && !arrivalChanged)}
            onClick={handleConfirm}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white font-semibold shadow
                       bg-gradient-to-r from-violet-600 to-fuchsia-600
                       hover:from-violet-700 hover:to-fuchsia-700
                       disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            title={sameAsCurrent && !arrivalChanged ? "Pick a different session or set a coming time to enable" : ""}
          >
            <CalendarClock className="w-4 h-4" />
            {busy ? "Saving…" : sameAsCurrent ? "Save coming time" : "Reschedule"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
