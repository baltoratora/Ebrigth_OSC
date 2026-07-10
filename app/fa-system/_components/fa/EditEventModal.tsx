"use client";

import { useState } from "react";
import { Modal } from "@fa/_components/shared/Modal";
import { AlertCircle } from "lucide-react";
import { EventStatus } from "@fa/_types";

export type EditableEvent = {
  name: string;
  venue: string;
  notes?: string;
  invitationOpenDate: string;
  invitationCloseDate: string;
  status: EventStatus;
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
  const [openD,  setOpenD]  = useState(event.invitationOpenDate);
  const [closeD, setCloseD] = useState(event.invitationCloseDate);

  return (
    <Modal open={open} onClose={onClose} kicker="Event" title="Edit event" size="md">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ status, name, venue, notes, invitationOpenDate: openD, invitationCloseDate: closeD });
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
        <div className="rounded-[10px] bg-ivory-100 text-ink-600 text-xs px-3 py-2.5 flex items-start gap-2 border border-gold-200">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gold-500" />
          <span>To change event dates or number of days, delete and recreate the event.</span>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="fa-btn-secondary">Cancel</button>
          <button type="submit" className="fa-btn-primary">Save</button>
        </div>
      </form>
    </Modal>
  );
}
