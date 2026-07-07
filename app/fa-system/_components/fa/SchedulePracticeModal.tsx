"use client";

import { useState } from "react";
import { CalendarClock, Check, AlertCircle } from "lucide-react";
import { Modal } from "@fa/_components/shared/Modal";

/**
 * Shown right after a BM confirms an invitation: lets them pick a date + time
 * for the student's practice session. BOTH fields are OPTIONAL — this never
 * gates anything. Whether the BM fills this in, skips it, or leaves it blank,
 * the student appears in the Practice sidebar the same way (that list is
 * driven purely by confirmed status, not by having a scheduled date/time).
 * Can also be reopened later from the Practice sidebar to set/change it.
 */
export function SchedulePracticeModal({
  open, onClose, studentName, initialDate = "", initialTime = "", onSave,
}: {
  open: boolean;
  onClose: () => void;
  studentName: string;
  initialDate?: string;
  initialTime?: string;
  /** Saves whatever was provided (either field can be blank). Resolves on
   *  success; rejects with a message. */
  onSave: (args: { practiceDate: string | null; practiceTime: string | null }) => Promise<void>;
}) {
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setDate(initialDate); setTime(initialTime); setBusy(false); setError(null);
  }
  function handleClose() { if (!busy) { reset(); onClose(); } }

  async function handleSave() {
    setBusy(true); setError(null);
    try {
      await onSave({ practiceDate: date || null, practiceTime: time || null });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed — please try again.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Schedule practice session"
      description={`${studentName} is confirmed. Pick a date and time for their practice session — both are optional.`}
      size="md"
    >
      <div className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 text-sm text-danger bg-danger-soft rounded-md px-3 py-2" role="alert">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className="flex items-center gap-1.5 text-sm font-semibold text-ink-800 mb-1.5">
            <CalendarClock className="w-4 h-4 text-ink-400" /> Practice date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={busy}
            className="fa-input w-full"
          />
        </div>

        <div>
          <label className="text-sm font-semibold text-ink-800 mb-1.5 block">Practice time</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            disabled={busy}
            className="fa-input w-full"
          />
        </div>

        <p className="text-xs text-ink-400">
          Skipping this is fine — {studentName.split(" ")[0]} will still show up in the Practice list either way.
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-5 mt-5 border-t border-ivory-300">
        <button onClick={handleClose} disabled={busy} className="fa-btn-secondary disabled:opacity-50">Skip</button>
        <button onClick={handleSave} disabled={busy} className="fa-btn-primary disabled:opacity-50">
          <Check className="w-4 h-4" /> {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}
