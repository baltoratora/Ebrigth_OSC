'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/crm/utils'

const TYPED_GUARD = 'CONFIRM'

/**
 * In-CRM destructive-action dialog. Replaces `window.confirm()` so the prompt
 * stays inside the app's visual language and forces the user to type CONFIRM
 * before the delete button enables — protects against accidental bulk wipes
 * (cat-on-keyboard, click-mistake, muscle-memory return key).
 *
 * Used for both single-lead delete (count=1) and bulk delete (count>1) so the
 * UX is identical regardless of how many cards are about to disappear.
 */
export function DeleteConfirmDialog({
  open,
  count,
  loading = false,
  onConfirm,
  onClose,
}: {
  open: boolean
  count: number
  loading?: boolean
  onConfirm: () => void | Promise<void>
  onClose: () => void
}) {
  const [typed, setTyped] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset the typed guard each time the dialog opens — otherwise reopening it
  // after a successful previous confirmation would leave "CONFIRM" still in the
  // box, defeating the whole point of the gate.
  useEffect(() => {
    if (open) {
      setTyped('')
      // Defer focus to next tick so the input is mounted.
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  // Close on Escape (don't accidentally trigger from input keystrokes).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, loading, onClose])

  if (!open) return null

  const enabled = typed === TYPED_GUARD && !loading
  const noun = count === 1 ? 'lead' : 'leads'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-confirm-title"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => !loading && onClose()}
      />

      <div className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/40">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h2 id="delete-confirm-title" className="text-base font-semibold text-slate-900 dark:text-white">
                Delete {count} {noun}?
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                This cannot be undone from the UI.
              </p>
            </div>
          </div>
          <button
            onClick={() => !loading && onClose()}
            disabled={loading}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-3 px-5 py-4 text-sm">
          <p className="text-slate-700 dark:text-slate-300">
            {count === 1
              ? 'This will remove the lead from every view. The contact and stage history are kept in the database (soft-delete) but will no longer appear anywhere in the CRM.'
              : `${count} leads will be removed from every view. Contacts and stage history are kept in the database (soft-delete) but won't appear anywhere in the CRM.`}
          </p>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Type <span className="font-mono font-bold text-red-600 dark:text-red-400">{TYPED_GUARD}</span> to enable the delete button
            </label>
            <input
              ref={inputRef}
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && enabled) {
                  e.preventDefault()
                  void onConfirm()
                }
              }}
              autoComplete="off"
              spellCheck={false}
              disabled={loading}
              className={cn(
                'mt-1.5 w-full rounded-lg border bg-white px-3 py-2 text-sm font-mono tracking-wider focus:outline-none focus:ring-2 dark:bg-slate-800',
                typed === TYPED_GUARD
                  ? 'border-red-500 text-red-600 focus:ring-red-500 dark:border-red-700 dark:text-red-400'
                  : 'border-slate-300 text-slate-900 focus:ring-indigo-500 dark:border-slate-600 dark:text-white',
              )}
              placeholder={TYPED_GUARD}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-700">
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={() => void onConfirm()}
            disabled={!enabled}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors',
              enabled
                ? 'bg-red-600 hover:bg-red-700'
                : 'cursor-not-allowed bg-red-300 dark:bg-red-900/50',
            )}
          >
            {loading ? 'Deleting…' : `Delete ${count} ${noun}`}
          </button>
        </div>
      </div>
    </div>
  )
}
