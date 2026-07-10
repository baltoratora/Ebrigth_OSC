import { Send, Lock } from "lucide-react";
import { EventStatus } from "@fa/_types";

export function StatusActionBar({
  status, sessionCount, onStatusChange,
}: { status: EventStatus; sessionCount: number; onStatusChange: (s: EventStatus) => void }) {
  if (status === "completed") return null;

  let message = "";
  let action: { label: string; next: EventStatus; disabled?: boolean; reason?: string } | null = null;

  if (status === "draft") {
    message = "This event is a draft. Add sessions and quotas, then open it for BMs to invite students.";
    action = { label: "Open for invitations", next: "open", disabled: sessionCount === 0, reason: sessionCount === 0 ? "Add at least one session first" : undefined };
  } else if (status === "open") {
    message = "Invitations are live. BMs can invite their students.";
    action = { label: "Close invitations", next: "closed" };
  } else if (status === "closed") {
    message = "Invitation window closed. Ready for the event day.";
    action = { label: "Mark as completed", next: "completed" };
  } else if (status === "ongoing") {
    message = "Event is happening now.";
    action = { label: "Mark as completed", next: "completed" };
  }

  return (
    <div className="bg-ivory-50 border border-gold-200 border-l-4 border-l-gold-400 rounded-[12px] p-4 mb-6 flex items-center gap-4">
      <div className="flex-shrink-0 w-9 h-9 rounded-[10px] bg-ivory-100 text-gold-500 flex items-center justify-center">
        {status === "open" ? <Send className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
      </div>
      <div className="flex-1 text-sm text-ink-700">{message}</div>
      {action && (
        <button
          onClick={() => onStatusChange(action!.next)}
          disabled={action.disabled}
          className="fa-btn-primary flex-shrink-0"
          title={action.reason}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
