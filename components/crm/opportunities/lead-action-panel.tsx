'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Package, Clock, Loader2, Check } from 'lucide-react'
import { cn } from '@/lib/crm/utils'
import {
  getLeadAdminContext,
  adminSetLeadWeek,
  adminSetTrial,
  adminSetPackage,
  adminSetRescheduleDate,
  type LeadAdminContext,
} from '@/server/actions/admin-lead'

const WEEKDAY_SLOTS = ['06:00 PM', '07:15 PM', '08:30 PM']
const WEEKEND_SLOTS = ['09:15 AM', '10:30 AM', '12:00 PM', '01:15 PM', '02:45 PM', '04:00 PM', '05:30 PM']
const PACKAGES: Array<3 | 6 | 9 | 12 | 18 | 24> = [3, 6, 9, 12, 18, 24]
const WEEKS: Array<{ key: 'last' | 'this' | 'next'; label: string }> = [
  { key: 'last', label: 'Last week' },
  { key: 'this', label: 'This week' },
  { key: 'next', label: 'Next week' },
]

function slotsForDate(iso: string): string[] {
  if (!iso) return []
  const day = new Date(`${iso}T00:00:00`).getDay()
  if (day === 6 || day === 0) return WEEKEND_SLOTS
  if (day === 3 || day === 4 || day === 5) return WEEKDAY_SLOTS
  return []
}
function slotToHHMM(slot: string): string {
  const t = slot.trim().toUpperCase()
  const m24 = t.match(/^(\d{1,2}):(\d{2})$/)
  if (m24) return `${m24[1].padStart(2, '0')}:${m24[2]}`
  const m12 = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/)
  if (m12) {
    let h = parseInt(m12[1], 10)
    const min = m12[2] ?? '00'
    if (m12[3] === 'PM' && h !== 12) h += 12
    if (m12[3] === 'AM' && h === 12) h = 0
    return `${String(h).padStart(2, '0')}:${min}`
  }
  return ''
}
function prettyDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * SUPER-ADMIN action editors for a lead, embedded in the card-detail popup's
 * "Action" sidebar tab. All writes go through SUPER_ADMIN-gated server actions;
 * on success it calls onChanged so the board refetches.
 */
