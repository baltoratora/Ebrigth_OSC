'use client'

/**
 * Ticket System dashboard.
 *
 * Super admin sees:
 *   - Summary cards (Total / Received / In Progress / Complete / Rejected)
 *   - Weekly line chart split by branch
 *   - Weekly line chart split by platform
 *
 * Branch user sees:
 *   - Summary cards scoped to their branch(es)
 *   - Single weekly line chart of their branch's submissions
 *
 * Date filter: Today, Yesterday, Last 7 Days, This Month.
 * The /api/crm/tickets/analytics endpoint applies the branch-scoping and
 * the date range — this page just paints what it returns.
 */

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Ticket, TicketCheck, Clock, XCircle, ListChecks } from 'lucide-react'

type Preset = 'today' | 'yesterday' | '7d' | 'month'

interface Analytics {
  period: { from: string; to: string }
  scope:  { isAdmin: boolean; viewerBranchIds: string[]; viewerRole: string }
  totals: {
    all: number
    received: number
    in_progress: number
    complete: number
    rejected: number
  }
  byPlatform:       Array<{ id: string; name: string; code: string; accent_color: string; total: number; open: number; completed: number }>
  topBranches:      Array<{ id: string; name: string; code: string; branch_number: string; total: number }>
  weeklyTotal:      Array<{ week: string; total: number }>
  weeklyByBranch:   Array<Record<string, string | number>>
  weeklyByPlatform: Array<Record<string, string | number>>
  avgResolutionHours: number
  rejectionRate:      number
}

const PRESETS: Array<{ key: Preset; label: string }> = [
  { key: 'today',     label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d',        label: 'Last 7 Days' },
  { key: 'month',     label: 'This Month' },
]

// Deterministic palette — same name always gets the same color across reloads.
const PALETTE = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
  '#ef4444', '#14b8a6', '#a855f7', '#f97316', '#06b6d4', '#84cc16',
  '#eab308', '#0ea5e9', '#22c55e', '#d946ef', '#f43f5e', '#0284c7',
  '#7c3aed', '#dc2626',
]

function colorFor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return PALETTE[Math.abs(h) % PALETTE.length]
}

export default function TicketDashboardPage() {
  // Default to Today so the dashboard mirrors the lead dashboard's at-a-glance
  // view — the user explicitly asked for "today" as the landing state.
  const [preset, setPreset] = useState<Preset>('today')

  const { data, isLoading, isError, error } = useQuery<Analytics>({
    queryKey: ['ticketDashboard', preset],
    queryFn: async () => {
      const res = await fetch(`/api/crm/tickets/analytics?preset=${preset}`, {
        credentials: 'same-origin',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      return res.json()
    },
    staleTime: 60_000,
  })

  // Derive chart series names from the data (which keys exist in the row objects).
  const branchSeries = useMemo(() => {
    if (!data?.weeklyByBranch?.[0]) return []
    return Object.keys(data.weeklyByBranch[0]).filter((k) => k !== 'week')
  }, [data])

  const platformSeries = useMemo(() => {
    if (!data?.weeklyByPlatform?.[0]) return []
    return Object.keys(data.weeklyByPlatform[0]).filter((k) => k !== 'week')
  }, [data])

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Ticket Dashboard</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {data?.scope.isAdmin
              ? 'Tenant-wide ticket activity'
              : 'Your branch ticket activity'}
          </p>
        </div>

        {/* Date-range chips */}
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
          {PRESETS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPreset(key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                preset === key
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300">
          Failed to load analytics: {(error as Error)?.message}
        </div>
      )}

      {isLoading && !data && (
        <div className="text-sm text-slate-500">Loading…</div>
      )}

      {data && (
        <>
          {/* ── Summary cards ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <MetricCard label="Total"        value={data.totals.all}         icon={<ListChecks className="h-4 w-4" />} color="text-slate-700 dark:text-slate-200" />
            <MetricCard label="Received"     value={data.totals.received}    icon={<Ticket className="h-4 w-4" />}     color="text-blue-600" />
            <MetricCard label="In Progress"  value={data.totals.in_progress} icon={<Clock className="h-4 w-4" />}      color="text-amber-600" />
            <MetricCard label="Complete"     value={data.totals.complete}    icon={<TicketCheck className="h-4 w-4" />}color="text-emerald-600" />
            <MetricCard label="Rejected"     value={data.totals.rejected}    icon={<XCircle className="h-4 w-4" />}    color="text-red-600" />
          </div>

          {/* ── Weekly trend chart(s) ─────────────────────────────────────── */}
          {data.scope.isAdmin ? (
            <>
              <ChartCard title="Weekly submissions by branch">
                {branchSeries.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={data.weeklyByBranch}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                      <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {branchSeries.map((name) => (
                        <Line
                          key={name}
                          type="monotone"
                          dataKey={name}
                          stroke={colorFor(name)}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                          isAnimationActive={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Weekly submissions by platform">
                {platformSeries.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={data.weeklyByPlatform}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                      <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {platformSeries.map((name) => (
                        <Line
                          key={name}
                          type="monotone"
                          dataKey={name}
                          stroke={colorFor(name)}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                          isAnimationActive={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </>
          ) : (
            <ChartCard title="Weekly submissions">
              {data.weeklyTotal.length === 0 ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={data.weeklyTotal}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line
                      type="monotone"
                      dataKey="total"
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          )}

          {/* ── Resolution metrics ─────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <ChartCard title="Avg. resolution time">
              <p className="px-2 py-4 text-3xl font-bold text-slate-900 dark:text-white">
                {data.avgResolutionHours.toFixed(1)} <span className="text-base font-medium text-slate-500">hrs</span>
              </p>
            </ChartCard>
            <ChartCard title="Rejection rate">
              <p className="px-2 py-4 text-3xl font-bold text-slate-900 dark:text-white">
                {(data.rejectionRate * 100).toFixed(1)} <span className="text-base font-medium text-slate-500">%</span>
              </p>
            </ChartCard>
          </div>
        </>
      )}
    </div>
  )
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const tooltipStyle = {
  backgroundColor: 'rgb(15 23 42 / 0.92)',
  border: 'none',
  borderRadius: 8,
  color: 'white',
  fontSize: 12,
} as const

function MetricCard({
  label, value, icon, color,
}: {
  label: string
  value: number
  icon: React.ReactNode
  color: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {label}
        </span>
        <span className={color}>{icon}</span>
      </div>
      <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{value}</p>
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h2>
      {children}
    </section>
  )
}

function EmptyChart() {
  return (
    <div className="flex h-64 items-center justify-center text-sm text-slate-400">
      No tickets in this period.
    </div>
  )
}
