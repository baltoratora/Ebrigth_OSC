import { EventStatus } from "@fa/_types";

export function InvitationWindowStatus({ event }: { event: { invitationOpenDate: string; invitationCloseDate: string; status: EventStatus } }) {
  const now   = new Date();
  const open  = new Date(event.invitationOpenDate);
  const close = new Date(event.invitationCloseDate);
  if (event.status !== "open" && event.status !== "closed") return null;
  if (now < open) {
    const days = Math.ceil((open.getTime() - now.getTime()) / 86400000);
    return <span className="fa-mono text-sm text-ink-500">Opens in {days} day{days !== 1 ? "s" : ""}</span>;
  }
  if (now > close) {
    return <span className="fa-mono text-sm text-ink-500">Closed</span>;
  }
  const days = Math.ceil((close.getTime() - now.getTime()) / 86400000);
  return <span className="fa-mono text-sm text-success">Open · {days} day{days !== 1 ? "s" : ""} left</span>;
}
