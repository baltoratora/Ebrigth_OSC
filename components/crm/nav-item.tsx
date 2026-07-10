'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/crm/utils'

export interface NavItemProps {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  collapsed?: boolean
  badge?: number
}

export function NavItem({
  href,
  icon: Icon,
  label,
  collapsed = false,
  badge,
}: NavItemProps) {
  const pathname = usePathname()
  // Exact match only — prevents "/crm/tickets" from being highlighted when
  // viewing a more specific sibling route like "/crm/tickets/new".
  const isActive = pathname === href

  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={cn(
        'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
        isActive
          ? 'bg-indigo-600 text-white shadow-sm'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
        collapsed && 'justify-center px-2',
      )}
    >
      <Icon
        className={cn(
          'h-5 w-5 shrink-0',
          isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300',
        )}
      />
      {!collapsed && <span className="truncate">{label}</span>}
      {!collapsed && badge != null && badge > 0 && (
        <span
          className={cn(
            'ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold',
            isActive
              ? 'bg-white/20 text-white'
              : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
          )}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      {collapsed && badge != null && badge > 0 && (
        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </Link>
  )
}
