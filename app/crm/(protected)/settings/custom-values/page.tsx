'use client'

import { useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2, Pencil, Trash2, X } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { cn } from '@/lib/crm/utils'
import { useReadOnlyViewer } from '@/lib/crm/use-read-only-viewer'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomValue {
  id: string
  key: string
  value: string
  scope: 'TENANT' | 'BRANCH'
  scopeId: string | null
  tenantId: string
  createdAt: string
  branch?: { id: string; name: string } | null
}

const CustomValueSchema = z.object({
  key: z.string().min(1, 'Key is required').regex(/^[a-z_][a-z0-9_]*$/, 'Use lowercase letters, numbers, underscores only'),
  value: z.string().min(1, 'Value is required'),
  scope: z.enum(['TENANT', 'BRANCH']),
  scopeId: z.string().optional(),
})
type CustomValueFormValues = z.infer<typeof CustomValueSchema>

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchCustomValues(): Promise<{ customValues: CustomValue[] }> {
  const res = await fetch('/api/crm/custom-values')
  if (!res.ok) throw new Error('Failed to fetch custom values')
  return res.json()
}

async function fetchBranches(): Promise<{ branches: { id: string; name: string }[] }> {
  const res = await fetch('/api/crm/branches')
  if (!res.ok) return { branches: [] }
  return res.json()
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function CustomValueModal({
  customValue,
  branches,
  onClose,
  onSuccess,
}: {
  customValue?: CustomValue
  branches: { id: string; name: string }[]
  onClose: () => void
  onSuccess: () => void
}) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CustomValueFormValues>({
    resolver: zodResolver(CustomValueSchema),
    defaultValues: customValue
      ? {
          key: customValue.key,
          value: customValue.value,
          scope: customValue.scope,
          scopeId: customValue.scopeId ?? '',
        }
      : { key: '', value: '', scope: 'TENANT', scopeId: '' },
  })

  const scope = watch('scope')
  const key = watch('key')

  async function onSubmit(data: CustomValueFormValues) {
    const url = customValue ? `/api/crm/custom-values/${customValue.id}` : '/api/crm/custom-values'
    const method = customValue ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string }
      toast.error(err.error ?? 'Failed to save')
      return
    }

    toast.success(customValue ? 'Updated' : 'Created')
    onSuccess()
    onClose()
  }

  const inputCls = (hasError?: boolean) =>
    cn(
      'w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white',
      'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500',
      hasError ? 'border-red-400 dark:border-red-500' : 'border-slate-300 dark:border-slate-600',
    )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            {customValue ? 'Edit Custom Value' : 'New Custom Value'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-5 py-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Key *</label>
            <input
              {...register('key')}
              placeholder="my_variable_name"
              disabled={!!customValue}
              className={inputCls(!!errors.key)}
            />
            {errors.key && <p className="text-xs text-red-500">{errors.key.message}</p>}
            {key && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Template: <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">{'{{custom_values.' + key + '}}'}</code>
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Value *</label>
            <input
              {...register('value')}
              placeholder="The actual value..."
              className={inputCls(!!errors.value)}
            />
            {errors.value && <p className="text-xs text-red-500">{errors.value.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Scope</label>
            <select {...register('scope')} className={inputCls()}>
              <option value="TENANT">Tenant-wide</option>
              <option value="BRANCH">Branch-specific</option>
            </select>
          </div>

          {scope === 'BRANCH' && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Branch</label>
              <select {...register('scopeId')} className={inputCls()}>
                <option value="">Select branch...</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}

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
              {customValue ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const col = createColumnHelper<CustomValue>()

export default function CustomValuesPage() {
  const readOnly = useReadOnlyViewer()
  const qc = useQueryClient()
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['crm', 'custom-values'],
    queryFn: fetchCustomValues,
  })
  const { data: branchesData } = useQuery({
    queryKey: ['crm', 'branches'],
    queryFn: fetchBranches,
  })

  const [editing, setEditing] = useState<CustomValue | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const customValues = data?.customValues ?? []
  const branches = branchesData?.branches ?? []

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      const res = await fetch(`/api/crm/custom-values/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Deleted')
      void qc.invalidateQueries({ queryKey: ['crm', 'custom-values'] })
    } catch {
      toast.error('Failed to delete')
    } finally {
      setDeleting(null)
    }
  }

  const columns = [
    col.accessor('key', {
      header: 'Key',
      cell: (info) => (
        <code className="text-sm font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-indigo-700 dark:text-indigo-300">
          {info.getValue()}
        </code>
      ),
    }),
    col.accessor('value', {
      header: 'Value',
      cell: (info) => <span className="text-sm text-slate-700 dark:text-slate-300">{info.getValue()}</span>,
    }),
    col.accessor('scope', {
      header: 'Scope',
      cell: (info) => (
        <span className={cn(
          'rounded-full px-2 py-0.5 text-[11px] font-medium',
          info.getValue() === 'TENANT'
            ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300'
            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
        )}>
          {info.getValue() === 'TENANT' ? 'Tenant' : 'Branch'}
        </span>
      ),
    }),
    col.accessor('branch', {
      header: 'Branch',
      cell: (info) => (
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {info.getValue()?.name ?? '—'}
        </span>
      ),
    }),
    col.display({
      id: 'actions',
      header: '',
      cell: (info) => (
        readOnly ? null : (
        <div className="flex items-center gap-1">
          <button
            onClick={() => setEditing(info.row.original)}
            className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => handleDelete(info.row.original.id)}
            disabled={deleting === info.row.original.id}
            className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950 dark:hover:text-red-400 transition-colors disabled:opacity-50"
          >
            {deleting === info.row.original.id
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Trash2 className="h-3.5 w-3.5" />
            }
          </button>
        </div>
        )
      ),
    }),
  ]

  const table = useReactTable({
    data: customValues,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Custom Values</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Key-value pairs injected into message templates as <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded text-xs">{'{{custom_values.key}}'}</code>
          </p>
        </div>
        {!readOnly && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add value
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
            Failed to load custom values.
            <button onClick={() => refetch()} className="ml-2 text-indigo-600 hover:underline">Retry</button>
          </div>
        ) : customValues.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-slate-500 dark:text-slate-400 text-sm">No custom values yet.</p>
            {!readOnly && (
              <button onClick={() => setShowCreate(true)} className="mt-3 text-sm text-indigo-600 hover:underline">
                Add your first value
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
        <CustomValueModal
          branches={branches}
          onClose={() => setShowCreate(false)}
          onSuccess={() => void qc.invalidateQueries({ queryKey: ['crm', 'custom-values'] })}
        />
      )}

      {editing && (
        <CustomValueModal
          customValue={editing}
          branches={branches}
          onClose={() => setEditing(null)}
          onSuccess={() => {
            void qc.invalidateQueries({ queryKey: ['crm', 'custom-values'] })
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}
