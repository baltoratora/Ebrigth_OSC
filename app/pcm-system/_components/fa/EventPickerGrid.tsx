import { CalendarDays, MapPin } from "lucide-react";
import { EmptyState } from "@pcm/_components/shared/EmptyState";
import { EventStatusPill } from "@pcm/_components/fa/StatusPill";
import { EventStatus } from "@pcm/_types";
import { MONTHS } from "@pcm/_lib/constants";
import { formatDateRange } from "@pcm/_lib/date";

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
            className="group relative overflow-hidden rounded-2xl bg-white border border-ivory-300 shadow-sm p-5 pt-6 text-left transition-all hover:shadow-md hover:border-violet-300"
          >
            {/* Violet accent strip to echo the Invitations theme */}
            <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 to-indigo-500" aria-hidden="true" />
            <div className="flex items-center justify-between mb-3">
              <div className="fa-mono text-[10px] uppercase tracking-wider font-semibold text-violet-700" style={{ letterSpacing: "0.12em" }}>
                {MONTHS[event.month - 1]} {event.year}
              </div>
              <EventStatusPill status={event.status} />
            </div>
            <h3 className="fa-display text-lg text-ink-900 mb-1 group-hover:text-violet-900 transition-colors">{event.name}</h3>
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
