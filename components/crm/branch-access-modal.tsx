'use client'

/**
 * Stub for branch-access management modal — referenced by topbar.tsx but the
 * actual implementation got dropped during the rebase recovery. Renders a
 * placeholder so the import resolves and the page builds. Replace with the
 * full UI when the branch-access flow is rebuilt.
 */

import { X } from 'lucide-react'

export function BranchAccessModal({
  branchName,
  onClose,
}: {
  branchId: string
  branchName: string
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="mb-3 flex items-start justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Manage access — {branchName}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Branch-access management is being rebuilt. Use the Users page in the
          meantime to assign roles per branch.
        </p>
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
