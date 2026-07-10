import { Check, X, CalendarClock } from "lucide-react";
import { InvitationStatus } from "@pcm/_types";
import { InvitationStatusPill } from "@pcm/_components/fa/StatusPill";

export function InvitationStatusSelector({
  value, onChange, disabled,
}: { value: InvitationStatus; onChange: (s: InvitationStatus) => void; disabled?: boolean }) {
  // BMs control confirmed/declined/rescheduled; Academy controls attended/no_show during the event
  if (disabled) {
    return <InvitationStatusPill status={value} />;
  }
  if (value === "attended" || value === "no_show") {
    return <InvitationStatusPill status={value} />;
  }
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <button
        onClick={() => onChange("confirmed")}
        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
          value === "confirmed"
            ? "bg-info-soft text-info ring-1 ring-info/30"
            : "text-ink-500 hover:bg-ivory-200"
        }`}
        title="Parent confirmed"
      >
        <Check className="w-3 h-3 inline" /> Confirmed
      </button>
      <button
        onClick={() => onChange("invited")}
        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
          value === "invited"
            ? "bg-ivory-200 text-ink-600 ring-1 ring-ink-200"
            : "text-ink-500 hover:bg-ivory-200"
        }`}
        title="Invited, awaiting confirmation"
      >
        Pending
      </button>
      <button
        onClick={() => onChange("rescheduled")}
        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
          value === "rescheduled"
            ? "bg-amber-100 text-amber-700 ring-1 ring-amber-300"
            : "text-ink-500 hover:bg-ivory-200"
        }`}
        title="Parent asked to reschedule to a later session"
      >
        <CalendarClock className="w-3 h-3 inline" /> Reschedule
      </button>
      <button
        onClick={() => onChange("declined")}
        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
          value === "declined"
            ? "bg-danger-soft text-danger ring-1 ring-danger/30"
            : "text-ink-500 hover:bg-ivory-200"
        }`}
        title="Parent declined"
      >
        <X className="w-3 h-3 inline" /> Declined
      </button>
    </div>
  );
}
