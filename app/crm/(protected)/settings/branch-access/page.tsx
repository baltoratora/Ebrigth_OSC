'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2, Loader2, Search, Building2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { cn } from '@/lib/crm/utils'

// Roles a SUPER_ADMIN can grant from this page. SUPER_ADMIN is intentionally
// omitted — promoting another super-admin is a one-line audit-sensitive
// action that belongs in a more guarded place than a checkbox dialog.
type GrantableRole = 'AGENCY_ADMIN' | 'REGIONAL_MANAGER' | 'BRANCH_MANAGER' | 'BRANCH_STAFF'

const ROLE_OPTIONS: Array<{ value: GrantableRole; label: string; hint: string }> = [
  { value: 'AGENCY_ADMIN',     label: 'Agency Admin',     hint: 'Sees every branch in the tenant. Pick any branch as their primary.' },
  { value: 'REGIONAL_MANAGER', label: 'Regional Manager', hint: 'Sees all branches granted here. Pick every branch in their region.' },
  { value: 'BRANCH_MANAGER',   label: 'Branch Manager',   hint: 'Sees only the branches granted here. Standard scope.' },
  { value: 'BRANCH_STAFF',     label: 'Branch Staff',     hint: 'Sees only the branches granted here. Limited write actions.' },
]

interface Link {
  id: string
  userId: string
  branchId: string
  role: string
  createdAt: string
}

interface UserRow {
  id: string
  email: string
  name: string | null
  links: Link[]
}

interface BranchRow {
  id: string
  name: string
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const e = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((e as { error?: string }).error ?? res.statusText)
  }
  return res.json() as Promise<T>
}

export default function BranchAccessPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [granting, setGranting] = useState<UserRow | null>(null)

  const { data, isLoading } = useQuery<{ users: UserRow[]; branches: BranchRow[] }>({
    queryKey: ['branch-access'],
    queryFn: () => fetchJson('/api/crm/branch-access'),
  })

  const branchNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const b of data?.branches ?? []) m.set(b.id, b.name)
    return m
  }, [data])

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    const users = data?.users ?? []
    if (!q) return users
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.name ?? '').toLowerCase().includes(q),
    )
  }, [data, search])

  const revokeMutation = useMutation({
    mutationFn: (linkId: string) =>
      fetchJson(`/api/crm/branch-access?id=${linkId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Access revoked')
      void qc.invalidateQueries({ queryKey: ['branch-access'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="space-y-6 p-6">
      <div>
        <Link
          href="/crm/opportunities"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Branch & Agency Access
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Grant a user access to one or more branches. Use this to create{' '}
          <span className="font-medium text-slate-700 dark:text-slate-300">agency accounts</span>
          {' '}(one user, many branches) and to assign{' '}
          <span className="font-medium text-slate-700 dark:text-slate-300">regional managers</span>
          {' '}(grant every branch in their region). Users switch between their granted branches with the topbar branch picker.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="pl-9"
          />
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {filteredUsers.length} of {data?.users.length ?? 0} user(s)
        </div>
      </div>

      {/* Users table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2.5">User</th>
                <th className="px-4 py-2.5">Accessible Branches</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-slate-100 align-top text-slate-800 last:border-0 dark:border-slate-700 dark:text-slate-200"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{u.name ?? u.email}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    {u.links.length === 0 ? (
                      <span className="text-xs italic text-slate-500 dark:text-slate-400">No branches assigned</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {u.links.map((link) => (
                          <span
                            key={link.id}
                            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] dark:border-slate-600 dark:bg-slate-700"
                          >
                            <Building2 className="h-3 w-3 text-slate-400" />
                            <span className="text-slate-700 dark:text-slate-200">
                              {branchNameById.get(link.branchId) ?? '?'}
                            </span>
                            <span className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[9px] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                              {link.role}
                            </span>
                            <button
                              onClick={() => {
                                if (confirm(`Revoke ${u.email}'s access to ${branchNameById.get(link.branchId)}?`)) {
                                  revokeMutation.mutate(link.id)
                                }
                              }}
                              className="text-slate-400 hover:text-red-500"
                              title="Revoke"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => setGranting(u)}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> Grant
                    </Button>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                    No users match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {granting && data && (
        <GrantDialog
          user={granting}
          branches={data.branches}
          existingBranchIds={new Set(granting.links.map((l) => l.branchId))}
          onClose={() => setGranting(null)}
        />
      )}
    </div>
  )
}

