'use client'

import { useAutomationRuns } from '@/hooks/crm/useAutomations'
import { CheckCircle, XCircle, Loader2, Clock, X } from 'lucide-react'

interface RunLog {
  nodeId: string
  action: string
  status: 'ok' | 'error'
  message: string
  ts: string
}

interface Run {
  id: string
  status: string
  startedAt: string
  completedAt: string | null
  logs: RunLog[] | null
  contact?: { id: string; firstName: string | null; lastName: string | null } | null
}

interface Props {
  automationId: string
  onClose: () => void
}

export function RunsDrawer({ automationId, onClose }: Props) {
  const { data, isLoading } = useAutomationRuns(automationId)
  const runs = (data as Run[] | undefined) ?? []

  return (
    <aside className="w-96 shrink-0 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Recent activity</p>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Last 20 runs</p>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
          <X className="h-4 w-4 text-slate-500" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 text-sm">
        {isLoading && <p className="text-xs text-slate-400 px-2">Loading…</p>}
        {!isLoading && runs.length === 0 && (
          <p className="text-xs text-slate-400 px-2">No runs yet. Hit <span className="font-semibold">Test run</span> to fire one.</p>
        )}
        {runs.map((r) => (
          <details key={r.id} className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 group">
            <summary className="cursor-pointer list-none px-3 py-2 flex items-center gap-2">
              <RunStatusIcon status={r.status} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                  {r.contact?.firstName ?? r.contact?.lastName
                    ? `${r.contact?.firstName ?? ''} ${r.contact?.lastName ?? ''}`.trim()
                    : 'Untagged run'}
                </p>
                <p className="text-[10px] text-slate-400">{new Date(r.startedAt).toLocaleString()}</p>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-slate-400">{r.status}</span>
            </summary>
            <div className="border-t border-slate-200 dark:border-slate-700 px-3 py-2 space-y-1 text-[11px]">
              {(r.logs ?? []).length === 0 && <p className="text-slate-400">No log entries</p>}
              {(r.logs ?? []).map((l, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  {l.status === 'ok'
                    ? <CheckCircle className="h-3 w-3 mt-0.5 text-emerald-500 shrink-0" />
                    : <XCircle className="h-3 w-3 mt-0.5 text-red-500 shrink-0" />}
                  <span className="font-mono text-slate-700 dark:text-slate-300">
                    [{l.action}] {l.message}
                  </span>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </aside>
  )
}

function RunStatusIcon({ status }: { status: string }) {
  if (status === 'COMPLETED') return <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
  if (status === 'FAILED') return <XCircle className="h-4 w-4 text-red-500 shrink-0" />
  if (status === 'RUNNING') return <Loader2 className="h-4 w-4 text-blue-500 animate-spin shrink-0" />
  return <Clock className="h-4 w-4 text-slate-400 shrink-0" />
}
