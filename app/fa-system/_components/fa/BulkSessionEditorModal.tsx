"use client";

import { useMemo, useState } from "react";
import { addDays, parseISO } from "date-fns";
import { Modal } from "@fa/_components/shared/Modal";
import { FAEvent, Session } from "@fa/_types";

interface Props {
  open: boolean;
  onClose: () => void;
  event: FAEvent;
  existingSessions: Session[];
  /** Creates each new session sequentially. Caller wires this to the store. */
  onCreate: (data: Omit<Session, "id" | "eventId">) => Promise<unknown>;
}

interface NewRow {
  startTime: string;
  endTime: string;
  label: string;
}

/** Adds 1 hour to an "HH:MM" 24h time string, wrapping at 24h. */
function addHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "10:00";
  const next = (h + 1) % 24;
  return `${String(next).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Build N rows with sensible defaults: first row starts at 09:00 (or wherever
 *  the previous list ended), each subsequent row picks up where the last one
 *  ended. The user can edit any of these inline before saving. */
function generateRows(count: number, startFrom = "09:00", existing: NewRow[] = []): NewRow[] {
  const out = [...existing];
  if (count <= out.length) return out.slice(0, count);
  let cursor = out.length === 0 ? startFrom : out[out.length - 1].endTime;
  while (out.length < count) {
    const end = addHour(cursor);
    out.push({ startTime: cursor, endTime: end, label: "" });
    cursor = end;
  }
  return out;
}

/** Day-by-day bulk session creator. The user enters a count per day, gets
 *  prefilled time rows, edits them inline, and saves. Existing sessions are
 *  not touched — this only ADDS new sessions, picking up session numbers
 *  after whatever's already there. */
export function BulkSessionEditorModal({
  open, onClose, event, existingSessions, onCreate,
}: Props) {
  const days = Array.from({ length: event.numberOfDays }, (_, i) => (i + 1) as 1 | 2 | 3);

  // Per-day state: arrays of new rows the user wants to create.
  const [daysState, setDaysState] = useState<Record<number, NewRow[]>>(() => {
    const init: Record<number, NewRow[]> = {};
    for (const d of days) init[d] = [];
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventStart = useMemo(() => parseISO(event.startDate), [event.startDate]);

  // Existing-session info per day so we (a) display what's already there,
  // and (b) know which session number to start the new rows from.
  const existingByDay = useMemo(() => {
    const map: Record<number, Session[]> = {};
    for (const s of existingSessions) {
      (map[s.dayNumber] ??= []).push(s);
    }
    for (const d in map) map[d].sort((a, b) => a.sessionNumber - b.sessionNumber);
    return map;
  }, [existingSessions]);

  function setCount(day: number, rawCount: number) {
    const count = Math.max(0, Math.min(20, Math.floor(rawCount)));
    setDaysState(prev => ({
      ...prev,
      [day]: generateRows(count, defaultStartFor(day), prev[day] ?? []),
    }));
  }

  // For day N>1, default the first new session to start at the latest end time
  // already used that day; otherwise fall back to 09:00.
  function defaultStartFor(day: number): string {
    const last = (existingByDay[day] ?? []).slice(-1)[0];
    return last?.endTime ?? "09:00";
  }

  function updateRow(day: number, idx: number, patch: Partial<NewRow>) {
    setDaysState(prev => ({
      ...prev,
      [day]: (prev[day] ?? []).map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    }));
  }

  function removeRow(day: number, idx: number) {
    setDaysState(prev => ({
      ...prev,
      [day]: (prev[day] ?? []).filter((_, i) => i !== idx),
    }));
  }

  const totalNew = Object.values(daysState).reduce((sum, arr) => sum + arr.length, 0);

  function validate(): string | null {
    for (const d of days) {
      const rows = daysState[d] ?? [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (!r.startTime || !r.endTime) {
          return `Day ${d}, Session ${i + 1}: start and end time are required.`;
        }
        if (r.startTime >= r.endTime) {
          return `Day ${d}, Session ${i + 1}: end time must be after start time.`;
        }
      }
      // Overlap inside the same day (new rows + existing sessions).
      const dayRows = [
        ...(existingByDay[d] ?? []).map(s => ({ startTime: s.startTime, endTime: s.endTime, src: `existing #${s.sessionNumber}` })),
        ...rows.map((r, i) => ({ startTime: r.startTime, endTime: r.endTime, src: `new #${i + 1}` })),
      ];
      for (let i = 0; i < dayRows.length; i++) {
        for (let j = i + 1; j < dayRows.length; j++) {
          const a = dayRows[i], b = dayRows[j];
          if (a.startTime < b.endTime && b.startTime < a.endTime) {
            return `Day ${d}: ${a.src} overlaps ${b.src}.`;
          }
        }
      }
    }
    return null;
  }

  async function handleSave() {
    const err = validate();
    if (err) { setError(err); return; }
    setError(null);
    setSaving(true);
    try {
      for (const d of days) {
        const rows = daysState[d] ?? [];
        if (rows.length === 0) continue;
        const startNum = ((existingByDay[d] ?? []).reduce(
          (max, s) => Math.max(max, s.sessionNumber), 0
        )) + 1;
        for (let i = 0; i < rows.length; i++) {
          await onCreate({
            dayNumber: d,
            sessionNumber: startNum + i,
            startTime: rows[i].startTime,
            endTime: rows[i].endTime,
            label: rows[i].label.trim() || undefined,
          });
        }
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save sessions");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      kicker="Bulk add"
      title="Add sessions"
      description="Day-by-day. Enter how many sessions you want per day, then edit each session's time inline."
      size="lg"
    >
      <div className="space-y-5 max-h-[65vh] overflow-y-auto pr-1">
        {days.map(day => {
          const rows = daysState[day] ?? [];
          const existing = existingByDay[day] ?? [];
          const dayDate = addDays(eventStart, day - 1);
          return (
            <div key={day} className="border border-ivory-300 rounded-[10px] overflow-hidden">
              {/* Day header */}
              <div className="flex items-center gap-3 px-4 py-3 bg-ivory-100 border-b border-ivory-300">
                <div className="w-8 h-8 rounded-[8px] bg-ink-900 text-ivory-50 flex items-center justify-center fa-mono text-sm font-semibold flex-shrink-0">
                  D{day}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-ink-900">Day {day}</div>
                  <div className="fa-mono text-[11px] text-ink-400">
                    {dayDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="fa-mono text-[10px] uppercase text-ink-500" style={{ letterSpacing: "0.08em" }}>
                    Sessions to add
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={rows.length}
                    onChange={e => setCount(day, Number(e.target.value))}
                    className="fa-input w-20 text-center"
                  />
                </div>
              </div>

              {/* Existing sessions (read-only) so the user sees what's already there */}
              {existing.length > 0 && (
                <div className="px-4 py-2 border-b border-ivory-200 bg-ivory-50">
                  <div className="fa-mono text-[10px] uppercase text-ink-400 mb-1" style={{ letterSpacing: "0.08em" }}>
                    Already scheduled
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {existing.map(s => (
                      <span key={s.id} className="fa-mono text-[11px] text-ink-700 bg-ivory-100 px-2 py-0.5 rounded border border-ivory-300">
                        S{s.sessionNumber} · {s.startTime}–{s.endTime}
                        {s.label && <span className="text-ink-400"> · {s.label}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Editable new rows */}
              {rows.length === 0 ? (
                <div className="px-4 py-4 text-xs text-ink-400 italic">
                  No new sessions for this day. Increase the count above to add.
                </div>
              ) : (
                <div>
                  <div className="grid grid-cols-[40px_1fr_1fr_2fr_40px] gap-2 px-4 py-2 fa-mono text-[10px] uppercase text-ink-400 border-b border-ivory-200" style={{ letterSpacing: "0.08em" }}>
                    <div>#</div>
                    <div>Start</div>
                    <div>End</div>
                    <div>Label (optional)</div>
                    <div></div>
                  </div>
                  {rows.map((row, idx) => {
                    const nextNumber = ((existingByDay[day] ?? []).reduce(
                      (m, s) => Math.max(m, s.sessionNumber), 0
                    )) + 1 + idx;
                    return (
                      <div key={idx} className="grid grid-cols-[40px_1fr_1fr_2fr_40px] gap-2 px-4 py-2 items-center border-b border-ivory-200 last:border-b-0">
                        <div className="fa-mono text-sm text-ink-700">S{nextNumber}</div>
                        <input
                          type="time"
                          value={row.startTime}
                          onChange={e => updateRow(day, idx, { startTime: e.target.value })}
                          className="fa-input py-1.5 text-sm"
                        />
                        <input
                          type="time"
                          value={row.endTime}
                          onChange={e => updateRow(day, idx, { endTime: e.target.value })}
                          className="fa-input py-1.5 text-sm"
                        />
                        <input
                          type="text"
                          value={row.label}
                          onChange={e => updateRow(day, idx, { label: e.target.value })}
                          placeholder="e.g. Morning Batch A"
                          className="fa-input py-1.5 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => removeRow(day, idx)}
                          className="fa-btn-ghost p-1.5 text-ink-400 hover:text-danger"
                          title="Remove this row"
                          aria-label="Remove session row"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="mt-4 text-sm text-danger bg-danger-soft rounded-md px-3 py-2" role="alert">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-4 mt-4 border-t border-ivory-300">
        <div className="text-xs text-ink-500">
          {totalNew === 0
            ? "No new sessions queued."
            : <><span className="font-semibold text-ink-900">{totalNew}</span> new session{totalNew !== 1 ? "s" : ""} ready to save.</>}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="fa-btn-secondary" disabled={saving}>Cancel</button>
          <button
            type="button"
            onClick={handleSave}
            className="fa-btn-primary"
            disabled={saving || totalNew === 0}
          >
            {saving ? "Saving…" : `Save ${totalNew || ""} session${totalNew !== 1 ? "s" : ""}`.trim()}
          </button>
        </div>
      </div>
    </Modal>
  );
}
