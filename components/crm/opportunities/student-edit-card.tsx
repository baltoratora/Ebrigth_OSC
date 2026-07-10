'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PenLine, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface StudentEditCardProps {
  contactId: string
  initial: {
    firstName: string
    lastName: string | null
    childAge1: string | null
    parentFullName: string | null
  }
  /** Whether the contact currently represents a child (was sibling-exploded
   *  at import). Drives only the read-only display order. */
  isChild: boolean
}

export function StudentEditCard({ contactId, initial, isChild }: StudentEditCardProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState({
    firstName:      initial.firstName,
    lastName:       initial.lastName ?? '',
    childAge1:      initial.childAge1 ?? '',
    parentFullName: initial.parentFullName ?? '',
  })

  function resetAndOpen() {
    setDraft({
      firstName:      initial.firstName,
      lastName:       initial.lastName ?? '',
      childAge1:      initial.childAge1 ?? '',
      parentFullName: initial.parentFullName ?? '',
    })
    setOpen(true)
  }

  async function save() {
    if (saving) return
    const firstName = draft.firstName.trim()
    if (!firstName) {
      toast.error('Student first name is required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/crm/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName:       draft.lastName.trim() || undefined,
          childAge1:      draft.childAge1.trim() || undefined,
          parentFullName: draft.parentFullName.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? 'Failed to save')
      }
      toast.success('Student details updated')
      setOpen(false)
      // Re-fetch the server component so the displayed name/age refresh.
      router.refresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const fullName = (initial.firstName + (initial.lastName ? ' ' + initial.lastName : '')).trim()

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Student & Parent
        </h3>
        {!open && (
          <button
            type="button"
            onClick={resetAndOpen}
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
          >
            <PenLine className="h-3 w-3" /> Edit
          </button>
        )}
      </div>

      {open ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Student first name *</span>
              <input
                type="text"
                value={draft.firstName}
                onChange={(e) => setDraft((d) => ({ ...d, firstName: e.target.value }))}
                disabled={saving}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Last name</span>
              <input
                type="text"
                value={draft.lastName}
                onChange={(e) => setDraft((d) => ({ ...d, lastName: e.target.value }))}
                disabled={saving}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </label>
          </div>
          <label className="block">
            <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Student age</span>
            <input
              type="text"
              placeholder='e.g. "10" or "10-12 years old"'
              value={draft.childAge1}
              onChange={(e) => setDraft((d) => ({ ...d, childAge1: e.target.value }))}
              disabled={saving}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
          </label>
          <label className="block">
            <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Parent name</span>
            <input
              type="text"
              value={draft.parentFullName}
              onChange={(e) => setDraft((d) => ({ ...d, parentFullName: e.target.value }))}
              disabled={saving}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={saving}
              className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !draft.firstName.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5 text-sm">
          <div className="text-slate-500 dark:text-slate-400">Student</div>
          <div className="text-slate-900 dark:text-slate-100">
            {fullName || '—'}
            {initial.childAge1 && (
              <span className="ml-2 text-xs text-slate-500">({initial.childAge1})</span>
            )}
          </div>
          <div className="text-slate-500 dark:text-slate-400">Parent</div>
          <div className="text-slate-900 dark:text-slate-100">
            {isChild ? (initial.parentFullName ?? '—') : (fullName || '—')}
          </div>
        </div>
      )}
    </section>
  )
}
