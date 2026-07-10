'use client'

import Link from 'next/link'
import { GripVertical, User, Calendar } from 'lucide-react'
import { cn, formatMYR, formatDate, formatDateTime, formatPhoneDisplay } from '@/lib/crm/utils'
import { getAgeCategory, ageCategoryClasses } from '@/lib/crm/age-category'
import type { OpportunityCard } from '@/server/queries/opportunities'
import { formatDistanceToNow } from 'date-fns'
import { DEFAULT_CARD_PREFS, type CardPrefs } from '@/lib/crm/kanban-card-prefs'
import { QuickActionIcon } from './customise-card-drawer'

// ─── Lead source icons ────────────────────────────────────────────────────────
// TikTok and Meta render as the original 2-letter chips ("tt" / "fb") per the
// user's preference — the inline brand-mark SVGs didn't pop the way the chips
// did at the card's tiny scale. Anything else still gets the Globe icon since
// that one tested better than the older "rf / wa / ?" chips.

function GlobeMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="7.5" />
      <path d="M2.5 10h15" />
      <path d="M10 2.5c2 2.3 3 5 3 7.5s-1 5.2-3 7.5c-2-2.3-3-5-3-7.5s1-5.2 3-7.5Z" />
    </svg>
  )
}

function LeadSourceIcon({ name }: { name: string }) {
  const lower = name.toLowerCase()

  if (lower.includes('tiktok')) {
    return (
      <span
        title={name}
        className="inline-flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold bg-slate-900 text-white"
      >
        tt
      </span>
    )
  }
  // Meta family — Facebook, Instagram, WhatsApp, "Meta" — all collapse to the
  // same "fb" blue chip per the latest preference.
  if (
    lower.includes('facebook') ||
    lower.includes('meta') ||
    lower.includes('instagram') ||
    lower.includes('whatsapp') ||
    lower === 'wa'
  ) {
    return (
      <span
        title={name}
        className="inline-flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
      >
        fb
      </span>
    )
  }
  // Walk-in / Referral / Website / Self-Generated / Others → Globe.
  return (
    <span title={name} className="inline-flex h-5 w-5 items-center justify-center text-slate-700 dark:text-slate-300">
      <GlobeMark className="h-5 w-5" />
    </span>
  )
}

// ─── KL same-day helper ──────────────────────────────────────────────────────
// Trial appointments are stored as "naive-KL-as-UTC": when the BM picks
// 16:00 KL, crm_appointment.startAt has UTC hour = 16. The UTC fields ARE
// KL wall-clock fields. To compare "is the trial today (in KL)" we read
// the trial's UTC components as-is, and shift `now` by +8h so we read its
// UTC components in KL wall-clock terms too.

const KL_OFFSET_MS = 8 * 3600 * 1000
function isSameKLDay(trialNaiveKL: Date, nowReal: Date): boolean {
  const nowKL = new Date(nowReal.getTime() + KL_OFFSET_MS)
  return (
    trialNaiveKL.getUTCFullYear() === nowKL.getUTCFullYear() &&
    trialNaiveKL.getUTCMonth()    === nowKL.getUTCMonth() &&
    trialNaiveKL.getUTCDate()     === nowKL.getUTCDate()
  )
}

// ─── Color coding by age in stage ────────────────────────────────────────────

function getAgeColor(
  lastStageChangeAt: Date,
  stuckHoursYellow = 24,
  stuckHoursRed = 48,
): string {
  const hoursElapsed =
    (Date.now() - new Date(lastStageChangeAt).getTime()) / (1000 * 60 * 60)

  if (hoursElapsed < stuckHoursYellow) return 'border-l-green-400'
  if (hoursElapsed < stuckHoursRed) return 'border-l-yellow-400'
  return 'border-l-red-400'
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function UserAvatar({
  user,
}: {
  user: { name: string | null; email: string; image: string | null }
}) {
  const initials = user.name
    ? user.name
        .split(' ')
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? '')
        .join('')
    : user.email.slice(0, 2).toUpperCase()

  return (
    <div
      title={user.name ?? user.email}
      className="relative group"
    >
      {user.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.image}
          alt={user.name ?? user.email}
          className="h-6 w-6 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-[9px] font-semibold">
          {initials}
        </div>
      )}
      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-20">
        <div className="rounded bg-slate-900 text-white text-xs px-2 py-1 whitespace-nowrap shadow-lg">
          {user.name ?? user.email}
        </div>
      </div>
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface KanbanCardProps {
  opportunity: OpportunityCard
  stageShortCode?: string
  stageName?: string
  stuckHoursYellow?: number
  stuckHoursRed?: number
  isSelected?: boolean
  dragHandleProps?: Record<string, unknown>
  isDragging?: boolean
  onClick?: () => void
  /**
   * Toggle this card's bulk-selection state. When omitted the checkbox isn't
   * rendered (e.g. read-only views). Wired up through the kanban board so the
   * shared `selectedIds` set stays the source of truth.
   */
  onToggleSelect?: () => void
  /**
   * Per-browser customisation set in the Customise Card drawer. Falls back to
   * the project default (matches the historical card layout) when omitted.
   */
  prefs?: CardPrefs
}

