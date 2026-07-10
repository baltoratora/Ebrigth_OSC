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
import { Plus, Loader2, Copy, X, Eye, EyeOff, Trash2, Check } from 'lucide-react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useReadOnlyViewer } from '@/lib/crm/use-read-only-viewer'
import { cn, formatDate } from '@/lib/crm/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiKey {
  id: string
  name: string
  scopes: string[]
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

const SCOPE_GROUPS: Array<{ label: string; scopes: string[] }> = [
  {
    label: 'Contacts',
    scopes: ['contacts:read', 'contacts:write', 'contacts:delete', 'contacts:export'],
  },
  {
    label: 'Opportunities',
    scopes: ['opportunities:read', 'opportunities:write', 'opportunities:delete'],
  },
  {
    label: 'Messaging',
    scopes: ['messages:read', 'messages:write'],
  },
  {
    label: 'Automations',
    scopes: ['automations:read', 'automations:write', 'automations:delete'],
  },
  {
    label: 'Tickets',
    scopes: ['tickets:read', 'tickets:write', 'tickets:delete', 'tickets:admin'],
  },
  {
    label: 'Reports & Dashboard',
    scopes: ['dashboard:read', 'reports:read'],
  },
]
const ALL_SCOPES: string[] = SCOPE_GROUPS.flatMap((g) => g.scopes)

const GenerateKeySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  scopes: z.array(z.string()).min(1, 'Select at least one scope'),
})
type GenerateKeyValues = z.infer<typeof GenerateKeySchema>

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchApiKeys(): Promise<{ apiKeys: ApiKey[] }> {
  const res = await fetch('/api/crm/api-keys')
  if (!res.ok) throw new Error('Failed to fetch API keys')
  return res.json()
}

// ─── Generated key display ────────────────────────────────────────────────────

function GeneratedKeyDisplay({
  apiKey,
  onDone,
}: {
  apiKey: string
  onDone: () => void
}) {
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(apiKey).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900">
            <Eye className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Save your API key</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              This key will only be shown once. Store it securely.
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3">
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-slate-800 dark:text-slate-200 font-mono break-all select-all">
              {revealed ? apiKey : apiKey.replace(/./g, '•')}
            </code>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setRevealed((p) => !p)}
                className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-700 transition-colors"
                title={revealed ? 'Hide' : 'Reveal'}
              >
                {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button
                onClick={handleCopy}
                className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-700 transition-colors"
                title="Copy"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={onDone}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          I&apos;ve saved it — close
        </button>
      </div>
    </div>
  )
}

// ─── Generate key modal ───────────────────────────────────────────────────────

