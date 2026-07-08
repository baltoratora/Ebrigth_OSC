'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/crm/utils'
import { useBranchContext } from '@/components/crm/branch-context'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts'
import { TrialSchedule } from './trial-schedule'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BranchMetrics {
  branchId: string
  branchName: string
  code: string
  /** Region letter from the API; null for region totals or branches outside the canonical list. */
  region: 'A' | 'B' | 'C' | null
  NL: number
  CT: number
  SU: number
  ENR: number
  /** Snapshot count of leads currently parked in the Buffer (OD use only) stage. */
  BUF: number
  conversionRate: number
  confirmedRate: number
  showUpRate: number
  enrolmentRate: number
}

interface MonthlyBucket {
  month: string  // YYYY-MM
  NL: number
  CT: number
  SU: number
  ENR: number
  BUF: number
}

interface MetricsResponse {
  range: { from: string; to: string }
  main: BranchMetrics
  regions: { A: BranchMetrics; B: BranchMetrics; C: BranchMetrics }
  branches: BranchMetrics[]
  regionMap: { A: string[]; B: string[]; C: string[] }
  /**
   * True for super_admin / agency_admin **viewing all branches**. Goes false
   * when (a) caller is BRANCH_MANAGER / BRANCH_STAFF or (b) caller is admin
   * but picked a specific branch in the topbar dropdown. Either way the UI
   * collapses to the "branch view": Main block + line chart, no regions.
   */
  elevated?: boolean
  /** True only for SUPER_ADMIN role. AGENCY_ADMIN is elevated but not super. */
  isSuperAdmin?: boolean
  /** 6-month NL/CT/SU/ENR buckets — populated for branch view only. */
  byMonth?: MonthlyBucket[]
  /** Branch name when scoped, used as the title of the Main block. */
  scopedBranchName?: string | null
  /** Branch ID when scoped — drives the trial-schedule widget when the BM
   *  has no explicit topbar selection (single-branch users don't get one). */
  scopedBranchId?: string | null
  /** Non-elevated multi-branch users (regional managers / multi-branch BMs):
   *  their full branch list, used to render the Trial Schedule branch picker
   *  across the whole region. Null for elevated + single-branch users. */
  scopedBranches?: Array<{ branchId: string; branchName: string }> | null
  /** Branches the caller may switch the dashboard to (super/agency + Marketing).
   *  Null = no picker. Drives the dashboard branch dropdown. */
  selectableBranches?: Array<{ branchId: string; branchName: string }> | null
}

type Preset = 'today' | 'yesterday' | 'last_week' | 'this_week' | 'next_week' | 'sat_sun' | '30d' | 'custom'
type Metric = 'NL' | 'CT' | 'SU' | 'ENR'
type Scope = 'main' | 'A' | 'B' | 'C'

const METRIC_LABEL: Record<Metric, string> = {
  NL: 'New Leads',
  CT: 'Confirmed for Trial',
  SU: 'Show-Up',
  ENR: 'Enrolled',
}

const PRESETS: Array<{ key: Preset; label: string }> = [
  { key: 'today',     label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'this_week', label: 'This Week (Mon)' },
  { key: 'next_week', label: 'Next Week' },
  { key: 'sat_sun',   label: 'Sat–Sun' },
  { key: 'last_week', label: 'Last Week' },
  { key: '30d',       label: 'Last 30 Days' },
  { key: 'custom',    label: 'Custom' },
]

// ─── Component ────────────────────────────────────────────────────────────────

