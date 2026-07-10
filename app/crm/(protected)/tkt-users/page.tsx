'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Loader2, Search, ShieldCheck, User as UserIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/crm/utils'

type TktRole = 'super_admin' | 'platform_admin' | 'user'

interface TktUser {
  user_id: string
  email: string
  name: string | null
  role: TktRole
  platforms: Array<{ id: string; name: string }>
  branches: Array<{ id: string; name: string; branch_number: string }>
}

interface Platform {
  id: string
  name: string
  code: string
  accent_color: string
}

interface Branch {
  id: string
  name: string
  code: string
  branch_number: string
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const e = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((e as { error?: string }).error ?? res.statusText)
  }
  return res.json() as Promise<T>
}

export default function TktUsersPage() {
  const qc = useQueryClient()

  const { data: users = [], isLoading } = useQuery<TktUser[]>({
    queryKey: ['tkt-users'],
    queryFn: () => fetchJson<TktUser[]>('/api/crm/tkt-users'),
  })

  const { data: platforms = [] } = useQuery<Platform[]>({
    queryKey: ['tkt-platforms'],
    queryFn: () => fetchJson<Platform[]>('/api/crm/tkt-platforms'),
  })

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['tkt-branches'],
    queryFn: () => fetchJson<Branch[]>('/api/crm/tkt-branches'),
  })

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('__all__')
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; user?: TktUser } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TktUser | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter((u) => {
      if (roleFilter !== '__all__' && u.role !== roleFilter) return false
      if (!q) return true
      return (
        u.email.toLowerCase().includes(q) ||
        (u.name ?? '').toLowerCase().includes(q)
      )
    })
  }, [users, search, roleFilter])

  const totals = useMemo(() => {
    return {
      total:          users.length,
      superAdmins:    users.filter((u) => u.role === 'super_admin').length,
      platformAdmins: users.filter((u) => u.role === 'platform_admin').length,
      regularUsers:   users.filter((u) => u.role === 'user').length,
    }
  }, [users])

  const deleteMutation = useMutation({
    mutationFn: (userId: string) =>
      fetchJson<{ success: boolean }>(`/api/crm/tkt-users/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('User removed from ticket module')
      void qc.invalidateQueries({ queryKey: ['tkt-users'] })
      setDeleteTarget(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Ticket Users</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Manage ticket module users, roles, and platform / branch access
          </p>
        </div>
        <Button onClick={() => setModal({ mode: 'create' })}>
          <Plus className="mr-2 h-4 w-4" /> Add Ticket User
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Users" value={totals.total} tint="indigo" icon={UserIcon} />
        <StatCard label="Super Admins" value={totals.superAdmins} tint="rose" icon={ShieldCheck} />
        <StatCard label="Platform Admins" value={totals.platformAdmins} tint="amber" icon={ShieldCheck} />
        <StatCard label="Regular Users" value={totals.regularUsers} tint="emerald" icon={UserIcon} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All roles</SelectItem>
            <SelectItem value="super_admin">Super Admin</SelectItem>
            <SelectItem value="platform_admin">Platform Admin</SelectItem>
            <SelectItem value="user">User</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Platforms</th>
              <th className="px-4 py-3">Branches</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                  No users match.
                </td>
              </tr>
            ) : (
              filtered.map((u) => (
                <tr
                  key={u.user_id}
                  className="border-b border-slate-100 text-slate-800 last:border-0 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700/50"
                >
                  <td className="px-4 py-3 font-medium">{u.name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{u.email}</td>
                  <td className="px-4 py-3">
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                    {u.role === 'super_admin' ? (
                      <span className="italic">All</span>
                    ) : u.platforms.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {u.platforms.map((p) => (
                          <span
                            key={p.id}
                            className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] dark:bg-slate-700"
                          >
                            {p.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                    {u.branches.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {u.branches.map((b) => (
                          <span
                            key={b.id}
                            className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] dark:bg-slate-700"
                          >
                            {b.branch_number}
                          </span>
                        ))}
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setModal({ mode: 'edit', user: u })}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(u)}
                        title="Remove from ticket module"
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <UserFormDialog
          mode={modal.mode}
          user={modal.user}
          platforms={platforms}
          branches={branches}
          onClose={() => setModal(null)}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteTarget?.name ?? deleteTarget?.email} from ticket module?</AlertDialogTitle>
            <AlertDialogDescription>
              They will lose access to tickets, but their main account remains. This can be re-enabled later by re-adding them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.user_id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Role badge ───────────────────────────────────────────────────────────────

const ROLE_STYLE: Record<TktRole, string> = {
  super_admin:    'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  platform_admin: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  user:           'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
}

const ROLE_LABEL: Record<TktRole, string> = {
  super_admin:    'Super Admin',
  platform_admin: 'Platform Admin',
  user:           'User',
}

function RoleBadge({ role }: { role: TktRole }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', ROLE_STYLE[role])}>
      {ROLE_LABEL[role]}
    </span>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────

const TINTS = {
  indigo:  'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400',
  rose:    'bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400',
  amber:   'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
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
  tint: keyof typeof TINTS
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', TINTS[tint])}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
        <div className="text-xl font-semibold text-slate-900 dark:text-slate-100">{value}</div>
      </div>
    </div>
  )
}

// ─── Create / edit dialog ─────────────────────────────────────────────────────

function UserFormDialog({
  mode,
  user,
  platforms,
  branches,
  onClose,
}: {
  mode: 'create' | 'edit'
  user?: TktUser
  platforms: Platform[]
  branches: Branch[]
  onClose: () => void
}) {
  const qc = useQueryClient()

  const [form, setForm] = useState({
    email:    user?.email ?? '',
    name:     user?.name ?? '',
    password: '',
    role:     (user?.role ?? 'user') as TktRole,
    platformIds: new Set(user?.platforms.map((p) => p.id) ?? []),
    branchIds:   new Set(user?.branches.map((b) => b.id) ?? []),
  })

  const togglePlatform = (id: string) =>
    setForm((f) => {
      const next = new Set(f.platformIds)
      next.has(id) ? next.delete(id) : next.add(id)
      return { ...f, platformIds: next }
    })

  const toggleBranch = (id: string) =>
    setForm((f) => {
      const next = new Set(f.branchIds)
      next.has(id) ? next.delete(id) : next.add(id)
      return { ...f, branchIds: next }
    })

  const saveMutation = useMutation({
    mutationFn: () => {
      if (mode === 'create') {
        return fetchJson('/api/crm/tkt-users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email:       form.email,
            name:        form.name,
            password:    form.password,
            role:        form.role,
            platformIds: Array.from(form.platformIds),
            branchIds:   Array.from(form.branchIds),
          }),
        })
      }
      return fetchJson(`/api/crm/tkt-users/${user!.user_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role:        form.role,
          platformIds: Array.from(form.platformIds),
          branchIds:   Array.from(form.branchIds),
        }),
      })
    },
    onSuccess: () => {
      toast.success(mode === 'create' ? 'User created' : 'User updated')
      void qc.invalidateQueries({ queryKey: ['tkt-users'] })
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const isCreate = mode === 'create'
  const platformsDisabled = form.role === 'super_admin'

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isCreate ? 'Add Ticket User' : 'Edit Ticket User'}</DialogTitle>
          <DialogDescription>
            {isCreate
              ? 'Create a new ticket module user with role and scope.'
              : `Update role and access for ${user?.email}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto py-2">
          {isCreate && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Ahmad Faris"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="user@ebright.my"
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="password">Initial Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Min 8 characters"
                  className="mt-1"
                />
                <p className="mt-1 text-xs text-slate-500">
                  User can change this after first login.
                </p>
              </div>
            </>
          )}

          <div>
            <Label htmlFor="role">Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as TktRole }))}>
              <SelectTrigger id="role" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="super_admin">
                  <div>
                    <div className="font-medium">Super Admin</div>
                    <div className="text-xs text-slate-500">Full access to all platforms and branches</div>
                  </div>
                </SelectItem>
                <SelectItem value="platform_admin">
                  <div>
                    <div className="font-medium">Platform Admin</div>
                    <div className="text-xs text-slate-500">Manage tickets on their assigned platform(s)</div>
                  </div>
                </SelectItem>
                <SelectItem value="user">
                  <div>
                    <div className="font-medium">User</div>
                    <div className="text-xs text-slate-500">Submit and view own tickets only</div>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label>Platforms {platformsDisabled && <span className="text-xs text-slate-400">(Super admins have all access)</span>}</Label>
              {!platformsDisabled && platforms.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      platformIds: f.platformIds.size === platforms.length
                        ? new Set()
                        : new Set(platforms.map((p) => p.id)),
                    }))
                  }
                  className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  {form.platformIds.size === platforms.length ? 'Clear all' : 'Select all'}
                </button>
              )}
            </div>
            <div className={cn('mt-1 grid grid-cols-2 gap-2 rounded-md border border-slate-200 p-3 dark:border-slate-700', platformsDisabled && 'opacity-50')}>
              {platforms.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.platformIds.has(p.id)}
                    onCheckedChange={() => togglePlatform(p.id)}
                    disabled={platformsDisabled}
                  />
                  <span className="font-mono text-xs text-slate-500">{p.code}</span>
                  <span>{p.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label>Branches</Label>
              {branches.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      branchIds: f.branchIds.size === branches.length
                        ? new Set()
                        : new Set(branches.map((b) => b.id)),
                    }))
                  }
                  className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  {form.branchIds.size === branches.length ? 'Clear all' : 'Select all'}
                </button>
              )}
            </div>
            <div className="mt-1 grid max-h-48 grid-cols-3 gap-2 overflow-y-auto rounded-md border border-slate-200 p-3 dark:border-slate-700">
              {branches.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.branchIds.has(b.id)}
                    onCheckedChange={() => toggleBranch(b.id)}
                  />
                  <span className="font-mono text-xs text-slate-500">{b.branch_number}</span>
                  <span className="truncate">{b.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={
              saveMutation.isPending ||
              (isCreate && (!form.email || !form.name || form.password.length < 8))
            }
          >
            {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isCreate ? 'Create User' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
