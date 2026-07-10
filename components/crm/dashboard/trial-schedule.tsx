'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { X, CalendarRange, ExternalLink, Building2, Lock } from 'lucide-react'
import { cn } from '@/lib/crm/utils'
import { getAgeCategory, ageCategoryClasses } from '@/lib/crm/age-category'
import { TRIAL_DAY_ORDER, TRIAL_ALL_SLOTS } from '@/lib/crm/trial-config'

interface Student {
  appointmentId: string
  contactId: string
  opportunityId: string | null
  name: string
  phone: string | null
  branchName: string | null
  region: 'A' | 'B' | 'C' | null
  source: string | null
  childAge: string | null
  startAt: string
}

interface SlotCell {
  slot: string
  count: number
  students: Student[]
}

interface DayBucket {
  key: string
  label: string
  slots: SlotCell[]
}

interface TrialScheduleResponse {
  range: { from: string | null; to: string | null }
  branchIds: string[]
  days: DayBucket[]
}

type SchedulePreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'next_week'
  | 'this_month'
  | 'custom'

const PRESET_OPTIONS: ReadonlyArray<{ key: SchedulePreset; label: string }> = [
  { key: 'today',      label: 'Today' },
  { key: 'yesterday',  label: 'Yesterday' },
  { key: 'this_week',  label: 'This week' },
  { key: 'last_week',  label: 'Last week' },
  { key: 'next_week',  label: 'Next week' },
  { key: 'this_month', label: 'This month' },
  { key: 'custom',     label: 'Custom' },
]

export interface TrialScheduleBranchOption {
  id: string
  name: string
}

interface TrialScheduleProps {
  /**
   * Either a single branch (BM view + admin-as-branch), or null. When null
   * AND `branches` is non-empty, the widget renders its own branch picker
   * so super-admin / agency-admin can browse any branch's trial grid
   * without having to switch the topbar selector.
   */
  branchId: string | null
  /**
   * Branches the picker offers when the parent doesn't bind to a specific
   * branch. Pass the elevated `branches` array from the metrics response.
   * Omit when the parent already binds via `branchId`.
   */
  branches?: TrialScheduleBranchOption[]
  /**
   * When true, count cells render as plain text instead of clickable buttons
   * and the "who's joining" modal is suppressed. Used for super admin —
   * they get visibility into trial bookings without being able to drill in
   * (drill-in tooling lives on the branch-side dashboards).
   */
  readOnly?: boolean
}