function GrantDialog({
  user,
  branches,
  existingBranchIds,
  onClose,
}: {
  user: UserRow
  branches: BranchRow[]
  existingBranchIds: Set<string>
  onClose: () => void
}) {
  const qc = useQueryClient()
  const available = branches.filter((b) => !existingBranchIds.has(b.id))
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [role, setRole] = useState<GrantableRole>('BRANCH_MANAGER')
  const [search, setSearch] = useState('')

  const roleHint = ROLE_OPTIONS.find((r) => r.value === role)?.hint ?? ''

  const filteredAvailable = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return available
    return available.filter((b) => b.name.toLowerCase().includes(q))
  }, [available, search])

  const toggleBranch = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const selectAllFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const b of filteredAvailable) next.add(b.id)
      return next
    })
  }
  const clearSelection = () => setSelected(new Set())

  // Sequential POSTs — keeps the API simple (no batch endpoint) and lets us
  // collate per-branch errors (e.g. a duplicate link returns 409 and we
  // continue with the rest instead of aborting the whole grant).
  const grantMutation = useMutation({
    mutationFn: async () => {
      const branchIds = Array.from(selected)
      const failures: Array<{ branchId: string; message: string }> = []
      let succeeded = 0
      for (const branchId of branchIds) {
        try {
          await fetchJson('/api/crm/branch-access', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, branchId, role }),
          })
          succeeded++
        } catch (e) {
          failures.push({ branchId, message: (e as Error).message })
        }
      }
      return { succeeded, failures, total: branchIds.length }
    },
    onSuccess: (result) => {
      if (result.failures.length === 0) {
        toast.success(
          result.succeeded === 1
            ? 'Access granted'
            : `Granted access to ${result.succeeded} branches`,
        )
      } else if (result.succeeded === 0) {
        toast.error(`Grant failed: ${result.failures[0].message}`)
      } else {
        toast.warning(
          `Granted ${result.succeeded} of ${result.total} — ${result.failures.length} failed`,
        )
      }
      void qc.invalidateQueries({ queryKey: ['branch-access'] })
      if (result.succeeded > 0) onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Grant branch access</DialogTitle>
          <DialogDescription>
            Give {user.name ?? user.email} access to one or more branches. All
            selected branches receive the same role.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as GrantableRole)}>
              <SelectTrigger id="role" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{roleHint}</p>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label>Branches</Label>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {selected.size} selected
              </div>
            </div>

            {available.length === 0 ? (
              <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                This user already has access to every branch.
              </div>
            ) : (
              <>
                <div className="mt-1 flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Filter branches…"
                      className="h-8 pl-8 text-sm"
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={selectAllFiltered}
                    disabled={filteredAvailable.length === 0}
                  >
                    Select all
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={clearSelection}
                    disabled={selected.size === 0}
                  >
                    Clear
                  </Button>
                </div>

                <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700">
                  {filteredAvailable.length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-slate-500 dark:text-slate-400">
                      No branches match.
                    </div>
                  ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                      {filteredAvailable.map((b) => {
                        const isSelected = selected.has(b.id)
                        return (
                          <li
                            key={b.id}
                            className={cn(
                              'flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50',
                              isSelected && 'bg-slate-50 dark:bg-slate-800/50',
                            )}
                            onClick={() => toggleBranch(b.id)}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleBranch(b.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <Building2 className="h-3.5 w-3.5 text-slate-400" />
                            <span className="text-slate-700 dark:text-slate-200">{b.name}</span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => grantMutation.mutate()}
            disabled={grantMutation.isPending || selected.size === 0}
          >
            {grantMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Grant access to {selected.size || 0} {selected.size === 1 ? 'branch' : 'branches'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
