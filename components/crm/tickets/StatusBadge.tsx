'use client'

import { cn } from '@/lib/crm/utils'

interface StatusBadgeProps {
  status: string
  className?: string
}

const STATUS_CONFIG: Record<string, { label: string; dotClass: string; pillClass: string }> = {
  received: {
    label: 'Received',
    dotClass: 'bg-slate-400',
    pillClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
  approved: {
    label: 'Approved',
    dotClass: 'bg-blue-500',
    pillClass: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  },
  in_progress: {
    label: 'In Progress',
    dotClass: 'bg-amber-500',
    pillClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  },
  complete: {
    label: 'Complete',
    dotClass: 'bg-emerald-500',
    pillClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  },
  rejected: {
    label: 'Rejected',
    dotClass: 'bg-red-500',
    pillClass: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  },
}

const FALLBACK = {
  label: 'Unknown',
  dotClass: 'bg-slate-300',
  pillClass: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? FALLBACK

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        config.pillClass,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', config.dotClass)} aria-hidden="true" />
      {config.label}
    </span>
  )
}