export function DashboardClient() {
  // Default landing view is the running week — single-day windows make funnel
  // rates noisy and aren't actionable for BMs scanning the board on Monday
  // morning.
  const [preset, setPreset] = useState<Preset>('this_week')
  // Custom range (YYYY-MM-DD), applied only when preset === 'custom'.
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const { selectedBranch } = useBranchContext()
  // The dashboard's branch scope. Initialised from the topbar selection and
  // re-synced when it changes, but the on-dashboard branch dropdown (super /
  // agency / Marketing) can override it independently.
  const [viewBranchId, setViewBranchId] = useState<string | null>(selectedBranch?.id ?? null)
  useEffect(() => {
    setViewBranchId(selectedBranch?.id ?? null)
  }, [selectedBranch?.id])
  const branchId = viewBranchId

  // Drill-in: which metric+scope the user clicked to see the underlying leads.
  const [drill, setDrill] = useState<{ metric: Metric; scope: Scope; scopeLabel: string } | null>(null)

  // Custom range becomes "applied" only when both ends are chosen. We send the
  // KL day boundaries (+08:00) as ISO so the window matches the preset logic
  // regardless of the viewer's browser timezone.
  const customApplied = preset === 'custom' && !!customFrom && !!customTo
  const fromIso = customApplied ? new Date(`${customFrom}T00:00:00+08:00`).toISOString() : null
  const toIso = customApplied ? new Date(`${customTo}T23:59:59.999+08:00`).toISOString() : null
  // While "Custom" is selected but a date is still missing, fall back to the
  // running week so the board isn't stuck showing a stale/empty range.
  const effectivePreset: Preset = preset === 'custom' && !customApplied ? 'this_week' : preset

  const { data, isLoading } = useQuery<MetricsResponse>({
    queryKey: ['crm', 'dashboard', 'leads-metrics', effectivePreset, branchId, fromIso, toIso],
    queryFn: async () => {
      const params = new URLSearchParams({ preset: effectivePreset })
      if (customApplied && fromIso && toIso) {
        params.set('preset', 'custom')
        params.set('from', fromIso)
        params.set('to', toIso)
      }
      if (branchId) params.set('branchId', branchId)
      const res = await fetch(`/api/crm/dashboard/leads-metrics?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load metrics')
      return res.json()
    },
  })

  const rangeLabel = useMemo(() => {
    if (!data) return ''
    const from = new Date(data.range.from)
    const to = new Date(data.range.to)
    const fmt = (d: Date) =>
      d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    return fmt(from) === fmt(to) ? fmt(from) : `${fmt(from)} – ${fmt(to)}`
  }, [data])

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Leads Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {rangeLabel || 'Select a range'} · NL by created · CT by trial date · SU / ENR by stage entry
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Branch picker — super/agency admins + Marketing can view any
              branch's lead dashboard (read-only metrics). */}
          {data?.selectableBranches && data.selectableBranches.length > 0 && (
            <select
              value={viewBranchId ?? ''}
              onChange={(e) => setViewBranchId(e.target.value || null)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              title="View another branch's lead dashboard"
            >
              <option value="">{data.elevated ? 'All branches' : 'My dashboard'}</option>
              {data.selectableBranches.map((b) => (
                <option key={b.branchId} value={b.branchId}>{b.branchName}</option>
              ))}
            </select>
          )}
          <div className="rounded-full bg-slate-100 p-1 text-sm dark:bg-slate-800">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPreset(p.key)}
                className={cn(
                  'rounded-full px-3 py-1.5 transition',
                  preset === p.key
                    ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-900 dark:text-indigo-400'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Custom range pickers — only when "Custom" is selected. */}
      {preset === 'custom' && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">From</span>
          <input
            type="date"
            value={customFrom}
            max={customTo || undefined}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          />
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">to</span>
          <input
            type="date"
            value={customTo}
            min={customFrom || undefined}
            onChange={(e) => setCustomTo(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          />
          {!customApplied && (
            <span className="text-xs italic text-slate-400">Pick both dates to apply.</span>
          )}
        </div>
      )}

      {isLoading ? (
        <LoadingSkeleton />
      ) : !data ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
          Failed to load metrics.
        </div>
      ) : (
        <>
          {(() => {
            const mainTitle = data.elevated === false ? (data.scopedBranchName ?? 'Your branch') : 'Main'
            return (
              <MetricsBlock
                title={mainTitle}
                subtitle={data.elevated === false ? 'Pipeline performance' : 'Overall pipeline'}
                metrics={data.main}
                accent="indigo"
                onMetric={(m) => setDrill({ metric: m, scope: 'main', scopeLabel: mainTitle })}
              />
            )
          })()}

          {/* Branch view (BM users + admins viewing a single branch via the
              topbar picker): show a 6-month line chart instead of the
              regional + per-branch sections. */}
          {data.elevated === false && data.byMonth && data.byMonth.length > 0 && (
            <LeadsByMonthChart data={data.byMonth} />
          )}

          {/* Elevated-only sections: regional rollup cards land FIRST under
              the headline metrics so the super-admin / agency-admin can
              size up the funnel split per region before drilling into a
              specific branch's trial schedule. */}
          {data.elevated !== false && (
            <div className="grid gap-5 lg:grid-cols-3">
              <MetricsBlock
                title="Region A"
                subtitle={data.regionMap.A.join(' · ')}
                metrics={data.regions.A}
                accent="sky"
                compact
                onMetric={(m) => setDrill({ metric: m, scope: 'A', scopeLabel: 'Region A' })}
              />
              <MetricsBlock
                title="Region B"
                subtitle={data.regionMap.B.join(' · ')}
                metrics={data.regions.B}
                accent="amber"
                compact
                onMetric={(m) => setDrill({ metric: m, scope: 'B', scopeLabel: 'Region B' })}
              />
              <MetricsBlock
                title="Region C"
                subtitle={data.regionMap.C.join(' · ')}
                metrics={data.regions.C}
                accent="emerald"
                compact
                onMetric={(m) => setDrill({ metric: m, scope: 'C', scopeLabel: 'Region C' })}
              />
            </div>
          )}

          {/* Trial schedule grid — sits AFTER the regional rollup for elevated
              users so the page reads top-down: headline → regional split →
              branch-level trial detail.
              - Branch view (BM or admin-as-branch): single-branch grid,
                clickable cells with "who's joining" drill-in. BMs whose
                access is a single branch don't get a topbar switcher, so
                `branchId` from useBranchContext is null — fall back to the
                API's scopedBranchId so the widget still renders.
              - Elevated view (agency / super admin viewing rollup): renders
                a branch-picker dropdown so the admin can browse any branch
                without leaving the dashboard.
              - readOnly for super admin: cells render as plain numbers and
                the drill-in modal is suppressed. Agency admin keeps drill-in. */}
          {(() => {
            // Elevated admins: branch picker over all branches (super admin
            // gets the read-only variant).
            if (data.elevated !== false) {
              if (data.branches.length === 0) return null
              return (
                <TrialSchedule
                  branchId={branchId}
                  branches={data.branches.map((b) => ({ id: b.branchId, name: b.branchName }))}
                  readOnly={data.isSuperAdmin ?? false}
                />
              )
            }

            // Non-elevated (branch / regional manager) — fully interactive:
            //  1. Explicit topbar branch selection → that single branch.
            //  2. Multiple branches, no selection (regional manager / multi-
            //     branch BM) → the widget's own picker across their branches.
            //  3. Single branch → that branch.
            const scoped = data.scopedBranches ?? []
            if (branchId) {
              return <TrialSchedule branchId={branchId} readOnly={false} />
            }
            if (scoped.length > 1) {
              return (
                <TrialSchedule
                  branchId={null}
                  branches={scoped.map((b) => ({ id: b.branchId, name: b.branchName }))}
                  readOnly={false}
                />
              )
            }
            const single = data.scopedBranchId ?? scoped[0]?.branchId ?? null
            if (!single) return null
            return <TrialSchedule branchId={single} readOnly={false} />
          })()}

          {/* Elevated-only continued: branch bar chart + per-branch table. */}
          {data.elevated !== false && (
            <>
              <BranchBarChart branches={data.branches} />
              <BranchTable branches={data.branches} />
            </>
          )}
        </>
      )}

      {drill && (
        <LeadListModal
          metric={drill.metric}
          scope={drill.scope}
          scopeLabel={drill.scopeLabel}
          preset={effectivePreset}
          from={fromIso}
          to={toIso}
          branchId={branchId}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  )
}

// ─── Metrics block (Main or per-region) ───────────────────────────────────────

const ACCENT_CLASSES = {
  indigo:  'text-indigo-600 dark:text-indigo-400',
  sky:     'text-sky-600 dark:text-sky-400',
  rose:    'text-rose-600 dark:text-rose-400',
  amber:   'text-amber-600 dark:text-amber-400',
  emerald: 'text-emerald-600 dark:text-emerald-400',
} as const
type Accent = keyof typeof ACCENT_CLASSES

function MetricsBlock({
  title,
  subtitle,
  metrics,
  accent,
  compact = false,
  onMetric,
}: {
  title: string
  subtitle?: string
  metrics: BranchMetrics
  accent: Accent
  compact?: boolean
  onMetric?: (m: Metric) => void
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:shadow-none">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <div>
          <h2 className={cn('text-lg font-bold', ACCENT_CLASSES[accent])}>{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
      </div>

      {compact ? (
        // Regional rollup cards: just the 4 funnel stats stacked 2-up. Buffer
        // is intentionally absent here (snapshot-only — meaningful at the
        // branch level, not the regional level).
        <div className="grid grid-cols-2 gap-3">
          <Stat label="NL"  value={metrics.NL}  bold onClick={onMetric && (() => onMetric('NL'))} />
          <Stat label="CT"  value={metrics.CT}  bold onClick={onMetric && (() => onMetric('CT'))} />
          <Stat label="SU"  value={metrics.SU}  bold onClick={onMetric && (() => onMetric('SU'))} />
          <Stat label="ENR" value={metrics.ENR} bold onClick={onMetric && (() => onMetric('ENR'))} />
        </div>
      ) : (
        // Main / branch view: funnel stat above its matching rate so the
        // numerator (top) and the denominator-derived rate (bottom) are
        // visually paired. Buffer sits in its own card to the right with a
        // subtle visual separator so it doesn't get read as part of the
        // funnel.
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-[1fr_auto]">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <FunnelPair label="NL"  value={metrics.NL}  rateLabel="Conversion Rate" rateValue={pct(metrics.conversionRate)} rateHint="ENR / NL" onClick={onMetric && (() => onMetric('NL'))} />
            <FunnelPair label="CT"  value={metrics.CT}  rateLabel="Confirmed Rate"  rateValue={pct(metrics.confirmedRate)}  rateHint="CT / NL" onClick={onMetric && (() => onMetric('CT'))} />
            <FunnelPair label="SU"  value={metrics.SU}  rateLabel="Show Up Rate"    rateValue={pct(metrics.showUpRate)}     rateHint="SU / CT" onClick={onMetric && (() => onMetric('SU'))} />
            <FunnelPair label="ENR" value={metrics.ENR} rateLabel="Enrolment Rate"  rateValue={pct(metrics.enrolmentRate)}  rateHint="ENR / SU" onClick={onMetric && (() => onMetric('ENR'))} />
          </div>
          <div className="lg:border-l lg:pl-4 lg:border-slate-200 lg:dark:border-slate-700">
            <BufferCard value={metrics.BUF} />
          </div>
        </div>
      )}
    </div>
  )
}

// Funnel pair = stat tile on top, rate tile directly below. The two tiles
// share the same column so the visual eye-line maps NL→Conv, CT→Confirmed,
// SU→Show Up, ENR→Enrolment one-for-one.
function FunnelPair({
  label,
  value,
  rateLabel,
  rateValue,
  rateHint,
  onClick,
}: {
  label: string
  value: number
  rateLabel: string
  rateValue: string
  rateHint: string
  onClick?: () => void
}) {
  return (
    <div className="space-y-2">
      <Stat label={label} value={value} bold onClick={onClick} />
      <Stat label={rateLabel} value={rateValue} hint={rateHint} />
    </div>
  )
}

// Buffer sits apart from the funnel — it's a snapshot of parked leads, not
// a funnel-stage count. Lives in its own card with a faintly different
// surface tint so it reads as "side info" rather than "the SU column".
function BufferCard({ value }: { value: number }) {
  return (
    <div className="h-full rounded-md border border-slate-200 bg-[#f3f6fc] px-4 py-3 text-center dark:border-slate-700 dark:bg-slate-900/40 lg:min-w-30">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Buffer
      </div>
      <div className="mt-1 text-3xl font-bold text-slate-900 dark:text-slate-100">
        {value}
      </div>
      <div className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
        OD use only · snapshot
      </div>
    </div>
  )
}

function Stat({ label, value, hint, bold, onClick }: { label: string; value: string | number; hint?: string; bold?: boolean; onClick?: () => void }) {
  const inner = (
    <>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className={cn('mt-0.5', bold ? 'text-2xl font-bold' : 'text-xl font-semibold', 'text-slate-900 dark:text-slate-100')}>
        {value}
      </div>
      {hint && <div className="text-[10px] text-slate-400 dark:text-slate-500">{hint}</div>}
    </>
  )
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title="Click to see the leads behind this number"
        className="group w-full rounded-lg border border-slate-200 bg-[#f3f6fc] px-4 py-3 text-left transition-colors hover:border-indigo-400 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900/30 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/30"
      >
        {inner}
      </button>
    )
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-[#f3f6fc] px-4 py-3 dark:border-slate-700 dark:bg-slate-900/30">
      {inner}
    </div>
  )
}

function pct(v: number): string {
  if (!isFinite(v) || v === 0) return '—'
  return `${(v * 100).toFixed(2)}%`
}

// ─── Bar chart (NL per branch) ────────────────────────────────────────────────

function BranchBarChart({ branches }: { branches: BranchMetrics[] }) {
  const max = Math.max(1, ...branches.map((b) => b.NL))

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:shadow-none">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">New Leads by Branch</h2>
        <div className="flex items-center gap-4 text-[11px] text-slate-500 dark:text-slate-400">
          <LegendDot color="bg-sky-500" label="Region A" />
          <LegendDot color="bg-amber-500" label="Region B" />
          <LegendDot color="bg-emerald-500" label="Region C" />
        </div>
      </div>

      {branches.every((b) => b.NL === 0) ? (
        <p className="py-10 text-center text-sm text-slate-400">No leads in this range.</p>
      ) : (
        <div className="space-y-1.5">
          {branches.map((b) => {
            // Region comes from the API now — the previous index-based logic
            // assumed branches arrived in regional order, which broke when
            // we switched to numerical "01 → 23" ordering.
            const barColor =
              b.region === 'A' ? 'bg-sky-500' :
              b.region === 'B' ? 'bg-amber-500' :
              b.region === 'C' ? 'bg-emerald-500' :
                                 'bg-slate-400'
            const pctWidth = (b.NL / max) * 100
            return (
              <div key={b.branchId} className="flex items-center gap-3">
                <div className="w-16 truncate font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {b.code || '—'}
                </div>
                <div className="flex-1 truncate text-xs text-slate-700 dark:text-slate-300">
                  {b.branchName.replace(/^.*?-\s*/, '')}
                </div>
                <div className="h-5 flex-2 rounded-full bg-slate-100 dark:bg-slate-700">
                  <div
                    className={cn(barColor, 'h-full rounded-full transition-all')}
                    style={{ width: `${pctWidth}%` }}
                  />
                </div>
                <div className="w-10 text-right font-mono text-xs font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                  {b.NL}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('h-2.5 w-2.5 rounded-full', color)} />
      {label}
    </span>
  )
}

// ─── Per-branch table ─────────────────────────────────────────────────────────

function BranchTable({ branches }: { branches: BranchMetrics[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:shadow-none">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          <tr>
            <th className="px-4 py-2.5">Branch</th>
            <th className="px-4 py-2.5">Code</th>
            <th className="px-4 py-2.5 text-right">NL</th>
            <th className="px-4 py-2.5 text-right">CT</th>
            <th className="px-4 py-2.5 text-right">SU</th>
            <th className="px-4 py-2.5 text-right">ENR</th>
            <th className="px-4 py-2.5 text-right">Conv</th>
            <th className="px-4 py-2.5 text-right">Enrol</th>
          </tr>
        </thead>
        <tbody>
          {branches.map((b) => (
            <tr
              key={b.branchId}
              className="border-b border-slate-100 text-slate-800 last:border-0 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700/50"
            >
              <td className="px-4 py-2.5 font-medium">{b.branchName.replace(/^.*?-\s*/, '')}</td>
              <td className="px-4 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400">{b.code || '—'}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">{b.NL}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">{b.CT}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">{b.SU}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">{b.ENR}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
                {pct(b.conversionRate)}
              </td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                {pct(b.enrolmentRate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Drill-in modal: the leads behind a clicked number ────────────────────────

interface LeadRow {
  parentName: string
  childName: string
  leadSource: string | null
  email: string | null
  phone: string | null
  branchName: string
  branchCode: string
}
interface LeadListResponse {
  metric: Metric
  scope: Scope
  count: number
  truncated: boolean
  canSeeBranch: boolean
  rows: LeadRow[]
}

function LeadListModal({
  metric,
  scope,
  scopeLabel,
  preset,
  from,
  to,
  branchId,
  onClose,
}: {
  metric: Metric
  scope: Scope
  scopeLabel: string
  preset: Preset
  from?: string | null
  to?: string | null
  branchId: string | null
  onClose: () => void
}) {
  const { data, isLoading, isError } = useQuery<LeadListResponse>({
    queryKey: ['crm', 'dashboard', 'leads-list', metric, scope, preset, from, to, branchId],
    queryFn: async () => {
      const params = new URLSearchParams({ metric, scope, preset })
      if (preset === 'custom' && from && to) {
        params.set('from', from)
        params.set('to', to)
      }
      if (branchId) params.set('branchId', branchId)
      const res = await fetch(`/api/crm/dashboard/leads-metrics/list?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load leads')
      return res.json()
    },
  })

  const showBranch = data?.canSeeBranch ?? false

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative z-10 flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              {METRIC_LABEL[metric]} — {scopeLabel}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {isLoading ? 'Loading…' : `${data?.count ?? 0} ${(data?.count ?? 0) === 1 ? 'lead' : 'leads'}`}
              {data?.truncated && ' (showing first 1000)'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
            </div>
          ) : isError ? (
            <div className="py-16 text-center text-sm text-slate-500">Failed to load leads.</div>
          ) : !data || data.rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">No leads in this range.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2.5">Parent</th>
                  <th className="px-4 py-2.5">Child</th>
                  <th className="px-4 py-2.5">Lead Source</th>
                  <th className="px-4 py-2.5">Email</th>
                  <th className="px-4 py-2.5">Phone</th>
                  {showBranch && <th className="px-4 py-2.5">Branch</th>}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr
                    key={i}
                    className="border-b border-slate-100 text-slate-800 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-4 py-2.5 font-medium">{r.parentName}</td>
                    <td className="px-4 py-2.5">{r.childName}</td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{r.leadSource ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{r.email ?? '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-400">{r.phone ?? '—'}</td>
                    {showBranch && (
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                        {r.branchCode || r.branchName.replace(/^\d+\s*/, '') || '—'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-56 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="h-48 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        <div className="h-48 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        <div className="h-48 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
      </div>
      <div className="h-72 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
    </div>
  )
}

// ─── Leads by month (branch view only) ────────────────────────────────────────

function LeadsByMonthChart({ data }: { data: MonthlyBucket[] }) {
  // Pretty month label: "2026-05" → "May 2026"
  const chartData = useMemo(
    () =>
      data.map((b) => {
        const d = new Date(`${b.month}-01T00:00:00Z`)
        const label = d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
        return { ...b, label }
      }),
    [data],
  )

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Leads by Month
        </h2>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <LegendDot color="bg-indigo-500" label="New Leads" />
          <LegendDot color="bg-emerald-500" label="Confirmed" />
          <LegendDot color="bg-amber-500" label="Show-Up" />
          <LegendDot color="bg-rose-500" label="Enrolled" />
        </div>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid stroke="currentColor" strokeOpacity={0.1} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'currentColor', fillOpacity: 0.6 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'currentColor', fillOpacity: 0.6 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                borderRadius: 8,
                color: '#f1f5f9',
                fontSize: 12,
                padding: '8px 12px',
              }}
              labelStyle={{ color: '#94a3b8', marginBottom: 4 }}
              cursor={{ stroke: 'rgba(99, 102, 241, 0.4)', strokeWidth: 1 }}
            />
            <Legend wrapperStyle={{ display: 'none' }} />
            <Line
              type="monotone"
              dataKey="NL"
              name="New Leads"
              stroke="#6366f1"
              strokeWidth={2.5}
              dot={{ r: 3, fill: '#6366f1' }}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="CT"
              name="Confirmed"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ r: 3, fill: '#10b981' }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="SU"
              name="Show-Up"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={{ r: 3, fill: '#f59e0b' }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="ENR"
              name="Enrolled"
              stroke="#f43f5e"
              strokeWidth={2}
              dot={{ r: 3, fill: '#f43f5e' }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
