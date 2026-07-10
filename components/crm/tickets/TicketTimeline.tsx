'use client'

import { ArrowRight, MessageSquare, Paperclip, User, Mail, Activity } from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import { formatDateTime } from '@/lib/crm/utils'
import type { TicketEvent } from '@/hooks/crm/useTickets'

interface TicketTimelineProps {
  events: TicketEvent[]
  actorNames?: Record<string, string>
}

const EVENT_ICONS: Record<string, typeof Activity> = {
  status_change: ArrowRight,
  comment: MessageSquare,
  attachment_added: Paperclip,
  assigned: User,
  email_sent: Mail,
}

export function TicketTimeline({ events, actorNames = {} }: TicketTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
        No events yet.
      </div>
    )
  }

  const sorted = [...events].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )

  return (
    <div className="relative">
      <div className="absolute left-4 top-2 bottom-2 w-px bg-slate-200 dark:bg-slate-700" />
      <ol className="space-y-4">
        {sorted.map((event) => {
          const Icon = EVENT_ICONS[event.type] ?? Activity
          const actor = actorNames[event.actor_id] ?? 'System'
          return (
            <li key={event.id} className="relative flex gap-3">
              <div className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                <Icon className="h-4 w-4 text-slate-600 dark:text-slate-300" />
              </div>
              <div className="flex-1 pb-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-slate-900 dark:text-slate-100">{actor}</span>
                  <EventDescription event={event} />
                </div>
                <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {formatDateTime(event.created_at)}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function EventDescription({ event }: { event: TicketEvent }) {
  switch (event.type) {
    case 'status_change':
      return (
        <span className="flex flex-wrap items-center gap-1.5 text-slate-600 dark:text-slate-400">
          changed status from
          {event.from_value && <StatusBadge status={event.from_value} />}
          to
          {event.to_value && <StatusBadge status={event.to_value} />}
        </span>
      )
    case 'assigned':
      return <span className="text-slate-600 dark:text-slate-400">assigned this ticket</span>
    case 'attachment_added':
      return <span className="text-slate-600 dark:text-slate-400">added an attachment</span>
    case 'comment':
      return (
        <span className="text-slate-600 dark:text-slate-400">
          commented: &ldquo;{(event.payload as { body?: string } | null)?.body ?? ''}&rdquo;
        </span>
      )
    case 'email_sent':
      return (
        <span className="text-slate-600 dark:text-slate-400">
          sent {(event.payload as { event?: string } | null)?.event ?? 'an email'} notification
        </span>
      )
    default:
      return <span className="text-slate-600 dark:text-slate-400">{event.type}</span>
  }
}
