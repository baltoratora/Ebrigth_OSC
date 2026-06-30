'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Kanban,
  Bell,
  ArrowLeft,
  UserRoundCheck,
  CalendarDays,
  Library,
} from 'lucide-react'
import { cn } from '@/lib/crm/utils'

// Recruitment runs its own app shell (like the CRM) but with a distinct
// emerald "HR / people" theme so it never reads as the indigo CRM.
const NAV_ITEMS = [
  { href: '/recruitment/dashboard',     label: 'Dashboard',     icon: LayoutDashboard },
  { href: '/recruitment/contacts',      label: 'Contacts',      icon: Users },
  { href: '/recruitment/opportunity',   label: 'Opportunity',   icon: Kanban },
  { href: '/recruitment/calendar',      label: 'Calendar',      icon: CalendarDays },
  { href: '/recruitment/library',       label: 'Library',       icon: Library },
  { href: '/recruitment/notifications', label: 'Notifications', icon: Bell },
]

export function RecruitmentSidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-emerald-100 bg-white dark:border-emerald-950/40 dark:bg-slate-900">
      {/* Brand */}
      <div className="flex items-center gap-2.5 border-b border-emerald-100 px-4 py-4 dark:border-emerald-950/40">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
          <UserRoundCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900 dark:text-white">Recruitment</p>
          <p className="truncate text-[11px] text-emerald-600 dark:text-emerald-400">Ebright HR</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Back to portal */}
      <div className="border-t border-emerald-100 p-3 dark:border-emerald-950/40">
        <Link
          href="/dashboards/hrms"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <span className="truncate">Back to HRMS</span>
        </Link>
      </div>
    </aside>
  )
}
