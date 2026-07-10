'use client'

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, MapPinned } from 'lucide-react'
import { cn } from '@/lib/crm/utils'

// ─── Brand colour ────────────────────────────────────────────────────────────
// Ebright red. Used as the accent for active selections and non-zero counts.
// Kept inline rather than threaded through tailwind.config because Tailwind v4
// reads colours directly from CSS — adding a real `--color-brand` and
// referencing it via `bg-brand` would be the next refactor.
const BRAND = '#ed1c24'

// ─── Types (mirror /api/crm/region/day-distribution response) ────────────────
type Region = 'A' | 'B' | 'C'
type TrialDay = 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN'
const DAYS: TrialDay[] = ['WED', 'THU', 'FRI', 'SAT', 'SUN']

type DayCounts = { CT: number; ENR: number }
type BranchRow = {
  branchId: string
  branchName: string
  shortName: string
  region: Region | null
  totals: DayCounts
  days: Record<TrialDay, DayCounts>
}
type ApiResponse = {
  asOfDate: string
  from: string
  to: string
  scope: 'all' | 'regional'
  availableRegions: Region[]
  overall: { totals: DayCounts; days: Record<TrialDay, DayCounts> }
  branches: BranchRow[]
}

// ─── Preset buttons ──────────────────────────────────────────────────────────
const PRESETS = [
  { id: 'today',      label: 'Today' },
  { id: 'yesterday',  label: 'Yesterday' },
  { id: 'this_week',  label: 'This Week' },
  { id: 'last_week',  label: 'Last Week' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
] as const
type Preset = (typeof PRESETS)[number]['id']

// ─── Helpers ─────────────────────────────────────────────────────────────────
function shortDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

async function fetchDayDistribution(params: {
  preset: Preset
  region: 'all' | Region
  branchId: string
}): Promise<ApiResponse> {
  const sp = new URLSearchParams({
    preset:   params.preset,
    region:   params.region,
    branchId: params.branchId,
  })
  const res = await fetch(`/api/crm/region/day-distribution?${sp.toString()}`, {
    cache: 'no-store',
  })
  if (!res.ok) {
    const e = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((e as { error?: string }).error ?? res.statusText)
  }
  return res.json() as Promise<ApiResponse>
}

// ─── Pill button — used by every selector row ────────────────────────────────
function Pill({
  active,
  onClick,
  children,
  size = 'md',
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  size?: 'sm' | 'md'
}) {
  const pad = size === 'sm' ? 'px-3 py-1 text-[11px]' : 'px-4 py-1.5 text-xs'
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full font-medium transition-all',
        pad,
        active
          ? 'text-white shadow-sm ring-1 ring-black/5'
          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-700/70',
      )}
      style={active ? { backgroundColor: BRAND } : undefined}
    >
      {children}
    </button>
  )
}

// ─── Day cell ─────────────────────────────────────────────────────────────────
function DayCell({ day, counts }: { day: TrialDay; counts: DayCounts }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-center dark:border-slate-800 dark:bg-slate-900/60">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
        {day}
      </div>
      <div className="mt-1.5 flex items-center justify-center gap-2 text-2xl font-bold tabular-nums">
        <span
          className={
            counts.CT > 0
              ? ''
              : 'text-slate-300 dark:text-slate-700'
          }
          style={counts.CT > 0 ? { color: BRAND } : undefined}
        >
          {counts.CT}
        </span>
        <span className="text-slate-300 dark:text-slate-700">|</span>
        <span
          className={
            counts.ENR > 0
              ? ''
              : 'text-slate-300 dark:text-slate-700'
          }
          style={counts.ENR > 0 ? { color: BRAND } : undefined}
        >
          {counts.ENR}
        </span>
      </div>
    </div>
  )
}

// ─── Grid row (Overall + one per branch) ─────────────────────────────────────
function GridRow({
  label,
  totals,
  days,
  emphasis,
}: {
  label: string
  totals: DayCounts
  days: Record<TrialDay, DayCounts>
  emphasis?: boolean
}) {
  const hasAny = totals.CT > 0 || totals.ENR > 0
  return (
    <div
      className={cn(
        'grid grid-cols-[minmax(180px,220px)_repeat(5,1fr)] items-center gap-3 rounded-xl border bg-white p-4 shadow-sm transition-colors dark:bg-slate-900/40',
        emphasis
          ? 'border-l-4 border-slate-200 dark:border-slate-800'
          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700',
      )}
      style={emphasis ? { borderLeftColor: BRAND } : undefined}
    >
      <div className="px-1">
        <div
          className={cn(
            'truncate',
            emphasis
              ? 'text-lg font-bold text-slate-900 dark:text-white'
              : 'text-base font-semibold text-slate-800 dark:text-slate-100',
          )}
        >
          {label}
        </div>
        <div className="mt-1 flex items-center gap-1.5 font-mono text-[11px]">
          <span className="text-slate-400 dark:text-slate-600">[</span>
          <span
            className={totals.CT > 0 ? 'font-semibold' : 'text-slate-400 dark:text-slate-600'}
            style={totals.CT > 0 ? { color: BRAND } : undefined}
          >
            {totals.CT}
          </span>
          <span className="text-slate-400 dark:text-slate-600">|</span>
          <span
            className={totals.ENR > 0 ? 'font-semibold' : 'text-slate-400 dark:text-slate-600'}
            style={totals.ENR > 0 ? { color: BRAND } : undefined}
          >
            {totals.ENR}
          </span>
          <span className="text-slate-400 dark:text-slate-600">]</span>
          {!hasAny && (
            <span className="ml-2 text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-600">
              no bookings
            </span>
          )}
        </div>
      </div>
      {DAYS.map((d) => (
        <DayCell key={d} day={d} counts={days[d]} />
      ))}
    </div>
  )
}

