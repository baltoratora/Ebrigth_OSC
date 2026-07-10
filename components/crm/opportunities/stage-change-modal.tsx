'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, X, CalendarDays, Clock, Package, ChevronLeft, ChevronRight, Lock } from 'lucide-react'
import { cn } from '@/lib/crm/utils'
import { TRIAL_CAPACITY } from '@/lib/crm/trial-config'

interface StageChangeModalProps {
  /** Branch the opportunity belongs to — used to scope slot-capacity checks. */
  branchId?: string
  fromStageName: string
  toStageName: string
  note: string
  onNoteChange: (note: string) => void
  trialDate?: string
  trialTimeSlot?: string
  enrollmentMonths?: 3 | 6 | 9 | 12 | 18 | 24
  rescheduleDate?: string
  onTrialDateChange?: (v: string) => void
  onTrialTimeSlotChange?: (v: string) => void
  onEnrollmentMonthsChange?: (v: 3 | 6 | 9 | 12 | 18 | 24) => void
  onRescheduleDateChange?: (v: string) => void
  onConfirm: () => void
  onCancel: () => void
  isPending?: boolean
  /** When the modal is opened as part of a bulk-move queue, show a "Lead
   *  N of M: <name>" badge in the header so the BM knows where they are
   *  in the sequence. Absent for single-lead moves. */
  bulkProgress?: { leadName: string; current: number; total: number }
}

/** "07:15 PM" → "19:15" (the key format the availability API returns). */
function slotToHHMM(slot: string): string {
  const trimmed = slot.trim().toUpperCase()
  const m24 = trimmed.match(/^(\d{1,2}):(\d{2})$/)
  if (m24) return `${m24[1].padStart(2, '0')}:${m24[2]}`
  const m12 = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/)
  if (m12) {
    let h = parseInt(m12[1], 10)
    const min = m12[2] ?? '00'
    if (m12[3] === 'PM' && h !== 12) h += 12
    if (m12[3] === 'AM' && h === 12) h = 0
    return `${String(h).padStart(2, '0')}:${min}`
  }
  return '10:00'
}

// Day-of-week indices: Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6
const ALLOWED_DAYS = new Set([3, 4, 5, 6, 0])      // Wed–Sun
const WEEKDAY_SLOTS = ['06:00 PM', '07:15 PM', '08:30 PM']
const WEEKEND_SLOTS = [
  '09:15 AM', '10:30 AM', '12:00 PM', '01:15 PM',
  '02:45 PM', '04:00 PM', '05:30 PM',
]

