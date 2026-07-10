'use client'

import { useState, useEffect } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2, X, Pencil } from 'lucide-react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { cn } from '@/lib/crm/utils'
import { useReadOnlyViewer } from '@/lib/crm/use-read-only-viewer'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Branch {
  id: string
  name: string
  address: string | null
  phone: string | null
  email: string | null
  timezone: string
  branchManagerId: string | null
  operatingHours: Record<string, { open: boolean; openTime?: string; closeTime?: string }> | null
  createdAt: string
  updatedAt: string
}

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const
const DAY_LABELS: Record<string, string> = {
  MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday',
  FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday',
}

const TIMEZONES = [
  'Asia/Kuala_Lumpur',
  'Asia/Singapore',
  'Asia/Jakarta',
  'Asia/Bangkok',
  'UTC',
]

// ─── Form schema ──────────────────────────────────────────────────────────────

const BranchFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  timezone: z.string().default('Asia/Kuala_Lumpur'),
  branchManagerId: z.string().optional(),
  operatingHours: z.record(
    z.object({
      open: z.boolean(),
      openTime: z.string().optional(),
      closeTime: z.string().optional(),
    }),
  ).optional(),
})
type BranchFormValues = z.infer<typeof BranchFormSchema>

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchBranches(): Promise<{ branches: Branch[] }> {
  const res = await fetch('/api/crm/branches')
  if (!res.ok) throw new Error('Failed to fetch branches')
  return res.json()
}

async function fetchUsers(): Promise<{ users: { id: string; name: string | null; email: string }[] }> {
  const res = await fetch('/api/crm/team')
  if (!res.ok) throw new Error('Failed to fetch users')
  const data = await res.json() as { users: { id: string; name: string | null; email: string; branches: unknown[] }[] }
  return { users: data.users }
}

// ─── Input helper ─────────────────────────────────────────────────────────────

const inputCls = (hasError?: boolean) =>
  cn(
    'w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white',
    'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500',
    hasError ? 'border-red-400 dark:border-red-500' : 'border-slate-300 dark:border-slate-600',
  )

// ─── Branch Modal ─────────────────────────────────────────────────────────────

