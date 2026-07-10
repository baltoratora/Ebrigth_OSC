'use client'

import { useState, useCallback } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  getPaginationRowModel,
} from '@tanstack/react-table'
import { useQuery } from '@tanstack/react-query'
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  X,
} from 'lucide-react'
import { cn, formatDate, formatDateTime } from '@/lib/crm/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditLog {
  id: string
  tenantId: string | null
  userId: string | null
  userEmail: string | null
  action: string
  entity: string
  entityId: string | null
  ipAddress: string | null
  createdAt: string
  meta: Record<string, unknown> | null
  // Enriched server-side:
  actorName: string | null
  actorEmail: string | null
  actorBranch: string | null      // the branch that made the change
  affectedBranch: string | null   // the branch the change was about
  description: string | null      // human-readable "what was done"
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  READ: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  UPDATE: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  LOGIN: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
  LOGOUT: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  EXPORT: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  IMPORT: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

interface AuditFilters {
  page: number
  pageSize: number
  search: string
  action: string
  entity: string
  dateFrom: string
  dateTo: string
}

async function fetchAuditLogs(filters: AuditFilters): Promise<{
  logs: AuditLog[]
  total: number
  page: number
  pageSize: number
}> {
  const sp = new URLSearchParams()
  sp.set('page', String(filters.page))
  sp.set('pageSize', String(filters.pageSize))
  if (filters.search) sp.set('search', filters.search)
  if (filters.action) sp.set('action', filters.action)
  if (filters.entity) sp.set('entity', filters.entity)
  if (filters.dateFrom) sp.set('dateFrom', filters.dateFrom)
  if (filters.dateTo) sp.set('dateTo', filters.dateTo)

  const res = await fetch(`/api/crm/audit-log?${sp}`)
  if (!res.ok) throw new Error('Failed to fetch audit log')
  return res.json()
}

// ─── Main page ────────────────────────────────────────────────────────────────

const col = createColumnHelper<AuditLog>()

const ACTIONS = ['CREATE', 'READ', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'EXPORT', 'IMPORT']

export default function AuditLogPage() {
  const [page, setPage] = useState(1)
  const [pageSize] = useState(25)
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['crm', 'audit-log', page, pageSize, search, actionFilter, entityFilter, dateFrom, dateTo],
    queryFn: () =>
      fetchAuditLogs({
        page,
        pageSize,
        search,
        action: actionFilter,
        entity: entityFilter,
        dateFrom,
        dateTo,
      }),
    staleTime: 30_000,
  })

  const logs = data?.logs ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / pageSize)

  function handleExportCsv() {
    const headers = ['Timestamp', 'User', 'Email', 'Branch', 'Action', 'What was done', 'Affected Branch', 'Entity', 'IP']
    const rows = logs.map((log) => [
      formatDateTime(log.createdAt),
      log.actorName ?? log.userEmail ?? log.userId ?? '—',
      log.actorEmail ?? log.userEmail ?? '—',
      log.actorBranch ?? '—',
      log.action,
      log.description ?? `${log.action} ${log.entity}`,
      log.affectedBranch ?? '—',
      log.entity,
      log.ipAddress ?? '—',
    ])
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${formatDate(new Date())}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const columns = [
    col.accessor('createdAt', {
      header: 'Timestamp',
      cell: (info) => (
        <span className="text-xs font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
          {formatDateTime(info.getValue())}
        </span>
      ),
    }),
    col.display({
      id: 'user',
      header: 'User',
      cell: ({ row }) => {
        const r = row.original
        const name = r.actorName ?? r.userEmail ?? r.userId ?? '—'
        const email = r.actorEmail ?? r.userEmail
        return (
          <div className="min-w-0 max-w-44">
            <div className="truncate text-xs font-medium text-slate-800 dark:text-slate-200">{name}</div>
            {email && email !== name && (
              <div className="truncate text-[10px] text-slate-400 dark:text-slate-500">{email}</div>
            )}
          </div>
        )
      },
    }),
    col.accessor('actorBranch', {
      header: 'Branch',
      cell: (info) => (
        <span className="text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
          {info.getValue() ?? '—'}
        </span>
      ),
    }),
    col.accessor('action', {
      header: 'Action',
      cell: (info) => (
        <span className={cn(
          'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
          ACTION_COLORS[info.getValue()] ?? 'bg-slate-100 text-slate-600',
        )}>
          {info.getValue()}
        </span>
      ),
    }),
    col.display({
      id: 'details',
      header: 'What was done',
      cell: ({ row }) => {
        const r = row.original
        const showAffected = r.affectedBranch && r.affectedBranch !== r.actorBranch
        return (
          <div className="min-w-0">
            <div className="text-xs text-slate-700 dark:text-slate-300">
              {r.description ?? `${r.action} ${r.entity}`}
              {showAffected && (
                <span className="text-slate-400 dark:text-slate-500"> → {r.affectedBranch}</span>
              )}
            </div>
            <code className="text-[10px] text-slate-400 dark:text-slate-500">{r.entity}</code>
          </div>
        )
      },
    }),
    col.accessor('ipAddress', {
      header: 'IP',
      cell: (info) => (
        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
          {info.getValue() ?? '—'}
        </span>
      ),
    }),
  ]

  const table = useReactTable({
    data: logs,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: totalPages,
  })

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Audit Log</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Track all system actions for compliance and debugging.
          </p>
        </div>
        <button
          onClick={handleExportCsv}
          disabled={logs.length === 0}
          className="flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search by user or entity..."
            className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 pl-8 pr-3 py-1.5 text-sm w-60 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1) }}
          className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All actions</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <input
          type="text"
          value={entityFilter}
          onChange={(e) => { setEntityFilter(e.target.value); setPage(1) }}
          placeholder="Entity (e.g. crm_contact)"
          className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm w-48 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
            className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <span className="text-slate-400 text-xs">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
            className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {(search || actionFilter || entityFilter || dateFrom || dateTo) && (
          <button
            onClick={() => {
              setSearch('')
              setActionFilter('')
              setEntityFilter('')
              setDateFrom('')
              setDateTo('')
              setPage(1)
            }}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
          </div>
        ) : isError ? (
          <div className="text-center py-16 text-sm text-slate-500">
            Failed to load audit log.
            <button onClick={() => refetch()} className="ml-2 text-indigo-600 hover:underline">Retry</button>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16 text-sm text-slate-400">No audit log entries found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    {hg.headers.map((h) => (
                      <th key={h.id} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 whitespace-nowrap">
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
                      <td key={cell.id} className="px-4 py-2.5">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
          <span>
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs tabular-nums">
              {page} / {totalPages || 1}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
