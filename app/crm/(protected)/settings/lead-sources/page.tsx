'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Pencil, Check, X, Plus } from 'lucide-react'
import { useReadOnlyViewer } from '@/lib/crm/use-read-only-viewer'
import { cn } from '@/lib/crm/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeadSource {
  id: string
  name: string
  tenantId: string
  createdAt: string
  _count?: { contacts: number }
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchLeadSources(): Promise<{ leadSources: LeadSource[] }> {
  const res = await fetch('/api/crm/lead-sources')
  if (!res.ok) throw new Error('Failed to fetch lead sources')
  return res.json()
}

// ─── Editable row ─────────────────────────────────────────────────────────────

function LeadSourceRow({
  source,
  onUpdate,
  readOnly = false,
}: {
  source: LeadSource
  onUpdate: (id: string, name: string) => Promise<void>
  readOnly?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(source.name)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim() || name === source.name) {
      setEditing(false)
      setName(source.name)
      return
    }
    setSaving(true)
    try {
      await onUpdate(source.id, name)
      setEditing(false)
    } catch {
      setName(source.name)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
      {editing ? (
        <>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save()
              if (e.key === 'Escape') {
                setName(source.name)
                setEditing(false)
              }
            }}
            autoFocus
            className="flex-1 rounded-lg border border-indigo-400 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={save}
            disabled={saving}
            className="flex h-7 w-7 items-center justify-center rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </button>
          <button
            onClick={() => { setName(source.name); setEditing(false) }}
            className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </>
      ) : (
        <>
          <span className="flex-1 text-sm text-slate-900 dark:text-white font-medium">{source.name}</span>
          <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
            {source._count?.contacts ?? 0} contacts
          </span>
          {!readOnly && (
            <button
              onClick={() => setEditing(true)}
              className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ─── Add form ─────────────────────────────────────────────────────────────────

function AddLeadSourceForm({ onSuccess }: { onSuccess: () => void }) {
  const [show, setShow] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/crm/lead-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error()
      toast.success('Lead source added')
      setName('')
      setShow(false)
      onSuccess()
    } catch {
      toast.error('Failed to add lead source')
    } finally {
      setSaving(false)
    }
  }

  if (!show) {
    return (
      <div className="px-4 py-3">
        <button
          onClick={() => setShow(true)}
          className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add lead source
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void handleAdd()
          if (e.key === 'Escape') setShow(false)
        }}
        autoFocus
        placeholder="e.g. TikTok Ads"
        className="flex-1 rounded-lg border border-indigo-400 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400"
      />
      <button
        onClick={handleAdd}
        disabled={saving || !name.trim()}
        className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        Add
      </button>
      <button
        onClick={() => setShow(false)}
        className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LeadSourcesPage() {
  const readOnly = useReadOnlyViewer()
  const qc = useQueryClient()
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['crm', 'lead-sources'],
    queryFn: fetchLeadSources,
  })

  const leadSources = data?.leadSources ?? []

  async function handleUpdate(id: string, name: string) {
    const res = await fetch(`/api/crm/lead-sources/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) {
      toast.error('Failed to update')
      throw new Error()
    }
    toast.success('Updated')
    void qc.invalidateQueries({ queryKey: ['crm', 'lead-sources'] })
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Lead Sources</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Configure where your leads come from. Pre-seeded sources can be renamed.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
          </div>
        ) : isError ? (
          <div className="text-center py-16 text-sm text-slate-500">
            Failed to load.
            <button onClick={() => refetch()} className="ml-2 text-indigo-600 hover:underline">Retry</button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Source Name
              </span>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Usage
              </span>
            </div>

            {leadSources.length === 0 ? (
              <div className="text-center py-12 text-sm text-slate-400">No lead sources yet.</div>
            ) : (
              leadSources.map((source) => (
                <LeadSourceRow key={source.id} source={source} onUpdate={handleUpdate} readOnly={readOnly} />
              ))
            )}

            {!readOnly && (
              <AddLeadSourceForm
                onSuccess={() => void qc.invalidateQueries({ queryKey: ['crm', 'lead-sources'] })}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
