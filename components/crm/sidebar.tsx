'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Kanban,
  Zap,
  Plug,
  Bell,
  Settings,
  ChevronDown,
  ChevronRight,
  User,
  Building2,
  GitBranch,
  Tag,
  SlidersHorizontal,
  MapPin,
  Map,
  Key,
  FileText,
  CreditCard,
  LogOut,
  Ticket,
  Plus,
  Layout,
  BarChart3,
} from 'lucide-react'
import { cn } from '@/lib/crm/utils'
import { isOperationAccount, isAgencyViewAccount } from '@/lib/crm/operation-accounts'
import { scopedDepartmentForEmail } from '@/lib/crm/departments'
import { NavItem } from './nav-item'
import { authClient } from '@/lib/crm/auth-client'
import { signOut as nextAuthSignOut } from 'next-auth/react'
import type { SessionUser } from './providers'
import { useBranchContext } from './branch-context'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SidebarProps {
  collapsed: boolean
  session: { user: SessionUser }
}

// ─── Settings accordion ───────────────────────────────────────────────────────

const SETTINGS_CHILDREN = [
  { href: '/crm/settings/profile', label: 'Profile', icon: User },
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

// ─── Nav items (role-filtered below) ──────────────────────────────────────────
// `roles`: if present, item is shown only to these tkt roles. Otherwise always shown.

interface NavItemDef {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  roles?: Array<'super_admin' | 'platform_admin' | 'user' | 'regional_manager'>
  /**
   * If true, hide this item when the topbar is set to a specific branch view
   * (regardless of the user's role). Used for tenant-wide admin pages that
   * shouldn't appear while the user is mentally scoped to one branch.
   */
  hideInBranchView?: boolean
}

// Lead module — shown on /crm/dashboard, /crm/opportunities, /crm/contacts, etc.
const LEAD_NAV_ITEMS: NavItemDef[] = [
  { href: '/crm/dashboard',     label: 'Dashboard',        icon: LayoutDashboard },
  { href: '/crm/contacts',      label: 'Contacts',         icon: Users },
  { href: '/crm/opportunities', label: 'Opportunities',    icon: Kanban },
  // Forms is visible to every signed-in role so branch managers can submit
  // leads for their own branch. The trial form locks the preferred-branch
  // dropdown to the manager's branch — only super_admin can pick freely.
  { href: '/crm/forms',         label: 'Forms',            icon: FileText },
  // Branches — tenant-wide admin page. Adding a branch here auto-creates
  // its kanban pipeline + tkt_branch row so the new entry shows up
  // everywhere (topbar switcher, kanban, ticket form, dashboard chart).
  { href: '/crm/branches',      label: 'Branches',         icon: Building2, roles: ['super_admin'],                       hideInBranchView: true },
  // Region — regional performance breakdown. Super admins see all regions
  // (A/B/C); REGIONAL_MANAGER users see only their own region (derived from
  // the region of their crm_user_branch links).
  { href: '/crm/region',        label: 'Region',           icon: Map,       roles: ['super_admin', 'regional_manager'],   hideInBranchView: true },
  { href: '/crm/automations',   label: 'Automations',      icon: Zap,       roles: ['super_admin'],                       hideInBranchView: true },
  { href: '/crm/analytics',     label: 'Analytics',        icon: BarChart3, roles: ['super_admin', 'platform_admin'],     hideInBranchView: true },
  { href: '/crm/integrations',  label: 'Integrations',     icon: Plug,      roles: ['super_admin'],                       hideInBranchView: true },
  { href: '/crm/notifications', label: 'Notifications',    icon: Bell },
]

// Ticket module — shown on /crm/tickets and /crm/tkt-*.
//
// Visibility rules:
//   • super_admin (= SUPER_ADMIN / AGENCY_ADMIN via the SSO bridge): all items.
//   • platform_admin / user                : Dashboard + My Tickets + New Ticket + Notifications only.
//
// The Dashboard page itself scopes its data via useBranchContext + the
// /api/crm/tickets/analytics ?branch= filter, so a non-admin only sees
// statistics for the branch their account is assigned to.
const TICKET_NAV_ITEMS: NavItemDef[] = [
  // Dashboard now points at a real page (app/crm/(protected)/tickets/dashboard).
  // Earlier the href pointed at a non-existent route, causing the [id] dynamic
  // route to catch "dashboard" as a UUID and return "Ticket not found".
  { href: '/crm/tickets/dashboard', label: 'Dashboard',     icon: LayoutDashboard },
  { href: '/crm/tickets/kanban',    label: 'Opportunities', icon: Kanban,    roles: ['super_admin', 'platform_admin'], hideInBranchView: true },
  { href: '/crm/tickets',           label: 'My Tickets',    icon: Ticket },
  { href: '/crm/tickets/new',       label: 'New Ticket',    icon: Plus },
  { href: '/crm/tkt-platforms',     label: 'Platforms',     icon: Layout,    roles: ['super_admin'], hideInBranchView: true },
  { href: '/crm/tkt-branches',      label: 'Branches',      icon: Building2, roles: ['super_admin'], hideInBranchView: true },
  { href: '/crm/tkt-users',         label: 'Users',         icon: Users,     roles: ['super_admin'], hideInBranchView: true },
  { href: '/crm/notifications',     label: 'Notifications', icon: Bell },
]

/** Pick the right nav set based on what page the user is currently on,
 *  AND the last "module" they were in (so shared pages like /crm/settings
 *  or /crm/notifications don't reset the sidebar context). */
function pickNavForPath(pathname: string, stickyModule: 'tickets' | 'leads' | null): NavItemDef[] {
  if (pathname.startsWith('/crm/tickets') || pathname.startsWith('/crm/tkt-')) {
    return TICKET_NAV_ITEMS
  }
  if (pathname.startsWith('/crm/settings') || pathname.startsWith('/crm/notifications')) {
    // Shared pages — fall back to whatever module the user was last in,
    // so clicking Notifications/Settings from the ticket sidebar keeps the
    // ticket nav visible. Defaults to LEAD if nothing is remembered.
    if (stickyModule === 'tickets') return TICKET_NAV_ITEMS
  }
  return LEAD_NAV_ITEMS
}

// ─── Operation accounts ───────────────────────────────────────────────────────
// Operation/marketing oversight accounts (see lib/crm/operation-accounts.ts) are
// elevated (they view all branches) but get a deliberately trimmed sidebar: lead
// oversight only, no tenant admin.

// The ONLY sidebar items an operation account may see (by label). Notably
// includes Region + Analytics (normally admin-gated) but excludes Branches,
// Automations, Integrations, and Settings.
const OPERATION_ALLOWED_LABELS = new Set<string>([
  'Dashboard', 'Contacts', 'Opportunities', 'Forms', 'Region', 'Analytics', 'Notifications',
])

function filterNav(
  items: NavItemDef[],
  role: string | null | undefined,
  inBranchView: boolean,
  userEmail: string | null | undefined,
): NavItemDef[] {
  // Operation accounts get a fixed lead-oversight allowlist — EXCEPT department
  // accounts (operation@ is both a department and an operation account), which
  // need their ticket module too and so fall through to normal role filtering.
  if (!scopedDepartmentForEmail(userEmail) && isOperationAccount(userEmail)) {
    return items.filter((item) => OPERATION_ALLOWED_LABELS.has(item.label))
  }
  // Treat unknown / null role as 'user'
  const r = (role ?? 'user') as 'super_admin' | 'platform_admin' | 'user' | 'regional_manager'
  // Scoped department accounts (incl. the agency-view CEO, who runs at
  // super-level nav) are department ticket triagers — never tenant ticket
  // admins — so hide the ticket super-management pages from them.
  const scopedDept = scopedDepartmentForEmail(userEmail)
  const TICKET_SUPER_ONLY = new Set(['/crm/tkt-platforms', '/crm/tkt-branches', '/crm/tkt-users'])
  return items.filter((item) => {
    if (scopedDept && TICKET_SUPER_ONLY.has(item.href)) return false
    if (item.roles && !item.roles.includes(r)) return false
    if (inBranchView && item.hideInBranchView) return false
    return true
  })
}

// Keyboard shortcut map: key sequence → route
const SHORTCUTS: Record<string, string> = {
  'g d': '/crm/dashboard',
  'g c': '/crm/contacts',
  'g o': '/crm/opportunities',
}

// ─── Avatar helper ────────────────────────────────────────────────────────────

function getInitials(name?: string | null, email?: string): string {
  if (name) {
    return name
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('')
  }
  return email?.slice(0, 2).toUpperCase() ?? '??'
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CrmSidebar({ collapsed, session }: SidebarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const isSettingsActive = pathname.startsWith('/crm/settings')
  const [settingsOpen, setSettingsOpen] = useState(isSettingsActive)

  // Keep accordion open when user navigates into settings
  useEffect(() => {
    if (isSettingsActive) setSettingsOpen(true)
  }, [isSettingsActive])

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    let pending = ''
    let timer: ReturnType<typeof setTimeout> | null = null

    function handleKeyDown(e: KeyboardEvent) {
      // Ignore when focus is in an input / textarea / contenteditable
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }

      pending += (pending ? ' ' : '') + e.key.toLowerCase()

      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { pending = '' }, 1000)

      const route = SHORTCUTS[pending]
      if (route) {
        pending = ''
        if (timer) clearTimeout(timer)
        router.push(route)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [router])

  // ── Sign out ────────────────────────────────────────────────────────────────
  // Clear BOTH cookies — the CRM session (Better Auth) AND the unified HRMS
  // session (NextAuth). nextAuthSignOut handles the redirect to /login.
  async function handleSignOut() {
    await authClient.signOut().catch(() => {})
    await nextAuthSignOut({ callbackUrl: '/login' })
  }

  const { user } = session
  // Sidebar visibility = role + topbar branch-view.
  //   • Role gate: super_admin (covers SUPER_ADMIN / AGENCY_ADMIN via the
  //     SSO bridge) sees admin items; lower roles don't.
  //   • Branch-view gate: when the topbar is locked to a single branch,
  //     a small set of tenant-wide items (Opportunities kanban, Platforms,
  //     Branches, Users, Settings) is *additionally* hidden — even from
  //     super_admin — because the user is intentionally scoped to a branch.
  const { selectedBranch } = useBranchContext()
  const inBranchView = !!selectedBranch

  // Sticky module tracking — remembers whether the user was last in the
  // tickets module or the leads module, so clicking Notifications/Settings
  // (shared routes) doesn't reset the sidebar context unexpectedly.
  // Persisted to sessionStorage so the choice survives a page reload but
  // not a new browser session.
  const [stickyModule, setStickyModule] = useState<'tickets' | 'leads' | null>(null)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (pathname.startsWith('/crm/tickets') || pathname.startsWith('/crm/tkt-')) {
      sessionStorage.setItem('crmStickyModule', 'tickets')
      setStickyModule('tickets')
    } else if (
      !pathname.startsWith('/crm/settings') &&
      !pathname.startsWith('/crm/notifications')
    ) {
      // Any non-shared, non-ticket path counts as the leads module.
      sessionStorage.setItem('crmStickyModule', 'leads')
      setStickyModule('leads')
    } else {
      // On a shared page; hydrate from storage so the first paint has the
      // right nav set (React state is empty on mount).
      const stored = sessionStorage.getItem('crmStickyModule')
      if (stored === 'tickets' || stored === 'leads') setStickyModule(stored)
    }
  }, [pathname])

  // Tickets-only departments (HR / Finance / Academy / CEO) never see the Lead
  // module — force the ticket nav. Marketing / Operation keep the lead module.
  const dept = scopedDepartmentForEmail(user.email)
  // Agency-view accounts (e.g. the CEO) keep the full Lead module even though
  // they're also a scoped ticket department.
  const isTicketsOnlyDept = !!dept && !dept.hasLeadSystem && !isAgencyViewAccount(user.email)
  const baseNav = isTicketsOnlyDept ? TICKET_NAV_ITEMS : pickNavForPath(pathname, stickyModule)
  const navItems = filterNav(baseNav, user.tktRole, inBranchView, user.email)
  // Settings is admin-only. Regional managers (and basic users) work like a
  // branch manager — branch/region data + the Region view — without the
  // tenant settings tree, so they don't see the Settings accordion.
  // Operation accounts never see Settings (lead oversight only).
  const canSeeSettings =
    !inBranchView &&
    !isOperationAccount(user.email) &&
    (!dept || isAgencyViewAccount(user.email)) &&
    (user.tktRole === 'super_admin' || user.tktRole === 'platform_admin')

  return (
    <aside className="flex h-full flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
      {/* Logo / brand — geometric diamond mark, inline so it inherits the
          theme colour (navy in light, white in dark) without needing an
          asset file. Matches the brand mark provided by the user. */}
      <div
        className={cn(
          'flex h-16 items-center border-b border-slate-200 dark:border-slate-800 px-4 shrink-0',
          collapsed ? 'justify-center' : 'gap-3',
        )}
      >
        <span
          aria-label="Ebright"
          className="flex h-8 w-8 shrink-0 items-center justify-center text-slate-900 dark:text-white"
        >
          <svg
            viewBox="0 0 100 100"
            fill="none"
            stroke="currentColor"
            strokeWidth={5}
            strokeLinejoin="miter"
            strokeLinecap="square"
            className="h-7 w-7"
            aria-hidden="true"
          >
            {/* Outer diamond frame */}
            <path d="M50 6 L94 50 L50 94 L6 50 Z" />
            {/* Inner concentric diamond */}
            <path d="M50 26 L74 50 L50 74 L26 50 Z" />
            {/* Centre small diamond */}
            <path d="M50 40 L60 50 L50 60 L40 50 Z" />
            {/* Side bridges connecting outer ↔ inner along the horizontal axis */}
            <path d="M26 50 L40 50" />
            <path d="M60 50 L74 50" />
          </svg>
        </span>
        {!collapsed && (
          <span className="font-semibold text-slate-900 dark:text-white tracking-tight">
            Ebright Nexus
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
        {navItems.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={item.label}
            collapsed={collapsed}
          />
        ))}

        {/* Settings accordion — hidden for basic users */}
        {canSeeSettings && <div>
          <button
            onClick={() => { setSettingsOpen(true); router.push('/crm/settings/profile') }}
            title={collapsed ? 'Settings' : undefined}
            className={cn(
              'group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
              isSettingsActive
                ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
              collapsed && 'justify-center px-2',
            )}
          >
            <Settings
              className={cn(
                'h-5 w-5 shrink-0',
                isSettingsActive
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300',
              )}
            />
            {!collapsed && (
              <>
                <span className="flex-1 truncate text-left">Settings</span>
                {settingsOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                )}
              </>
            )}
          </button>

          {!collapsed && settingsOpen && (
            <div className="mt-0.5 ml-4 space-y-0.5 border-l border-slate-200 dark:border-slate-700 pl-3">
              {SETTINGS_CHILDREN.map((child) => (
                <NavItem
                  key={child.href}
                  href={child.href}
                  icon={child.icon}
                  label={child.label}
                  collapsed={false}
                />
              ))}
            </div>
          )}
        </div>}
      </nav>

      {/* User footer */}
      <div
        className={cn(
          'shrink-0 border-t border-slate-200 dark:border-slate-800 p-3',
          collapsed ? 'flex flex-col items-center gap-2' : 'flex items-center gap-3',
        )}
      >
        {/* Avatar */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 text-xs font-semibold">
          {getInitials(user.name, user.email)}
        </div>

        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
              {user.name ?? user.email}
            </p>
            {user.name && (
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {user.email}
              </p>
            )}
          </div>
        )}

        <button
          onClick={handleSignOut}
          title="Sign out"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400 transition-colors"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
  )
}
