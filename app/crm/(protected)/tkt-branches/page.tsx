'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  Building2,
  Ticket as TicketIcon,
  ExternalLink,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { useBranchContext } from '@/components/crm/branch-context'
import { crmBranchToTktBranchNumber } from '@/lib/crm/branch-number'

interface Branch {
  id: string
  name: string
  code: string
  branch_number: string
  ticket_count: number
  open_ticket_count: number
  user_count: number
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const e = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((e as { error?: string }).error ?? res.statusText)
  }
  return res.json() as Promise<T>
}

export default function TktBranchesPage() {
  const router = useRouter()
  const qc = useQueryClient()

  // When the topbar is locked to a specific branch, the "View tickets for"
  // dropdown is locked to that branch (and the All-branches option hidden).
  // In Super Admin / Agency view (selectedBranch === null) the dropdown
  // remains free.
  const { selectedBranch } = useBranchContext()
  const lockedBranchNumber = crmBranchToTktBranchNumber(selectedBranch?.name)

  const { data: branches = [], isLoading } = useQuery<Branch[]>({
    queryKey: ['tkt-branches-full'],
    queryFn: () => fetchJson<Branch[]>('/api/crm/tkt-branches'),
  })

  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; branch?: Branch } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null)

  // Summary stats
  const totals = useMemo(() => {
    return {
      branches: branches.length,
      tickets: branches.reduce((s, b) => s + b.ticket_count, 0),
      openTickets: branches.reduce((s, b) => s + b.open_ticket_count, 0),
      users: branches.reduce((s, b) => s + b.user_count, 0),
    }
  }, [branches])

  // Filtered list
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return branches
    return branches.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.code.toLowerCase().includes(q) ||
        b.branch_number.includes(q),
    )
  }, [branches, search])

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetchJson<{ success: boolean }>(`/api/crm/tkt-branches/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Branch deleted')
      void qc.invalidateQueries({ queryKey: ['tkt-branches-full'] })
      void qc.invalidateQueries({ queryKey: ['tkt-branches'] })
      setDeleteTarget(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Ticket Branches</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Manage Ebright branches used for ticket routing and numbering
          </p>
        </div>
        <Button onClick={() => setModal({ mode: 'create' })}>
          <Plus className="mr-2 h-4 w-4" /> Add Branch
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Building2} label="Total Branches" value={totals.branches} tint="indigo" />
        <StatCard icon={TicketIcon} label="Total Tickets" value={totals.tickets} tint="blue" />
        <StatCard
          icon={TicketIcon}
          label="Open / In Progress"
          value={totals.openTickets}
          tint="amber"
        />
        <StatCard icon={Users} label="Assigned Users" value={totals.users} tint="emerald" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search branches by name, code, or number..."
            className="pl-9"
          />
        </div>

        {/* Jump-to-tickets dropdown */}
        <div className="flex items-center gap-2">
          <Label htmlFor="jump" className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
            View tickets for:
          </Label>
          {(() => {
            // In branch-view, lock the picker to the topbar's branch.
            const lockedBranch = lockedBranchNumber
              ? branches.find((b) => b.branch_number === lockedBranchNumber) ?? null
              : null
            return (
              <Select
                value={lockedBranch?.id ?? undefined}
                onValueChange={(v) => {
                  if (v === '__all__') router.push('/crm/tickets')
                  else router.push(`/crm/tickets?branchId=${v}`)
                }}
                disabled={!!lockedBranch}
              >
                <SelectTrigger id="jump" className="w-60">
                  <SelectValue placeholder="Select a branch..." />
                </SelectTrigger>
                <SelectContent>
                  {!lockedBranch && <SelectItem value="__all__">All branches</SelectItem>}
                  {(lockedBranch ? [lockedBranch] : branches).map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.branch_number} — {b.name} ({b.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )
          })()}
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Open</th>
              <th className="px-4 py-3">Users</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                  {search ? `No branches match "${search}"` : 'No branches yet.'}
                </td>
              </tr>
            ) : (
              filtered.map((b) => (
                <tr
                  key={b.id}
                  className="border-b border-slate-100 text-slate-800 last:border-0 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700/50"
                >
                  <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">
                    {b.branch_number}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                      {b.code}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">{b.name}</td>
                  <td className="px-4 py-3">
                    <CountBadge value={b.ticket_count} tint="slate" />
                  </td>
                  <td className="px-4 py-3">
                    <CountBadge value={b.open_ticket_count} tint={b.open_ticket_count > 0 ? 'amber' : 'slate'} />
                  </td>
                  <td className="px-4 py-3">
                    <CountBadge value={b.user_count} tint="slate" />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        title="View tickets for this branch"
                        onClick={() => router.push(`/crm/tickets?branchId=${b.id}`)}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Edit"
                        onClick={() => setModal({ mode: 'edit', branch: b })}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title={
                          b.ticket_count > 0
                            ? 'Cannot delete — has tickets'
                            : b.user_count > 0
                              ? 'Cannot delete — has users'
                              : 'Delete'
                        }
                        onClick={() => setDeleteTarget(b)}
                        disabled={b.ticket_count > 0 || b.user_count > 0}
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
        <BranchFormDialog
          mode={modal.mode}
          branch={modal.branch}
          onClose={() => setModal(null)}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleteTarget?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The branch must have no tickets and no assigned users.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────

const TINTS = {
  indigo:  'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400',
  blue:    'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400',
  amber:   'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
  slate:   'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
} as const

type Tint = keyof typeof TINTS

function StatCard({
  icon: Icon,
  label,
  value,
  tint,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  tint: Tint
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

function CountBadge({ value, tint }: { value: number; tint: Tint }) {
  return (
    <span className={cn('inline-flex min-w-[2rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium', TINTS[tint])}>
      {value}
    </span>
  )
}

// ─── Add / Edit dialog ────────────────────────────────────────────────────────

function BranchFormDialog({
  mode,
  branch,
  onClose,
}: {
  mode: 'create' | 'edit'
  branch?: Branch
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: branch?.name ?? '',
    code: branch?.code ?? '',
    branch_number: branch?.branch_number ?? '',
  })

  const saveMutation = useMutation({
    mutationFn: () => {
      const url = mode === 'create' ? '/api/crm/tkt-branches' : `/api/crm/tkt-branches/${branch!.id}`
      const method = mode === 'create' ? 'POST' : 'PATCH'
      return fetchJson(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
    },
    onSuccess: () => {
      toast.success(mode === 'create' ? 'Branch created' : 'Branch updated')
      void qc.invalidateQueries({ queryKey: ['tkt-branches-full'] })
      void qc.invalidateQueries({ queryKey: ['tkt-branches'] })
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Add Branch' : 'Edit Branch'}</DialogTitle>
          <DialogDescription>
            Branches are used in ticket numbering. The 2-digit number appears in ticket IDs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="branch_number">Branch Number (2 digits)</Label>
            <Input
              id="branch_number"
              value={form.branch_number}
              onChange={(e) =>
                setForm((f) => ({ ...f, branch_number: e.target.value.replace(/\D/g, '').slice(0, 2) }))
              }
              placeholder="e.g. 01"
              className="mt-1 font-mono"
              maxLength={2}
            />
            <p className="mt-1 text-xs text-slate-500">Used in ticket numbers (YYMM-BBII-00KT).</p>
          </div>
          <div>
            <Label htmlFor="code">Code</Label>
            <Input
              id="code"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase().slice(0, 10) }))}
              placeholder="e.g. AMP"
              className="mt-1 font-mono uppercase"
            />
            <p className="mt-1 text-xs text-slate-500">Short identifier, 2–10 characters.</p>
          </div>
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Ampang"
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !form.name || !form.code || !form.branch_number}
          >
            {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {mode === 'create' ? 'Create' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
