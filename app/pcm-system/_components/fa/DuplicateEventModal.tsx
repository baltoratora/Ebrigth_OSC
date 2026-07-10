"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@pcm/_components/shared/Modal";
import { useFAStore } from "@pcm/_lib/store";
import { FAEvent } from "@pcm/_types";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { Copy } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  source: FAEvent | null;
}

/**
 * Light-weight clone form for an existing PCM event. Academy fills in only
 * the new name and start date; everything else (length, venue, session
 * layout, branch quotas) is carried over from the source event. The end
 * date and invitation-window dates are pre-filled by date-shifting the
 * source's offsets, so the typical "make next week's PCM" case is one
 * change (the start date).
 */
export function DuplicateEventModal({ open, onClose, source }: Props) {
  const duplicateEvent = useFAStore(s => s.duplicateEvent);
  const router = useRouter();

  // Default the new start date to "source startDate + numberOfDays" — i.e.
  // immediately after the source ends. Common case: schedule next week.
  const defaultStart = useMemo(() => {
    if (!source) return "";
    const next = addDays(parseISO(source.startDate), source.numberOfDays);
    return format(next, "yyyy-MM-dd");
  }, [source]);

  const [name, setName]             = useState("");
  const [startDate, setStartDate]   = useState(defaultStart);
  const [error, setError]           = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Re-seed when a new source comes in (e.g. user opens duplicate on a
  // different row without unmounting the modal).
  useMemo(() => {
    setName(source ? `${source.name} (copy)` : "");
    setStartDate(defaultStart);
    setError(null);
  }, [source, defaultStart]);

  // Compute derived dates so the user can see what they'll get.
  const derived = useMemo(() => {
    if (!source || !startDate) return null;
    const newStart = parseISO(startDate);
    const newEnd = addDays(newStart, source.numberOfDays - 1);
    // Shift the invitation window by the SAME delta as the event itself
    // so "invitations open 5 days before the event" stays true.
    const delta = differenceInCalendarDays(newStart, parseISO(source.startDate));
    const newInvOpen  = addDays(parseISO(source.invitationOpenDate),  delta);
    const newInvClose = addDays(parseISO(source.invitationCloseDate), delta);
    return {
      endDate: format(newEnd, "yyyy-MM-dd"),
      invOpen: format(newInvOpen, "yyyy-MM-dd"),
      invClose: format(newInvClose, "yyyy-MM-dd"),
      humanRange: `${format(newStart, "d MMM")} → ${format(newEnd, "d MMM yyyy")}`,
    };
  }, [source, startDate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!source) return;
    if (!name.trim())  return setError("New event name is required.");
    if (!startDate)    return setError("Start date is required.");
    if (!derived)      return;

    setSubmitting(true);
    try {
      const created = await duplicateEvent(source.id, {
        name: name.trim(),
        startDate,
        endDate: derived.endDate,
        invitationOpenDate: derived.invOpen,
        invitationCloseDate: derived.invClose,
      });
      onClose();
      router.push(`/pcm-system/academy/events/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not duplicate event");
      setSubmitting(false);
    }
  }

  if (!source) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      kicker="Duplicate event"
      title="Clone this week's setup"
      description="Sessions and branch quotas are copied 1:1. Only the name and dates change. Invitations are NOT cloned — the new event starts empty."
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-xl bg-violet-50 border border-violet-200 p-3 text-sm">
          <div className="fa-mono text-[10px] uppercase text-violet-700 font-bold mb-1" style={{ letterSpacing: "0.1em" }}>
            Source event
          </div>
          <div className="font-semibold text-ink-900">{source.name}</div>
          <div className="text-xs text-ink-500 mt-0.5">
            {format(parseISO(source.startDate), "d MMM")} → {format(parseISO(source.endDate), "d MMM yyyy")}
            · {source.numberOfDays} day{source.numberOfDays !== 1 ? "s" : ""}
          </div>
        </div>

        <div>
          <label className="fa-label">New event name</label>
          <input
            className="fa-input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. PCM Week 22 — Junior Showcase"
            autoFocus
          />
        </div>

        <div>
          <label className="fa-label">Start date</label>
          <input
            type="date"
            className="fa-input"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />
          {derived && (
            <p className="text-[11px] text-ink-500 mt-1">
              Will run <strong className="text-ink-700">{derived.humanRange}</strong>
              · invitations <span className="font-mono">{derived.invOpen} → {derived.invClose}</span>
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="fa-btn-secondary">Cancel</button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white font-semibold shadow
                       bg-gradient-to-r from-violet-600 to-fuchsia-600
                       hover:from-violet-700 hover:to-fuchsia-700
                       disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <Copy className="w-4 h-4" />
            {submitting ? "Duplicating…" : "Duplicate event"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