// ─── Component ────────────────────────────────────────────────────────────────

export function KanbanCard({
  opportunity,
  stageShortCode,
  stageName,
  stuckHoursYellow = 24,
  stuckHoursRed = 48,
  isSelected = false,
  dragHandleProps,
  isDragging = false,
  onClick,
  onToggleSelect,
  prefs = DEFAULT_CARD_PREFS,
}: KanbanCardProps) {
  // Field toggles — checked once at the top so the JSX below stays readable.
  const showField = (k: (typeof prefs.fields)[number]) => prefs.fields.includes(k)
  const compact = prefs.layout === 'compact'
  const { contact } = opportunity

  // With master_leads_base as the source of truth, the contact's first/last
  // name IS the child when parentFullName is set (sibling-exploded row) AND
  // the importer extracted a real child name from children_details. When no
  // child name was available we fall back to displaying the parent's name —
  // either by storing the parent's name as firstName (new imports) or by
  // detecting the legacy "Child N" placeholder and reading parentFullName
  // instead (rows imported by the previous build).
  const isLegacyPlaceholder = /^Child \d+$/.test(contact.firstName)
  const hasRealChildName = !!contact.parentFullName && !isLegacyPlaceholder
  const primaryChildName = hasRealChildName
    ? `${contact.firstName}${contact.lastName ? ' ' + contact.lastName : ''}`
    : (isLegacyPlaceholder ? contact.parentFullName : contact.childName1)
  const primaryChildAge = hasRealChildName ? contact.childAge1 : null

  const ageColor = getAgeColor(
    opportunity.lastStageChangeAt,
    stuckHoursYellow,
    stuckHoursRed,
  )

  const relativeTime = formatDistanceToNow(new Date(opportunity.lastStageChangeAt), {
    addSuffix: true,
  })

  // Is this lead's trial scheduled for today (Asia/Kuala_Lumpur wall-clock)?
  // Compared in KL so a lead booked for "23 May 19:00" doesn't accidentally
  // light up on the 22nd just because the browser is in a behind-KL TZ.
  // The pill is also gated by stage — only Reschedule, Confirmed for Trial,
  // Show-Up, and Buffer (OD) leads display the timeslot. Anything past SU
  // (ENR, SNE) or that never reached CT (NL, FU1-3, etc.) hides it because
  // the slot info isn't actionable in that state.
  const stageCodeRaw = stageShortCode ?? ''
  const stageCodeNorm = stageCodeRaw.toUpperCase().replace(/_/g, '')
  const TIMESLOT_VISIBLE_STAGES = new Set(['RSD', 'CT', 'SU', 'SG'])
  const stageAllowsTimeslot = TIMESLOT_VISIBLE_STAGES.has(stageCodeNorm)
  const trialStartAt =
    stageAllowsTimeslot && contact.appointments?.[0]?.startAt
      ? new Date(contact.appointments[0].startAt)
      : null
  const isTrialToday = trialStartAt ? isSameKLDay(trialStartAt, new Date()) : false

  return (
    <div
      className={cn(
        'group relative rounded-lg border border-l-4 bg-white dark:bg-slate-800',
        'border-slate-200 dark:border-slate-700 shadow-sm',
        'transition-all duration-150',
        ageColor,
        isDragging && 'shadow-xl rotate-1 opacity-90 scale-[1.02]',
        isSelected && 'ring-2 ring-indigo-500 ring-offset-1',
        // "Popped" treatment when today is the lead's trial date — amber
        // glow + thicker ring so the card stands out in the CT column.
        isTrialToday && !isSelected && 'ring-2 ring-amber-400 ring-offset-1 shadow-md shadow-amber-100 dark:shadow-amber-900/20',
        'hover:shadow-md cursor-pointer',
      )}
      onClick={(e) => {
        // Don't trigger click if the user was dragging or clicked the drag handle
        const target = e.target as HTMLElement
        if (target.closest('[data-drag-handle="true"]')) return
        onClick?.()
      }}
    >
      <div className={cn('flex items-start gap-1', compact ? 'p-1.5' : 'p-2.5')}>
        {/* Bulk-select checkbox — hidden until hover, sticky once selected. */}
        {onToggleSelect && (
          <label
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'flex shrink-0 items-center justify-center self-start mt-0.5 cursor-pointer',
              'transition-opacity',
              isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
            )}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => {
                e.stopPropagation()
                onToggleSelect()
              }}
              className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0 dark:border-slate-600 dark:bg-slate-700"
              aria-label={`Select ${contact.firstName}`}
            />
          </label>
        )}

        {/* Drag handle */}
        <div
          {...dragHandleProps}
          data-drag-handle="true"
          onClick={(e) => e.stopPropagation()}
          className="flex shrink-0 items-center justify-center self-stretch -ml-1 cursor-grab active:cursor-grabbing text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 transition-colors"
        >
          <GripVertical className="h-4 w-4" />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1 space-y-1.5">
          {/* Child name + age category */}
          {primaryChildName ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Link
                href={`/crm/opportunities/${opportunity.id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-sm font-semibold text-slate-900 dark:text-white truncate hover:underline hover:text-indigo-600 dark:hover:text-indigo-400 underline-offset-2"
                title="Open lead detail"
              >
                {primaryChildName}
              </Link>
              {showField('ageCategory') && primaryChildAge && (() => {
                const category = getAgeCategory(primaryChildAge)
                if (category) {
                  return (
                    <span
                      title={`${primaryChildAge} — ${category}`}
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        ageCategoryClasses(category),
                      )}
                    >
                      {category}
                    </span>
                  )
                }
                return (
                  <span className="shrink-0 rounded-full bg-indigo-100 dark:bg-indigo-900 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:text-indigo-300">
                    {primaryChildAge}
                  </span>
                )
              })()}
            </div>
          ) : (
            <Link
              href={`/crm/opportunities/${opportunity.id}`}
              onClick={(e) => e.stopPropagation()}
              className="text-sm font-semibold text-slate-900 dark:text-white truncate hover:underline hover:text-indigo-600 dark:hover:text-indigo-400 underline-offset-2"
              title="Open lead detail"
            >
              {contact.firstName} {contact.lastName ?? ''}
            </Link>
          )}

          {/* Parent name — shown below child name only when we actually have a
              real child name (hasRealChildName). When we're falling back to the
              parent's name as the primary, repeating it below would be noise. */}
          {showField('parentName') && hasRealChildName && primaryChildName && !compact && (
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {contact.parentFullName}
            </p>
          )}

          {/* Trial timeslot — surfaced whenever a Trial Class appointment
              exists for this lead (i.e. after the BM moved it to CT).
              Always rendered (not gated by Manage Fields) because the slot
              is critical context once a lead is past CT. When today is the
              trial date, the pill flips to an amber "TODAY" treatment so
              the lead pops out of the column. */}
          {trialStartAt && (
            <div
              className={cn(
                'inline-flex items-center gap-1 self-start rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
                isTrialToday
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
              )}
              title={`Trial: ${trialStartAt.toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}`}
            >
              <Calendar className="h-3 w-3" />
              {isTrialToday && (
                <span className="rounded bg-white/20 px-1 text-[9px] font-bold tracking-wider">
                  TODAY
                </span>
              )}
              {trialStartAt.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' })}
              {' · '}
              {trialStartAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}
            </div>
          )}

          {/* Tags */}
          {showField('tags') && contact.contactTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {contact.contactTags.slice(0, 3).map(({ tag }) => (
                <span
                  key={tag.id}
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                  style={{ backgroundColor: tag.color }}
                >
                  {tag.name}
                </span>
              ))}
              {contact.contactTags.length > 3 && (
                <span className="rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-300">
                  +{contact.contactTags.length - 3}
                </span>
              )}
            </div>
          )}

          {/* Bottom row — collapses entirely when every field in it is hidden. */}
          {(showField('leadSource') || showField('value') || showField('lastStageChange') || showField('owner')) && (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {showField('leadSource') && contact.leadSource && (
                  <LeadSourceIcon name={contact.leadSource.name} />
                )}
                {showField('value') && Number(opportunity.value) > 0 && (
                  <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                    {formatMYR(Number(opportunity.value))}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {showField('lastStageChange') && (
                  <span
                    className="text-[10px] text-slate-400 dark:text-slate-500"
                    title={`Last moved: ${formatDate(opportunity.lastStageChangeAt)}`}
                  >
                    {relativeTime}
                  </span>
                )}
                {showField('owner') && (
                  opportunity.assignedUser ? (
                    <UserAvatar user={opportunity.assignedUser} />
                  ) : (
                    <div
                      title="Unassigned"
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-400"
                    >
                      <User className="h-3 w-3" />
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* Extra detail rows — only rendered when the user has toggled
              them on in the Manage Fields drawer. Keeps the default card
              compact unless the BM explicitly wants more info on-card. */}
          {(showField('email') || showField('phone') || showField('campaign') || showField('createdAt') || showField('stageName')) && (
            <div className="flex flex-col gap-0.5 text-[10px] text-slate-500 dark:text-slate-400">
              {showField('email') && contact.email && (
                <span className="truncate" title={contact.email}>{contact.email}</span>
              )}
              {showField('phone') && contact.phone && (
                <span className="truncate" title={contact.phone}>{formatPhoneDisplay(contact.phone)}</span>
              )}
              {showField('campaign') && (contact as unknown as { campaignName?: string | null }).campaignName && (
                <span className="truncate" title={(contact as unknown as { campaignName?: string | null }).campaignName ?? ''}>
                  Campaign: {(contact as unknown as { campaignName?: string | null }).campaignName}
                </span>
              )}
              {showField('createdAt') && (
                <span title={`Created ${formatDateTime(opportunity.createdAt)}`}>
                  Created {formatDateTime(opportunity.createdAt)}
                </span>
              )}
              {showField('stageName') && stageName && (
                <span className="truncate">Stage: {stageName}</span>
              )}
            </div>
          )}

          {/* Quick-actions row — clickable. Call uses tel:, the rest jump
              to the lead detail page (where Notes / Tasks / Appointments
              live). Tags + Notes show real count badges when available. */}
          {prefs.quickActions.length > 0 && (
            <div className="flex items-center gap-2 pt-0.5">
              {prefs.quickActions.map((action) => {
                let badge: number | null = null
                if (action === 'tags')  badge = contact.contactTags.length
                const detailHref = `/crm/opportunities/${opportunity.id}`
                // "call" uses tel: when a phone is present, "appointment" /
                // "notes" / "tasks" / "conversations" jump to the lead
                // detail page where the relevant section lives. Hashes
                // give the page a chance to scroll-to-section later.
                const href: string =
                  action === 'call' && contact.phone
                    ? `tel:${contact.phone}`
                    : action === 'notes'
                      ? `${detailHref}#notes`
                      : action === 'tasks'
                        ? `${detailHref}#tasks`
                        : action === 'appointment'
                          ? `${detailHref}#appointments`
                          : detailHref
                const ariaLabel = `${action} for ${(primaryChildName || contact.firstName)}`
                return (
                  <Link
                    key={action}
                    href={href}
                    onClick={(e) => e.stopPropagation()}
                    title={action}
                    aria-label={ariaLabel}
                    className="relative inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-700 dark:hover:text-indigo-300 transition-colors"
                  >
                    <QuickActionIcon action={action} />
                    {badge !== null && badge > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-indigo-600 px-0.5 text-[8px] font-bold text-white">
                        {badge > 9 ? '9+' : badge}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          )}

          {/* Stage abbreviation pill at the bottom */}
          {showField('stageBadge') && stageShortCode && (
            <div className="mt-1 flex justify-end">
              <span
                title={stageName}
                className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold tracking-wider text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-200"
              >
                {stageShortCode}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