// ─── Section header (for the toolbar groups) ─────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
      {children}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────
export function RegionDashboard() {
  // The superadmin branch-switcher deep-links here as /crm/region?region=B so
  // picking a region from the top-left dropdown lands pre-filtered. Falls back
  // to "all" for the sidebar link / regional managers (whose own region is
  // resolved server-side regardless of this initial value).
  const searchParams = useSearchParams()
  const regionParam = (searchParams.get('region') ?? '').toUpperCase()
  const initialRegion: 'all' | Region =
    regionParam === 'A' || regionParam === 'B' || regionParam === 'C' ? regionParam : 'all'

  const [preset, setPreset] = useState<Preset>('this_week')
  const [region, setRegion] = useState<'all' | Region>(initialRegion)
  const [branchId, setBranchId] = useState<string>('all')

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['region-day-distribution', preset, region, branchId],
    queryFn:  () => fetchDayDistribution({ preset, region, branchId }),
  })

  const visibleRegions = data?.availableRegions ?? []

  const branchesInRegion = useMemo(() => {
    if (!data) return [] as BranchRow[]
    if (region === 'all') return data.branches
    return data.branches.filter((b) => b.region === region)
  }, [data, region])

  function chooseRegion(next: 'all' | Region) {
    setRegion(next)
    setBranchId('all')
  }

  const asOfLabel = data ? shortDate(data.asOfDate) : '—'

  const rowsToRender = useMemo(() => {
    if (!data) return [] as BranchRow[]
    if (branchId === 'all') return branchesInRegion
    return data.branches.filter((b) => b.branchId === branchId)
  }, [data, branchId, branchesInRegion])

  const overall = useMemo(() => {
    if (!data) return null
    if (branchId === 'all' && region === 'all') {
      return data.overall
    }
    const totals: DayCounts = { CT: 0, ENR: 0 }
    const days: Record<TrialDay, DayCounts> = {
      WED: { CT: 0, ENR: 0 },
      THU: { CT: 0, ENR: 0 },
      FRI: { CT: 0, ENR: 0 },
      SAT: { CT: 0, ENR: 0 },
      SUN: { CT: 0, ENR: 0 },
    }
    for (const b of rowsToRender) {
      totals.CT += b.totals.CT
      totals.ENR += b.totals.ENR
      for (const d of DAYS) {
        days[d].CT += b.days[d].CT
        days[d].ENR += b.days[d].ENR
      }
    }
    return { totals, days }
  }, [data, region, branchId, rowsToRender])

  return (
    <div className="mx-auto max-w-370 space-y-6 p-6 lg:p-8">
      {/* ─── Header ─── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-lg text-white shadow-sm"
            style={{ backgroundColor: BRAND }}
          >
            <MapPinned className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Day Distribution
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              CT bookings by trial day · <span className="font-medium text-slate-700 dark:text-slate-300">{asOfLabel}</span> · Each cell shows{' '}
              <span className="font-medium" style={{ color: BRAND }}>CT</span>
              <span className="text-slate-400 dark:text-slate-600"> | </span>
              <span className="font-medium" style={{ color: BRAND }}>ENR</span>
              {data && (
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  {data.scope === 'all' ? 'All regions' : 'Your regions'}
                </span>
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className={cn(
            'flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors',
            'hover:border-slate-300 hover:bg-slate-50',
            'dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800',
            isFetching && 'opacity-60',
          )}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* ─── Toolbar card (filters) ─── */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
        <div>
          <SectionLabel>Date range</SectionLabel>
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
              <Pill key={p.id} active={preset === p.id} onClick={() => setPreset(p.id)}>
                {p.label}
              </Pill>
            ))}
          </div>
        </div>

        <div>
          <SectionLabel>Region</SectionLabel>
          <div className="flex flex-wrap items-center gap-2">
            <Pill active={region === 'all'} onClick={() => chooseRegion('all')}>
              All Regions
            </Pill>
            {(['A', 'B', 'C'] as const).map((r) =>
              visibleRegions.includes(r) || data?.scope === 'all' ? (
                <Pill key={r} active={region === r} onClick={() => chooseRegion(r)}>
                  Region {r}
                </Pill>
              ) : null,
            )}
          </div>
        </div>

        {branchesInRegion.length > 0 && (
          <div>
            <SectionLabel>Branch</SectionLabel>
            <div className="flex flex-wrap items-center gap-1.5">
              <Pill active={branchId === 'all'} onClick={() => setBranchId('all')} size="sm">
                All ({branchesInRegion.length})
              </Pill>
              {branchesInRegion.map((b) => (
                <Pill
                  key={b.branchId}
                  active={branchId === b.branchId}
                  onClick={() => setBranchId(b.branchId)}
                  size="sm"
                >
                  {b.shortName}
                </Pill>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── Loading state ─── */}
      {isLoading && (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
          Loading…
        </div>
      )}

      {/* ─── Empty state ─── */}
      {!isLoading && rowsToRender.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
          <p className="text-slate-700 dark:text-slate-300">No branches match the current filters.</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
            Check that the branches you manage have a region assigned (A / B / C) under Settings → Branches.
          </p>
        </div>
      )}

      {/* ─── Grid: Overall + per-branch rows ─── */}
      {!isLoading && rowsToRender.length > 0 && overall && (
        <div className="space-y-3">
          <GridRow
            label="Overall"
            totals={overall.totals}
            days={overall.days}
            emphasis
          />
          {rowsToRender.map((b) => (
            <GridRow
              key={b.branchId}
              label={b.shortName}
              totals={b.totals}
              days={b.days}
            />
          ))}
        </div>
      )}
    </div>
  )
}
