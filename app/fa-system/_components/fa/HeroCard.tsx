import Link from "next/link";
import { CalendarDays, MapPin } from "lucide-react";
import { FAEvent } from "@fa/_types";
import { MONTHS } from "@fa/_lib/constants";
import { formatDateRange } from "@fa/_lib/date";
import { EventStatusPill } from "@fa/_components/fa/StatusPill";
import { HoverPreview } from "@fa/_components/shared/HoverPreview";
import { QuickActionButtons } from "@fa/_components/fa/QuickActionButtons";
import { EventPreview } from "@fa/_components/fa/EventPreview";

export function HeroCard({ event, sessionCount, invitationCount, confirmedCount, quotaTotal, onView, onEdit, onDuplicate }: {
  event: FAEvent;
  sessionCount: number;
  invitationCount: number;
  confirmedCount: number;
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
    <Link href={`/fa-system/marketing/events/${event.id}`} className="fa-card-hover block">
      <div className="p-8 flex items-center gap-8">

        {/* Monumental mono date */}
        <div className="flex-shrink-0 text-center" style={{ width: "96px" }}>
          <div
            className="fa-mono text-[10px] uppercase text-gold-600"
            style={{ letterSpacing: "0.14em" }}
          >
            {MONTHS[event.month - 1].slice(0, 3)}
          </div>
          <div className="fa-mono font-bold text-[72px] text-ink-900 leading-none my-1">
            {String(startD.getDate()).padStart(2, "0")}
          </div>
          <div className="fa-mono text-xs text-ink-400">{event.year}</div>
        </div>

        {/* Gold vertical rule */}
        <div className="w-px self-stretch bg-gold-200 flex-shrink-0" />

        {/* Event info */}
        <div className="flex-1 min-w-0">
          <div className="mb-2">
            <EventStatusPill status={event.status} />
          </div>
          <h2 className="fa-display text-[32px] leading-tight text-ink-900 mb-3">{event.name}</h2>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-ink-500">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-gold-500" />
              {dateStr} · {event.numberOfDays} day{event.numberOfDays > 1 ? "s" : ""}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-gold-500" />
              {event.venue}
            </span>
          </div>
        </div>

        {/* Stat columns */}
        <div className="flex-shrink-0 flex items-center gap-6">
          <div className="text-center">
            <div className="fa-mono font-semibold text-[40px] text-ink-900 leading-none">
              {sessionCount}
            </div>
            <div
              className="fa-mono text-[10px] uppercase text-ink-400 mt-1"
              style={{ letterSpacing: "0.1em" }}
            >
              Sessions
            </div>
          </div>
          <div className="w-px h-10 bg-gold-200" />
          <div className="text-center">
            <div className="fa-mono font-semibold text-[40px] text-ink-900 leading-none">
              {invitationCount}
            </div>
            <div
              className="fa-mono text-[10px] uppercase text-ink-400 mt-1"
              style={{ letterSpacing: "0.1em" }}
            >
              Invited
            </div>
          </div>
          <div className="w-px h-10 bg-gold-200" />
          <div className="text-center">
            <div className="fa-mono font-semibold text-[40px] text-emerald-600 leading-none">
              {confirmedCount}
            </div>
            <div
              className="fa-mono text-[10px] uppercase text-ink-400 mt-1"
              style={{ letterSpacing: "0.1em" }}
            >
              Confirmed
            </div>
          </div>
        </div>

      </div>
    </Link>
    <QuickActionButtons eventId={event.id} onView={onView} onEdit={onEdit} onDuplicate={onDuplicate} />
    </div>
    </HoverPreview>
  );
}