export function TrialSchedule({ branchId, branches, readOnly = false }: TrialScheduleProps) {
  // Clicking a slot cell opens the branch/source breakdown (`activeCell`); a row
  // there drills into the existing "who's joining" student list (`drill`).
  const [activeCell, setActiveCell] = useState<{ day: DayBucket; slot: SlotCell } | null>(null)
  const [drill, setDrill] = useState<{ label: string; students: Student[] } | null>(null)
  const [preset, setPreset] = useState<SchedulePreset>('this_week')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [pickedBranchId, setPickedBranchId] = useState<string | null>(null)

  // Custom range is "applied" only once both ends are picked; until then the
  // query falls back to this week so the grid isn't left blank.
  const customApplied = preset === 'custom' && !!customFrom && !!customTo

  // Resolve effective branch: explicit prop wins; otherwise fall back to the
  // internal picker. When the parent passes a branchId but the elevated user
  // also has a branches list available, we still let the parent's choice take
  // precedence — they've already narrowed scope via the topbar.
  const effectiveBranchId = branchId ?? pickedBranchId

  // Default the picker to "All Branches" so elevated users get the tenant-wide
  // trial grid on first mount (individual branches still selectable).
  useEffect(() => {
    if (!branchId && !pickedBranchId && branches && branches.length > 0) {
      setPickedBranchId('all')
    }
  }, [branchId, branches, pickedBranchId])

  const { data, isLoading } = useQuery<TrialScheduleResponse>({
    queryKey: ['crm', 'dashboard', 'trial-schedule', effectiveBranchId ?? 'none', preset, customApplied ? customFrom : '', customApplied ? customTo : ''],
    queryFn: async () => {
      // "custom" with both dates → pass from/to; otherwise send the preset (and
      // fall back to this_week while a custom range is half-entered).
      const effectivePreset = preset === 'custom' && !customApplied ? 'this_week' : preset
      const params = new URLSearchParams({ preset: effectivePreset })
      if (customApplied) {
        params.set('preset', 'custom')
        params.set('from', customFrom)
        params.set('to', customTo)
      }
      if (effectiveBranchId) params.set('branchId', effectiveBranchId)
      const res = await fetch(`/api/crm/dashboard/trial-schedule?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load trial schedule')
      return res.json()
    },
    enabled: !!effectiveBranchId,
  })

  // Trim slot rows to those that have at least one count somewhere on the grid
  // OR are part of the canonical Wed-Sun list — keeps the table compact when
  // a branch only ever uses evening slots.
  const visibleSlots = useMemo(() => {
    if (!data) return [...TRIAL_ALL_SLOTS]
    const seen = new Set<string>()
    for (const d of data.days) {
      for (const s of d.slots) {
        if (s.count > 0) seen.add(s.slot)
      }
    }
    if (seen.size === 0) return [...TRIAL_ALL_SLOTS]
    return TRIAL_ALL_SLOTS.filter((s) => seen.has(s))
  }, [data])

  // Per-day totals (every slot in the day) and the grand total for the range.
  const { dayTotals, weekTotal } = useMemo(() => {
    const dayTotals: Record<string, number> = {}
    let weekTotal = 0
    if (data) {
      for (const d of data.days) {
        const sum = d.slots.reduce((acc, s) => acc + s.count, 0)
        dayTotals[d.key] = sum
        weekTotal += sum
      }
    }
    return { dayTotals, weekTotal }
  }, [data])

  const pickerBranches = branches ?? []
  const showPicker = !branchId && pickerBranches.length > 0
  const hasAnyBranchInScope = !!effectiveBranchId

  if (!hasAnyBranchInScope && !showPicker) return null

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Trial Class Schedule
            </h2>
            {readOnly && (
              <span
                title="Read-only — super-admin view"
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400"
              >
                <Lock className="h-2.5 w-2.5" /> Read-only
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Students booked into trial classes for the selected range.{' '}
            Click a count for the branch &amp; source breakdown, then drill into who&apos;s joining.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* Prominent grand total for the selected range. */}
          {data && (
            <div className="flex items-baseline gap-2 rounded-xl bg-indigo-50 px-4 py-2 ring-1 ring-indigo-100 dark:bg-indigo-950/40 dark:ring-indigo-900/50">
              <span className="text-3xl font-bold leading-none tabular-nums text-indigo-700 dark:text-indigo-300">
                {weekTotal}
              </span>
              <span className="text-xs font-semibold uppercase tracking-wide text-indigo-500 dark:text-indigo-400">
                trials total
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            {showPicker && (
              <label className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-1 text-[11px] dark:bg-slate-800">
                <Building2 className="h-3 w-3 text-slate-400" />
                <select
                  value={pickedBranchId ?? ''}
                  onChange={(e) => setPickedBranchId(e.target.value || null)}
                  className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                >
                  <option value="all" className="bg-white text-slate-900 dark:bg-slate-800 dark:text-white">
                    All Branches
                  </option>
                  {pickerBranches.map((b) => (
                    <option
                      key={b.id}
                      value={b.id}
                      className="bg-white text-slate-900 dark:bg-slate-800 dark:text-white"
                    >
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 p-0.5 text-[11px] dark:bg-slate-800">
              <CalendarRange className="ml-1.5 h-3 w-3 text-slate-400" />
              {PRESET_OPTIONS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPreset(p.key)}
                  className={cn(
                    'rounded-full px-2.5 py-1 font-medium transition',
                    preset === p.key
                      ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-900 dark:text-indigo-300'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Custom range — shown only when the Custom preset is active. */}
            {preset === 'custom' && (
              <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] dark:bg-slate-800">
                <input
                  type="date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                />
                <span className="text-slate-400">→</span>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                />
              </div>
            )}
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : !data ? (
        <p className="py-6 text-center text-sm text-slate-400">Failed to load schedule.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-separate border-spacing-1.5 text-sm">
            <thead>
              <tr>
                <th className="w-32 text-left text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Slot
                </th>
                {TRIAL_DAY_ORDER.map((d) => (
                  <th
                    key={d.key}
                    className="text-center text-[11px] font-semibold text-slate-700 dark:text-slate-200"
                  >
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleSlots.map((slot) => (
                <tr key={slot}>
                  <td className="w-32 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {slot}
                  </td>
                  {TRIAL_DAY_ORDER.map((d) => {
                    const dayBucket = data.days.find((x) => x.key === d.key)
                    const cell = dayBucket?.slots.find((s) => s.slot === slot)
                    const count = cell?.count ?? 0
                    // Drill-in is available to everyone (view-only); clicking a
                    // non-empty cell opens the student list. `readOnly` no longer
                    // suppresses it — super admins explicitly need this view.
                    const interactive = count > 0
                    return (
                      <td key={d.key} className="min-w-30">
                        <button
                          type="button"
                          onClick={() => interactive && dayBucket && cell && setActiveCell({ day: dayBucket, slot: cell })}
                          disabled={!interactive}
                          className={cn(
                            'w-full rounded-lg border px-3 py-2 text-center transition',
                            count === 0
                              ? 'cursor-default border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-600'
                              : interactive
                                ? 'cursor-pointer border-indigo-200 bg-indigo-50 text-indigo-700 hover:border-indigo-400 hover:bg-indigo-100 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-300 dark:hover:bg-indigo-950/50'
                                : 'cursor-default border-indigo-200 bg-indigo-50/60 text-indigo-700 dark:border-indigo-900/40 dark:bg-indigo-950/20 dark:text-indigo-300',
                          )}
                        >
                          <span className="block text-xl font-bold tabular-nums">{count}</span>
                          {count > 0 && (
                            <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide">
                              View
                            </span>
                          )}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="w-32 pt-1 align-bottom text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Daily total
                </td>
                {TRIAL_DAY_ORDER.map((d) => (
                  <td key={d.key} className="min-w-30 pt-1">
                    <div className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-center dark:border-slate-700 dark:bg-slate-800">
                      <span className="block text-lg font-bold tabular-nums text-slate-700 dark:text-slate-200">
                        {dayTotals[d.key] ?? 0}
                      </span>
                    </div>
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Step 1 — branch/source breakdown for the clicked slot. */}
      {activeCell && (
        <SlotBreakdownModal
          dayLabel={activeCell.day.label}
          slot={activeCell.slot.slot}
          students={activeCell.slot.students}
          onClose={() => {
            setActiveCell(null)
            setDrill(null)
          }}
          onDrill={(label, students) => setDrill({ label, students })}
        />
      )}

      {/* Step 2 — the "who's joining" student list, scoped to the drilled
          branch/source (or all students when "View all" was chosen). Layered
          above the breakdown; closing it returns to the breakdown. */}
      {activeCell && drill && (
        <StudentListModal
          dayLabel={activeCell.day.label}
          slot={activeCell.slot.slot}
          subtitle={drill.label}
          students={drill.students}
          onClose={() => setDrill(null)}
        />
      )}
    </section>
  )
}

// ─── Slot breakdown modal ───────────────────────────────────────────────────────
//
// First level of the drill-in: for the clicked day × time slot, group the booked
// students by (branch, lead source) and show a count per group. A "View all" row
// opens the full list; clicking any group opens the student list scoped to it.

function SlotBreakdownModal({
  dayLabel,
  slot,
  students,
  onClose,
  onDrill,
}: {
  dayLabel: string
  slot: string
  students: Student[]
  onClose: () => void
  onDrill: (label: string, students: Student[]) => void
}) {
  const groups = useMemo(() => {
    const map = new Map<
      string,
      { branch: string; region: 'A' | 'B' | 'C' | null; source: string; students: Student[] }
    >()
    for (const s of students) {
      const branch = s.branchName ?? 'Unknown branch'
      const source = s.source ?? 'Unknown source'
      const key = `${branch}||${source}`
      let g = map.get(key)
      if (!g) {
        g = { branch, region: s.region, source, students: [] }
        map.set(key, g)
      }
      g.students.push(s)
    }
    return Array.from(map.values()).sort(
      (a, b) =>
        b.students.length - a.students.length ||
        a.branch.localeCompare(b.branch) ||
        a.source.localeCompare(b.source),
    )
  }, [students])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[85vh] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 dark:bg-slate-900">
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Trial Class · Breakdown
            </p>
            <h3 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-white">
              {dayLabel} <span className="text-slate-400">·</span> {slot}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {students.length} student{students.length === 1 ? '' : 's'} across {groups.length} branch
              {groups.length === 1 ? '' : 'es'}/source{groups.length === 1 ? '' : 's'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="overflow-y-auto px-2 py-2" style={{ maxHeight: 'calc(85vh - 100px)' }}>
          {/* View-all shortcut — opens the full student list for the slot. */}
          <button
            type="button"
            onClick={() => onDrill('All branches & sources', students)}
            className="flex w-full items-center justify-between gap-3 rounded-lg px-4 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
          >
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              View all students
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400">
              {students.length}
              <ExternalLink className="h-3 w-3" />
            </span>
          </button>

          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {groups.map((g) => (
              <li key={`${g.branch}||${g.source}`}>
                <button
                  type="button"
                  onClick={() => onDrill(`${g.branch} · ${g.source}`, g.students)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-indigo-50/60 dark:hover:bg-indigo-950/20"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-sm font-bold text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-300 dark:ring-indigo-900/40">
                    {g.students.length}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                      {g.branch}
                      {g.region ? (
                        <span className="font-normal text-slate-400"> · Region {g.region}</span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                      Source: <span className="font-medium text-slate-600 dark:text-slate-300">{g.source}</span>
                    </p>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

// ─── Student-list modal ────────────────────────────────────────────────────────
//
// Polished version of the "who's joining" popover. Each student row shows the
// age-category pill (matches the kanban card), the trial start time prominently,
// and a tappable "Open" link to the lead detail page.

function StudentListModal({
  dayLabel,
  slot,
  students,
  subtitle,
  onClose,
}: {
  dayLabel: string
  slot: string
  students: Student[]
  /** Branch/source scope chosen in the breakdown step, shown under the title. */
  subtitle?: string
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[85vh] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 dark:bg-slate-900">
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Trial Class
            </p>
            <h3 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-white">
              {dayLabel} <span className="text-slate-400">·</span> {slot}
            </h3>
            {subtitle && (
              <p className="mt-0.5 truncate text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                {subtitle}
              </p>
            )}
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {students.length} student{students.length === 1 ? '' : 's'} joining
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <ul className="divide-y divide-slate-100 overflow-y-auto px-2 dark:divide-slate-800" style={{ maxHeight: 'calc(85vh - 100px)' }}>
          {students.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-slate-400">
              No students booked into this slot.
            </li>
          )}
          {students.map((s) => {
            const ageCategory = s.childAge ? getAgeCategory(s.childAge) : null
            const startAt = new Date(s.startAt)
            return (
              <li key={s.appointmentId} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-indigo-100 to-indigo-50 text-sm font-bold text-indigo-700 ring-1 ring-indigo-200 dark:from-indigo-950/40 dark:to-indigo-900/20 dark:text-indigo-300 dark:ring-indigo-900/50">
                  {(s.name[0] ?? '?').toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                      {s.name}
                    </p>
                    {ageCategory && (
                      <span
                        title={s.childAge ?? undefined}
                        className={cn(
                          'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                          ageCategoryClasses(ageCategory),
                        )}
                      >
                        {ageCategory}
                      </span>
                    )}
                    {!ageCategory && s.childAge && (
                      <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {s.childAge}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {startAt.toLocaleString('en-GB', {
                      weekday:  'short',
                      day:      '2-digit',
                      month:    'short',
                      hour:     '2-digit',
                      minute:   '2-digit',
                      // Appointments are stored naive-KL-as-UTC, so the UTC
                      // components already represent KL wall-clock. Force
                      // UTC display to avoid an extra +8h shift in the
                      // browser's local timezone.
                      timeZone: 'UTC',
                    })}
                  </p>
                  {/* Branch + region (populated for the All Branches view) and
                      the parent's contact number. */}
                  {(s.branchName || s.phone) && (
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {s.branchName && (
                        <span className="truncate font-medium text-slate-600 dark:text-slate-300">
                          {s.branchName}{s.region ? ` · Region ${s.region}` : ''}
                        </span>
                      )}
                      {s.branchName && s.phone && <span className="text-slate-300 dark:text-slate-600">·</span>}
                      {s.phone && <span className="tabular-nums">{s.phone}</span>}
                    </p>
                  )}
                </div>
                {s.opportunityId && (
                  <Link
                    href={`/crm/opportunities/${s.opportunityId}`}
                    onClick={onClose}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-indigo-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-50 dark:border-indigo-700 dark:bg-slate-800 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
                  >
                    Open <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
