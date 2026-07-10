"use client";

import { useState } from "react";
import { Modal } from "@pcm/_components/shared/Modal";
import { Session } from "@pcm/_types";

export function SessionFormModal({
  open, onClose, session, eventId, maxDays, existingSessions, defaultDayNumber, onSave,
}: {
  open: boolean; onClose: () => void; session: Session | null;
  eventId: string; maxDays: number; existingSessions: Session[];
  /** When opening to create a new session from a specific day's "+" button. */
  defaultDayNumber?: number;
  onSave: (data: Omit<Session, "id" | "eventId">) => void;
}) {
  void eventId;
  const initialDay = session?.dayNumber ?? defaultDayNumber ?? 1;
  const [dayNumber,     setDayNumber]     = useState<number>(initialDay);
  const [sessionNumber, setSessionNumber] = useState<number>(
    session?.sessionNumber ?? (existingSessions.filter(s => s.dayNumber === initialDay).length + 1)
  );
  const [startTime,     setStartTime]     = useState(session?.startTime ?? "09:00");
  const [endTime,       setEndTime]       = useState(session?.endTime ?? "10:00");
  const [label,         setLabel]         = useState(session?.label ?? "");
  const [error,         setError]         = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (startTime >= endTime) return setError("End time must be after start time.");
    const dup = existingSessions.find(s => s.dayNumber === dayNumber && s.sessionNumber === sessionNumber && s.id !== session?.id);
    if (dup) return setError(`Session ${sessionNumber} already exists on day ${dayNumber}.`);
    // Two sessions overlap if one starts before the other ends, on both sides.
    // "HH:MM" strings compare lexicographically the same way as time, so
    // string compare is correct here.
    const overlap = existingSessions.find(s =>
      s.dayNumber === dayNumber &&
      s.id !== session?.id &&
      startTime < s.endTime &&
      endTime > s.startTime
    );
    if (overlap) {
      return setError(
        `Overlaps with Session ${overlap.sessionNumber} (${overlap.startTime}–${overlap.endTime}) on day ${dayNumber}.`
      );
    }
    onSave({ dayNumber, sessionNumber, startTime, endTime, label: label.trim() || undefined });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      kicker={session ? "Edit session" : "New session"}
      title={session ? "Edit session" : "Add session"}
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="fa-label">Day</label>
            <select className="fa-input" value={dayNumber} onChange={e => setDayNumber(Number(e.target.value))}>
              {Array.from({ length: maxDays }, (_, i) => i + 1).map(d => (
                <option key={d} value={d}>Day {d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="fa-label">Session #</label>
            <input type="number" min={1} className="fa-input" value={sessionNumber} onChange={e => setSessionNumber(Number(e.target.value))} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="fa-label">Start time</label>
            <input type="time" className="fa-input" value={startTime} onChange={e => setStartTime(e.target.value)} />
          </div>
          <div>
            <label className="fa-label">End time</label>
            <input type="time" className="fa-input" value={endTime} onChange={e => setEndTime(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="fa-label">Label (optional)</label>
          <input className="fa-input" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Morning Batch A" />
        </div>
        {error && <div className="text-sm text-danger bg-danger-soft rounded-md px-3 py-2">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="fa-btn-secondary">Cancel</button>
          <button type="submit" className="fa-btn-primary">{session ? "Save" : "Add session"}</button>
        </div>
      </form>
    </Modal>
  );
}
