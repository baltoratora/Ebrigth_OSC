import { FAEvent } from "@fa/_types";
import { daysUntil, formatDateRange } from "@fa/_lib/date";
import { EventStatusPill } from "@fa/_components/fa/StatusPill";
import { PreviewStat } from "@fa/_components/fa/PreviewStat";

export function EventPreview({ event, sessionCount, invitationCount, quotaTotal }: {
  event: FAEvent;
  sessionCount: number;
  invitationCount: number;
  quotaTotal: number;
}) {
  const days = daysUntil(event.startDate);
  const dateStr = formatDateRange(event.startDate, event.endDate);
  const fillPct = quotaTotal > 0 ? Math.min(100, Math.round((invitationCount / quotaTotal) * 100)) : 0;

  let countdownLabel = "";
  if (days === 0)       countdownLabel = "Today";
  else if (days === 1)  countdownLabel = "1 day left";
  else if (days > 1)    countdownLabel = `${days} days left`;
  else if (days === -1) countdownLabel = "Yesterday";
  else if (days < -1)   countdownLabel = `${Math.abs(days)} days ago`;

  return (
    <div
      className="bg-ivory-50 border border-gold-200 rounded-[14px] p-6"
      style={{
        boxShadow:
          "0 24px 48px -16px rgba(176, 145, 79, 0.30), 0 8px 24px -8px rgba(12, 10, 9, 0.12), 0 2px 6px rgba(12, 10, 9, 0.05)",
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <EventStatusPill status={event.status} />
        {countdownLabel && (
          <span
            className="fa-mono text-[10px] uppercase text-gold-600"
            style={{ letterSpacing: "0.12em" }}
          >
            {countdownLabel}
          </span>
        )}
      </div>

      <h3 className="fa-display text-xl leading-snug text-ink-900 mb-4">
        {event.name}
      </h3>

      <hr className="border-0 border-t border-gold-200 mb-4" />

      <div className="space-y-3 mb-4">
        <div>
          <div
            className="fa-mono text-[9px] uppercase text-gold-600 mb-1"
            style={{ letterSpacing: "0.14em" }}
          >
            When
          </div>
          <div className="fa-mono text-[13px] text-ink-800">
            {dateStr} · {event.numberOfDays} day{event.numberOfDays > 1 ? "s" : ""}
          </div>
        </div>
        <div>
          <div
            className="fa-mono text-[9px] uppercase text-gold-600 mb-1"
            style={{ letterSpacing: "0.14em" }}
          >
            Venue
          </div>
          <div className="text-[13px] text-ink-800">{event.venue}</div>
        </div>
        <div>
          <div
            className="fa-mono text-[9px] uppercase text-gold-600 mb-1"
            style={{ letterSpacing: "0.14em" }}
          >
            Invitation window
          </div>
          <div className="fa-mono text-[13px] text-ink-800">
            {new Date(event.invitationOpenDate).toLocaleDateString()} → {new Date(event.invitationCloseDate).toLocaleDateString()}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 pt-4 border-t border-gold-200">
        <PreviewStat label="Sessions" value={sessionCount} />
        <PreviewStat label="Invited"  value={invitationCount} />
        <PreviewStat label="Quota"    value={quotaTotal} />
      </div>

      {quotaTotal > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <span
              className="fa-mono text-[9px] uppercase text-gold-600"
              style={{ letterSpacing: "0.14em" }}
            >
              Fill
            </span>
            <span className="fa-mono text-[11px] text-ink-700">{fillPct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-ivory-200 overflow-hidden">
            <div
              className="h-full bg-gold-400 transition-all"
              style={{ width: `${fillPct}%` }}
            />
          </div>
        </div>
      )}

      {event.notes && (
        <>
          <div
            className="fa-mono text-[9px] uppercase text-gold-600 mt-4 mb-1"
            style={{ letterSpacing: "0.14em" }}
          >
            Notes
          </div>
          <p className="text-[12px] italic text-ink-500 leading-snug" style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}>{event.notes}</p>
        </>
      )}
    </div>
  );
}
