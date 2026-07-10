"use client";

import { useMemo, useState } from "react";
import { Modal } from "@pcm/_components/shared/Modal";
import { AlertCircle, AlertTriangle } from "lucide-react";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { EventStatus } from "@pcm/_types";

export type EditableEvent = {
  name: string;
  venue: string;
  notes?: string;
  startDate: string;
  endDate: string;
  numberOfDays: number;
  invitationOpenDate: string;
  invitationCloseDate: string;
  status: EventStatus;
  /** Highest dayNumber currently in use across this event's sessions —
   *  passed in by the caller so the modal can warn (not block) when the
   *  user shortens the event below that day, which would silently hide
   *  sessions on later days from the calendar render. */
  maxSessionDay?: number;
};

export type EditEventPatch = Partial<EditableEvent>;

interface EditEventModalProps {
  open: boolean;
  onClose: () => void;
  event: EditableEvent;
  onSave: (patch: EditEventPatch) => void;
}

export function EditEventModal({ open, onClose, event, onSave }: EditEventModalProps) {
  const [status, setStatus] = useState<EventStatus>(event.status);
  const [name,   setName]   = useState(event.name);
  const [venue,  setVenue]  = useState(event.venue);
  const [notes,  setNotes]  = useState(event.notes ?? "");
  const [startD, setStartD] = useState(event.startDate);
  const [endD,   setEndD]   = useState(event.endDate);
  const [openD,  setOpenD]  = useState(event.invitationOpenDate);
  const [closeD, setCloseD] = useState(event.invitationCloseDate);

  // Recompute number-of-days from start+end so the user only has to think
  // about the calendar range; the integer day count derives automatically.
  const computedDays = useMemo(() => {
    if (!startD || !endD) return event.numberOfDays;
    const d = differenceInCalendarDays(parseISO(endD), parseISO(startD)) + 1;
    return d > 0 ? d : event.numberOfDays;
  }, [startD, endD, event.numberOfDays]);

  // What changed vs the original event — drives the inline summary so
  // Academy sees exactly what they're about to commit before clicking Save.
  const startChanged = startD !== event.startDate;
  const endChanged   = endD   !== event.endDate;
  const daysChanged  = computedDays !== event.numberOfDays;

  // Safety check: shortening the event below the highest session-day
  // currently scheduled would visually orphan those sessions (they still
  // exist in the DB but the calendar only renders Day 1..numberOfDays).
  // We warn — don't block — because Academy may want to do it deliberately
  // and clean up the sessions afterwards on the event page.
  const wouldOrphan = typeof event.maxSessionDay === "number"
    && event.maxSessionDay > computedDays;

  // End-before-start guard. Pure UI feedback; the server PATCH would
  // accept either order so we have to prevent it here.
  const endBeforeStart = startD && endD && parseISO(endD) < parseISO(startD);

  return (
    <Modal open={open} onClose={onClose} kicker="Event" title="Edit event" size="md">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (endBeforeStart) return;
          // Only send fields that actually changed — keeps the patch
          // minimal so the server-side UPDATE only touches what's needed.
          const patch: EditEventPatch = { status, name, venue, notes, invitationOpenDate: openD, invitationCloseDate: closeD };
          if (startChanged) patch.startDate = startD;
          if (endChanged)   patch.endDate   = endD;
          if (daysChanged)  patch.numberOfDays = computedDays;
          onSave(patch);
        }}
        className="space-y-4"
      >
        <div>
          <label className="fa-label">Status</label>
          <p className="text-xs text-ink-500 mb-1.5">
            Use this to correct mistakes. Normal status changes happen via the action bar on the event page.
          </p>
          <select className="fa-input" value={status} onChange={e => setStatus(e.target.value as EventStatus)}>
            <option value="draft">Draft</option>
            <option value="open">Open — BMs can invite</option>
            <option value="closed">Closed — invitations ended</option>
            <option value="ongoing">Ongoing — event is happening</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div>
          <label className="fa-label">Event name</label>
          <input className="fa-input" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <label className="fa-label">Venue</label>
          <input className="fa-input" value={venue} onChange={e => setVenue(e.target.value)} />
        </div>

        {/* Event date range. Number of days derives from the range so we
            don't expose three competing inputs (start, end, length) that
            could disagree. */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="fa-label">Event start</label>
            <input type="date" className="fa-input" value={startD} onChange={e => setStartD(e.target.value)} />
          </div>
          <div>
            <label className="fa-label">Event end</label>
            <input
              type="date"
              className="fa-input"
              value={endD}
              min={startD || undefined}
              onChange={e => setEndD(e.target.value)}
            />
          </div>
        </div>
        {daysChanged && (
          <div className="text-xs text-ink-500 -mt-2">
            New length: <strong className="text-ink-900">{computedDays} day{computedDays !== 1 ? "s" : ""}</strong>{" "}
            (was {event.numberOfDays}).
          </div>
        )}
        {endBeforeStart && (
          <div className="rounded-[10px] bg-rose-50 text-rose-700 text-xs px-3 py-2.5 flex items-start gap-2 border border-rose-200">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>Event end can&apos;t be before event start.</span>
          </div>
        )}
        {wouldOrphan && !endBeforeStart && (
          <div className="rounded-[10px] bg-amber-50 text-amber-800 text-xs px-3 py-2.5 flex items-start gap-2 border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-600" />
            <span>
              You already have sessions on day <strong>{event.maxSessionDay}</strong>, but the new range only has{" "}
              <strong>{computedDays}</strong> day{computedDays !== 1 ? "s" : ""}. Those later-day sessions will be hidden from the calendar (still in the DB) — delete them from the event page first if you don&apos;t need them.
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="fa-label">Invitation open</label>
            <input type="date" className="fa-input" value={openD} onChange={e => setOpenD(e.target.value)} />
          </div>
          <div>
            <label className="fa-label">Invitation close</label>
            <input type="date" className="fa-input" value={closeD} onChange={e => setCloseD(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="fa-label">Notes</label>
          <textarea className="fa-input min-h-[80px] resize-y" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="fa-btn-secondary">Cancel</button>
          <button type="submit" className="fa-btn-primary" disabled={!!endBeforeStart}>Save</button>
        </div>
      </form>
    </Modal>
  );
}
