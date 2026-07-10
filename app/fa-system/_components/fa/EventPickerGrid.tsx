import { CalendarDays, MapPin } from "lucide-react";
import { EmptyState } from "@fa/_components/shared/EmptyState";
import { EventStatusPill } from "@fa/_components/fa/StatusPill";
import { EventStatus } from "@fa/_types";
import { MONTHS } from "@fa/_lib/constants";
import { formatDateRange } from "@fa/_lib/date";

export function EventPickerGrid({
  events, onSelect, emptyTitle, emptyDescription,
}: {
  events: { id: string; name: string; startDate: string; endDate: string; venue: string; status: EventStatus; month: number; year: number }[];
  onSelect: (id: string) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title={emptyTitle ?? "No events to take attendance for"}
        description={emptyDescription ?? "Events appear here once they're closed for invitations or currently running."}
      />
    );
  }
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      {events.map(event => {
        const dateDisplay = formatDateRange(event.startDate, event.endDate);
        return (
          <button
            key={event.id}
            onClick={() => onSelect(event.id)}
            className="fa-card-hover p-5 text-left"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs uppercase tracking-wider font-semibold text-brand-900">
                {MONTHS[event.month - 1]} {event.year}
              </div>
              <EventStatusPill status={event.status} />
            </div>
            <h3 className="fa-display text-lg text-ink-900 mb-1">{event.name}</h3>
            <div className="text-sm text-ink-500 flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              {dateDisplay}
            </div>
            <div className="text-sm text-ink-500 flex items-center gap-1.5 mt-0.5">
              <MapPin className="w-3.5 h-3.5" />
              {event.venue}
            </div>
          </button>
        );
      })}
    </div>
  );
}