export function LeadActionContent({
  opportunityId,
  onChanged,
}: {
  opportunityId: string
  onChanged: () => void
}) {
  const [ctx, setCtx] = useState<LeadAdminContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const [date, setDate] = useState('')
  const [slot, setSlot] = useState('')
  const [rsdDate, setRsdDate] = useState('')

  async function reload() {
    const res = await getLeadAdminContext(opportunityId)
    if (res.ok && res.ctx) {
      setCtx(res.ctx)
      if (res.ctx.trial) {
        setDate(res.ctx.trial.date)
        setSlot([...WEEKDAY_SLOTS, ...WEEKEND_SLOTS].find((s) => slotToHHMM(s) === res.ctx!.trial!.slot) ?? '')
      }
      setRsdDate(res.ctx.rescheduleDate ?? '')
    } else setError(res.error ?? 'Failed to load')
    setLoading(false)
  }
  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunityId])

  const stage = (ctx?.stageShort ?? '').toUpperCase()
  const hasTrial = !!ctx?.trial
  const showWeek = !!ctx?.weekMetric
  const showTrial = stage === 'CT' || hasTrial
  const showPackage = stage === 'ENR' || !!ctx?.enrolledPackage
  const showRSD = stage === 'RSD'
  const availableSlots = useMemo(() => slotsForDate(date), [date])

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setBusy(key); setError(null); setOk(null)
    const res = await fn()
    setBusy(null)
    if (!res.ok) { setError(res.error ?? 'Action failed'); return }
    setOk(okMsg)
    onChanged()
    await reload()
    setTimeout(() => setOk(null), 2500)
  }

  if (loading) {
    return <div className="flex items-center gap-2 py-10 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
  }
  if (!ctx) {
    return <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error ?? 'Not available'}</p>
  }

  const metricLabel = ctx.weekMetric === 'CT' ? 'trial' : ctx.weekMetric === 'SU' ? 'show-up' : ctx.weekMetric === 'ENR' ? 'enrolment' : ''

  return (
    <div className="space-y-5">
      {(error || ok) && (
        <div className={cn('rounded-lg px-3 py-2 text-sm', ok ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300')}>
          {ok ? <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" />{ok}</span> : error}
        </div>
      )}

      {/* Dashboard week — tickbox, re-buckets the current funnel metric */}
      {showWeek && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <CalendarDays className="h-3.5 w-3.5" /> Dashboard week
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Counts this lead&apos;s {metricLabel} in the ticked week on the dashboard{ctx.currentWeek === 'other' ? '' : ` (currently ${ctx.currentWeek} week)`}.
          </p>
          <div className="flex flex-col gap-1.5">
            {WEEKS.map((w) => (
              <label
                key={w.key}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition',
                  ctx.currentWeek === w.key
                    ? 'border-indigo-400 bg-indigo-50 text-indigo-800 dark:border-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-200'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800',
                  busy && 'opacity-60',
                )}
              >
                <input
                  type="checkbox"
                  checked={ctx.currentWeek === w.key}
                  disabled={!!busy}
                  onChange={() => { if (ctx.currentWeek !== w.key) void run(`week-${w.key}`, () => adminSetLeadWeek(opportunityId, w.key), `Set to ${w.label.toLowerCase()}`) }}
                  className="h-4 w-4 accent-indigo-600"
                />
                {busy === `week-${w.key}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : w.label}
              </label>
            ))}
          </div>
        </section>
      )}

      {/* Trial full editor */}
      {showTrial && (
        <section className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 dark:border-indigo-900 dark:bg-indigo-950/20">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <Clock className="h-3.5 w-3.5" /> Edit trial (date · day · slot)
          </h3>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              Date
              <input
                type="date"
                value={date}
                onChange={(e) => { setDate(e.target.value); if (slot && !slotsForDate(e.target.value).includes(slot)) setSlot('') }}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 scheme-light dark:scheme-dark dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs text-slate-500">
              Time slot
              <select
                value={slot}
                onChange={(e) => setSlot(e.target.value)}
                disabled={!date || availableSlots.length === 0}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              >
                <option value="">{!date ? 'Pick a date…' : availableSlots.length === 0 ? 'No classes this day' : 'Select slot'}</option>
                {availableSlots.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <button
              disabled={!date || !slot || !!busy}
              onClick={() => run('trial', () => adminSetTrial(opportunityId, date, slot), 'Trial updated')}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy === 'trial' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </button>
          </div>
          <p className="text-[11px] italic text-slate-400">Classes run Wed–Sun only.</p>
        </section>
      )}

      {/* ENR package */}
      {showPackage && (
        <section className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <Package className="h-3.5 w-3.5" /> Enrollment package
          </h3>
          <div className="grid grid-cols-4 gap-2">
            {PACKAGES.map((m) => {
              const active = ctx.enrolledPackage === `${m} months`
              return (
                <button
                  key={m}
                  disabled={!!busy}
                  onClick={() => run(`pkg-${m}`, () => adminSetPackage(opportunityId, m), `Package set to ${m} months`)}
                  className={cn(
                    'rounded-lg border px-2 py-2 text-sm font-semibold transition disabled:opacity-50',
                    active
                      ? 'border-emerald-500 bg-emerald-100 text-emerald-800 dark:border-emerald-400 dark:bg-emerald-900 dark:text-emerald-100'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300',
                  )}
                >
                  {busy === `pkg-${m}` ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : `${m}mo`}
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* RSD date */}
      {showRSD && (
        <section className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/40 p-3 dark:border-amber-900 dark:bg-amber-950/20">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <CalendarDays className="h-3.5 w-3.5" /> Reschedule date
          </h3>
          <div className="flex items-end gap-2">
            <input
              type="date"
              value={rsdDate}
              onChange={(e) => setRsdDate(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 scheme-light dark:scheme-dark dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
            <button
              disabled={!rsdDate || !!busy}
              onClick={() => run('rsd', () => adminSetRescheduleDate(opportunityId, rsdDate), 'Reschedule date updated')}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-amber-700 disabled:opacity-50"
            >
              {busy === 'rsd' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </button>
          </div>
        </section>
      )}

      {!showWeek && !showTrial && !showPackage && !showRSD && (
        <p className="text-sm text-slate-400">No admin actions apply to this lead&apos;s current stage.</p>
      )}
    </div>
  )
}
