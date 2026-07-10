import Link from "next/link";
import { FAEvent } from "@pcm/_types";
import { MONTHS } from "@pcm/_lib/constants";
import { EventStatusPill } from "@pcm/_components/fa/StatusPill";
import { HoverPreview } from "@pcm/_components/shared/HoverPreview";
import { EventPreview } from "@pcm/_components/fa/EventPreview";

export function ArchiveRow({ event, sessionCount, invitationCount, quotaTotal, isLast }: {
  event: FAEvent;
  sessionCount: number;
  invitationCount: number;
  quotaTotal: number;
  isLast: boolean;
}) {
  const startD = new Date(event.startDate);

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
    <Link
      href={`/pcm-system/academy/events/${event.id}`}
      className={`flex items-center gap-5 px-5 py-3 bg-ivory-100 hover:bg-ivory-50 transition-colors ${
        isLast ? "" : "border-b border-gold-200"
      }`}
    >
      <div className="flex-shrink-0" style={{ width: "88px" }}>
        <span className="fa-mono text-[11px] text-ink-400">
          {MONTHS[event.month - 1].slice(0, 3)} {startD.getDate()}, {event.year}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-ink-500 truncate block">{event.name}</span>
      </div>
      <div className="flex-shrink-0">
        <EventStatusPill status={event.status} />
      </div>
      <div className="flex-shrink-0 flex items-center gap-4">
        <span className="fa-mono text-[11px] text-ink-400">{sessionCount} sessions</span>
        <span className="fa-mono text-[11px] text-ink-400">{invitationCount} invited</span>
      </div>
    </Link>
    </HoverPreview>
  );
}
