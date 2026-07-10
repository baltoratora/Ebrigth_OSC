"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Modal } from "@fa/_components/shared/Modal";
import { EventStatusPill } from "./StatusPill";
import { CalendarDays, MapPin, ArrowRight, Clock } from "lucide-react";
import { FAEvent } from "@fa/_types";
import { formatDateRange } from "@fa/_lib/date";
import { useFAStore } from "@fa/_lib/store";

interface PreviewEventModalProps {
  open: boolean;
  onClose: () => void;
  event: FAEvent | null;
}

export function PreviewEventModal({ open, onClose, event }: PreviewEventModalProps) {
  const sessions    = useFAStore(s => s.sessions);
  const invitations = useFAStore(s => s.invitations);
  const quotas      = useFAStore(s => s.quotas);

  const data = useMemo(() => {
    if (!event) return null;
    const eventSessions = sessions
      .filter(s => s.eventId === event.id)
      .sort((a, b) => a.dayNumber - b.dayNumber || a.sessionNumber - b.sessionNumber);
    const eventInvites = invitations.filter(i => i.eventId === event.id);
    const sessionIds = new Set(eventSessions.map(s => s.id));
    const totalQuota = quotas
      .filter(q => sessionIds.has(q.sessionId))
      .reduce((sum, q) => sum + q.quota, 0);
    return { eventSessions, eventInvites, totalQuota };
  }, [event, sessions, invitations, quotas]);

  if (!event || !data) return null;

  const dateStr = formatDateRange(event.startDate, event.endDate);

  return (
    <Modal open={open} onClose={onClose} kicker="Event preview" title={event.name} size="lg">
      <div className="flex items-center gap-3 mb-5">
        <EventStatusPill status={event.status} />
        <span className="fa-mono text-[11px] text-ink-400">
          Created {new Date(event.createdAt).toLocaleDateString()}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="fa-card p-4">
          <div className="fa-mono text-[10px] uppercase text-gold-600 mb-1.5" style={{ letterSpacing: "0.12em" }}>
            When
          </div>
          <div className="flex items-center gap-2 text-sm text-ink-800">
            <CalendarDays className="w-3.5 h-3.5 text-gold-500 flex-shrink-0" />
            <span className="fa-mono">
              {dateStr} · {event.numberOfDays} day{event.numberOfDays > 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <div className="fa-card p-4">
          <div className="fa-mono text-[10px] uppercase text-gold-600 mb-1.5" style={{ letterSpacing: "0.12em" }}>
            Venue
          </div>
          <div className="flex items-center gap-2 text-sm text-ink-800">
            <MapPin className="w-3.5 h-3.5 text-gold-500 flex-shrink-0" />
            {event.venue}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-5">
        <Stat label="Sessions" value={data.eventSessions.length} />
        <Stat label="Invited"  value={data.eventInvites.length} />
        <Stat label="Quota"    value={data.totalQuota} />
      </div>

      <div className="fa-card p-4 mb-5">
        <div className="fa-mono text-[10px] uppercase text-gold-600 mb-1.5" style={{ letterSpacing: "0.12em" }}>
          Invitation window
        </div>
        <div className="fa-mono text-sm text-ink-800">
          {new Date(event.invitationOpenDate).toLocaleDateString()} → {new Date(event.invitationCloseDate).toLocaleDateString()}
        </div>
      </div>

      {data.eventSessions.length > 0 && (
        <div className="mb-5">
          <div className="fa-mono text-[10px] uppercase text-gold-600 mb-2" style={{ letterSpacing: "0.12em" }}>
            Sessions
          </div>
          <div className="rounded-[12px] border border-gold-200 overflow-hidden">
            {data.eventSessions.map((s, i) => (
              <div
                key={s.id}
                className={`flex items-center gap-4 px-4 py-2.5 bg-ivory-50 ${
                  i < data.eventSessions.length - 1 ? "border-b border-gold-200" : ""
                }`}
              >
                <span className="fa-mono text-[11px] uppercase text-gold-600 w-12" style={{ letterSpacing: "0.1em" }}>
                  D{s.dayNumber} · S{s.sessionNumber}
                </span>
                <Clock className="w-3 h-3 text-ink-400" />
                <span className="fa-mono text-xs text-ink-800">{s.startTime}–{s.endTime}</span>
                {s.label && (
                  <span className="text-xs text-ink-500 truncate">· {s.label}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {event.notes && (
        <div className="mb-5">
          <div className="fa-mono text-[10px] uppercase text-gold-600 mb-1.5" style={{ letterSpacing: "0.12em" }}>
            Notes
          </div>
          <p className="text-sm italic text-ink-600 leading-relaxed">{event.notes}</p>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t border-gold-200 mt-2">
        <button onClick={onClose} className="fa-btn-secondary">Close</button>
        <Link
          href={`/fa-system/marketing/events/${event.id}`}
          className="fa-btn-primary"
          onClick={onClose}
        >
          Open detail page <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="fa-card p-4 text-center">
      <div className="fa-mono font-semibold text-3xl text-ink-900 leading-none">{value}</div>
      <div
        className="fa-mono text-[10px] uppercase text-ink-400 mt-2"
        style={{ letterSpacing: "0.12em" }}
      >
        {label}
      </div>
    </div>
  );
}
