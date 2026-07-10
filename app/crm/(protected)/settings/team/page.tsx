'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  getFilteredRowModel,
  type ColumnFiltersState,
} from '@tanstack/react-table'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { UserPlus, Loader2, X, Trash2, MoreHorizontal, Search, Users, ShieldCheck, UserCog, User } from 'lucide-react'
import { useReadOnlyViewer } from '@/lib/crm/use-read-only-viewer'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { cn } from '@/lib/crm/utils'
import { useTeam, type TeamUser } from '@/hooks/crm/useTeam'
import { formatDate } from '@/lib/crm/utils'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const InviteSchema = z.object({
  email: z.string().email('Invalid email'),
  role: z.enum(['AGENCY_ADMIN', 'BRANCH_MANAGER', 'BRANCH_STAFF']),
  branchIds: z.array(z.string()).min(1, 'Select at least one branch'),
})
type InviteValues = z.infer<typeof InviteSchema>

const ROLES = [
  { value: 'AGENCY_ADMIN', label: 'Agency Admin' },
  { value: 'BRANCH_MANAGER', label: 'Branch Manager' },
  { value: 'BRANCH_STAFF', label: 'Branch Staff' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roleBadge(role: string) {
  const colors: Record<string, string> = {
    SUPER_ADMIN: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
    AGENCY_ADMIN: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
    BRANCH_MANAGER: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
    BRANCH_STAFF: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  }
  const labels: Record<string, string> = {
    SUPER_ADMIN: 'Super Admin',
    AGENCY_ADMIN: 'Agency Admin',
    BRANCH_MANAGER: 'Branch Manager',
    BRANCH_STAFF: 'Branch Staff',
  }
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', colors[role] ?? 'bg-slate-100 text-slate-600')}>
      {labels[role] ?? role}
    </span>
  )
}

// ─── Invite Modal ─────────────────────────────────────────────────────────────

function InviteModal({
  branches,
  onClose,
  onSuccess,
}: {
  branches: { id: string; name: string }[]
  onClose: () => void
  onSuccess: () => void
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<InviteValues>({
    resolver: zodResolver(InviteSchema),
    defaultValues: { email: '', role: 'BRANCH_STAFF', branchIds: [] },
  })

  const selectedBranchIds = watch('branchIds')

  function toggleBranch(id: string) {
    const current = selectedBranchIds ?? []
    if (current.includes(id)) {
      setValue('branchIds', current.filter((b) => b !== id), { shouldValidate: true })
    } else {
      setValue('branchIds', [...current, id], { shouldValidate: true })
    }
  }

  async function onSubmit(data: InviteValues) {
    const res = await fetch('/api/crm/team/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string }
      toast.error(err.error ?? 'Failed to invite user')
      return
    }
    toast.success('Invitation sent')
    onSuccess()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Invite Team Member</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-5 py-4 space-y-4">
          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
            <input
              {...register('email')}
              type="email"
              placeholder="colleague@example.com"
              className={cn(
                'w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white',
                'focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400',
                errors.email ? 'border-red-400' : 'border-slate-300 dark:border-slate-600',
              )}
            />
            {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Role</label>
            <select
              {...register('role')}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {/* Branches */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Branches</label>
            <div className="flex flex-wrap gap-2">
              {branches.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => toggleBranch(b.id)}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                    selectedBranchIds?.includes(b.id)
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                      : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800',
                  )}
                >
                  {b.name}
                </button>
              ))}
            </div>
            {errors.branchIds && <p className="text-xs text-red-500">{errors.branchIds.message}</p>}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Send invitation
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Confirm modal ────────────────────────────────────────────────────────────

function ConfirmModal({
  message,
  onConfirm,
  onCancel,
  isPending,
}: {
  message: string
  onConfirm: () => void
  onCancel: () => void
  isPending?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm rounded-xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
        <p className="text-sm text-slate-700 dark:text-slate-300">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

const col = createColumnHelper<TeamUser>()

export default function TeamPage() {
  const readOnly = useReadOnlyViewer()
  const { data, isLoading, isError, refetch } = useTeam()
  const qc = useQueryClient()

  const [showInvite, setShowInvite] = useState(false)
  const [confirmDeactivate, setConfirmDeactivate] = useState<TeamUser | null>(null)
  const [deactivating, setDeactivating] = useState(false)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('__all__')

  // Stats
  const stats = useMemo(() => {
    const users = data?.users ?? []
    const roleOf = (u: TeamUser) => u.branches[0]?.role ?? ''
    return {
      total:    users.length,
      admins:   users.filter((u) => roleOf(u) === 'SUPER_ADMIN' || roleOf(u) === 'AGENCY_ADMIN').length,
      managers: users.filter((u) => roleOf(u) === 'BRANCH_MANAGER').length,
      staff:    users.filter((u) => roleOf(u) === 'BRANCH_STAFF').length,
    }
  }, [data?.users])

  // Filtered list
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const users = data?.users ?? []
    return users.filter((u) => {
      if (roleFilter !== '__all__') {
        const userRole = u.branches[0]?.role
        if (userRole !== roleFilter) return false
      }
      if (!q) return true
      return (
        (u.name ?? '').toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
      )
    })
  }, [data?.users, search, roleFilter])

  // Fetch branches for invite modal
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    fetch('/api/crm/branches')
      .then((r) => r.json())
      .then((d: { branches: { id: string; name: string }[] }) => {
        if (d.branches) setBranches(d.branches)
      })
      .catch(() => {})
  }, [])

  async function handleRoleChange(userId: string, branchId: string, role: string) {
    const res = await fetch('/api/crm/team/role', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, branchId, role }),
    })
    if (res.ok) {
      toast.success('Role updated')
      void qc.invalidateQueries({ queryKey: ['crm', 'team'] })
    } else {
      toast.error('Failed to update role')
    }
  }

  async function handleDeactivate() {
    if (!confirmDeactivate) return
    setDeactivating(true)
    try {
      const res = await fetch('/api/crm/team/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: confirmDeactivate.id }),
      })
      if (res.ok) {
        toast.success('User deactivated')
        void refetch()
      } else {
        toast.error('Failed to deactivate user')
      }
    } finally {
      setDeactivating(false)
      setConfirmDeactivate(null)
    }
  }

  const columns = [
    col.accessor('name', {
      header: 'Name',
      cell: (info) => (
        <div>
          <p className="text-sm font-medium text-slate-900 dark:text-white">{info.getValue() ?? '—'}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{info.row.original.email}</p>
        </div>
      ),
    }),
    col.accessor('branches', {
      header: 'Role / Branch',
      cell: (info) => (
        <div className="space-y-1">
          {info.getValue().map((b) => (
            <div key={b.id} className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">{b.name}</span>
              {readOnly ? (
                <span className="rounded border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 text-xs text-slate-600 dark:text-slate-400">
                  {ROLES.find((r) => r.value === b.role)?.label ?? b.role}
                </span>
              ) : (
                <select
                  value={b.role}
                  onChange={(e) => handleRoleChange(info.row.original.id, b.id, e.target.value)}
                  className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-1 py-0.5 text-xs text-slate-700 dark:text-slate-300 focus:outline-none"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>
      ),
    }),
    col.accessor('createdAt', {
      header: 'Joined',
      cell: (info) => (
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {formatDate(info.getValue())}
        </span>
      ),
    }),
    col.display({
      id: 'actions',
      header: '',
      cell: (info) => (
        readOnly ? null : (
        <button
          onClick={() => setConfirmDeactivate(info.row.original)}
          title="Remove user"
          className="flex items-center justify-center h-7 w-7 rounded text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950 dark:hover:text-red-400 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        )
      ),
    }),
  ]

  const table = useReactTable({
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Team</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Manage team members and their roles.
          </p>
        </div>
        {!readOnly && (
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            Invite member
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users}       label="Total Members"   value={stats.total}    tint="indigo"  />
        <StatCard icon={ShieldCheck} label="Admins"          value={stats.admins}   tint="purple"  />
        <StatCard icon={UserCog}     label="Branch Managers" value={stats.managers} tint="emerald" />
        <StatCard icon={User}        label="Branch Staff"    value={stats.staff}    tint="slate"   />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full rounded-md border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="__all__">All roles</option>
          <option value="SUPER_ADMIN">Super Admin</option>
          <option value="AGENCY_ADMIN">Agency Admin</option>
          <option value="BRANCH_MANAGER">Branch Manager</option>
          <option value="BRANCH_STAFF">Branch Staff</option>
        </select>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {filtered.length} of {stats.total} shown
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
          </div>
        ) : isError ? (
          <div className="text-center py-16 text-sm text-slate-500">
            Failed to load team members.
            <button onClick={() => refetch()} className="ml-2 text-indigo-600 hover:underline">Retry</button>
          </div>
        ) : (data?.users ?? []).length === 0 ? (
          <div className="text-center py-16">
            <p className="text-slate-500 dark:text-slate-400 text-sm">No team members yet.</p>
            <button onClick={() => setShowInvite(true)} className="mt-3 text-sm text-indigo-600 hover:underline">
              Invite your first member
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-slate-200 dark:border-slate-700">
                  {hg.headers.map((h) => (
                    <th
                      key={h.id}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {showInvite && (
        <InviteModal
          branches={branches}
          onClose={() => setShowInvite(false)}
          onSuccess={() => void refetch()}
        />
      )}

      {confirmDeactivate && (
        <ConfirmModal
          message={`Remove ${confirmDeactivate.name ?? confirmDeactivate.email} from all branches? This cannot be undone.`}
          onConfirm={handleDeactivate}
          onCancel={() => setConfirmDeactivate(null)}
          isPending={deactivating}
        />
      )}
    </div>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────

const STAT_TINTS = {
  indigo:  'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400',
  purple:  'bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
  slate:   'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
} as const

function StatCard({
  icon: Icon,
  label,
  value,
  tint,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  tint: keyof typeof STAT_TINTS
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', STAT_TINTS[tint])}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
        <div className="text-xl font-semibold text-slate-900 dark:text-slate-100">{value}</div>
      </div>
    </div>
  )
}
