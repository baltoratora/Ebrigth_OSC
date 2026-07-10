'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRightLeft, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/crm/utils'

export const MAX_TRANSFERS_PER_LEAD = 3

interface TransferableBranch {
  id:   string
  name: string
}

interface LeadTransferPanelProps {
  opportunityId:   string
  currentBranchId: string
  transferCount:   number
  branches:        TransferableBranch[]
}

export function LeadTransferPanel({
  opportunityId,
  currentBranchId,
  transferCount,
  branches,
}: LeadTransferPanelProps) {
  const router = useRouter()
  const [toBranchId, setToBranchId] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showLimitDialog, setShowLimitDialog] = useState(false)

  const limitReached = transferCount >= MAX_TRANSFERS_PER_LEAD
  const transfersRemaining = Math.max(0, MAX_TRANSFERS_PER_LEAD - transferCount)

  const targetBranches = useMemo(
    () => branches.filter((b) => b.id !== currentBranchId),
    [branches, currentBranchId],
  )

  function handleAttempt(e: React.FormEvent) {
    e.preventDefault()
    if (limitReached) {
      setShowLimitDialog(true)
      return
    }
    if (!toBranchId) {
      toast.error('Please pick a target branch')
      return
    }
    if (reason.trim().length < 5) {
      toast.error('Please enter a reason (at least 5 characters)')
      return
    }
    void submit()
  }

  async function submit() {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/crm/opportunities/${opportunityId}/transfer`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ toBranchId, reason: reason.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 409 && data?.error === 'TRANSFER_LIMIT_REACHED') {
          setShowLimitDialog(true)
          return
        }
        toast.error(data?.error?.formErrors?.[0] ?? data?.message ?? data?.error ?? 'Transfer failed')
        return
      }
      toast.success(
        `Transferred to ${data.toBranchName}. ${data.transfersRemaining} transfer(s) remaining.`,
      )
      setReason('')
      setToBranchId('')
      // The lead now belongs to the target branch — this detail page is no
      // longer in the current user's scope (a branch manager who transfers a
      // lead OUT can't load it anymore), which previously surfaced a 404 even
      // though the transfer succeeded. Send them back to the board instead of
      // refreshing the now-inaccessible page.
      router.push('/crm/opportunities')
      router.refresh()
    } catch (err) {
      toast.error((err as Error).message || 'Transfer failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <header className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Transfer to another branch
            </h2>
          </div>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-semibold',
              limitReached
                ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
            )}
          >
            {transferCount}/{MAX_TRANSFERS_PER_LEAD} transfers used
          </span>
        </header>

        <form onSubmit={handleAttempt} className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Target branch
            </label>
            <select
              value={toBranchId}
              onChange={(e) => setToBranchId(e.target.value)}
              disabled={limitReached || submitting}
              className={cn(
                'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm',
                'dark:border-slate-600 dark:bg-slate-800 dark:text-white',
                'focus:outline-none focus:ring-2 focus:ring-indigo-500',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              <option value="">Select a branch…</option>
              {targetBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={limitReached || submitting}
              placeholder="Why is this lead being transferred?"
              rows={3}
              className={cn(
                'w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm',
                'dark:border-slate-600 dark:bg-slate-800 dark:text-white',
                'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            />
            <p className="text-[11px] text-slate-400">Minimum 5 characters.</p>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {limitReached
                ? 'Maximum transfers reached.'
                : `${transfersRemaining} transfer${transfersRemaining === 1 ? '' : 's'} remaining.`}
            </p>
            <button
              type="submit"
              disabled={submitting}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white',
                'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Transfer lead
            </button>
          </div>
        </form>
      </section>

      {showLimitDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowLimitDialog(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Transfer limit reached
              </h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              This lead has reached the maximum of {MAX_TRANSFERS_PER_LEAD} transfers between
              branches. Please contact the <strong>Optimisation Department</strong> for
              further assistance.
            </p>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowLimitDialog(false)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
