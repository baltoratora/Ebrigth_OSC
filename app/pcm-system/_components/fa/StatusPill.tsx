import { EventStatus, InvitationStatus } from "@pcm/_types";

type PillTone = "draft" | "open" | "closed" | "ongoing" | "completed"
              | "invited" | "confirmed" | "declined" | "attended" | "no_show" | "rescheduled"
              | "neutral" | "success" | "warning" | "danger" | "info";

const TONES: Record<PillTone, { bg: string; text: string; dot: string; label: string }> = {
  // Event statuses
  draft:     { bg: "bg-ivory-200",  text: "text-ink-600",  dot: "bg-ink-300",  label: "Draft" },
  open:      { bg: "bg-success-soft",text: "text-success",   dot: "bg-success",    label: "Open" },
  closed:    { bg: "bg-warning-soft",text: "text-warning",   dot: "bg-warning",    label: "Closed" },
  ongoing:   { bg: "bg-info-soft",  text: "text-info",       dot: "bg-info",       label: "Ongoing" },
  completed: { bg: "bg-brand-50",   text: "text-brand-900",  dot: "bg-brand-700",  label: "Completed" },
  // Invitation statuses
  invited:   { bg: "bg-ivory-200",  text: "text-ink-600",  dot: "bg-ink-300",  label: "Invited" },
  confirmed: { bg: "bg-info-soft",  text: "text-info",       dot: "bg-info",       label: "Confirmed" },
  declined:  { bg: "bg-danger-soft",text: "text-danger",     dot: "bg-danger",     label: "Declined" },
  attended:  { bg: "bg-success-soft",text: "text-success",   dot: "bg-success",    label: "Attended" },
  no_show:   { bg: "bg-danger-soft",text: "text-danger",     dot: "bg-danger",     label: "No show" },
  rescheduled: { bg: "bg-warning-soft", text: "text-warning",  dot: "bg-warning",    label: "Reschedule" },
  // Generic
  neutral:   { bg: "bg-ivory-200",  text: "text-ink-600",  dot: "bg-ink-300",  label: "" },
  success:   { bg: "bg-success-soft",text: "text-success",   dot: "bg-success",    label: "" },
  warning:   { bg: "bg-warning-soft",text: "text-warning",   dot: "bg-warning",    label: "" },
  danger:    { bg: "bg-danger-soft",text: "text-danger",     dot: "bg-danger",     label: "" },
  info:      { bg: "bg-info-soft",  text: "text-info",       dot: "bg-info",       label: "" },
};

interface StatusPillProps {
  tone: PillTone;
  children?: React.ReactNode;
  showDot?: boolean;
}

export function StatusPill({ tone, children, showDot = true }: StatusPillProps) {
  const t = TONES[tone];
  return (
    <span className={`fa-pill ${t.bg} ${t.text}`}>
      {showDot && <span className={`fa-pill-dot ${t.dot}`} />}
      {children ?? t.label}
    </span>
  );
}

export function EventStatusPill({ status }: { status: EventStatus }) {
  return <StatusPill tone={status} />;
}

export function InvitationStatusPill({ status }: { status: InvitationStatus }) {
  return <StatusPill tone={status} />;
}
