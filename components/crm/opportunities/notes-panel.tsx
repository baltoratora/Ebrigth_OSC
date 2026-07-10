'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, PenLine } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate } from '@/lib/crm/utils'

export interface NotePanelEntry {
  id: string
  body: string
  createdAt: string | Date
  user: { id: string; name: string | null; email: string } | null
}

interface NotesPanelProps {
  contactId: string
  initial: NotePanelEntry[]
}

/**
 * Stand-alone notes UI used by the lead detail page (server component).
 * Mirrors the inline notes section in OpportunityDetailModal so BMs see
 * the same affordance whether they click the lead card or the underlined
 * name. router.refresh() is enough to repaint the server page with the
 * newly-fetched note in the list.
 */
export function NotesPanel({ contactId, initial }: NotesPanelProps) {
  const router = useRouter()
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    const body = draft.trim()
    if (!body || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/crm/contacts/${contactId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error((errBody as { error?: string }).error ?? 'Failed to save')
      }
      setDraft('')
      toast.success('Note added')
      router.refresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section id="notes" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h3 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        <PenLine className="h-3 w-3" /> Notes
      </h3>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void handleAdd()
        }}
        className="space-y-2"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a note about this lead…"
          rows={2}
          disabled={saving}
          className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!draft.trim() || saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            {saving ? 'Saving…' : 'Add note'}
          </button>
        </div>
      </form>

      {initial.length === 0 ? (
        <p className="mt-3 text-xs italic text-slate-500 dark:text-slate-400">
          No notes yet.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {initial.map((n) => (
            <li
              key={n.id}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50"
            >
              <p className="whitespace-pre-wrap text-sm text-slate-900 dark:text-slate-100">
                {n.body}
              </p>
              <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                {n.user?.name ?? n.user?.email ?? 'Unknown'}
                {' · '}
                {formatDate(n.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
