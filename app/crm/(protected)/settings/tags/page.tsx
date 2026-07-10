'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2, Pencil, Trash2, X, Check } from 'lucide-react'
import { cn } from '@/lib/crm/utils'
import { useReadOnlyViewer } from '@/lib/crm/use-read-only-viewer'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tag {
  id: string
  name: string
  color: string
  tenantId: string
  branchId: string | null
  createdAt: string
}

const COLOR_SWATCHES = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#14b8a6', '#64748b', '#000000', '#ffffff',
]

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchTags(): Promise<{ tags: Tag[] }> {
  const res = await fetch('/api/crm/tags')
  if (!res.ok) throw new Error('Failed to fetch tags')
  return res.json()
}

// ─── Tag chip (editable) ──────────────────────────────────────────────────────

function TagChip({
  tag,
  onUpdate,
  onDelete,
  readOnly = false,
}: {
  tag: Tag
  onUpdate: (id: string, name: string, color: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  readOnly?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(tag.name)
  const [color, setColor] = useState(tag.color)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const textColor =
    color === '#ffffff' || color === '#eab308' || color === '#22c55e' || color === '#06b6d4'
      ? '#1e293b'
      : '#ffffff'

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onUpdate(tag.id, name, color)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="relative rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3 w-56">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save()
            if (e.key === 'Escape') setEditing(false)
          }}
          autoFocus
          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <div className="grid grid-cols-6 gap-1">
          {COLOR_SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={cn(
                'h-6 w-6 rounded-full border-2 transition-transform hover:scale-110',
                color === c ? 'border-indigo-500' : 'border-slate-200 dark:border-slate-600',
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing(false)}
            className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-indigo-600 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Save
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative group">
      <div
        className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium select-none ${readOnly ? '' : 'cursor-pointer'}`}
        style={{ backgroundColor: color, color: textColor }}
        onClick={() => { if (!readOnly) setEditing(true) }}
      >
        <span>{tag.name}</span>
        <div className={`flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1 ${readOnly ? 'hidden' : ''}`}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setEditing(true)
            }}
            className="hover:opacity-70 transition-opacity"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setConfirmDelete(true)
            }}
            className="hover:opacity-70 transition-opacity"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {confirmDelete && (
        <div className="absolute top-full left-0 mt-1 z-20 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-3 space-y-2 w-44">
          <p className="text-xs text-slate-700 dark:text-slate-300">Delete this tag?</p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmDelete(false)}
              className="flex-1 text-xs rounded border border-slate-300 dark:border-slate-600 py-1 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              No
            </button>
            <button
              onClick={async () => {
                await onDelete(tag.id)
                setConfirmDelete(false)
              }}
              className="flex-1 text-xs rounded bg-red-600 py-1 text-white hover:bg-red-700 transition-colors"
            >
              Yes
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── New tag form ─────────────────────────────────────────────────────────────

function NewTagForm({ onSuccess }: { onSuccess: () => void }) {
  const [show, setShow] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#3b82f6')
  const [saving, setSaving] = useState(false)

  const textColor = color === '#ffffff' || color === '#eab308' ? '#1e293b' : '#ffffff'

  async function handleCreate() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/crm/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      })
      if (!res.ok) throw new Error()
      toast.success('Tag created')
      setName('')
      setColor('#3b82f6')
      setShow(false)
      onSuccess()
    } catch {
      toast.error('Failed to create tag')
    } finally {
      setSaving(false)
    }
  }

  if (!show) {
    return (
      <button
        onClick={() => setShow(true)}
        className="flex items-center gap-2 rounded-full border-2 border-dashed border-slate-300 dark:border-slate-600 px-4 py-2 text-sm text-slate-500 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
      >
        <Plus className="h-4 w-4" />
        New tag
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3 w-56">
      {/* Preview */}
      <div
        className="rounded-full px-4 py-2 text-sm font-medium text-center"
        style={{ backgroundColor: color, color: textColor }}
      >
        {name || 'Preview'}
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void handleCreate()
          if (e.key === 'Escape') setShow(false)
        }}
        autoFocus
        placeholder="Tag name"
        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400"
      />

      <div className="grid grid-cols-6 gap-1">
        {COLOR_SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className={cn(
              'h-6 w-6 rounded-full border-2 transition-transform hover:scale-110',
              color === c ? 'border-indigo-500' : 'border-slate-200 dark:border-slate-600',
            )}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setShow(false)}
          className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={saving || !name.trim()}
          className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-indigo-600 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Create
        </button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TagsPage() {
  const readOnly = useReadOnlyViewer()
  const qc = useQueryClient()
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['crm', 'tags'],
    queryFn: fetchTags,
  })

  const tags = data?.tags ?? []

  async function handleUpdate(id: string, name: string, color: string) {
    const res = await fetch(`/api/crm/tags/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color }),
    })
    if (!res.ok) {
      toast.error('Failed to update tag')
      return
    }
    toast.success('Tag updated')
    void qc.invalidateQueries({ queryKey: ['crm', 'tags'] })
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/crm/tags/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error('Failed to delete tag')
      return
    }
    toast.success('Tag deleted')
    void qc.invalidateQueries({ queryKey: ['crm', 'tags'] })
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Tags</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Create and manage contact tags. Click a tag to edit it.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
        </div>
      ) : isError ? (
        <div className="text-center py-20 text-sm text-slate-500">
          Failed to load tags.
          <button onClick={() => refetch()} className="ml-2 text-indigo-600 hover:underline">Retry</button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3 items-start">
          {tags.map((tag) => (
            <TagChip
              key={tag.id}
              tag={tag}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              readOnly={readOnly}
            />
          ))}
          {!readOnly && <NewTagForm onSuccess={() => void qc.invalidateQueries({ queryKey: ['crm', 'tags'] })} />}
        </div>
      )}

      {!isLoading && !isError && tags.length === 0 && (
        <div className="text-center py-10 text-slate-400 text-sm">
          No tags yet. Create your first one.
        </div>
      )}
    </div>
  )
}
