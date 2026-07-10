'use client'

/**
 * Analytics — LEAD PERFORMANCE (not tickets).
 *
 * Reuses the dashboard's leads-metrics endpoint (the single source of truth for
 * NL/CT/SU/ENR so the numbers always match the dashboard) and presents a
 * cross-region / cross-branch performance summary with a PDF export.
 *
 * Date range + branch are scoped server-side; the region filter narrows the
 * per-branch table client-side (the A/B/C cards already summarise each region).
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { Loader2, Download, Users, CalendarCheck, UserCheck, GraduationCap } from 'lucide-react'
import { cn, formatDate } from '@/lib/crm/utils'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

// ─── Types (mirror /api/crm/dashboard/leads-metrics) ──────────────────────────

interface BranchMetrics {
  branchId: string
  branchName: string
  code: string
  region: 'A' | 'B' | 'C' | null
  NL: number; CT: number; SU: number; ENR: number; BUF: number
  conversionRate: number // ENR / NL
  confirmedRate: number  // CT / NL
  showUpRate: number     // SU / CT
  enrolmentRate: number  // ENR / SU
}

interface MetricsResponse {
  range: { from: string; to: string }
  main: BranchMetrics
  regions: { A: BranchMetrics; B: BranchMetrics; C: BranchMetrics }
  branches: BranchMetrics[]
  byMonth: Array<{ month: string; NL: number; CT: number; SU: number; ENR: number; BUF: number }>
  elevated: boolean
  isSuperAdmin: boolean
  selectableBranches: Array<{ branchId: string; branchName: string }> | null
}

// ─── Date windows ─────────────────────────────────────────────────────────────

const WINDOWS: Array<{ value: string; label: string }> = [
  { value: 'this_week',  label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: '30d',        label: 'Last 30 days' },
  { value: '90d',        label: 'Last 90 days' },
  { value: '365d',       label: 'Last 12 months' },
]

function rangeParams(win: string): string {
  if (win === 'this_week') return 'preset=this_week'
  if (win === '30d') return 'preset=30d'
  const now = new Date()
  const end = now.toISOString()
  if (win === '90d')  return `preset=custom&from=${new Date(now.getTime() - 89 * 864e5).toISOString()}&to=${end}`
  if (win === '365d') return `preset=custom&from=${new Date(now.getTime() - 364 * 864e5).toISOString()}&to=${end}`
  if (win === 'this_month') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
    return `preset=custom&from=${from}&to=${end}`
  }
  return 'preset=this_week'
}

const pct = (r: number) => `${Math.round((r ?? 0) * 100)}%`
const monthLabel = (m: string) => {
  const [y, mo] = m.split('-').map(Number)
  return new Date(Date.UTC(y, (mo ?? 1) - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })
}

export default function AnalyticsPage() {
  const [win, setWin] = useState('this_month')
  const [branch, setBranch] = useState('all')
  const [region, setRegion] = useState<'all' | 'A' | 'B' | 'C'>('all')

  const { data, isLoading, isError } = useQuery<MetricsResponse>({
    queryKey: ['lead-analytics', win, branch],
    queryFn: async () => {
      const params = `${rangeParams(win)}&trend=1${branch !== 'all' ? `&branchId=${branch}` : ''}`
      const res = await fetch(`/api/crm/dashboard/leads-metrics?${params}`)
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
  })

  // Per-branch table, narrowed by the region filter (client-side).
  const tableBranches = useMemo(() => {
    const list = data?.branches ?? []
    return region === 'all' ? list : list.filter((b) => b.region === region)
  }, [data?.branches, region])

  const regionCards = data ? ([
    { key: 'A' as const, m: data.regions.A },
    { key: 'B' as const, m: data.regions.B },
    { key: 'C' as const, m: data.regions.C },
  ]) : []

  function handleExportPdf() {
    if (data) void exportPdf(data, { win, branch, region, tableBranches })
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Analytics</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Lead performance across all regions and branches
            {data && <> · {formatDate(data.range.from)} – {formatDate(data.range.to)}</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={win} onValueChange={setWin}>
            <SelectTrigger className="w-37.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {WINDOWS.map((w) => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={region} onValueChange={(v) => setRegion(v as typeof region)}>
            <SelectTrigger className="w-35"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All regions</SelectItem>
              <SelectItem value="A">Region A</SelectItem>
              <SelectItem value="B">Region B</SelectItem>
              <SelectItem value="C">Region C</SelectItem>
            </SelectContent>
          </Select>
          {data?.selectableBranches && data.selectableBranches.length > 0 && (
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger className="w-50"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {data.selectableBranches.map((b) => (
                  <SelectItem key={b.branchId} value={b.branchId}>{b.branchName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <button
            onClick={handleExportPdf}
            disabled={!data}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <Download className="h-4 w-4" /> Export PDF
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : isError || !data ? (
        <EmptyCard message="Failed to load analytics." />
      ) : (
        <>
          {/* KPI row */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard icon={Users}         tint="indigo"  label="New Leads"      value={data.main.NL}  sublabel="created in period" />
            <KpiCard icon={CalendarCheck} tint="blue"    label="Confirmed Trial" value={data.main.CT} sublabel={`${pct(data.main.confirmedRate)} of new leads`} />
            <KpiCard icon={UserCheck}     tint="amber"   label="Show-Up"        value={data.main.SU}  sublabel={`${pct(data.main.showUpRate)} of confirmed`} />
            <KpiCard icon={GraduationCap} tint="emerald" label="Enrolled"       value={data.main.ENR} sublabel={`${pct(data.main.conversionRate)} of new leads`} />
          </div>

          {/* Funnel rates */}
          <Card title="Conversion funnel">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <RateCell label="New Lead → Confirmed" value={data.main.confirmedRate} />
              <RateCell label="Confirmed → Show-Up"  value={data.main.showUpRate} />
              <RateCell label="Show-Up → Enrolled"   value={data.main.enrolmentRate} />
              <RateCell label="New Lead → Enrolled"  value={data.main.conversionRate} highlight />
            </div>
          </Card>

          {/* Region breakdown */}
          {data.elevated && (
            <div className="grid gap-4 sm:grid-cols-3">
              {regionCards.map(({ key, m }) => (
                <RegionCard key={key} region={key} m={m} />
              ))}
            </div>
          )}

          {/* Trend */}
          {data.byMonth.length > 0 && (
            <Card title="Trend">
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.byMonth.map((d) => ({ ...d, label: monthLabel(d.month) }))}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="NL"  name="New Leads"  stroke="#6366f1" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="CT"  name="Confirmed"  stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="SU"  name="Show-Up"    stroke="#f59e0b" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="ENR" name="Enrolled"   stroke="#10b981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {/* Per-branch table */}
          {data.elevated && (
            <Card title={`Branch performance${region !== 'all' ? ` — Region ${region}` : ''}`}>
              {tableBranches.length === 0 ? (
                <p className="py-4 text-sm text-slate-500">No branches in scope.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
                        <th className="py-2 pr-3 font-medium">Branch</th>
                        <th className="px-2 py-2 text-center font-medium">Reg</th>
                        <th className="px-2 py-2 text-right font-medium">NL</th>
                        <th className="px-2 py-2 text-right font-medium">CT</th>
                        <th className="px-2 py-2 text-right font-medium">SU</th>
                        <th className="px-2 py-2 text-right font-medium">ENR</th>
                        <th className="px-2 py-2 text-right font-medium">CT%</th>
                        <th className="px-2 py-2 text-right font-medium">SU%</th>
                        <th className="px-2 py-2 text-right font-medium">ENR%</th>
                        <th className="px-2 py-2 text-right font-medium">Conv%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableBranches.map((b) => (
                        <tr key={b.branchId} className="border-b border-slate-100 dark:border-slate-800">
                          <td className="py-2 pr-3 text-slate-800 dark:text-slate-200">{b.branchName}</td>
                          <td className="px-2 py-2 text-center text-slate-500">{b.region ?? '—'}</td>
                          <td className="px-2 py-2 text-right font-mono">{b.NL}</td>
                          <td className="px-2 py-2 text-right font-mono">{b.CT}</td>
                          <td className="px-2 py-2 text-right font-mono">{b.SU}</td>
                          <td className="px-2 py-2 text-right font-mono font-semibold">{b.ENR}</td>
                          <td className="px-2 py-2 text-right font-mono text-slate-500">{pct(b.confirmedRate)}</td>
                          <td className="px-2 py-2 text-right font-mono text-slate-500">{pct(b.showUpRate)}</td>
                          <td className="px-2 py-2 text-right font-mono text-slate-500">{pct(b.enrolmentRate)}</td>
                          <td className="px-2 py-2 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">{pct(b.conversionRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  )
}

// ─── PDF export ───────────────────────────────────────────────────────────────

async function exportPdf(
  data: MetricsResponse,
  ctx: { win: string; branch: string; region: string; tableBranches: BranchMetrics[] },
) {
  const { default: JsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default

  const doc = new JsPDF({ orientation: 'landscape' })
  const winLabel = WINDOWS.find((w) => w.value === ctx.win)?.label ?? ctx.win
  const branchLabel = ctx.branch === 'all'
    ? 'All branches'
    : data.selectableBranches?.find((b) => b.branchId === ctx.branch)?.branchName ?? ctx.branch

  doc.setFontSize(16)
  doc.text('Lead Performance Analytics', 14, 16)
  doc.setFontSize(10)
  doc.setTextColor(110)
  doc.text(
    `${winLabel}  ·  ${formatDate(data.range.from)} – ${formatDate(data.range.to)}  ·  ${branchLabel}` +
      (ctx.region !== 'all' ? `  ·  Region ${ctx.region}` : ''),
    14, 23,
  )
  doc.setTextColor(0)

  // Headline KPIs
  autoTable(doc, {
    startY: 30,
    head: [['New Leads', 'Confirmed Trial', 'Show-Up', 'Enrolled', 'Conversion (NL→ENR)']],
    body: [[
      String(data.main.NL), String(data.main.CT), String(data.main.SU),
      String(data.main.ENR), pct(data.main.conversionRate),
    ]],
    styles: { halign: 'center', fontSize: 11 },
    headStyles: { fillColor: [79, 70, 229] },
  })

  // Region summary
  if (data.elevated) {
    autoTable(doc, {
      head: [['Region', 'NL', 'CT', 'SU', 'ENR', 'CT%', 'SU%', 'ENR%', 'Conv%']],
      body: (['A', 'B', 'C'] as const).map((k) => {
        const m = data.regions[k]
        return [k, m.NL, m.CT, m.SU, m.ENR, pct(m.confirmedRate), pct(m.showUpRate), pct(m.enrolmentRate), pct(m.conversionRate)]
      }),
      styles: { fontSize: 9, halign: 'right' },
      columnStyles: { 0: { halign: 'left' } },
      headStyles: { fillColor: [30, 41, 59] },
    })

    // Per-branch table
    autoTable(doc, {
      head: [['Branch', 'Reg', 'NL', 'CT', 'SU', 'ENR', 'CT%', 'SU%', 'ENR%', 'Conv%']],
      body: ctx.tableBranches.map((b) => [
        b.branchName, b.region ?? '-', b.NL, b.CT, b.SU, b.ENR,
        pct(b.confirmedRate), pct(b.showUpRate), pct(b.enrolmentRate), pct(b.conversionRate),
      ]),
      styles: { fontSize: 8, halign: 'right' },
      columnStyles: { 0: { halign: 'left' }, 1: { halign: 'center' } },
      headStyles: { fillColor: [30, 41, 59] },
    })
  }

  doc.save(`lead-analytics-${formatDate(new Date())}.pdf`)
}

// ─── UI bits ──────────────────────────────────────────────────────────────────

const TINTS = {
  indigo:  'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400',
  blue:    'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400',
  amber:   'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
} as const
type Tint = keyof typeof TINTS

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
      <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      {children}
    </div>
  )
}

function EmptyCard({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
      {message}
    </div>
  )
}

function KpiCard({
  icon: Icon, label, value, sublabel, tint,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string; value: string | number; sublabel?: string; tint: Tint
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</div>
          {sublabel && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sublabel}</div>}
        </div>
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', TINTS[tint])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}

function RateCell({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={cn('rounded-md border p-4', highlight ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/30' : 'border-slate-200 dark:border-slate-700')}>
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div className={cn('mt-2 text-2xl font-semibold', highlight ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100')}>
        {pct(value)}
      </div>
    </div>
  )
}

const REGION_TINT: Record<'A' | 'B' | 'C', string> = {
  A: 'text-rose-600 dark:text-rose-400',
  B: 'text-amber-600 dark:text-amber-400',
  C: 'text-emerald-600 dark:text-emerald-400',
}

function RegionCard({ region, m }: { region: 'A' | 'B' | 'C'; m: BranchMetrics }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center justify-between">
        <h3 className={cn('text-sm font-semibold', REGION_TINT[region])}>Region {region}</h3>
        <span className="text-xs text-slate-400">Conv {pct(m.conversionRate)}</span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        {([['NL', m.NL], ['CT', m.CT], ['SU', m.SU], ['ENR', m.ENR]] as const).map(([k, v]) => (
          <div key={k}>
            <div className="text-[10px] uppercase tracking-wide text-slate-400">{k}</div>
            <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{v}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
