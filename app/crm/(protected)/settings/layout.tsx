import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/crm/auth'
import Link from 'next/link'
import {
  User,
  Users,
  Building2,
  GitBranch,
  Tag,
  SlidersHorizontal,
  MapPin,
  Key,
  FileText,
  CreditCard,
} from 'lucide-react'
import type { ReactNode } from 'react'

const SETTINGS_NAV = [
  { href: '/crm/settings/profile', label: 'My Profile', icon: User },
  { href: '/crm/settings/team', label: 'Team', icon: Users },
  { href: '/crm/settings/branches', label: 'Branches', icon: Building2 },
  { href: '/crm/settings/pipelines', label: 'Pipelines', icon: GitBranch },
  { href: '/crm/settings/tags', label: 'Tags', icon: Tag },
  { href: '/crm/settings/custom-values', label: 'Custom Values', icon: SlidersHorizontal },
  { href: '/crm/settings/lead-sources', label: 'Lead Sources', icon: MapPin },
  { href: '/crm/settings/api-keys', label: 'API Keys', icon: Key },
  { href: '/crm/settings/audit-log', label: 'Audit Log', icon: FileText },
  { href: '/crm/settings/billing', label: 'Billing', icon: CreditCard },
]

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) redirect('/crm/login')

  return (
    <div className="flex h-full">
      {/* Settings sidebar */}
      <aside className="w-52 shrink-0 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex flex-col py-4">
        <p className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Settings
        </p>
        <nav className="flex-1 space-y-0.5 px-2">
          {SETTINGS_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors group"
            >
              <item.icon className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors" />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-950">
        {children}
      </div>
    </div>
  )
}