function GenerateKeyModal({
  onClose,
  onGenerated,
}: {
  onClose: () => void
  onGenerated: (key: string) => void
}) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<GenerateKeyValues>({
    resolver: zodResolver(GenerateKeySchema),
    defaultValues: { name: '', scopes: ['contacts:read'] },
  })

  const selectedScopes = watch('scopes')

  function toggleScope(scope: string) {
    const current = selectedScopes ?? []
    if (current.includes(scope)) {
      setValue('scopes', current.filter((s) => s !== scope), { shouldValidate: true })
    } else {
      setValue('scopes', [...current, scope], { shouldValidate: true })
    }
  }

  async function onSubmit(data: GenerateKeyValues) {
    const res = await fetch('/api/crm/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      toast.error('Failed to generate key')
      return
    }
    const result = await res.json() as { key: string }
    onGenerated(result.key)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Generate API Key</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-5 py-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Key Name *</label>
            <input
              {...register('name')}
              placeholder="e.g. Production Integration"
              className={cn(
                'w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white',
                'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500',
                errors.name ? 'border-red-400 dark:border-red-500' : 'border-slate-300 dark:border-slate-600',
              )}
            />
            {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Scopes *</label>
              <button
                type="button"
                onClick={() => setValue('scopes', selectedScopes?.length === ALL_SCOPES.length ? [] : [...ALL_SCOPES], { shouldValidate: true })}
                className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
              >
                {selectedScopes?.length === ALL_SCOPES.length ? 'Clear all' : 'Select all'}
              </button>
            </div>
            <div className="max-h-72 space-y-3 overflow-y-auto rounded-md border border-slate-200 p-3 dark:border-slate-700">
              {SCOPE_GROUPS.map((group) => (
                <div key={group.label}>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {group.label}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {group.scopes.map((scope) => (
                      <label key={scope} className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={selectedScopes?.includes(scope) ?? false}
                          onChange={() => toggleScope(scope)}
                          className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 accent-indigo-600"
                        />
                        <code className="text-xs text-slate-700 dark:text-slate-300 font-mono group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {scope}
                        </code>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {errors.scopes && <p className="text-xs text-red-500">{errors.scopes.message}</p>}
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
              Generate
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const col = createColumnHelper<ApiKey>()

export default function ApiKeysPage() {
  const readOnly = useReadOnlyViewer()
  const qc = useQueryClient()
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['crm', 'api-keys'],
    queryFn: fetchApiKeys,
  })

  const [showGenerate, setShowGenerate] = useState(false)
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [showRevoked, setShowRevoked] = useState(false)

  const allKeys = data?.apiKeys ?? []
  const activeCount = allKeys.filter((k) => !k.revokedAt).length
  const revokedCount = allKeys.length - activeCount
  const apiKeys = showRevoked ? allKeys : allKeys.filter((k) => !k.revokedAt)

  async function handleRevoke(id: string) {
    setRevoking(id)
    try {
      const res = await fetch(`/api/crm/api-keys/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('API key revoked')
      void qc.invalidateQueries({ queryKey: ['crm', 'api-keys'] })
    } catch {
      toast.error('Failed to revoke key')
    } finally {
      setRevoking(null)
    }
  }

  const columns = [
    col.accessor('name', {
      header: 'Name',
      cell: (info) => (
        <div>
          <p className="text-sm font-medium text-slate-900 dark:text-white">{info.getValue()}</p>
          {info.row.original.revokedAt && (
            <span className="text-[10px] text-red-500">Revoked</span>
          )}
        </div>
      ),
    }),
    col.accessor('scopes', {
      header: 'Scopes',
      cell: (info) => (
        <div className="flex flex-wrap gap-1">
          {info.getValue().map((scope) => (
            <code key={scope} className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-700 dark:text-slate-300">
              {scope}
            </code>
          ))}
        </div>
      ),
    }),
    col.accessor('lastUsedAt', {
      header: 'Last Used',
      cell: (info) => (
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {info.getValue() ? formatDate(info.getValue()!) : 'Never'}
        </span>
      ),
    }),
    col.accessor('createdAt', {
      header: 'Created',
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
        !info.row.original.revokedAt && !readOnly ? (
          <button
            onClick={() => handleRevoke(info.row.original.id)}
            disabled={revoking === info.row.original.id}
            title="Revoke key"
            className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950 dark:hover:text-red-400 transition-colors disabled:opacity-50"
          >
            {revoking === info.row.original.id
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Trash2 className="h-3.5 w-3.5" />
            }
          </button>
        ) : null
      ),
    }),
  ]

  const table = useReactTable({
    data: apiKeys,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">API Keys</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Generate keys for external integrations. Keys are only shown once.
          </p>
        </div>
        {!readOnly && (
          <button
            onClick={() => setShowGenerate(true)}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Generate key
          </button>
        )}
      </div>

      {/* Summary + toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-wrap items-center gap-4 text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="font-medium">{activeCount}</span>
            <span className="text-slate-500 dark:text-slate-400">active</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-slate-400" />
            <span className="font-medium">{revokedCount}</span>
            <span className="text-slate-500 dark:text-slate-400">revoked</span>
          </span>
        </div>
        {revokedCount > 0 && (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={showRevoked}
              onChange={(e) => setShowRevoked(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 accent-indigo-600"
            />
            Show revoked keys
          </label>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
          </div>
        ) : isError ? (
          <div className="text-center py-16 text-sm text-slate-500">
            Failed to load API keys.
            <button onClick={() => refetch()} className="ml-2 text-indigo-600 hover:underline">Retry</button>
          </div>
        ) : apiKeys.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-slate-500 dark:text-slate-400 text-sm">No API keys yet.</p>
            {!readOnly && (
              <button onClick={() => setShowGenerate(true)} className="mt-3 text-sm text-indigo-600 hover:underline">
                Generate your first key
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
                <tr
                  key={row.id}
                  className={cn(
                    'hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors',
                    row.original.revokedAt && 'opacity-50',
                  )}
                >
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

      {showGenerate && (
        <GenerateKeyModal
          onClose={() => setShowGenerate(false)}
          onGenerated={(key) => {
            setGeneratedKey(key)
            void qc.invalidateQueries({ queryKey: ['crm', 'api-keys'] })
          }}
        />
      )}

      {generatedKey && (
        <GeneratedKeyDisplay
          apiKey={generatedKey}
          onDone={() => setGeneratedKey(null)}
        />
      )}
    </div>
  )
}
