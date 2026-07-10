'use client'

import { useRef, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import {
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Bell,
  BellOff,
  ChevronDown,
  Check,
  CheckCheck,
  Building2,
  HelpCircle,
  Home,
  LogOut,
  Loader2,
  RefreshCw,
  UserCircle,
  UserCog,
  ArrowLeftRight,
  ChevronRight,
  RotateCcw,
  Share2,
  Sun,
  Moon,
} from 'lucide-react'
import { usePushSubscription } from '@/hooks/crm/usePushSubscription'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/crm/utils'
import { isOperationAccount, isHiddenForOperation } from '@/lib/crm/operation-accounts'
import { useBranchContext, type BranchInfo } from './branch-context'
import { DEPARTMENTS } from '@/lib/crm/departments'
import { authClient } from '@/lib/crm/auth-client'
import { useUnreadCount, useNotifications, useMarkNotificationRead, useMarkAllRead } from '@/hooks/crm/useNotifications'
import type { SessionUser } from './providers'
import { BranchAccessModal } from './branch-access-modal'

interface TopbarProps {
  collapsed: boolean
  onToggleCollapse: () => void
  session: { user: SessionUser }
}

// ─── Avatar initials helper ───────────────────────────────────────────────────

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

// ─── Branch switcher ──────────────────────────────────────────────────────────

const VIEW_MODE_KEY = 'crm.branchSwitcherViewMode'

function BranchSwitcher({ user }: { user: SessionUser }) {
  const { branches, selectedBranch, setSelectedBranch, loading, viewerRole } = useBranchContext()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // Branch whose access list is being managed (Agency View only).
  const [manageBranch, setManageBranch] = useState<BranchInfo | null>(null)
  // View mode is only meaningful for super admins — persists across reloads
  const [viewMode, setViewMode] = useState<'super' | 'agency'>('super')
  // `mounted` avoids hydration mismatch: server always renders the default
  // state; client swaps in localStorage-backed values on first effect pass.
  const [mounted, setMounted] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const pathname = usePathname()

  // After picking a branch (or "View all"), send the user to that module's
  // dashboard so they're not stranded on a detail page that no longer applies
  // to the new scope. Ticket pages → ticket dashboard, anything else → CRM
  // dashboard. Pages already on a dashboard or settings page stay where they
  // are (the route re-renders against the new branch scope automatically).
  function defaultLandingPage(): string {
    if (pathname.startsWith('/crm/tickets') || pathname.startsWith('/crm/tkt-')) {
      return '/crm/tickets/dashboard'
    }
    return '/crm/dashboard'
  }

  function selectBranchAndNavigate(branch: BranchInfo | null) {
    setSelectedBranch(branch)
    setOpen(false)
    setQuery('')
    // Push to module-specific dashboard. If user is already on a dashboard,
    // this still re-fires the route — useful since the branch context change
    // alone may not trigger a refetch on every detail page.
    router.push(defaultLandingPage())
  }

  // "Admin" for the purposes of seeing the Super Admin / Agency View toggle.
  // Three sources are accepted:
  //   1. CRM role (from /api/crm/branches → `viewerRole`) — the source of truth
  //   2. Ticket role (legacy super_admin in tkt_user_profile)
  //   3. Email convention used during preview mode
  const isAdmin =
    viewerRole === 'SUPER_ADMIN' ||
    viewerRole === 'AGENCY_ADMIN' ||
    (user as { tktRole?: string | null }).tktRole === 'super_admin' ||
    user.email === 'admin@ebright.my'

  // Operation accounts are elevated (all-branches) but get a single
  // "Operation View" — NO Agency-View toggle, NO super-admin tooling — and the
  // internal OD + Marketing branches are hidden from their branch list.
  const isOperation = isOperationAccount(user.email)
  // Only a real SUPER_ADMIN may use "Super Admin View". AGENCY_ADMIN accounts
  // (incl. the CEO / agency-view accounts) get Agency View only.
  const isRealSuper = viewerRole === 'SUPER_ADMIN'
  // The Super↔Agency toggle and agency-only tooling are for real admins only.
  const showViewToggle = isAdmin && !isOperation
  // Force super (all-branches) semantics for operation; force agency for any
  // elevated non-super (agency admins) so they never land in Super Admin View.
  const effectiveViewMode: 'super' | 'agency' = isOperation
    ? 'super'
    : !isRealSuper
      ? 'agency'
      : viewMode

  useEffect(() => {
    setMounted(true)
    if (typeof window === 'undefined') return
    const saved = localStorage.getItem(VIEW_MODE_KEY) as 'super' | 'agency' | null
    if (saved === 'super' || saved === 'agency') setViewMode(saved)
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function setMode(m: 'super' | 'agency') {
    setViewMode(m)
    if (typeof window !== 'undefined') localStorage.setItem(VIEW_MODE_KEY, m)
  }

  // Sort numerically by the "NN …" prefix. HR is excluded from dropdowns
  // entirely (no pipeline, no leads), so we no longer pin it. Any branches
  // without a numeric prefix sort alphabetically below the numbered set.
  const sorted = [...branches]
    .filter((b) => !/^Ebright HR$/i.test(b.name))
    // Operation accounts don't see the internal OD + Marketing branches.
    .filter((b) => !isOperation || !isHiddenForOperation(b.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

  const filtered = query
    ? sorted.filter(
        (b) =>
          b.name.toLowerCase().includes(query.toLowerCase()) ||
          (b.address ?? '').toLowerCase().includes(query.toLowerCase()),
      )
    : sorted

  // Labels — keep server + first client render identical, then update after mount.
  // Operation accounts always read "Operation View" (no Super/Agency wording).
  const adminViewLabel = isOperation
    ? 'Operation View'
    : effectiveViewMode === 'agency' ? 'Agency View' : 'Super Admin View'
  const defaultPanelLabel = !mounted
    ? isAdmin ? (isOperation ? 'Operation View' : 'Super Admin View') : 'My Branch'
    : isAdmin
      ? adminViewLabel
      : branches.length > 0 ? branches[0].name : 'My Branch'

  // Branch count shown to operation excludes the hidden OD + Marketing branches.
  const adminBranchCount = isOperation ? sorted.length : (branches.length || '—')

  const currentLabel = mounted ? (selectedBranch?.name ?? defaultPanelLabel) : defaultPanelLabel
  const currentSublabel = !mounted
    ? 'Loading…'
    : selectedBranch?.address ??
      (isAdmin
        // Admin who picked a specific branch is essentially impersonating the
        // branch-manager view — clearer than "Viewing all 23 branches".
        ? selectedBranch
          ? `Viewing as ${selectedBranch.name.replace(/^\d+\s+/, '')}`
          : `Viewing all ${adminBranchCount} branches`
        : branches.length > 1
          ? `Viewing ${branches.length} accessible branches`
          : 'Your branch'
      )

  return (
    <div ref={ref} className="relative">
      {/* Trigger — GHL-style wide button with 2 lines */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex min-w-80 max-w-105 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition',
          'hover:border-indigo-300 hover:shadow-sm',
          'dark:border-slate-700 dark:bg-slate-800 dark:hover:border-indigo-500',
        )}
      >
        <div className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          selectedBranch
            ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300'
            : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
        )}>
          <Building2 className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">
            {currentLabel}
          </div>
          <div className="truncate text-xs text-slate-500 dark:text-slate-400">
            {currentSublabel}
          </div>
        </div>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-120 max-w-[90vw] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800">
          {/* Admin-only view-mode toggle (Super Admin ↔ Agency View).
              Operation accounts don't get this — they have a single view. */}
          {showViewToggle && (
            <div className="flex items-center gap-1 border-b border-slate-100 bg-slate-50 p-1.5 dark:border-slate-700 dark:bg-slate-900">
              {isRealSuper && (
                <button
                  onClick={() => setMode('super')}
                  className={cn(
                    'flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition',
                    viewMode === 'super'
                      ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-800 dark:text-indigo-300'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
                  )}
                >
                  Super Admin View
                </button>
              )}
              <button
                onClick={() => setMode('agency')}
                className={cn(
                  'flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition',
                  viewMode === 'agency'
                    ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-800 dark:text-indigo-300'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
                )}
              >
                Agency View
              </button>
            </div>
          )}

          {/* Agency-only: Manage branch access */}
          {showViewToggle && effectiveViewMode === 'agency' && (
            <button
              onClick={() => { router.push('/crm/settings/branch-access'); setOpen(false) }}
              className="flex w-full items-center gap-3 border-b border-slate-100 bg-indigo-50/60 px-3 py-2.5 text-sm transition hover:bg-indigo-100 dark:border-slate-700 dark:bg-indigo-950/30 dark:hover:bg-indigo-950/50"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900">
                <UserCog className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-300" />
              </div>
              <span className="flex-1 text-left font-medium text-indigo-700 dark:text-indigo-300">
                Manage branch access
              </span>
              <ChevronRight className="h-4 w-4 text-indigo-400" />
            </button>
          )}

          {/* Search */}
          <div className="border-b border-slate-100 p-3 dark:border-slate-700">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for a sub-account"
                className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* "View all" option — admins see all their branches at once */}
          {branches.length > 1 && (
            <button
              onClick={() => selectBranchAndNavigate(null)}
              className={cn(
                'flex w-full items-center gap-3 px-3 py-2.5 text-sm transition',
                'hover:bg-slate-50 dark:hover:bg-slate-700',
                selectedBranch === null && 'bg-indigo-50 dark:bg-indigo-950/40',
              )}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700">
                <Building2 className="h-3.5 w-3.5 text-slate-500" />
              </div>
              <span className="flex-1 text-left font-medium text-indigo-600 dark:text-indigo-400">
                {isAdmin
                  ? effectiveViewMode === 'agency' ? 'Switch to Agency View' : 'View all branches'
                  : 'All my branches'}
              </span>
              {selectedBranch === null && <Check className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />}
            </button>
          )}

          {/* Regions — admins only. Deep-links into the Day Distribution
              (Region) view pre-filtered to the chosen region. Branches are
              grouped A/B/C in lib/crm/dashboard-metrics; this is the quick
              jump the super admin asked for in the top-left dropdown. */}
          {isAdmin && (
            <div className="border-t border-slate-100 dark:border-slate-700">
              <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Regions
              </div>
              <div className="flex flex-wrap gap-1.5 px-3 pb-2">
                {(['A', 'B', 'C'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => { router.push(`/crm/region?region=${r}`); setOpen(false); setQuery('') }}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/40"
                  >
                    Region {r}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Departments — admins only. Jumps to the ticket triage board
              filtered to one department's directed tickets (by sub_type). */}
          {isAdmin && (
            <div className="border-t border-slate-100 dark:border-slate-700">
              <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Departments
              </div>
              <div className="flex flex-wrap gap-1.5 px-3 pb-2">
                {DEPARTMENTS.map((d) => (
                  <button
                    key={d.subType}
                    onClick={() => { router.push(`/crm/tickets/kanban?dept=${d.subType}`); setOpen(false); setQuery('') }}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/40"
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-700">
            {isAdmin ? 'All Accounts' : 'Accessible Branches'}
          </div>

          {/* Branch list */}
          <div className="max-h-125 overflow-y-auto pb-1">
            {loading ? (
              <div className="px-3 py-6 text-center text-sm text-slate-400">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-slate-400">
                {query ? 'No matches' : 'No branches found'}
              </div>
            ) : (
              filtered.map((branch: BranchInfo) => {
                const selected = selectedBranch?.id === branch.id
                const showShare = showViewToggle && effectiveViewMode === 'agency'
                return (
                  <div
                    key={branch.id}
                    className={cn(
                      'flex items-center gap-1 transition',
                      'hover:bg-slate-50 dark:hover:bg-slate-700',
                      selected && 'bg-indigo-50 dark:bg-indigo-950/40',
                    )}
                  >
                    <button
                      onClick={() => selectBranchAndNavigate(branch)}
                      className="flex flex-1 items-start gap-3 px-3 py-2.5 text-left min-w-0"
                    >
                      <div className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                        selected
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
                      )}>
                        {branch.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm font-medium text-slate-900 dark:text-white">
                          {branch.name}
                        </div>
                        {branch.address && (
                          <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {branch.address}
                          </div>
                        )}
                      </div>
                      {selected && <Check className="mt-1 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />}
                    </button>
                    {showShare && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setManageBranch(branch)
                        }}
                        title="Manage who can view this branch"
                        className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-indigo-100 hover:text-indigo-700 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Branch-access manager — opens from the share icon next to a branch */}
      {manageBranch && (
        <BranchAccessModal
          branchId={manageBranch.id}
          branchName={manageBranch.name}
          onClose={() => setManageBranch(null)}
        />
      )}
    </div>
  )
}

// ─── Refresh button ───────────────────────────────────────────────────────────
// Sits to the LEFT of the search bar. Click → hard reload of the current
// page. We used to call queryClient.invalidateQueries() + router.refresh()
// here, but invalidateQueries only refetches ACTIVE queries (mounted
// observers) — anything on a tab the user isn't currently viewing stayed
// stale, and server-component pages didn't visibly update either. A plain
// reload is what users expect from a "Refresh" button anyway, so we just
// do that. The icon spins for a beat before the reload kicks in so the
// click registers visually.

function RefreshButton() {
  const [spinning, setSpinning] = useState(false)

  function handleRefresh() {
    if (spinning) return
    setSpinning(true)
    // Tiny delay so the spinner has a chance to paint before we navigate.
    // 250ms is enough to register the click without making the user wait.
    setTimeout(() => {
      window.location.reload()
    }, 250)
  }

  return (
    <button
      type="button"
      onClick={handleRefresh}
      disabled={spinning}
      title="Refresh page"
      aria-label="Refresh page"
      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-indigo-600 disabled:opacity-60 dark:hover:bg-slate-800 dark:hover:text-indigo-300 transition-colors"
    >
      <RefreshCw className={cn('h-4 w-4', spinning && 'animate-spin')} />
    </button>
  )
}

// ─── Help tooltip ─────────────────────────────────────────────────────────────
// Sits to the RIGHT of the search bar. Not clickable — hover/focus only.
// The tooltip lists the keyboard shortcuts that already exist on the page
// so branch managers can discover them without docs.

function HelpTooltip() {
  return (
    <div
      className="group relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
      tabIndex={0}
      aria-label="Help — shortcuts"
    >
      <HelpCircle className="h-4 w-4" aria-hidden="true" />
      <div
        role="tooltip"
        className={cn(
          'pointer-events-none absolute right-0 top-full z-50 mt-2 w-72',
          'rounded-lg border border-slate-200 bg-white p-3 shadow-xl',
          'opacity-0 translate-y-1 transition-all duration-150',
          'group-hover:opacity-100 group-hover:translate-y-0',
          'group-focus-within:opacity-100 group-focus-within:translate-y-0',
          'dark:border-slate-700 dark:bg-slate-800',
        )}
      >
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Tips & shortcuts
        </p>
        <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-200">
          <li className="flex items-center justify-between gap-3">
            <span>Focus search</span>
            <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">/</kbd>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span>Go to Dashboard</span>
            <span>
              <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">G</kbd>
              <span className="px-1 text-slate-400">then</span>
              <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">D</kbd>
            </span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span>Go to Contacts</span>
            <span>
              <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">G</kbd>
              <span className="px-1 text-slate-400">then</span>
              <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">C</kbd>
            </span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span>Go to Opportunities</span>
            <span>
              <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">G</kbd>
              <span className="px-1 text-slate-400">then</span>
              <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">O</kbd>
            </span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span>Blur search</span>
            <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">Esc</kbd>
          </li>
        </ul>
        <p className="mt-2 text-[10px] italic text-slate-400">
          Click the refresh icon on the left to re-fetch everything on the page.
        </p>
      </div>
    </div>
  )
}

// ─── Global search ────────────────────────────────────────────────────────────

interface SearchContactHit {
  id: string
  firstName: string
  lastName: string | null
  parentFullName: string | null
  phone: string | null
  email: string | null
}

// Quick-nav targets. Matched against label + keywords so "auto" → Automations,
// "pipe" → Pipelines, etc. The destination page enforces its own role access.
const SEARCH_PAGES: Array<{ label: string; href: string; kw: string }> = [
  { label: 'Dashboard',              href: '/crm/dashboard',              kw: 'dashboard home metrics leads overview' },
  { label: 'Opportunities',          href: '/crm/opportunities',          kw: 'opportunities kanban pipeline leads board cards' },
  { label: 'Contacts',               href: '/crm/contacts',               kw: 'contacts leads people parents' },
  { label: 'Tickets',                href: '/crm/tickets',                kw: 'tickets support issues helpdesk' },
  { label: 'Automations',            href: '/crm/automations',            kw: 'automations automation workflow auto triggers' },
  { label: 'Forms',                  href: '/crm/forms',                  kw: 'forms trial registration' },
  { label: 'Analytics',              href: '/crm/analytics',              kw: 'analytics reports charts insights' },
  { label: 'Notifications',          href: '/crm/notifications',          kw: 'notifications alerts' },
  { label: 'Settings · Pipelines',   href: '/crm/settings/pipelines',     kw: 'settings pipelines stages buffer' },
  { label: 'Settings · Team',        href: '/crm/settings/team',          kw: 'settings team users members staff' },
  { label: 'Settings · Tags',        href: '/crm/settings/tags',          kw: 'settings tags labels' },
  { label: 'Settings · Lead Sources', href: '/crm/settings/lead-sources', kw: 'settings lead sources channels' },
  { label: 'Settings · Branch Access', href: '/crm/settings/branch-access', kw: 'settings branch access permissions' },
]

function GlobalSearch() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)

  // Debounce the contact lookup so we don't fire a request on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === 'Escape') {
        setOpen(false)
        inputRef.current?.blur()
      }
    }
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Lead/contact search — reuses the branch-scoped /api/crm/contacts endpoint.
  const { data, isFetching } = useQuery({
    queryKey: ['crm', 'global-search', debounced],
    queryFn: async (): Promise<{ data: SearchContactHit[] }> => {
      const res = await fetch(`/api/crm/contacts?search=${encodeURIComponent(debounced)}&pageSize=6`)
      if (!res.ok) throw new Error('Search failed')
      return res.json()
    },
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  })

  const q = query.trim().toLowerCase()
  const pageHits = q
    ? SEARCH_PAGES.filter((p) => p.label.toLowerCase().includes(q) || p.kw.includes(q)).slice(0, 5)
    : []
  const contacts = debounced.length >= 2 ? data?.data ?? [] : []
  const showDropdown = open && q.length > 0

  function go(href: string) {
    setOpen(false)
    setQuery('')
    inputRef.current?.blur()
    router.push(href)
  }

  function contactName(c: SearchContactHit): string {
    if (c.parentFullName) return c.parentFullName
    return `${c.firstName} ${c.lastName ?? ''}`.trim() || 'Unnamed lead'
  }

  return (
    <div ref={containerRef} className="relative hidden sm:block">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Search… (press /)"
        className="h-9 w-56 lg:w-72 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-9 pr-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
      />

      {showDropdown && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800">
          {/* Quick page navigation */}
          {pageHits.length > 0 && (
            <div className="py-1">
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Pages</div>
              {pageHits.map((p) => (
                <button
                  key={p.href}
                  onClick={() => go(p.href)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="text-slate-800 dark:text-slate-100">{p.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Leads / contacts */}
          <div className={cn('py-1', pageHits.length > 0 && 'border-t border-slate-100 dark:border-slate-700')}>
            <div className="flex items-center justify-between px-3 py-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Leads</span>
              {isFetching && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
            </div>
            {debounced.length < 2 ? (
              <p className="px-3 py-2 text-xs text-slate-400">Type 2+ letters to search leads…</p>
            ) : contacts.length === 0 && !isFetching ? (
              <p className="px-3 py-2 text-xs text-slate-400">No leads match &ldquo;{query}&rdquo;.</p>
            ) : (
              contacts.map((c) => (
                <button
                  key={c.id}
                  onClick={() => go(`/crm/contacts/${c.id}`)}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                    {contactName(c).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-900 dark:text-white">{contactName(c)}</div>
                    <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {[c.phone, c.email].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── User menu ────────────────────────────────────────────────────────────────

interface PreviewUser {
  /** crm_auth_user.id, or null when the user only exists in HRMS yet. */
  id: string | null
  email: string
  name: string | null
  tktRole: string | null
  crmRole: string | null
  hrmsRole: string | null
  hrmsBranchName: string | null
  /** True if the user already has a crm_auth_user row. */
  provisioned: boolean
}

function UserMenu({ user }: { user: SessionUser }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loginAsOpen, setLoginAsOpen] = useState(false)
  const [users, setUsers] = useState<PreviewUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setLoginAsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function openLoginAs() {
    setLoginAsOpen(true)
    if (users.length === 0) {
      setLoadingUsers(true)
      try {
        const res = await fetch('/api/crm/preview/users')
        if (res.ok) setUsers(await res.json())
      } catch {
        toast.error('Failed to load users')
      } finally {
        setLoadingUsers(false)
      }
    }
  }

  async function impersonate(userId: string | null, name: string | null, email: string) {
    // userId may be null for HRMS-only users — server provisions a crm_auth_user
    // row from the email when that happens.
    const payload = userId ? { userId } : { email }
    const res = await fetch('/api/crm/preview/login-as', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      toast.error('Failed to switch user')
      return
    }
    toast.success(`Now viewing as ${name ?? email}`)
    window.location.reload()
  }

  async function resetToDefault() {
    await fetch('/api/crm/preview/reset', { method: 'POST' })
    toast.success('Reset to default admin')
    window.location.reload()
  }

  function handleSignOut() {
    // Fire-and-forget Better Auth sign-out (no-op in preview mode)
    void authClient.signOut().catch(() => undefined)
    // Immediate navigation — do NOT await, browser follows the 302 to /login and sets cookies
    window.location.assign('/api/crm/preview/exit')
  }

  const filteredUsers = search
    ? users.filter(
        (u) =>
          u.email.toLowerCase().includes(search.toLowerCase()) ||
          (u.name ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : users

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 text-xs font-semibold">
          {getInitials(user.name, user.email)}
        </div>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400 hidden sm:block" />
      </button>

      {open && !loginAsOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-1 shadow-lg">
          {/* Identity */}
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
              {user.name ?? 'User'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
              {user.email}
            </p>
          </div>

          <button
            onClick={() => { router.push('/crm/settings/profile'); setOpen(false) }}
            className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <UserCircle className="h-4 w-4 text-slate-400" />
            Profile Settings
          </button>

          <button
            onClick={openLoginAs}
            className="flex w-full items-center justify-between gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <span className="flex items-center gap-2.5">
              <ArrowLeftRight className="h-4 w-4 text-slate-400" />
              Login As…
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          </button>

          <button
            onClick={resetToDefault}
            className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <RotateCcw className="h-4 w-4 text-slate-400" />
            Reset to default admin
          </button>

          <hr className="my-1 border-slate-100 dark:border-slate-700" />

          <ThemeToggleRow />

          <hr className="my-1 border-slate-100 dark:border-slate-700" />

          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      )}

      {open && loginAsOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-1 shadow-lg">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-700">
            <button
              onClick={() => setLoginAsOpen(false)}
              className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
              title="Back"
            >
              <ChevronRight className="h-4 w-4 rotate-180" />
            </button>
            <span className="text-sm font-semibold text-slate-900 dark:text-white">Login as user</span>
          </div>

          <div className="p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users…"
                autoFocus
                className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto pb-1">
            {loadingUsers ? (
              <div className="py-6 text-center text-sm text-slate-500">Loading users…</div>
            ) : filteredUsers.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-500">No users found</div>
            ) : (
              filteredUsers.map((u) => {
                // Prefer the CRM-side role when available; fall back to HRMS
                // so HRMS-only users still display a role badge.
                const roleLabel = u.tktRole ?? u.crmRole ?? u.hrmsRole
                return (
                  <button
                    key={u.id ?? u.email}
                    onClick={() => impersonate(u.id, u.name, u.email)}
                    disabled={u.id !== null && u.id === user.id}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-40 dark:hover:bg-slate-700"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-semibold dark:bg-indigo-900 dark:text-indigo-300">
                      {getInitials(u.name, u.email)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-medium text-slate-900 dark:text-white">
                        {u.name ?? u.email}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs text-slate-500 dark:text-slate-400">{u.email}</span>
                        {!u.provisioned && (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0 text-[9px] text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                            new
                          </span>
                        )}
                      </div>
                    </div>
                    {roleLabel && (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                        {roleLabel}
                      </span>
                    )}
                    {u.id !== null && u.id === user.id && <Check className="h-3.5 w-3.5 text-indigo-500" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Notification bell + dropdown ─────────────────────────────────────────────

interface NotificationItem {
  id: string
  type: string
  title: string
  body: string
  link?: string | null
  readAt?: string | Date | null
  createdAt: string | Date
}

function formatNotificationTime(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const diffMs = Date.now() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

function NotificationBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { data: unreadCount = 0 } = useUnreadCount()
  // Only fetch the list payload when the dropdown is open — saves a poll
  // on every topbar render for users who never click the bell.
  const { data: list, isLoading } = useNotifications('all') as {
    data: { data: NotificationItem[]; total: number } | undefined
    isLoading: boolean
  }
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllRead()

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const notifications = (list?.data ?? []).slice(0, 8)

  function handleItemClick(n: NotificationItem) {
    if (!n.readAt) {
      markRead.mutate(n.id)
    }
    setOpen(false)
    if (n.link) {
      router.push(n.link)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        title="Notifications"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-96 max-w-[90vw] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                Notifications
              </span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-950/40 dark:text-red-300">
                  {unreadCount > 99 ? '99+' : unreadCount} new
                </span>
              )}
            </div>
            <button
              onClick={() => markAllRead.mutate()}
              disabled={unreadCount === 0 || markAllRead.isPending}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
              title="Mark all as read"
            >
              <CheckCheck className="h-3 w-3" /> Mark all read
            </button>
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="px-3 py-6 text-center text-xs text-slate-400">Loading…</div>
            ) : notifications.length === 0 ? (
              <div className="px-3 py-10 text-center">
                <Bell className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
                <p className="text-xs text-slate-400">No notifications yet.</p>
              </div>
            ) : (
              notifications.map((n) => {
                const unread = !n.readAt
                return (
                  <button
                    key={n.id}
                    onClick={() => handleItemClick(n)}
                    className={cn(
                      'flex w-full items-start gap-2 border-b border-slate-100 px-3 py-2.5 text-left transition last:border-0',
                      'hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700/60',
                      unread && 'bg-indigo-50/40 dark:bg-indigo-950/20',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                        unread ? 'bg-indigo-500' : 'bg-transparent',
                      )}
                      aria-hidden="true"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <p
                          className={cn(
                            'truncate text-sm',
                            unread
                              ? 'font-semibold text-slate-900 dark:text-white'
                              : 'font-medium text-slate-700 dark:text-slate-300',
                          )}
                        >
                          {n.title}
                        </p>
                        <span className="shrink-0 whitespace-nowrap text-[10px] text-slate-400">
                          {formatNotificationTime(n.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                        {n.body}
                      </p>
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {/* Footer — link to the full page + push toggle */}
          <div className="border-t border-slate-100 px-3 py-2 dark:border-slate-700">
            <button
              onClick={() => {
                setOpen(false)
                router.push('/crm/notifications')
              }}
              className="w-full rounded-md py-1.5 text-center text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
            >
              View all notifications
            </button>
            <PushNotificationToggle />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Push notification toggle (in notification dropdown footer) ──────────────
//
// Lets the user opt in/out of browser push for the in-app notifications they
// already get via the bell. Toggle OFF removes only the push subscription —
// notifications still write to crm_notification and appear on the bell list.
//
// The user's tenantId is read off the first accessible branch (every branch
// in BranchContext carries it). Hidden when the browser doesn't support
// the Push API or when no tenantId is available yet.

function PushNotificationToggle() {
  const { branches } = useBranchContext()
  const tenantId = branches[0]?.tenantId ?? null
  const push     = usePushSubscription(tenantId)

  // Surface subscribe/unsubscribe failures so "the toggle won't turn on" is
  // diagnosable instead of failing silently.
  useEffect(() => {
    if (push.error) toast.error(`Push notifications: ${push.error}`)
  }, [push.error])

  if (!push.ready)     return null
  if (push.unsupported) return null

  const handleClick = () => {
    if (push.pending) return
    if (push.subscribed) void push.unsubscribe()
    else                 void push.subscribe()
  }

  return (
    <div className="mt-1 flex items-center justify-between gap-2 rounded-md px-2 py-1.5">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
        {push.subscribed ? (
          <Bell className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
        ) : (
          <BellOff className="h-3.5 w-3.5 text-slate-400" />
        )}
        <span>Browser push notifications</span>
      </div>

      <button
        type="button"
        onClick={handleClick}
        disabled={push.pending || push.denied}
        aria-pressed={push.subscribed}
        title={
          push.denied
            ? 'Browser blocked notifications — re-enable in site settings'
            : push.subscribed
              ? 'Push is on. Click to turn off (in-app bell still works).'
              : 'Push is off. Click to receive browser notifications too.'
        }
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
          push.subscribed ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600',
          (push.pending || push.denied) && 'opacity-50 cursor-not-allowed',
        )}
      >
        <span
          className={cn(
            'inline-flex h-3.5 w-3.5 transform items-center justify-center rounded-full bg-white shadow-sm transition-transform',
            push.subscribed ? 'translate-x-4' : 'translate-x-1',
          )}
        >
          {push.pending && <Loader2 className="h-2.5 w-2.5 animate-spin text-slate-500" />}
        </span>
      </button>
    </div>
  )
}

// ─── Topbar ───────────────────────────────────────────────────────────────────

export function CrmTopbar({ collapsed, onToggleCollapse, session }: TopbarProps) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4">
      {/* Sidebar toggle */}
      <button
        onClick={onToggleCollapse}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? (
          <PanelLeftOpen className="h-5 w-5" />
        ) : (
          <PanelLeftClose className="h-5 w-5" />
        )}
      </button>

      {/* Home — back to the CRM hub picker (Lead / Ticket tiles) */}
      <Link
        href="/dashboards/crm"
        title="Back to CRM home"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400 transition-colors"
      >
        <Home className="h-5 w-5" />
      </Link>

      {/* Branch switcher — visible to all authenticated users.
          Server-side, non-admins only see their assigned branch(es). */}
      <BranchSwitcher user={session.user} />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Refresh — invalidates every React Query + soft-refreshes the
          server components. Visual confirmation via a brief spin. */}
      <RefreshButton />

      {/* Global search */}
      <GlobalSearch />

      {/* Help — hover-only tooltip listing keyboard shortcuts.
          Not clickable; tabbable for keyboard users (focus shows it too). */}
      <HelpTooltip />

      {/* Notification bell — dropdown panel showing recent notifications.
          Clicking an item marks it read and follows its link (if any).
          "View all" in the footer still navigates to /crm/notifications. */}
      <NotificationBell />

      {/* User menu */}
      <UserMenu user={session.user} />
    </header>
  )
}

// ─── Theme toggle row (in user dropdown) ──────────────────────────────────────
//
// Reads + writes via next-themes. The ThemeProvider in components/crm/providers.tsx
// is configured with attribute="class" defaultTheme="dark", so toggling here
// flips the .dark class on <html> and all the dark: variants throughout the
// CRM follow. Persists in localStorage automatically.
//
// Guarded against the server / hydration mismatch with a mounted flag —
// next-themes is client-only.

function ThemeToggleRow() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Treat anything other than 'light' as dark — covers the system / undefined
  // edge cases without needing to wait for resolvedTheme.
  const isDark = !mounted || theme !== 'light'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="flex w-full items-center justify-between gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
    >
      <span className="flex items-center gap-2.5">
        {isDark ? <Moon className="h-4 w-4 text-slate-400" /> : <Sun className="h-4 w-4 text-amber-500" />}
        {isDark ? 'Dark mode' : 'Light mode'}
      </span>
      <span
        aria-hidden
        className={cn(
          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
          isDark ? 'bg-indigo-500' : 'bg-slate-300',
        )}
      >
        <span
          className={cn(
            'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform',
            isDark ? 'translate-x-4' : 'translate-x-1',
          )}
        />
      </span>
    </button>
  )
}
