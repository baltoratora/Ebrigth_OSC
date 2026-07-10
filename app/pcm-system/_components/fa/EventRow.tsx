import Link from "next/link";
import { CalendarDays, MapPin } from "lucide-react";
import { FAEvent } from "@pcm/_types";
import { MONTHS } from "@pcm/_lib/constants";
import { formatDateRange } from "@pcm/_lib/date";
import { EventStatusPill } from "@pcm/_components/fa/StatusPill";
import { HoverPreview } from "@pcm/_components/shared/HoverPreview";
import { QuickActionButtons } from "@pcm/_components/fa/QuickActionButtons";
import { EventPreview } from "@pcm/_components/fa/EventPreview";

export function EventRow({ event, sessionCount, invitationCount, quotaTotal, onView, onEdit, onDuplicate }: {
  event: FAEvent;
  sessionCount: number;
  invitationCount: number;
  quotaTotal: number;
  onView: () => void;
  onEdit: () => void;
  onDuplicate?: () => void;
}) {
  const startD = new Date(event.startDate);
  const dateStr = formatDateRange(event.startDate, event.endDate);

  return (
    <HoverPreview
      width={320}
      preview={
        <EventPreview
          event={event}
          sessionCount={sessionCount}
          invitationCount={invitationCount}
          quotaTotal={quotaTotal}
        />
      }
    >
    <div className="group relative">
    <Link
      href={`/pcm-system/academy/events/${event.id}`}
      className="fa-card-hover flex items-center gap-5 px-5 py-4"
    >
      {/* Compact date block */}
      <div className="flex-shrink-0 text-center" style={{ width: "48px" }}>
        <div className="fa-mono text-[9px] uppercase text-gold-600" style={{ letterSpacing: "0.12em" }}>
          {MONTHS[event.month - 1].slice(0, 3)}
        </div>
        <div className="fa-mono font-semibold text-[26px] text-ink-900 leading-none">
          {String(startD.getDate()).padStart(2, "0")}
        </div>
        <div className="fa-mono text-[10px] text-ink-400">{event.year}</div>
      </div>

      <div className="w-px h-9 bg-gold-200 flex-shrink-0" />

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5 mb-0.5">
          <h3 className="fa-display text-lg text-ink-900 truncate">{event.name}</h3>
          <EventStatusPill status={event.status} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-ink-500">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="w-3 h-3" />
            {dateStr} · {event.numberOfDays} day{event.numberOfDays > 1 ? "s" : ""}
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {event.venue}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="flex-shrink-0 flex items-center gap-5">
        <div className="text-right">
          <div className="fa-mono text-xl text-ink-900">{sessionCount}</div>
          <div
            className="fa-mono text-[9px] uppercase text-ink-400"
            style={{ letterSpacing: "0.08em" }}
          >
            Sessions
          </div>
        </div>
        <div className="text-right">
          <div className="fa-mono text-xl text-ink-900">{invitationCount}</div>
          <div
            className="fa-mono text-[9px] uppercase text-ink-400"
            style={{ letterSpacing: "0.08em" }}
          >
            Invited
          </div>
        </div>
      </div>
    </Link>
    <QuickActionButtons eventId={event.id} onView={onView} onEdit={onEdit} onDuplicate={onDuplicate} />
    </div>
    </HoverPreview>
  );
}