function slotsForDate(isoDate: string | undefined): string[] {
  if (!isoDate) return []
  const day = new Date(`${isoDate}T00:00:00`).getDay()
  if (day === 6 || day === 0) return WEEKEND_SLOTS         // Sat / Sun
  if (day === 3 || day === 4 || day === 5) return WEEKDAY_SLOTS // Wed / Thu / Fri
  return []                                                  // Mon / Tue — not allowed
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const PACKAGE_OPTIONS: Array<{
  months: 3 | 6 | 9 | 12 | 18 | 24
  label: string
  subtitle: string
  /** Total price in MYR (Ringgit). Displayed to the BM as confirmation. */
  priceMyr: number
}> = [
  { months: 3,  label: '3 Months',  subtitle: 'Starter',   priceMyr:  980 },
  { months: 6,  label: '6 Months',  subtitle: 'Standard',  priceMyr: 2160 },
  { months: 9,  label: '9 Months',  subtitle: 'Extended',  priceMyr: 3040 },
  { months: 12, label: '12 Months', subtitle: 'Full year', priceMyr: 3920 },
  { months: 18, label: '18 Months', subtitle: '1.5 years', priceMyr: 5980 },
  { months: 24, label: '24 Months', subtitle: '2 years',   priceMyr: 7940 },
]

function formatRm(n: number): string {
  return `RM ${n.toLocaleString('en-MY')}`
}

export function StageChangeModal({
  branchId,
  fromStageName,
  toStageName,
  note,
  onNoteChange,
  trialDate,
  trialTimeSlot,
  enrollmentMonths,
  rescheduleDate,
  onTrialDateChange,
  onTrialTimeSlotChange,
  onEnrollmentMonthsChange,
  onRescheduleDateChange,
  onConfirm,
  onCancel,
  isPending = false,
  bulkProgress,
}: StageChangeModalProps) {
  const normalized = toStageName.trim().toLowerCase()
  const isTrial = normalized === 'confirmed for trial'
  const isEnrolled = normalized === 'enrolled'
  const isReschedule = normalized === 'reschedule'
  // Cold Lead requires an explicit remark — staff must explain why the lead
  // is being dropped before the move commits. No date / package picker is
  // shown for this stage, just the note field with a "required" hint.
  const isColdLead = normalized === 'cold lead'

  const availableSlots = useMemo(() => slotsForDate(trialDate), [trialDate])

  // Slot occupancy for the picked date — keyed by HH:MM (24h).
  const [slotCounts, setSlotCounts] = useState<Record<string, number>>({})
  const [loadingCounts, setLoadingCounts] = useState(false)

  useEffect(() => {
    if (!isTrial || !trialDate) {
      setSlotCounts({})
      return
    }
    const qs = new URLSearchParams({ date: trialDate })
    if (branchId) qs.set('branchId', branchId)
    let cancelled = false
    setLoadingCounts(true)
    fetch(`/api/crm/opportunities/slot-availability?${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { counts?: Record<string, number> }) => {
        if (!cancelled) setSlotCounts(data.counts ?? {})
      })
      .catch(() => {
        if (!cancelled) setSlotCounts({})
      })
      .finally(() => {
        if (!cancelled) setLoadingCounts(false)
      })
    return () => {
      cancelled = true
    }
  }, [isTrial, trialDate, branchId])

  // If the currently-selected slot just got filled, clear the selection so the
  // Confirm button doesn't proceed on a locked slot.
  useEffect(() => {
    if (!trialTimeSlot) return
    const count = slotCounts[slotToHHMM(trialTimeSlot)] ?? 0
    if (count >= TRIAL_CAPACITY) onTrialTimeSlotChange?.('')
  }, [slotCounts, trialTimeSlot, onTrialTimeSlotChange])

  const selectedSlotFull = trialTimeSlot
    ? (slotCounts[slotToHHMM(trialTimeSlot)] ?? 0) >= TRIAL_CAPACITY
    : false

  const canConfirm =
    !isPending &&
    (!isTrial ||
      (!!trialDate && !!trialTimeSlot && availableSlots.includes(trialTimeSlot) && !selectedSlotFull)) &&
    (!isEnrolled || !!enrollmentMonths) &&
    (!isReschedule || !!rescheduleDate) &&
    (!isColdLead || !!note?.trim())

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stage-change-title"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />

      <div className="relative z-10 w-full max-w-md rounded-xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-700 px-5 py-4 shrink-0">
          <div className="min-w-0 flex-1">
            <h2 id="stage-change-title" className="text-base font-semibold text-slate-900 dark:text-white">
              {isTrial
                ? 'Schedule Trial Class'
                : isEnrolled
                  ? 'Select Enrollment Package'
                  : isReschedule
                    ? 'Pick Reschedule Follow-up Date'
                    : isColdLead
                      ? 'Drop Lead — Cold Lead'
                      : 'Move Opportunity'}
            </h2>
            {/* Bulk-move progress badge — only when this dialog is being
                walked through as part of a queued bulk action. */}
            {bulkProgress && (
              <div className="mt-1 flex items-center gap-2 text-xs">
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-semibold text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
                  Lead {bulkProgress.current} of {bulkProgress.total}
                </span>
                <span className="truncate text-slate-600 dark:text-slate-300">
                  {bulkProgress.leadName}
                </span>
              </div>
            )}
          </div>
          <button
            onClick={onCancel}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4 space-y-4">
          {/* Transition badges */}
          <div className="flex items-center gap-3">
            <span className="flex-1 rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 text-center truncate">
              {fromStageName}
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-indigo-500" />
            <span className="flex-1 rounded-lg bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 px-3 py-2 text-sm font-medium text-indigo-700 dark:text-indigo-300 text-center truncate">
              {toStageName}
            </span>
          </div>

          {/* Trial scheduling */}
          {isTrial && (
            <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-900 dark:bg-indigo-950/30">
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <CalendarDays className="h-3.5 w-3.5 text-indigo-500" /> Date
                  <span className="text-red-500">*</span>
                </label>
                <MiniCalendar
                  value={trialDate}
                  onChange={(d) => {
                    onTrialDateChange?.(d)
                    // Clear the time slot if new day doesn't offer the currently-picked slot
                    const nextSlots = slotsForDate(d)
                    if (trialTimeSlot && !nextSlots.includes(trialTimeSlot)) {
                      onTrialTimeSlotChange?.('')
                    }
                  }}
                />
                <p className="text-[11px] italic text-slate-500">
                  Classes only run Wed–Sun. Mon & Tue are disabled.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <Clock className="h-3.5 w-3.5 text-indigo-500" /> Time slot
                  <span className="text-red-500">*</span>
                </label>
                {!trialDate ? (
                  <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm italic text-slate-400 dark:border-slate-700 dark:bg-slate-800">
                    Pick a date first…
                  </p>
                ) : availableSlots.length === 0 ? (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                    No slots — classes don&apos;t run on this day.
                  </p>
                ) : (
                  <>
                  <div className="grid grid-cols-3 gap-1.5">
                    {availableSlots.map((slot) => {
                      const selected = trialTimeSlot === slot
                      const count = slotCounts[slotToHHMM(slot)] ?? 0
                      const remaining = Math.max(0, TRIAL_CAPACITY - count)
                      const full = count >= TRIAL_CAPACITY
                      return (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => !full && onTrialTimeSlotChange?.(slot)}
                          disabled={full}
                          title={
                            full
                              ? `Fully booked (${count}/${TRIAL_CAPACITY} students)`
                              : `${remaining} seat${remaining === 1 ? '' : 's'} left (${count}/${TRIAL_CAPACITY} booked)`
                          }
                          className={cn(
                            'flex flex-col items-center gap-0.5 rounded-md border px-2 py-1.5 text-xs font-semibold transition',
                            selected && !full
                              ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm'
                              : full
                                ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-600'
                                : 'border-slate-300 bg-white text-slate-700 hover:border-indigo-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300',
                          )}
                        >
                          <span className="flex items-center gap-1">
                            {full && <Lock className="h-3 w-3" />}
                            {slot}
                          </span>
                          <span
                            className={cn(
                              'text-[9px] font-normal leading-none',
                              selected && !full
                                ? 'text-indigo-100'
                                : full
                                  ? 'text-red-500'
                                  : remaining <= 3
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-slate-400 dark:text-slate-500',
                            )}
                          >
                            {loadingCounts
                              ? '…'
                              : full
                                ? 'Full'
                                : `${remaining} seat${remaining === 1 ? '' : 's'} left`}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-[11px] italic text-slate-500">
                    Each trial slot fits up to {TRIAL_CAPACITY} students.
                  </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Reschedule follow-up date */}
          {isReschedule && (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
              <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                <CalendarDays className="h-3.5 w-3.5 text-amber-600" /> Follow-up date
                <span className="text-red-500">*</span>
              </label>
              <MiniCalendar
                value={rescheduleDate}
                onChange={(d) => onRescheduleDateChange?.(d)}
                allowAllDays
              />
              <p className="text-[11px] italic text-slate-500">
                Pick the date to follow up with this lead. Past dates are disabled.
              </p>
            </div>
          )}

          {/* Enrollment */}
          {isEnrolled && (
            <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
              <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                <Package className="h-3.5 w-3.5 text-emerald-600" /> Package length
                <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {PACKAGE_OPTIONS.map((opt) => {
                  const selected = enrollmentMonths === opt.months
                  return (
                    <button
                      key={opt.months}
                      type="button"
                      onClick={() => onEnrollmentMonthsChange?.(opt.months)}
                      className={cn(
                        'rounded-lg border px-2 py-2.5 text-center transition',
                        selected
                          ? 'border-emerald-500 bg-emerald-100 text-emerald-900 shadow-sm dark:border-emerald-400 dark:bg-emerald-900 dark:text-emerald-100'
                          : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300',
                      )}
                    >
                      <div className="text-base font-bold">{opt.label}</div>
                      <div className={cn('text-[11px]', selected ? 'text-emerald-700 dark:text-emerald-200' : 'text-slate-500 dark:text-slate-400')}>
                        {opt.subtitle}
                      </div>
                      <div
                        className={cn(
                          'mt-1 text-[12px] font-semibold tabular-nums',
                          selected ? 'text-emerald-800 dark:text-emerald-100' : 'text-emerald-700 dark:text-emerald-300',
                        )}
                      >
                        {formatRm(opt.priceMyr)}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Note */}
          <div className="space-y-1.5">
            <label htmlFor="stage-change-note" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {isColdLead ? (
                <>Reason <span className="text-red-500">*</span></>
              ) : (
                <>Note <span className="text-slate-400 font-normal">(optional)</span></>
              )}
            </label>
            <textarea
              id="stage-change-note"
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder={
                isColdLead
                  ? 'Required: why is this lead being marked Cold? (e.g. parent decided not to enroll, unresponsive after 3 attempts…)'
                  : 'Add a note about this stage change...'
              }
              rows={isColdLead ? 4 : 2}
              required={isColdLead}
              className="w-full resize-none rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {isColdLead && !note?.trim() && (
              <p className="text-xs text-red-500">
                A reason is required when dropping a lead into Cold Lead.
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-700 px-5 py-4 shrink-0">
          <button
            onClick={onCancel}
            disabled={isPending}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            {isPending
              ? 'Moving…'
              : isTrial
                ? 'Schedule Trial'
                : isEnrolled
                  ? 'Confirm Enrollment'
                  : isReschedule
                    ? 'Set Follow-up'
                    : 'Confirm Move'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Mini calendar (disables Mon/Tue + past dates) ────────────────────────────

function MiniCalendar({
  value,
  onChange,
  allowAllDays = false,
}: {
  value?: string
  onChange: (iso: string) => void
  /** When true, no weekday is disabled — only past dates are blocked. */
  allowAllDays?: boolean
}) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const initialMonth = value ? new Date(`${value}T00:00:00`) : today
  const [view, setView] = useState<{ year: number; month: number }>({
    year: initialMonth.getFullYear(),
    month: initialMonth.getMonth(),
  })

  const monthLabel = new Date(view.year, view.month, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  const firstOfMonth = new Date(view.year, view.month, 1)
  const startWeekday = firstOfMonth.getDay() // 0..6 (Sun..Sat)
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()

  const cells: Array<{ date: Date | null }> = []
  for (let i = 0; i < startWeekday; i++) cells.push({ date: null })
  for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(view.year, view.month, d) })

  function prevMonth() {
    setView((v) => (v.month === 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: v.month - 1 }))
  }
  function nextMonth() {
    setView((v) => (v.month === 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: v.month + 1 }))
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={prevMonth}
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{monthLabel}</span>
        <button
          type="button"
          onClick={nextMonth}
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="text-center">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (!cell.date) return <div key={`empty-${i}`} />
          const iso = isoOf(cell.date)
          const day = cell.date.getDay()
          const isPast = cell.date < today
          const isDisallowedDay = !allowAllDays && !ALLOWED_DAYS.has(day)
          const disabled = isPast || isDisallowedDay
          const isSelected = value === iso
          const isToday = iso === isoOf(today)

          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              onClick={() => onChange(iso)}
              className={cn(
                'h-8 rounded-md text-xs font-medium transition',
                disabled && 'cursor-not-allowed bg-slate-100 text-slate-300 line-through dark:bg-slate-900 dark:text-slate-700',
                !disabled && !isSelected && 'bg-white text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-indigo-950 dark:hover:text-indigo-200',
                !disabled && isSelected && 'bg-indigo-600 text-white shadow-sm',
                !disabled && !isSelected && isToday && 'ring-1 ring-indigo-400',
              )}
              title={
                isPast
                  ? 'Past date'
                  : isDisallowedDay
                    ? 'Classes do not run on this day'
                    : undefined
              }
            >
              {cell.date.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}