function BranchModal({
  branch,
  users,
  onClose,
  onSuccess,
}: {
  branch?: Branch
  users: { id: string; name: string | null; email: string }[]
  onClose: () => void
  onSuccess: () => void
}) {
  const defaultHours: Record<string, { open: boolean; openTime: string; closeTime: string }> = {}
  for (const day of DAYS) {
    defaultHours[day] = { open: day !== 'SUN', openTime: '09:00', closeTime: '18:00' }
  }

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<BranchFormValues>({
    resolver: zodResolver(BranchFormSchema),
    defaultValues: branch
      ? {
          name: branch.name,
          address: branch.address ?? '',
          phone: branch.phone ?? '',
          email: branch.email ?? '',
          timezone: branch.timezone,
          branchManagerId: branch.branchManagerId ?? '',
          operatingHours: (branch.operatingHours as BranchFormValues['operatingHours']) ?? defaultHours,
        }
      : {
          name: '',
          address: '',
          phone: '',
          email: '',
          timezone: 'Asia/Kuala_Lumpur',
          branchManagerId: '',
          operatingHours: defaultHours,
        },
  })

  const operatingHours = watch('operatingHours') ?? {}

  async function onSubmit(data: BranchFormValues) {
    const url = branch ? `/api/crm/branches/${branch.id}` : '/api/crm/branches'
    const method = branch ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string }
      toast.error(err.error ?? 'Failed to save branch')
      return
    }

    toast.success(branch ? 'Branch updated' : 'Branch created')
    onSuccess()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-xl rounded-xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            {branch ? 'Edit Branch' : 'New Branch'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Branch Name *</label>
                <input {...register('name')} placeholder="KL Main Branch" className={inputCls(!!errors.name)} />
                {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
              </div>

              <div className="col-span-2 space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Address</label>
                <input {...register('address')} placeholder="No. 1, Jalan..." className={inputCls()} />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Phone</label>
                <input {...register('phone')} placeholder="+60 3-1234 5678" className={inputCls()} />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
                <input {...register('email')} type="email" placeholder="branch@example.com" className={inputCls(!!errors.email)} />
                {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Timezone</label>
                <select {...register('timezone')} className={inputCls()}>
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Branch Manager</label>
                <select {...register('branchManagerId')} className={inputCls()}>
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Operating hours */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Operating Hours</label>
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                {DAYS.map((day) => {
                  const isOpen = operatingHours[day]?.open ?? false
                  return (
                    <div key={day} className="flex items-center gap-3 px-3 py-2">
                      <span className="w-10 text-xs font-medium text-slate-500 dark:text-slate-400">{day}</span>
                      <span className="w-20 text-xs text-slate-600 dark:text-slate-400">{DAY_LABELS[day]}</span>
                      <Controller
                        name={`operatingHours.${day}.open` as `operatingHours.MON.open`}
                        control={control}
                        render={({ field }) => (
                          <button
                            type="button"
                            onClick={() => field.onChange(!field.value)}
                            className={cn(
                              'w-10 h-5 rounded-full transition-colors relative shrink-0',
                              field.value ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600',
                            )}
                          >
                            <div className={cn(
                              'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                              field.value ? 'translate-x-5' : 'translate-x-0.5',
                            )} />
                          </button>
                        )}
                      />
                      {isOpen && (
                        <>
                          <input
                            type="time"
                            {...register(`operatingHours.${day}.openTime` as `operatingHours.MON.openTime`)}
                            className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                          <span className="text-xs text-slate-400">to</span>
                          <input
                            type="time"
                            {...register(`operatingHours.${day}.closeTime` as `operatingHours.MON.closeTime`)}
                            className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </>
                      )}
                      {!isOpen && <span className="text-xs text-slate-400">Closed</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-700 px-5 py-4">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {branch ? 'Save changes' : 'Create branch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const col = createColumnHelper<Branch>()

export default function BranchesPage() {
  const readOnly = useReadOnlyViewer()
  const qc = useQueryClient()
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['crm', 'branches'],
    queryFn: fetchBranches,
  })
  const { data: usersData } = useQuery({
    queryKey: ['crm', 'team'],
    queryFn: fetchUsers,
  })

  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const branches = data?.branches ?? []
  const users = usersData?.users ?? []

  const columns = [
    col.accessor('name', {
      header: 'Branch',
      cell: (info) => <span className="text-sm font-medium text-slate-900 dark:text-white">{info.getValue()}</span>,
    }),
    col.accessor('address', {
      header: 'Address',
      cell: (info) => <span className="text-sm text-slate-500 dark:text-slate-400">{info.getValue() ?? '—'}</span>,
    }),
    col.accessor('email', {
      header: 'Email',
      cell: (info) => <span className="text-sm text-slate-500 dark:text-slate-400">{info.getValue() ?? '—'}</span>,
    }),
    col.accessor('timezone', {
      header: 'Timezone',
      cell: (info) => <span className="text-xs text-slate-500 dark:text-slate-400">{info.getValue()}</span>,
    }),
    col.display({
      id: 'actions',
      header: '',
      cell: (info) => (
        readOnly ? null : (
        <button
          onClick={() => setEditingBranch(info.row.original)}
          className="flex items-center justify-center h-7 w-7 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        )
      ),
    }),
  ]

  const table = useReactTable({
    data: branches,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Branches</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Manage your branch locations.
          </p>
        </div>
        {!readOnly && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New branch
          </button>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
          </div>
        ) : isError ? (
          <div className="text-center py-16 text-sm text-slate-500">
            Failed to load branches.
            <button onClick={() => refetch()} className="ml-2 text-indigo-600 hover:underline">Retry</button>
          </div>
        ) : branches.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-slate-500 dark:text-slate-400 text-sm">No branches yet.</p>
            {!readOnly && (
              <button onClick={() => setShowCreate(true)} className="mt-3 text-sm text-indigo-600 hover:underline">
                Create your first branch
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-slate-200 dark:border-slate-700">
                  {hg.headers.map((h) => (
                    <th key={h.id} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
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

      {showCreate && (
        <BranchModal
          users={users}
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            void qc.invalidateQueries({ queryKey: ['crm', 'branches'] })
          }}
        />
      )}

      {editingBranch && (
        <BranchModal
          branch={editingBranch}
          users={users}
          onClose={() => setEditingBranch(null)}
          onSuccess={() => {
            void qc.invalidateQueries({ queryKey: ['crm', 'branches'] })
            setEditingBranch(null)
          }}
        />
      )}
    </div>
  )
}
