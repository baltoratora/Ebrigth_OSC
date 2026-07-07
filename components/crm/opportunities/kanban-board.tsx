'use client'

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from 'react'
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd'
import { Plus, Search, X, Loader2, ChevronDown, Users, CalendarRange, CalendarDays, AlertTriangle, ArrowRight, MoveRight, PenLine, Settings2, ArrowDownWideNarrow, ArrowUpWideNarrow, Info, ShieldAlert, MoreHorizontal, Download, RotateCcw } from 'lucide-react'
import { exportOpportunities, type OppExportRow } from '@/server/actions/export-opportunities'
import { useQueryClient } from '@tanstack/react-query'
import { CustomiseCardDrawer } from './customise-card-drawer'
import { loadCardPrefs, saveCardPrefs, type CardPrefs, DEFAULT_CARD_PREFS } from '@/lib/crm/kanban-card-prefs'
import { toast } from 'sonner'
import { startOfWeek, endOfWeek, addWeeks } from 'date-fns'
import { cn, formatMYR, formatDate, formatDateTime } from '@/lib/crm/utils'
import { useKanban, useMoveOpportunity, useOpportunity, useDeleteOpportunity, opportunityKeys } from '@/hooks/crm/useOpportunities'
import { getAgeCategory, ageCategoryClasses, formatChildAge } from '@/lib/crm/age-category'
import { Trash2 } from 'lucide-react'
import { useBranchContext } from '../branch-context'
import { useOppFilter } from './opp-filter-context'
import { KanbanCard } from './kanban-card'
import { StageChangeModal } from './stage-change-modal'
import { OpportunityModal } from './opportunity-modal'
import { DeleteConfirmDialog } from './delete-confirm-dialog'
import { LeadActionContent } from './lead-action-panel'
import type { KanbanStage, OpportunityCard } from '@/server/queries/opportunities'

// ─── Lead transition rules ───────────────────────────────────────────────────
// Maps each stage to the set of stages a lead is allowed to move to next, as
// defined by the business flow chart. Short codes are normalized (uppercase,
// underscores stripped) so UR_W1 and URW1 compare equal. Missing key = no
// rule applies (used for HR/non-lead pipelines). Empty array = terminal stage.

function normalizeStageCode(code: string): string {
  return code.toUpperCase().replace(/_/g, '')
}

/**
 * Trial Class appointments are stored as KL-wall-clock-as-UTC (the picked
 * "2026-06-18 10:00" is saved as 10:00Z, not 02:00Z). To compare a trial date
 * against the kanban's week filter — whose bounds are browser-local wall clock —
 * we must read the appointment's UTC fields and rebuild a local Date with the
 * SAME wall-clock numbers. Comparing the raw instant instead skews trials by 8h
 * and drops Sunday-evening / Monday-morning trials into the wrong week.
 */
function trialWallClock(startAt: string | Date): Date {
  const d = new Date(startAt)
  return new Date(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds(),
  )
}

/** A stage is "Confirmed for Trial" (not the Trial Buffer CTB). */
function isConfirmedTrialStage(shortCode: string, name: string): boolean {
  const code = normalizeStageCode(shortCode)
  return code === 'CT' || (/confirmed for trial/i.test(name) && code !== 'CTB')
}

const ALLOWED_LEAD_TRANSITIONS: Record<string, string[]> = {
  // NL: must start with FU1 (no skipping to FU2 / FU3), but can short-cut
  // directly to CT when a lead is already confirmed for a trial, enrol, drop
  // to Cold Lead / DND, or reschedule (RSD). CTB stays as an optional Trial
  // Buffer holding-pen destination.
  NL: ['FU1', 'CT', 'CTB', 'ENR', 'RSD', 'CL', 'DND'],
  // FU1/FU2/FU3: can advance to a later follow-up, jump to CT (or park in the
  // Trial Buffer CTB), reschedule (RSD), or drop the lead directly to Cold Lead
  // without going through UR_W1/UR_W2/FU3M first.
  FU1: ['FU2', 'FU3', 'CT', 'CTB', 'RSD', 'CL', 'DND'],
  FU2: ['FU3', 'CT', 'CTB', 'RSD', 'CL', 'DND'],
  FU3: ['RSD', 'URW1', 'CT', 'CTB', 'CL', 'DND'],
  // RSD (Reschedule) is a fully open recovery hub — a rescheduled lead can be
  // re-confirmed for trial, dropped back into any follow-up, parked in CNS/SU/
  // SNE, enrolled, escalated to UR_W1, or closed (CL/DND). CTB stays as an
  // optional Trial Buffer destination.
  RSD: ['CT', 'CTB', 'FU1', 'FU2', 'FU3', 'CNS', 'SU', 'SNE', 'ENR', 'URW1', 'CL', 'DND'],
  // Recovery to RSD: CT → RSD lets a confirmed trial be rescheduled without
  // an admin override. The "terminal-ish" / unresponsive stages below
  // (NL, CNS, SNE, URW1-3, CL, DND) also allow → RSD so a lead that was
  // parked or written off can be revived back into the active funnel. RSD
  // is the ONLY backward destination permitted from those stages.
  CT: ['SU', 'CNS', 'RSD'],
  CNS: ['URW1', 'RSD'],
  URW1: ['URW2', 'CL', 'DND', 'RSD'],
  URW2: ['URW3', 'FU3M', 'CL', 'DND', 'RSD'],
  URW3: ['CL', 'DND', 'RSD'],
  FU3M: ['CL', 'DND'],
  // Trial Buffer (CTB): a holding pen for imported "confirmed for trial" leads
  // that lack a trial date. Moving CTB → CT fires the trial date/slot popup.
  CTB: ['CT', 'RSD', 'CL', 'DND'],
  SU: ['ENR', 'ENRB', 'SNE'],
  SNE: ['CL', 'RSD'],
  // Enroll Buffer (ENRB): a holding pen for imported "enrolled" leads that lack
  // a package. Moving ENRB → ENR fires the package popup.
  ENRB: ['ENR', 'SNE', 'CL', 'DND', 'RSD'],
  ENR: [],
  CL: ['RSD'],
  DND: ['RSD'],
  // Buffer (OD use only) — entry state, allow hand-off into early/confirmed stages.
  SG: ['NL', 'FU1', 'FU2', 'FU3', 'CT'],
}

function isLeadTransitionAllowed(fromShortCode: string, toShortCode: string): boolean {
  const from = normalizeStageCode(fromShortCode)
  const to = normalizeStageCode(toShortCode)
  const allowed = ALLOWED_LEAD_TRANSITIONS[from]
  if (allowed === undefined) return true
  return allowed.includes(to)
}

// ─── Debounce hook ────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [dv, setDv] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return dv
}

// ─── Virtual list for a column ────────────────────────────────────────────────

const CARD_GAP = 8

// Progressive reveal: a column shows the first INITIAL_REVEAL cards, then loads
// REVEAL_STEP more each time the user scrolls near the bottom, until the whole
// (already-filtered) stage is shown. This is a render-only concern — counts,
// drag/drop, search, and select-all all still operate on the full stage list.
const INITIAL_REVEAL = 50
const REVEAL_STEP = 20

function VirtualColumnList({
  items,
  resetSignature,
  stuckHoursYellow,
  stuckHoursRed,
  selectedIds,
  stageShortCode,
  stageName,
  onCardClick,
  onToggleSelect,
  cardPrefs,
}: {
  items: OpportunityCard[]
  /** Changing this (filters/sort/pipeline) resets the reveal back to the top. */
  resetSignature: string
  stuckHoursYellow: number
  stuckHoursRed: number
  selectedIds: Set<string>
  stageShortCode?: string
  stageName?: string
  onCardClick?: (opp: OpportunityCard) => void
  onToggleSelect?: (id: string) => void
  cardPrefs: CardPrefs
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [revealLimit, setRevealLimit] = useState(INITIAL_REVEAL)

  // Keep latest values readable inside the (mount-once) scroll listener.
  const revealRef = useRef(revealLimit)
  revealRef.current = revealLimit
  const totalRef = useRef(items.length)
  totalRef.current = items.length

  // Reset the reveal window when the filter/sort/pipeline context changes, and
  // jump the column back to the top so the user starts from the first 50.
  useEffect(() => {
    setRevealLimit(INITIAL_REVEAL)
    if (containerRef.current) containerRef.current.scrollTop = 0
  }, [resetSignature])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onScroll = () => {
      // Near the bottom and more cards remain → reveal the next batch.
      if (
        el.scrollTop + el.clientHeight >= el.scrollHeight - 200 &&
        revealRef.current < totalRef.current
      ) {
        setRevealLimit((l) => Math.min(l + REVEAL_STEP, totalRef.current))
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Render the revealed slice directly. We deliberately do NOT virtual-window
  // with spacers: cards vary in height (trial pill, tags, age badge), so a
  // fixed-height estimate made the scroll position drift and "jump" as the user
  // scrolled. Progressive reveal alone keeps the DOM light (50 cards, +20 per
  // scroll) while leaving scroll position rock-steady.
  const revealedItems = items.slice(0, revealLimit)
  const hasMore = revealLimit < items.length

  return (
    <div
      ref={containerRef}
      className="cns-scroll flex-1 min-h-0 overflow-y-auto pr-1"
    >
      {revealedItems.map((opp, index) => (
        <Draggable key={opp.id} draggableId={opp.id} index={index}>
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.draggableProps}
              style={{
                ...provided.draggableProps.style,
                marginBottom: CARD_GAP,
              }}
            >
              <KanbanCard
                opportunity={opp}
                stageShortCode={stageShortCode}
                stageName={stageName}
                stuckHoursYellow={stuckHoursYellow}
                stuckHoursRed={stuckHoursRed}
                isSelected={selectedIds.has(opp.id)}
                dragHandleProps={provided.dragHandleProps as unknown as Record<string, unknown>}
                isDragging={snapshot.isDragging}
                onClick={() => onCardClick?.(opp)}
                onToggleSelect={onToggleSelect ? () => onToggleSelect(opp.id) : undefined}
                prefs={cardPrefs}
              />
            </div>
          )}
        </Draggable>
      ))}
      {/* Reveal hint — shown while more cards remain to be scrolled into view. */}
      {hasMore && (
        <div className="py-2 text-center text-[10px] font-medium text-slate-400 dark:text-slate-500">
          Scroll for more — {items.length - revealLimit} more
        </div>
      )}
    </div>
  )
}

// ─── Column ───────────────────────────────────────────────────────────────────

function KanbanColumn({
  stage,
  selectedIds,
  onAddCard,
  onCardClick,
  onToggleSelect,
  onToggleStage,
  cardPrefs,
  filterKey,
}: {
  stage: KanbanStage
  selectedIds: Set<string>
  onAddCard: (stageId: string) => void
  onCardClick?: (opp: OpportunityCard) => void
  onToggleSelect?: (id: string) => void
  /** Select/deselect every lead in this stage. Given the full id list. */
  onToggleStage?: (oppIds: string[]) => void
  cardPrefs: CardPrefs
  /** Board-level filter signature; combined with this column's sort to reset
   *  the progressive-reveal window when the visible set changes. */
  filterKey: string
}) {
  const totalValue = stage.opportunities.reduce(
    (sum, o) => sum + Number(o.value),
    0,
  )

  // Per-stage "select all" — only shown once bulk mode is active (≥1 card
  // selected anywhere). Checked when every card in this stage is selected;
  // indeterminate when only some are.
  const bulkActive = selectedIds.size > 0
  const stageOppIds = stage.opportunities.map((o) => o.id)
  const allSelected = stageOppIds.length > 0 && stageOppIds.every((id) => selectedIds.has(id))
  const someSelected = stageOppIds.some((id) => selectedIds.has(id))
  const selectAllRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected && !allSelected
  }, [someSelected, allSelected])

  // Per-stage sort by created date. 'desc' = newest first (default), 'asc' =
  // oldest first. Each column remembers its own direction.
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')
  const sortedOpportunities = useMemo(() => {
    return [...stage.opportunities].sort((a, b) => {
      const da = new Date(a.createdAt).getTime()
      const db = new Date(b.createdAt).getTime()
      return sortDir === 'asc' ? da - db : db - da
    })
  }, [stage.opportunities, sortDir])

  return (
    <div className="flex flex-col w-72 shrink-0 h-full min-h-0 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-200 dark:border-slate-700">
        {/* Select-all-in-stage — appears only in bulk mode. */}
        {bulkActive && onToggleStage && stageOppIds.length > 0 && (
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allSelected}
            onChange={() => onToggleStage(stageOppIds)}
            title={allSelected ? 'Deselect all in this stage' : 'Select all in this stage'}
            className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600"
          />
        )}
        <div
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: stage.color || '#6366f1' }}
        />
        <span className="flex-1 truncate text-sm font-semibold text-slate-800 dark:text-white">
          {stage.name}
        </span>
        <span className="shrink-0 rounded bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
          {stage.shortCode}
        </span>
        <span className="shrink-0 rounded-full bg-indigo-100 dark:bg-indigo-900 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">
          {stage.opportunities.length}
        </span>
        <button
          onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
          title={sortDir === 'desc' ? 'Sorted newest first — click for oldest first' : 'Sorted oldest first — click for newest first'}
          className="shrink-0 flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-white transition-colors"
        >
          {sortDir === 'desc'
            ? <ArrowDownWideNarrow className="h-3.5 w-3.5" />
            : <ArrowUpWideNarrow className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={() => onAddCard(stage.id)}
          title="Add opportunity"
          className="shrink-0 flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-white transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Value summary */}
      <div className="px-3 py-1.5 border-b border-slate-200 dark:border-slate-700">
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {formatMYR(totalValue)} total
        </p>
      </div>

      {/* Cards */}
      <Droppable droppableId={stage.id} type="CARD">
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              'flex flex-col p-2 flex-1 min-h-0 transition-colors',
              snapshot.isDraggingOver &&
                'bg-indigo-50 dark:bg-indigo-950/30',
            )}
          >
            <VirtualColumnList
              items={sortedOpportunities}
              resetSignature={`${filterKey}|${sortDir}`}
              stuckHoursYellow={stage.stuckHoursYellow}
              stuckHoursRed={stage.stuckHoursRed}
              selectedIds={selectedIds}
              stageShortCode={stage.shortCode}
              stageName={stage.name}
              onCardClick={onCardClick}
              onToggleSelect={onToggleSelect}
              cardPrefs={cardPrefs}
            />
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  )
}

// ─── Filters bar ─────────────────────────────────────────────────────────────

interface Pipeline {
  id: string
  name: string
  branchId: string
  stages: { id: string; name: string; order: number }[]
}

interface BranchUser {
  id: string
  name: string | null
  email: string
}

export type WeekFilter = 'today' | 'yesterday' | 'this' | 'next' | 'last' | 'custom' | 'all'
/** Which timestamp the day/week filter matches against:
 *  'created' = when the lead came in (createdAt),
 *  'updated' = when it was last moved/worked (lastStageChangeAt). */
export type DateBasis = 'created' | 'updated'

/**
 * Resolve the selected preset into a concrete {from, to} Date range (inclusive
 * on both ends). Returns null when no filter should be applied (i.e. "all").
 * Weeks are Monday-start, matching local business convention.
 */
function resolveRange(
  filter: WeekFilter,
  customFrom: string,
  customTo: string,
): { from: Date; to: Date } | null {
  if (filter === 'all') return null
  const now = new Date()
  if (filter === 'today') {
    const from = new Date(now)
    from.setHours(0, 0, 0, 0)
    const to = new Date(now)
    to.setHours(23, 59, 59, 999)
    return { from, to }
  }
  if (filter === 'yesterday') {
    const from = new Date(now)
    from.setDate(from.getDate() - 1)
    from.setHours(0, 0, 0, 0)
    const to = new Date(from)
    to.setHours(23, 59, 59, 999)
    return { from, to }
  }
  if (filter === 'this') {
    return {
      from: startOfWeek(now, { weekStartsOn: 1 }),
      to: endOfWeek(now, { weekStartsOn: 1 }),
    }
  }
  if (filter === 'next') {
    const d = addWeeks(now, 1)
    return {
      from: startOfWeek(d, { weekStartsOn: 1 }),
      to: endOfWeek(d, { weekStartsOn: 1 }),
    }
  }
  if (filter === 'last') {
    const d = addWeeks(now, -1)
    return {
      from: startOfWeek(d, { weekStartsOn: 1 }),
      to: endOfWeek(d, { weekStartsOn: 1 }),
    }
  }
  // custom — inclusive range; guard against empty inputs
  if (!customFrom || !customTo) return null
  return {
    from: new Date(`${customFrom}T00:00:00`),
    to: new Date(`${customTo}T23:59:59.999`),
  }
}

interface FiltersBarProps {
  pipelines: Pipeline[]
  selectedPipelineId: string
  onPipelineChange: (id: string) => void
  search: string
  onSearchChange: (s: string) => void
  selectedBranchId: string | undefined
  onBranchChange: (id: string | undefined) => void
  branches: { id: string; name: string }[]
  canSwitchPipelines?: boolean
  /** When true, the pipeline picker is read-only — driven by the topbar branch
   *  switcher selecting a specific branch. */
  pipelineLocked?: boolean
  weekFilter: WeekFilter
  onWeekFilterChange: (f: WeekFilter) => void
  dateBasis: DateBasis
  onDateBasisChange: (b: DateBasis) => void
  customFrom: string
  customTo: string
  onCustomFromChange: (s: string) => void
  onCustomToChange: (s: string) => void
  // Refinement filters — options derived from the currently-loaded card set so
  // we don't show choices that yield zero results.
  sourceFilter: string  // '' = all, otherwise lead-source name
  onSourceFilterChange: (s: string) => void
  sourceOptions: string[]
  ageFilter: string  // '' = all | 'Junior' | 'Mid' | 'Senior'
  onAgeFilterChange: (s: string) => void
  tagFilter: string  // '' = all, otherwise tag id
  onTagFilterChange: (s: string) => void
  tagOptions: Array<{ id: string; name: string; color: string }>
  /** Opens the Customise Card drawer. Mirrors GHL's "Manage Fields" button. */
  onOpenCustomiseCard: () => void
}

function FiltersBar({
  pipelines,
  selectedPipelineId,
  onPipelineChange,
  search,
  onSearchChange,
  canSwitchPipelines = true,
  pipelineLocked = false,
  weekFilter,
  onWeekFilterChange,
  dateBasis,
  onDateBasisChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
  sourceFilter,
  onSourceFilterChange,
  sourceOptions,
  ageFilter,
  onAgeFilterChange,
  tagFilter,
  onTagFilterChange,
  tagOptions,
  onOpenCustomiseCard,
}: FiltersBarProps) {
  const pipelineDisabled = !canSwitchPipelines || pipelineLocked
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
      {/* Pipeline selector — locked when topbar branch is fixed, or for BMs */}
      <div className="relative">
        <select
          value={selectedPipelineId}
          onChange={(e) => onPipelineChange(e.target.value)}
          disabled={pipelineDisabled}
          title={
            pipelineLocked
              ? 'Locked by topbar branch view'
              : !canSwitchPipelines
                ? 'Locked to your branch'
                : undefined
          }
          className={cn(
            'appearance-none rounded-lg border border-slate-300 dark:border-slate-600',
            'bg-white dark:bg-slate-800 pl-3 pr-8 py-1.5 text-sm text-slate-900 dark:text-white',
            'focus:outline-none focus:ring-2 focus:ring-indigo-500',
            pipelineDisabled && 'cursor-not-allowed opacity-70',
          )}
        >
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search contacts..."
          className={cn(
            'rounded-lg border border-slate-300 dark:border-slate-600',
            'bg-white dark:bg-slate-800 pl-8 pr-8 py-1.5 text-sm w-52',
            'text-slate-900 dark:text-white placeholder:text-slate-400',
            'focus:outline-none focus:ring-2 focus:ring-indigo-500',
          )}
        />
        {search && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Week filter */}
      <div className="relative">
        <CalendarRange className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
        <select
          value={weekFilter}
          onChange={(e) => onWeekFilterChange(e.target.value as WeekFilter)}
          className={cn(
            'appearance-none rounded-lg border border-slate-300 dark:border-slate-600',
            'bg-white dark:bg-slate-800 pl-8 pr-8 py-1.5 text-sm text-slate-900 dark:text-white',
            'focus:outline-none focus:ring-2 focus:ring-indigo-500',
          )}
        >
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="this">This week</option>
          <option value="next">Next week</option>
          <option value="last">Last week</option>
          <option value="custom">Custom range…</option>
          <option value="all">All</option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
      </div>

      {/* Which timestamp the day/week range matches: created vs last-updated. */}
      <div
        className="inline-flex overflow-hidden rounded-lg border border-slate-300 text-xs dark:border-slate-600"
        title="Filter the date range by when the lead was created, or when it was last moved/updated"
      >
        {(['created', 'updated'] as const).map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => onDateBasisChange(b)}
            className={cn(
              'px-2.5 py-1.5 font-medium capitalize transition',
              dateBasis === b
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
            )}
          >
            {b}
          </button>
        ))}
      </div>

      {weekFilter === 'custom' && (
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => onCustomFromChange(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <span className="text-xs text-slate-400">→</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => onCustomToChange(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      )}

      {/* Platform / lead-source refinement */}
      <div className="relative">
        <select
          value={sourceFilter}
          onChange={(e) => onSourceFilterChange(e.target.value)}
          className={cn(
            'appearance-none rounded-lg border border-slate-300 dark:border-slate-600',
            'bg-white dark:bg-slate-800 pl-3 pr-8 py-1.5 text-sm text-slate-900 dark:text-white',
            'focus:outline-none focus:ring-2 focus:ring-indigo-500',
          )}
          title="Filter by lead source / platform"
        >
          <option value="">All platforms</option>
          {sourceOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
      </div>

      {/* Age class refinement */}
      <div className="relative">
        <select
          value={ageFilter}
          onChange={(e) => onAgeFilterChange(e.target.value)}
          className={cn(
            'appearance-none rounded-lg border border-slate-300 dark:border-slate-600',
            'bg-white dark:bg-slate-800 pl-3 pr-8 py-1.5 text-sm text-slate-900 dark:text-white',
            'focus:outline-none focus:ring-2 focus:ring-indigo-500',
          )}
          title="Filter by age class (Junior 7-9, Mid 10-12, Senior 13-16)"
        >
          <option value="">All ages</option>
          <option value="Junior">Junior (7-9)</option>
          <option value="Mid">Mid (10-12)</option>
          <option value="Senior">Senior (13-16)</option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
      </div>

      {/* Spacer pushes Manage Fields to the right edge, GHL-style. */}
      <div className="ml-auto" />

      {/* Manage Fields — opens the Customise Card drawer. */}
      <button
        type="button"
        onClick={onOpenCustomiseCard}
        title="Customise the kanban card layout"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-indigo-400 hover:text-indigo-700',
          'dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-indigo-400 dark:hover:text-indigo-300',
        )}
      >
        <Settings2 className="h-3.5 w-3.5" /> Manage Fields
      </button>
    </div>
  )
}

// ─── Bulk action bar ──────────────────────────────────────────────────────────

function BulkActionBar({
  count,
  stages,
  onMoveAll,
  onDeleteAll,
  onClear,
  canEditLeads,
  canDeleteLeads,
}: {
  count: number
  stages: KanbanStage[]
  onMoveAll: (toStageId: string) => void
  onDeleteAll: () => void
  onClear: () => void
  canEditLeads: boolean
  canDeleteLeads: boolean
}) {
  const [targetStage, setTargetStage] = useState('')

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-indigo-600 text-white text-sm font-medium">
      <span>{count} selected</span>
      <div className="flex items-center gap-2 ml-auto">
        {/* Native <select> renders the open dropdown panel with OS defaults, so
            colours from the closed-state classes don't propagate to <option>.
            Force a readable white-panel/dark-text combo on the options so it
            stays legible against the indigo BulkActionBar in both light and
            dark mode. */}
        {/* Bulk move = lead editing (hidden for read-only AGENCY_ADMIN). */}
        {canEditLeads && (
          <>
            <select
              value={targetStage}
              onChange={(e) => setTargetStage(e.target.value)}
              className="rounded bg-white/20 border border-white/30 px-2 py-1 text-sm text-white focus:outline-none [&>option]:bg-white [&>option]:text-slate-900"
            >
              <option value="" className="bg-white text-slate-900">Move to stage...</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id} className="bg-white text-slate-900">
                  {s.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => targetStage && onMoveAll(targetStage)}
              disabled={!targetStage}
              className="rounded bg-white/20 px-3 py-1 hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Move all
            </button>
          </>
        )}
        {/* Delete = SUPER_ADMIN only. */}
        {canDeleteLeads && (
          <button
            onClick={onDeleteAll}
            className="rounded bg-red-500/80 px-3 py-1 hover:bg-red-500 transition-colors"
          >
            Delete all
          </button>
        )}
        <button
          onClick={onClear}
          className="rounded bg-white/20 px-3 py-1 hover:bg-white/30 transition-colors"
        >
          Clear
        </button>
      </div>
    </div>
  )
}

// ─── Main KanbanBoard ─────────────────────────────────────────────────────────

/**
 * In-session memory for the FiltersBar selections (day/week range, lead source,
 * age class, tag, and search). Module-scoped on purpose: it survives client-side
 * navigation — open a lead and come back and the filters are still applied — but
 * is wiped on a full page refresh or tab close. It does NOT track the pipeline,
 * which is driven by the top-bar branch switcher.
 */
interface KanbanFilterMemory {
  search: string
  weekFilter: WeekFilter
  dateBasis: DateBasis
  customFrom: string
  customTo: string
  sourceFilter: string
  ageFilter: string
  tagFilter: string
}
const kanbanFilterMemory: Partial<KanbanFilterMemory> = {}

interface KanbanBoardProps {
  initialPipelineId: string
  pipelines: Pipeline[]
  branches: { id: string; name: string }[]
  users: BranchUser[]
  defaultBranchId?: string
  /** When false (BRANCH_MANAGER and below), the pipeline dropdown is locked. */
  canSwitchBranches?: boolean
  /** False for AGENCY_ADMIN — leads are read-only (no create/edit/move/drag). */
  canEditLeads?: boolean
  /** True only for SUPER_ADMIN — lead deletion. */
  canDeleteLeads?: boolean
}

// CSV download for the opportunities export (BOM so Excel reads UTF-8 right).
function downloadOpportunitiesCsv(rows: OppExportRow[]) {
  const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`
  const header = ['Name', 'Parent', 'Phone', 'Email', 'Branch', 'Date Created', 'Date Updated', 'Current Stage', 'Lead Source', 'Remarks']
  const lines = [
    header.join(','),
    ...rows.map((r) => [r.name, r.parent, r.phone, r.email, r.branch, r.createdAt, r.updatedAt, r.stage, r.leadSource, r.remarks].map(esc).join(',')),
  ]
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `opportunities-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// 3-dot menu next to "New Opportunity": Export (detailed CSV) + Reset card layout.
function KanbanActionsMenu({ onResetCard, shownIds }: { onResetCard: () => void; shownIds: string[] }) {
  const [open, setOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  async function doExport() {
    setExporting(true)
    const res = await exportOpportunities(shownIds)
    setExporting(false)
    setOpen(false)
    if (!res.ok || !res.rows) { toast.error(res.error ?? 'Export failed'); return }
    if (res.rows.length === 0) { toast.info('No opportunities to export'); return }
    downloadOpportunitiesCsv(res.rows)
    toast.success(`Exported ${res.rows.length} opportunities`)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="More actions"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              onClick={doExport}
              disabled={exporting}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export to CSV
            </button>
            <button
              type="button"
              onClick={() => { onResetCard(); setOpen(false); toast.success('Card layout reset to default') }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <RotateCcw className="h-4 w-4" /> Reset card to default
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export function KanbanBoard({
  initialPipelineId,
  pipelines,
  branches,
  users,
  defaultBranchId,
  canSwitchBranches = true,
  canEditLeads = true,
  canDeleteLeads = true,
}: KanbanBoardProps) {
  const [selectedPipelineId, setSelectedPipelineId] = useState(initialPipelineId)
  const [searchInput, setSearchInput] = useState(() => kanbanFilterMemory.search ?? '')
  // Card customisation — persisted per browser via localStorage.
  // Starts at the project default so first render matches SSR; the
  // localStorage value is hydrated client-side after mount.
  const [cardPrefs, setCardPrefs] = useState<CardPrefs>(DEFAULT_CARD_PREFS)
  const [customiseOpen, setCustomiseOpen] = useState(false)
  useEffect(() => {
    setCardPrefs(loadCardPrefs())
  }, [])
  // Branch filter UI was removed — the pipeline selector already implies a single
  // branch. This state is kept in sync with the selected pipeline so the
  // "Add card" modal pre-fills the right branch.
  const [selectedBranchId, setSelectedBranchId] = useState<string | undefined>(defaultBranchId)

  // Keep selectedBranchId aligned with the current pipeline's branch
  useEffect(() => {
    const current = pipelines.find((p) => p.id === selectedPipelineId)
    if (current && current.branchId) setSelectedBranchId(current.branchId)
  }, [selectedPipelineId, pipelines])

  // Cross-page branch switcher — when the super_admin picks a branch from the
  // top-bar switcher, auto-jump to that branch's pipeline (and fall back to the
  // "All Branches" synthetic pipeline when they go back to Agency View).
  const { selectedBranch: contextBranch } = useBranchContext()
  useEffect(() => {
    if (contextBranch) {
      const match = pipelines.find((p) => p.branchId === contextBranch.id && !p.id.startsWith('all:'))
      if (match && match.id !== selectedPipelineId) setSelectedPipelineId(match.id)
    } else {
      const allPipe = pipelines.find((p) => p.id.startsWith('all:'))
      if (allPipe && allPipe.id !== selectedPipelineId) setSelectedPipelineId(allPipe.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextBranch?.id])
  const [weekFilter, setWeekFilter] = useState<WeekFilter>(() => kanbanFilterMemory.weekFilter ?? 'all')
  const [dateBasis, setDateBasis] = useState<DateBasis>(() => kanbanFilterMemory.dateBasis ?? 'created')
  const [customFrom, setCustomFrom] = useState<string>(() => kanbanFilterMemory.customFrom ?? '')
  const [customTo, setCustomTo] = useState<string>(() => kanbanFilterMemory.customTo ?? '')

  // Mirror the resolved day/week range into the shared context so sibling
  // widgets (the header WhatsApp button) filter to the same window.
  const oppFilter = useOppFilter()
  useEffect(() => {
    const r = resolveRange(weekFilter, customFrom, customTo)
    oppFilter.setRange(r ? { from: r.from.toISOString(), to: r.to.toISOString() } : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekFilter, customFrom, customTo])
  // Refinement filters (lead source / age class / tag). Empty string = "all".
  const [sourceFilter, setSourceFilter] = useState<string>(() => kanbanFilterMemory.sourceFilter ?? '')
  const [ageFilter, setAgeFilter] = useState<string>(() => kanbanFilterMemory.ageFilter ?? '')
  const [tagFilter, setTagFilter] = useState<string>(() => kanbanFilterMemory.tagFilter ?? '')
  const search = useDebounce(searchInput, 350)

  // Persist the FiltersBar selections for the tab session (see kanbanFilterMemory).
  useEffect(() => {
    kanbanFilterMemory.search = searchInput
    kanbanFilterMemory.weekFilter = weekFilter
    kanbanFilterMemory.dateBasis = dateBasis
    kanbanFilterMemory.customFrom = customFrom
    kanbanFilterMemory.customTo = customTo
    kanbanFilterMemory.sourceFilter = sourceFilter
    kanbanFilterMemory.ageFilter = ageFilter
    kanbanFilterMemory.tagFilter = tagFilter
  }, [searchInput, weekFilter, dateBasis, customFrom, customTo, sourceFilter, ageFilter, tagFilter])

  // Filter signature for the columns' progressive-reveal reset (see KanbanColumn).
  const filterKey = `${selectedPipelineId}|${weekFilter}|${dateBasis}|${customFrom}|${customTo}|${sourceFilter}|${ageFilter}|${tagFilter}|${search}`

  // Always pass undefined for branchId — the pipeline itself already scopes to one branch.
  const { data, isLoading, isError, refetch } = useKanban(
    selectedPipelineId,
    undefined,
    search,
  )

  const moveMutation = useMoveOpportunity()

  // Optimistic local state
  const [localStages, setLocalStages] = useState<KanbanStage[] | null>(null)

  useEffect(() => {
    if (data?.stages) setLocalStages(data.stages)
  }, [data])

  const stages = localStages ?? data?.stages ?? []

  // Pending move (for modal)
  const [pendingMove, setPendingMove] = useState<{
    opportunityId: string
    branchId: string
    fromStageId: string
    toStageId: string
    fromStageName: string
    toStageName: string
    previousStages: KanbanStage[]
    /** Lead display name + cursor — shown as a badge in the modal when the
     *  user is walking through a bulk-move queue. Absent for normal single
     *  moves so the modal stays clean. */
    bulkProgress?: { leadName: string; current: number; total: number }
  } | null>(null)
  // Pending bulk-move queue — non-null while the user is walking through the
  // per-lead modal flow that bulk-Move all kicks off for CT/ENR/RSD/CL.
  const [bulkQueue, setBulkQueue] = useState<{
    remaining: string[]    // opportunity ids still to prompt for
    toStageId: string
    completed: number
    total: number
  } | null>(null)
  // Blocked move (for invalid-transition popup — non-admins only)
  const [blockedMove, setBlockedMove] = useState<{
    fromStageName: string
    fromShortCode: string
    toStageName: string
    toShortCode: string
    allowedStages: Array<{ id: string; name: string; shortCode: string }>
  } | null>(null)
  const [moveNote, setMoveNote] = useState('')
  const [trialDate, setTrialDate] = useState<string>('')
  const [trialTimeSlot, setTrialTimeSlot] = useState<string>('')
  const [enrollmentMonths, setEnrollmentMonths] = useState<3 | 6 | 9 | 12 | 18 | 24 | undefined>(undefined)
  const [rescheduleDate, setRescheduleDate] = useState<string>('')
  // Local pending flag scoped to the modal confirm action. Using
  // moveMutation.isPending directly would leak state from any other in-flight
  // fire-and-forget move happening on the board at the same time.
  const [isConfirming, setIsConfirming] = useState(false)

  function resetStageExtras() {
    setMoveNote('')
    setTrialDate('')
    setTrialTimeSlot('')
    setEnrollmentMonths(undefined)
    setRescheduleDate('')
  }

  // Selected cards (bulk)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Add card modal (from stage "+" button — pre-fills stageId)
  const [addCardStageId, setAddCardStageId] = useState<string | null>(null)
  // Global "New Opportunity" modal (from top bar button — full pipeline picker)
  const [showNewOpportunity, setShowNewOpportunity] = useState(false)
  // Card detail modal
  const [detailCard, setDetailCard] = useState<OpportunityCard | null>(null)

  // Derive available source / tag options from the current card set so the
  // dropdowns only offer choices that yield results.
  const sourceOptions = useMemo(() => {
    const set = new Set<string>()
    for (const s of stages) {
      for (const o of s.opportunities) {
        const name = o.contact.leadSource?.name
        if (name) set.add(name)
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [stages])

  const tagOptions = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; color: string }>()
    for (const s of stages) {
      for (const o of s.opportunities) {
        for (const { tag } of o.contact.contactTags) byId.set(tag.id, tag)
      }
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [stages])

  // Filter by date range + lead source + age class + tag (client-side).
  // The date basis toggle picks which timestamp the range matches: 'created'
  // (createdAt — leads that came in during the period, mirrors the dashboard's
  // New Leads count) or 'updated' (lastStageChangeAt — leads last moved/worked
  // during the period).
  const filteredStages = useMemo(() => {
    const range = resolveRange(weekFilter, customFrom, customTo)
    return stages.map((stage) => {
      return {
      ...stage,
      opportunities: stage.opportunities.filter((o) => {
        // Date range — match on created or last-updated date per the toggle.
        if (range) {
          const when = new Date(dateBasis === 'updated' ? o.lastStageChangeAt : o.createdAt)
          if (when < range.from || when > range.to) return false
        }
        // Lead source / platform
        if (sourceFilter && o.contact.leadSource?.name !== sourceFilter) return false
        // Age class — childAge1 is the canonical sibling age column post-refactor
        if (ageFilter) {
          const cat = getAgeCategory(o.contact.childAge1)
          if (cat !== ageFilter) return false
        }
        // Tag — opportunity matches if ANY of its tags equals the selected one
        if (tagFilter) {
          const hasTag = o.contact.contactTags.some(({ tag }) => tag.id === tagFilter)
          if (!hasTag) return false
        }
        return true
      }),
    }
    })
  }, [stages, weekFilter, dateBasis, customFrom, customTo, sourceFilter, ageFilter, tagFilter])

  // ── Drag & Drop ──────────────────────────────────────────────────────────────

  const onDragEnd = useCallback(
    (result: DropResult) => {
      const { source, destination, draggableId } = result
      if (!destination || source.droppableId === destination.droppableId) return

      // AGENCY_ADMIN has read-only leads — moving a card is an edit.
      if (!canEditLeads) {
        toast.error('Your role has read-only access to leads.')
        return
      }

      const fromStage = stages.find((s) => s.id === source.droppableId)
      const toStage = stages.find((s) => s.id === destination.droppableId)
      if (!fromStage || !toStage) return

      // Lead pipelines follow the business flow chart. Super/agency admins
      // bypass the rule (canSwitchBranches flag); everyone else can only move
      // a lead along the allowed edges and gets an Acknowledge popup otherwise.
      // HR Recruitment is exempt since its flow is non-linear.
      const currentPipelineName = pipelines.find((p) => p.id === selectedPipelineId)?.name ?? ''
      const isLeadPipeline = !/recruitment/i.test(currentPipelineName) && !currentPipelineName.startsWith('Ebright HR')
      if (
        isLeadPipeline &&
        !canSwitchBranches &&
        !isLeadTransitionAllowed(fromStage.shortCode, toStage.shortCode)
      ) {
        const allowedCodes =
          ALLOWED_LEAD_TRANSITIONS[normalizeStageCode(fromStage.shortCode)] ?? []
        const allowedStages = allowedCodes
          .map((code) =>
            stages.find((s) => normalizeStageCode(s.shortCode) === code),
          )
          .filter((s): s is KanbanStage => !!s)
          .map((s) => ({ id: s.id, name: s.name, shortCode: s.shortCode }))
        setBlockedMove({
          fromStageName: fromStage.name,
          fromShortCode: fromStage.shortCode,
          toStageName: toStage.name,
          toShortCode: toStage.shortCode,
          allowedStages,
        })
        return
      }

      // Snapshot for rollback
      const previousStages = JSON.parse(JSON.stringify(stages)) as KanbanStage[]

      // Optimistic update
      const card = fromStage.opportunities.find((o) => o.id === draggableId)
      if (!card) return

      setLocalStages((prev) => {
        if (!prev) return prev
        return prev.map((stage) => {
          if (stage.id === source.droppableId) {
            return {
              ...stage,
              opportunities: stage.opportunities.filter((o) => o.id !== draggableId),
            }
          }
          if (stage.id === destination.droppableId) {
            const newOpps = [...stage.opportunities]
            newOpps.splice(destination.index, 0, {
              ...card,
              stageId: destination.droppableId,
              lastStageChangeAt: new Date(),
            })
            return { ...stage, opportunities: newOpps }
          }
          return stage
        })
      })

      const normalized = toStage.name.trim().toLowerCase()
      const requiresModal =
        normalized === 'confirmed for trial' ||
        normalized === 'enrolled' ||
        normalized === 'reschedule' ||
        normalized === 'cold lead'

      if (requiresModal) {
        // Show popup to collect trial date/slot or enrollment months
        setPendingMove({
          opportunityId: draggableId,
          branchId: card.branchId,
          fromStageId: source.droppableId,
          toStageId: destination.droppableId,
          fromStageName: fromStage.name,
          toStageName: toStage.name,
          previousStages,
        })
        resetStageExtras()
      } else {
        // Fire-and-forget move for every other stage (no confirmation needed)
        void (async () => {
          try {
            await moveMutation.mutateAsync({
              opportunityId: draggableId,
              toStageId: destination.droppableId,
            })
            toast.success(`Moved to ${toStage.name}`)
          } catch {
            setLocalStages(previousStages)
            toast.error('Failed to move opportunity')
          }
        })()
      }
    },
    [stages, moveMutation, pipelines, selectedPipelineId, canSwitchBranches, canEditLeads],
  )

  // Stage change kicked off from the OpportunityDetailModal's picker. The
  // dropdown there already filters out disallowed transitions (and admins
  // see every stage), so we don't re-run the blocked-move check here —
  // just mirror onDragEnd's optimistic update + modal-required branching.
  const handleStageChangeFromDetail = useCallback(
    (opportunityId: string, toStageId: string) => {
      const fromStage = stages.find((s) =>
        s.opportunities.some((o) => o.id === opportunityId),
      )
      const toStage = stages.find((s) => s.id === toStageId)
      if (!fromStage || !toStage || fromStage.id === toStage.id) return

      const card = fromStage.opportunities.find((o) => o.id === opportunityId)
      if (!card) return

      // Close the detail modal so a follow-up stage-change popup (CT/ENR/RSD/CL)
      // takes focus without overlapping the detail card.
      setDetailCard(null)

      const previousStages = JSON.parse(JSON.stringify(stages)) as KanbanStage[]

      setLocalStages((prev) => {
        if (!prev) return prev
        return prev.map((stage) => {
          if (stage.id === fromStage.id) {
            return {
              ...stage,
              opportunities: stage.opportunities.filter((o) => o.id !== opportunityId),
            }
          }
          if (stage.id === toStage.id) {
            return {
              ...stage,
              opportunities: [
                { ...card, stageId: toStage.id, lastStageChangeAt: new Date() },
                ...stage.opportunities,
              ],
            }
          }
          return stage
        })
      })

      const normalized = toStage.name.trim().toLowerCase()
      const requiresModal =
        normalized === 'confirmed for trial' ||
        normalized === 'enrolled' ||
        normalized === 'reschedule' ||
        normalized === 'cold lead'

      if (requiresModal) {
        setPendingMove({
          opportunityId,
          branchId: card.branchId,
          fromStageId: fromStage.id,
          toStageId,
          fromStageName: fromStage.name,
          toStageName: toStage.name,
          previousStages,
        })
        resetStageExtras()
      } else {
        void (async () => {
          try {
            await moveMutation.mutateAsync({ opportunityId, toStageId })
            toast.success(`Moved to ${toStage.name}`)
          } catch {
            setLocalStages(previousStages)
            toast.error('Failed to move opportunity')
          }
        })()
      }
    },
    [stages, moveMutation],
  )

  // Confirm move. When this is part of a bulk queue, the post-success branch
  // advances to the next lead's modal instead of closing the dialog.
  async function confirmMove() {
    if (!pendingMove || isConfirming) return
    setIsConfirming(true)

    const wasBulk = !!pendingMove.bulkProgress
    let moveSucceeded = false

    try {
      await moveMutation.mutateAsync({
        opportunityId: pendingMove.opportunityId,
        toStageId: pendingMove.toStageId,
        note: moveNote || undefined,
        trialDate: trialDate || undefined,
        trialTimeSlot: trialTimeSlot || undefined,
        enrollmentMonths,
        rescheduleDate: rescheduleDate || undefined,
      })
      moveSucceeded = true
      if (!wasBulk) toast.success('Opportunity moved')
    } catch {
      setLocalStages(pendingMove.previousStages)
      toast.error('Failed to move opportunity')
    } finally {
      setIsConfirming(false)
    }

    if (!moveSucceeded) {
      // Single-move failure or bulk-step failure — clear the modal but ALSO
      // abort any remaining bulk queue, since the user just saw an error.
      setPendingMove(null)
      if (wasBulk) {
        setBulkQueue(null)
      }
      resetStageExtras()
      return
    }

    if (!wasBulk || !bulkQueue) {
      setPendingMove(null)
      resetStageExtras()
      return
    }

    // Bulk step succeeded — advance to the next lead, or finish the queue.
    const [nextId, ...rest] = bulkQueue.remaining
    const completed = bulkQueue.completed + 1
    if (!nextId) {
      setPendingMove(null)
      setBulkQueue(null)
      setSelectedIds(new Set())
      resetStageExtras()
      toast.success(`Moved ${completed} opportunit${completed === 1 ? 'y' : 'ies'}`)
      void refetch()
      return
    }

    // Reset extras + open the modal for the next lead before clearing
    // pendingMove, so the modal stays mounted (no flicker) and just gets
    // a new payload + bulk-progress badge.
    resetStageExtras()
    setBulkQueue({
      remaining: rest,
      toStageId: bulkQueue.toStageId,
      completed,
      total: bulkQueue.total,
    })
    const opened = openBulkPendingFor(nextId, bulkQueue.toStageId, {
      current: completed + 1,
      total: bulkQueue.total,
    })
    if (!opened) {
      setPendingMove(null)
      setBulkQueue(null)
      toast.error('Bulk move aborted — could not locate the next lead')
    }
  }

  // Cancel move (rollback). Cancelling mid-bulk-queue stops the whole
  // sequence — any leads already moved stay moved, the rest are dropped.
  function cancelMove() {
    if (pendingMove) {
      setLocalStages(pendingMove.previousStages)
    }
    if (bulkQueue) {
      const moved = bulkQueue.completed
      setBulkQueue(null)
      setSelectedIds(new Set())
      if (moved > 0) {
        toast.success(`Moved ${moved} opportunit${moved === 1 ? 'y' : 'ies'} (cancelled rest)`)
        void refetch()
      } else {
        toast('Bulk move cancelled')
      }
    }
    setPendingMove(null)
    resetStageExtras()
  }

  // Open the stage-change modal for one specific opportunity inside a
  // bulk-move queue. Splits the snapshot/optimistic-update logic out so
  // both handleBulkMove (start) and confirmMove (advance) can call it.
  function openBulkPendingFor(opportunityId: string, toStageId: string, progress: { current: number; total: number }) {
    const fromStage = stages.find((s) => s.opportunities.some((o) => o.id === opportunityId))
    const toStage   = stages.find((s) => s.id === toStageId)
    if (!fromStage || !toStage) return false
    const card = fromStage.opportunities.find((o) => o.id === opportunityId)
    if (!card) return false

    const previousStages = JSON.parse(JSON.stringify(stages)) as KanbanStage[]
    // Optimistically pull the card out of its current column so the user can
    // see the progress visibly. The actual API call happens on confirm.
    setLocalStages((prev) => {
      if (!prev) return prev
      return prev.map((stage) => {
        if (stage.id === fromStage.id) {
          return { ...stage, opportunities: stage.opportunities.filter((o) => o.id !== opportunityId) }
        }
        if (stage.id === toStage.id) {
          return {
            ...stage,
            opportunities: [
              { ...card, stageId: toStage.id, lastStageChangeAt: new Date() },
              ...stage.opportunities,
            ],
          }
        }
        return stage
      })
    })

    const leadName = `${card.contact.firstName}${card.contact.lastName ? ' ' + card.contact.lastName : ''}`.trim() || '(No name)'
    setPendingMove({
      opportunityId,
      branchId: card.branchId,
      fromStageId: fromStage.id,
      toStageId,
      fromStageName: fromStage.name,
      toStageName: toStage.name,
      previousStages,
      bulkProgress: { leadName, current: progress.current, total: progress.total },
    })
    resetStageExtras()
    return true
  }

  // Bulk move. Stages that need extras (CT / Enrolled / Reschedule / Cold
  // Lead) route through the per-lead modal queue so each lead gets its own
  // date / slot / package / reason. Other stages take the fast bulk-endpoint
  // path because no extras are needed.
  //
  // Before doing anything we filter the selected leads against
  // ALLOWED_LEAD_TRANSITIONS — a CT lead can't bulk-move to FU1, an SU
  // lead can't bulk-move to NL, etc. Admins (canSwitchBranches) bypass.
  async function handleBulkMove(toStageId: string) {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return

    const toStage = stages.find((s) => s.id === toStageId)
    if (!toStage) {
      toast.error('Target stage not found')
      return
    }

    // ── Per-lead transition validation ──────────────────────────────────────
    // Build a map of opportunityId → currentStage. Then partition the selection
    // into authorised / unauthorised based on the lead-transition rules. Admins
    // pass everything through. HR / non-lead pipelines also pass through.
    const currentPipelineName = pipelines.find((p) => p.id === selectedPipelineId)?.name ?? ''
    const isLeadPipeline =
      !/recruitment/i.test(currentPipelineName) &&
      !currentPipelineName.startsWith('Ebright HR')
    const enforceRules = isLeadPipeline && !canSwitchBranches

    interface LeadByStage { id: string; fromStage: KanbanStage }
    const leadsByStage: LeadByStage[] = []
    for (const stage of stages) {
      for (const o of stage.opportunities) {
        if (ids.includes(o.id)) leadsByStage.push({ id: o.id, fromStage: stage })
      }
    }

    const authorised: string[] = []
    const rejected: Array<{ id: string; fromCode: string }> = []
    for (const l of leadsByStage) {
      // Same-stage moves are no-ops — drop them silently.
      if (l.fromStage.id === toStage.id) continue
      if (!enforceRules || isLeadTransitionAllowed(l.fromStage.shortCode, toStage.shortCode)) {
        authorised.push(l.id)
      } else {
        rejected.push({ id: l.id, fromCode: l.fromStage.shortCode })
      }
    }

    if (rejected.length > 0) {
      // Group by source short code so the toast reads "FU3, CT (3 rejected)"
      // instead of dumping every id. Branch managers can tell at a glance
      // which sub-set of their selection couldn't move.
      const byCode = new Map<string, number>()
      for (const r of rejected) byCode.set(r.fromCode, (byCode.get(r.fromCode) ?? 0) + 1)
      const summary = Array.from(byCode.entries())
        .map(([code, n]) => `${code}×${n}`)
        .join(', ')
      toast.error(
        `${rejected.length} lead${rejected.length === 1 ? '' : 's'} can't move to ${toStage.shortCode} (${summary}). Skipped.`,
        { duration: 6000 },
      )
    }

    if (authorised.length === 0) {
      toast('No leads eligible for this stage change')
      return
    }

    const normalized = toStage.name.trim().toLowerCase()
    const requiresModal =
      normalized === 'confirmed for trial' ||
      normalized === 'enrolled' ||
      normalized === 'reschedule' ||
      normalized === 'cold lead'

    if (!requiresModal) {
      try {
        const res = await fetch('/api/crm/opportunities/bulk/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ opportunityIds: authorised, toStageId }),
        })
        if (!res.ok) throw new Error('Bulk move failed')
        const data = (await res.json()) as { moved: number }
        toast.success(`Moved ${data.moved} opportunit${data.moved === 1 ? 'y' : 'ies'}`)
        setSelectedIds(new Set())
        void refetch()
      } catch {
        toast.error('Bulk move failed')
      }
      return
    }

    // Modal-required path: walk through each authorised lead sequentially.
    const remaining = [...authorised]
    const firstId = remaining.shift()
    if (!firstId) return
    setBulkQueue({ remaining, toStageId, completed: 0, total: authorised.length })
    const opened = openBulkPendingFor(firstId, toStageId, { current: 1, total: authorised.length })
    if (!opened) {
      setBulkQueue(null)
      toast.error('Could not open bulk move')
    }
  }

  // Bulk delete (soft-delete; recoverable from the database via deletedAt).
  // The CONFIRM-typed dialog gates the actual call; this just opens it.
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeletePending, setBulkDeletePending] = useState(false)

  function openBulkDelete() {
    if (selectedIds.size === 0) return
    setBulkDeleteOpen(true)
  }

  async function confirmBulkDelete() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) {
      setBulkDeleteOpen(false)
      return
    }
    setBulkDeletePending(true)
    try {
      const res = await fetch('/api/crm/opportunities/bulk/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityIds: ids }),
      })
      if (!res.ok) throw new Error('Bulk delete failed')
      const data = (await res.json()) as { deleted: number }
      toast.success(`Deleted ${data.deleted} opportunit${data.deleted === 1 ? 'y' : 'ies'}`)
      setSelectedIds(new Set())
      setBulkDeleteOpen(false)
      void refetch()
    } catch {
      toast.error('Bulk delete failed')
    } finally {
      setBulkDeletePending(false)
    }
  }

  // Toggle one card's selection state (called from KanbanCard's checkbox).
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Select (or, if already all-selected, deselect) every lead in a stage —
  // driven by the per-column header checkbox in bulk mode.
  function toggleStageSelect(oppIds: string[]) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const allSelected = oppIds.length > 0 && oppIds.every((id) => next.has(id))
      if (allSelected) oppIds.forEach((id) => next.delete(id))
      else oppIds.forEach((id) => next.add(id))
      return next
    })
  }

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId)

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-white dark:bg-slate-900">
      {/* Top actions bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-700">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {/* Count must match the cards rendered. Use filteredStages — which
              has the week-filter and any other client-side filters applied —
              not the raw `data` from the API. */}
          {filteredStages.reduce((acc, s) => acc + s.opportunities.length, 0)} opportunities
        </span>
        {/* Creating a lead is read-only for AGENCY_ADMIN; the 3-dot menu
            (Export / Reset card) is available to everyone. */}
        <div className="flex items-center gap-2">
          {canEditLeads && (
            <button
              type="button"
              onClick={() => setShowNewOpportunity(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition"
            >
              <Plus className="h-4 w-4" />
              New Opportunity
            </button>
          )}
          <KanbanActionsMenu
            shownIds={filteredStages.flatMap((s) => s.opportunities.map((o) => o.id))}
            onResetCard={() => { setCardPrefs(DEFAULT_CARD_PREFS); saveCardPrefs(DEFAULT_CARD_PREFS) }}
          />
        </div>
      </div>

      {/* Filters */}
      <FiltersBar
        pipelines={pipelines}
        selectedPipelineId={selectedPipelineId}
        onPipelineChange={setSelectedPipelineId}
        search={searchInput}
        onSearchChange={setSearchInput}
        selectedBranchId={selectedBranchId}
        onBranchChange={setSelectedBranchId}
        branches={branches}
        canSwitchPipelines={canSwitchBranches}
        // Lock the pipeline dropdown when the topbar branch view is set to a
        // specific branch — otherwise the user could override their own scope.
        pipelineLocked={!!contextBranch}
        weekFilter={weekFilter}
        onWeekFilterChange={setWeekFilter}
        dateBasis={dateBasis}
        onDateBasisChange={setDateBasis}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
        sourceFilter={sourceFilter}
        onSourceFilterChange={setSourceFilter}
        sourceOptions={sourceOptions}
        ageFilter={ageFilter}
        onAgeFilterChange={setAgeFilter}
        tagFilter={tagFilter}
        onTagFilterChange={setTagFilter}
        tagOptions={tagOptions}
        onOpenCustomiseCard={() => setCustomiseOpen(true)}
      />

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          stages={filteredStages}
          onMoveAll={handleBulkMove}
          onDeleteAll={openBulkDelete}
          onClear={() => setSelectedIds(new Set())}
          canEditLeads={canEditLeads}
          canDeleteLeads={canDeleteLeads}
        />
      )}

      {/* Bulk-delete CONFIRM dialog */}
      <DeleteConfirmDialog
        open={bulkDeleteOpen}
        count={selectedIds.size}
        loading={bulkDeletePending}
        onClose={() => !bulkDeletePending && setBulkDeleteOpen(false)}
        onConfirm={confirmBulkDelete}
      />

      {/* Board — scrolls horizontally between stages; each column scrolls its
          own card list vertically (so the stage header stays put). */}
      <div className="cns-scroll flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        ) : isError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">
            <p className="text-sm">Failed to load kanban board.</p>
            <button
              onClick={() => refetch()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : filteredStages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-slate-400 text-sm">
            No stages found for this pipeline.
          </div>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex h-full gap-4 p-4 items-stretch">
              {filteredStages.map((stage) => (
                <KanbanColumn
                  key={stage.id}
                  stage={stage}
                  selectedIds={selectedIds}
                  onAddCard={(stageId) => setAddCardStageId(stageId)}
                  onCardClick={setDetailCard}
                  onToggleSelect={toggleSelect}
                  onToggleStage={toggleStageSelect}
                  cardPrefs={cardPrefs}
                  filterKey={filterKey}
                />
              ))}
            </div>
          </DragDropContext>
        )}
      </div>

      {/* Stage change modal */}
      {pendingMove && (
        <StageChangeModal
          branchId={pendingMove.branchId}
          fromStageName={pendingMove.fromStageName}
          toStageName={pendingMove.toStageName}
          note={moveNote}
          onNoteChange={setMoveNote}
          trialDate={trialDate}
          trialTimeSlot={trialTimeSlot}
          enrollmentMonths={enrollmentMonths}
          rescheduleDate={rescheduleDate}
          onTrialDateChange={setTrialDate}
          onTrialTimeSlotChange={setTrialTimeSlot}
          onEnrollmentMonthsChange={setEnrollmentMonths}
          onRescheduleDateChange={setRescheduleDate}
          onConfirm={confirmMove}
          onCancel={cancelMove}
          isPending={isConfirming}
          bulkProgress={pendingMove.bulkProgress}
        />
      )}

      {/* Create opportunity modal — from stage "+" button */}
      {addCardStageId && selectedPipeline && (
        <OpportunityModal
          pipelines={[selectedPipeline]}
          users={users}
          defaultPipelineId={selectedPipelineId}
          defaultStageId={addCardStageId}
          onClose={() => setAddCardStageId(null)}
          onSuccess={() => void refetch()}
        />
      )}

      {/* Create opportunity modal — from top bar button (full pipeline picker) */}
      {showNewOpportunity && (
        <OpportunityModal
          pipelines={pipelines}
          users={users}
          defaultPipelineId={
            selectedPipelineId.startsWith('all:') ? pipelines.find((p) => !p.id.startsWith('all:'))?.id : selectedPipelineId
          }
          onClose={() => setShowNewOpportunity(false)}
          onSuccess={() => void refetch()}
        />
      )}

      {/* Card detail modal — opens when a kanban card is clicked */}
      {detailCard && (() => {
        const currentPipelineName = pipelines.find((p) => p.id === selectedPipelineId)?.name ?? ''
        const isLeadPipeline =
          !/recruitment/i.test(currentPipelineName) &&
          !currentPipelineName.startsWith('Ebright HR')
        // Admins bypass the rule map; non-lead pipelines (HR Recruitment) have
        // no enforced flow chart so anything goes there too.
        const canBypassRules = canSwitchBranches || !isLeadPipeline
        return (
          <OpportunityDetailModal
            opportunity={detailCard}
            stageName={stages.find((s) => s.id === detailCard.stageId)?.name ?? '—'}
            stageShortCode={stages.find((s) => s.id === detailCard.stageId)?.shortCode ?? ''}
            branchName={branches.find((b) => b.id === detailCard.branchId)?.name ?? null}
            canDelete={canDeleteLeads}
            pipelineStages={stages.map((s) => ({
              id: s.id,
              name: s.name,
              shortCode: s.shortCode,
              order: s.order,
            }))}
            canBypassRules={canBypassRules}
            isSuperAdmin={canDeleteLeads}
            onChangeStage={(toStageId) => handleStageChangeFromDetail(detailCard.id, toStageId)}
            onChanged={() => void refetch()}
            onClose={() => setDetailCard(null)}
          />
        )
      })()}

      {/* Invalid-transition warning popup — shown when a non-admin drags a
          lead to a stage that isn't allowed by the pipeline flow chart. */}
      {blockedMove && (
        <TransitionBlockedModal
          fromStageName={blockedMove.fromStageName}
          fromShortCode={blockedMove.fromShortCode}
          toStageName={blockedMove.toStageName}
          toShortCode={blockedMove.toShortCode}
          allowedStages={blockedMove.allowedStages}
          onClose={() => setBlockedMove(null)}
        />
      )}

      {/* Customise Card drawer — GHL-style field picker for the kanban cards.
          Persists per browser via localStorage. */}
      <CustomiseCardDrawer
        open={customiseOpen}
        value={cardPrefs}
        onClose={() => setCustomiseOpen(false)}
        onApply={(next) => {
          setCardPrefs(next)
          saveCardPrefs(next)
          setCustomiseOpen(false)
        }}
      />
    </div>
  )
}

// ─── Opportunity detail modal ─────────────────────────────────────────────────

type StageLite = { id: string; name: string; shortCode: string; order: number }
type HistoryEntry = {
  id: string
  changedAt: string | Date
  toStage: StageLite | null
  fromStage: StageLite | null
  /** Stage-change remark / note text recorded by the BM at move time. */
  note?: string | null
}

/**
 * Build the lead's actual journey from stage-history rows. We walk the history
 * in chronological order and keep each new toStage encountered. If the current
 * stage isn't in the history (stale/inconsistent data) we append it so the
 * strip always ends on where the lead is right now.
 */
function buildJourneyFromHistory(
  history: HistoryEntry[] | undefined,
  currentStage: StageLite | undefined,
  currentStageId: string,
): { stages: StageLite[]; currentIdx: number } {
  const stages: StageLite[] = []
  const seen = new Set<string>()

  if (history && history.length > 0) {
    // Incoming history is ordered desc by changedAt — reverse for chronology.
    const chronological = [...history].reverse()
    for (const h of chronological) {
      const s = h.toStage
      if (!s) continue
      if (seen.has(s.id)) continue
      seen.add(s.id)
      stages.push(s)
    }
  }

  // Ensure the current stage ends the journey, even if history lacks it.
  if (currentStage && !seen.has(currentStage.id)) {
    stages.push(currentStage)
    seen.add(currentStage.id)
  }

  let currentIdx = stages.findIndex((s) => s.id === currentStageId)
  if (currentIdx === -1 && stages.length > 0) {
    // Defensive — if IDs don't line up, highlight the last stage we know of.
    currentIdx = stages.length - 1
  }
  return { stages, currentIdx }
}

function OpportunityDetailModal({
  opportunity,
  stageName,
  stageShortCode,
  branchName,
  canDelete,
  pipelineStages,
  canBypassRules,
  isSuperAdmin = false,
  onChangeStage,
  onChanged,
  onClose,
}: {
  opportunity: OpportunityCard
  stageName: string
  stageShortCode: string
  /** Resolved from the kanban's branch list. Null when not found (e.g. branch deleted). */
  branchName: string | null
  canDelete: boolean
  /** All stages in the current pipeline — used to populate the stage picker. */
  pipelineStages: StageLite[]
  /** True for admins (canSwitchBranches) and non-lead pipelines (no enforced flow). */
  canBypassRules: boolean
  /** SUPER_ADMIN only — surfaces the "Admin" action panel (trial/package/week edits). */
  isSuperAdmin?: boolean
  /** Fires when the user picks a new stage in the dropdown. The parent
   *  handles the optimistic update + popup-or-fire decision. */
  onChangeStage: (toStageId: string) => void
  /** Fires after an admin edit so the board refetches. */
  onChanged?: () => void
  onClose: () => void
}) {
  const { contact } = opportunity
  const childOwnName = `${contact.firstName} ${contact.lastName ?? ''}`.trim()
  // With master_leads_base as source of truth, the contact IS the child when
  // parentFullName is set. Header shows the child; the Contact section reveals
  // the parent details (the user's "click the card to see parent" requirement).
  const isChild = !!contact.parentFullName
  const headerName = childOwnName || '(No name)'
  const parentName = isChild ? (contact.parentFullName ?? '—') : childOwnName

  const { data: full, isLoading: loadingFull } = useOpportunity(opportunity.id) as {
    data: {
      stage?: StageLite
      stageId?: string
      stageHistory?: HistoryEntry[]
      contact?: {
        id: string
        /** Parent's free-text remarks from the registration/Wix form. */
        remarks?: string | null
        /** Raw source label captured on import (e.g. "roadshow") — shown in
         *  parentheses after the normalised source name. */
        leadSourceDetail?: string | null
        notes?: Array<{
          id: string
          body: string
          createdAt: string | Date
          user: { id: string; name: string | null; email: string } | null
        }>
        /** Latest Trial Class appointment surfaced as a timeslot pill. */
        appointments?: Array<{ id: string; startAt: string | Date }>
      }
    } | undefined
    isLoading: boolean
  }
  const notes = full?.contact?.notes ?? []
  const formRemarks = (full?.contact?.remarks ?? '').trim()
  // Source label: normalised bucket from the kanban payload, annotated with the
  // raw source detail when the import captured one and it adds information
  // beyond the bucket name — e.g. "Others (roadshow)". The detail arrives on
  // the full-opportunity fetch (getOpportunityById includes all contact
  // scalars), so it fills in once that settles.
  const sourceName = contact.leadSource?.name ?? ''
  const sourceDetail = (full?.contact?.leadSourceDetail ?? '').trim()
  const sourceLabel =
    sourceDetail && sourceDetail.toLowerCase() !== sourceName.toLowerCase()
      ? `${sourceName} (${sourceDetail})`
      : sourceName
  // Stage remarks history — every prior stage move with a non-empty note.
  // Newest-first so the most recent context is at the top of the section.
  const stageRemarks = (full?.stageHistory ?? [])
    .filter((h) => !!h.note && h.note.trim().length > 0)
    .map((h) => ({
      id:        h.id,
      changedAt: h.changedAt,
      note:      h.note ?? '',
      toStage:   h.toStage,
      fromStage: h.fromStage,
    }))
  // Prefer the detail API's stage — in the "All Branches" aggregate view the
  // parent's stage lookup uses reference-pipeline IDs that won't match the
  // opportunity's own stageId.
  const currentStageId = full?.stageId ?? opportunity.stageId
  const displayStageName = full?.stage?.name ?? (stageName !== '—' ? stageName : '')
  const displayShortCode = full?.stage?.shortCode ?? stageShortCode
  const journey = buildJourneyFromHistory(full?.stageHistory, full?.stage, currentStageId)

  // Trial timeslot — prefer the detail-API copy, fall back to the kanban-card
  // copy already on `opportunity.contact.appointments` so the pill renders
  // immediately on first paint even before the detail fetch settles.
  // Gated to RSD / CT / SU / SG stages: those are the only states where
  // the appointment is the "active" datum to show in the header.
  const TIMESLOT_VISIBLE_STAGES = new Set(['RSD', 'CT', 'SU', 'SG'])
  const stageAllowsTimeslot = TIMESLOT_VISIBLE_STAGES.has(
    normalizeStageCode(displayShortCode ?? ''),
  )
  const trialAppt =
    stageAllowsTimeslot
      ? full?.contact?.appointments?.[0] ??
        (opportunity.contact as unknown as { appointments?: Array<{ id: string; startAt: string | Date }> })
          .appointments?.[0] ??
        null
      : null

  const deleteMutation = useDeleteOpportunity()
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [adminTab, setAdminTab] = useState<'details' | 'action'>('details')
  const queryClient = useQueryClient()
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  // Inline student-details editor — toggled by the pencil in the Student
  // header. Form values are seeded from the current contact every time the
  // editor opens so Cancel + reopen always shows the latest server state.
  const [isEditingStudent, setIsEditingStudent] = useState(false)
  const [studentDraft, setStudentDraft] = useState({
    firstName:      '',
    lastName:       '',
    childAge1:      '',
    parentFullName: '',
  })
  const [savingStudent, setSavingStudent] = useState(false)

  function openStudentEditor() {
    setStudentDraft({
      firstName:      contact.firstName,
      lastName:       contact.lastName ?? '',
      childAge1:      (contact as unknown as { childAge1?: string | null }).childAge1 ?? '',
      parentFullName: contact.parentFullName ?? '',
    })
    setIsEditingStudent(true)
  }

  async function handleSaveStudent() {
    if (savingStudent) return
    const firstName = studentDraft.firstName.trim()
    if (!firstName) {
      toast.error('Student first name is required')
      return
    }
    setSavingStudent(true)
    try {
      const res = await fetch(`/api/crm/contacts/${contact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName:       studentDraft.lastName.trim() || undefined,
          childAge1:      studentDraft.childAge1.trim() || undefined,
          parentFullName: studentDraft.parentFullName.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? 'Failed to save')
      }
      toast.success('Student details updated')
      setIsEditingStudent(false)
      // Refresh both the detail fetch and the kanban so the card label updates.
      void queryClient.invalidateQueries({ queryKey: opportunityKeys.detail(opportunity.id) })
      void queryClient.invalidateQueries({ queryKey: opportunityKeys.all })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSavingStudent(false)
    }
  }

  async function handleAddNote() {
    const body = noteText.trim()
    if (!body || savingNote) return
    setSavingNote(true)
    try {
      const res = await fetch(`/api/crm/contacts/${contact.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      if (!res.ok) throw new Error('Failed to save')
      setNoteText('')
      // Refetch the opportunity so the new note appears immediately.
      void queryClient.invalidateQueries({ queryKey: opportunityKeys.detail(opportunity.id) })
      toast.success('Note added')
    } catch {
      toast.error('Failed to add note')
    } finally {
      setSavingNote(false)
    }
  }

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync(opportunity.id)
      setConfirmDeleteOpen(false)
      onClose()
    } catch {
      // useDeleteOpportunity already toasts on failure — stay open so the user
      // can retry or cancel.
    }
  }

  const children: Array<{ name: string; age: string | null }> = []
  for (const i of [1, 2, 3, 4] as const) {
    const name = (contact as unknown as Record<string, string | null>)[`childName${i}`]
    const age = (contact as unknown as Record<string, string | null>)[`childAge${i}`]
    if (name) children.push({ name, age })
  }

  // Stages this lead is allowed to move into next. We match by shortCode (not
  // stage.id) because in the All-Branches aggregate view the opportunity's
  // own stageId points to its branch's pipeline, while pipelineStages here
  // comes from the agency-reference pipeline — the IDs won't line up but the
  // short codes are canonical across every branch.
  const allowedToStages = useMemo<StageLite[]>(() => {
    const normalizedCurrent = displayShortCode ? normalizeStageCode(displayShortCode) : ''
    if (!normalizedCurrent) return []
    if (canBypassRules) {
      return pipelineStages
        .filter((s) => normalizeStageCode(s.shortCode) !== normalizedCurrent)
        .slice()
        .sort((a, b) => a.order - b.order)
    }
    const allowedCodes = ALLOWED_LEAD_TRANSITIONS[normalizedCurrent]
    if (!allowedCodes || allowedCodes.length === 0) return []
    return pipelineStages
      .filter((s) => allowedCodes.includes(normalizeStageCode(s.shortCode)))
      .slice()
      .sort((a, b) => a.order - b.order)
  }, [pipelineStages, displayShortCode, canBypassRules])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={cn('relative z-10 flex w-full max-h-[85vh] overflow-hidden rounded-xl bg-white shadow-2xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900', isSuperAdmin ? 'max-w-3xl' : 'max-w-lg')}>
        {/* Super-admin sidebar — Details | Action */}
        {isSuperAdmin && (
          <nav className="flex w-32 shrink-0 flex-col gap-1 border-r border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
            <div className="mb-1 flex items-center gap-1 px-1 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              <ShieldAlert className="h-3 w-3" /> Super Admin
            </div>
            {([['details', 'Details', Info], ['action', 'Action', Settings2]] as const).map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setAdminTab(key)}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition',
                  adminTab === key ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                )}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </nav>
        )}
        {/* Content column */}
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-700 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">{headerName}</h2>
              {displayShortCode && (
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold tracking-wider text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-200">
                  {displayShortCode}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Stage: {displayStageName || (loadingFull ? 'Loading…' : '—')}
            </p>
            {/* Trial timeslot pill — only shown once a CT appointment exists. */}
            {trialAppt && (() => {
              const startAt = new Date(trialAppt.startAt)
              return (
                <div className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  <CalendarDays className="h-3 w-3" />
                  Trial: {startAt.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' })}
                  {' @ '}
                  {startAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}
                </div>
              )
            })()}
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — Details view (hidden when the Action tab is active) */}
        <div className={cn('space-y-4 px-5 py-4 text-sm', isSuperAdmin && adminTab === 'action' && 'hidden')}>
          {/* Journey — actual stages this lead has been dragged through */}
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Journey
            </h3>
            {loadingFull ? (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading history…
              </div>
            ) : journey.stages.length === 0 ? (
              <p className="text-xs italic text-slate-500 dark:text-slate-400">
                No stage history yet.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
                {journey.stages.map((s, i) => (
                  <span key={s.id} className="inline-flex items-center">
                    {i > 0 && (
                      <span className="px-0.5 text-xs leading-none text-slate-300 dark:text-slate-600">
                        ›
                      </span>
                    )}
                    <span
                      title={s.name}
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-bold leading-none tracking-wider',
                        i === journey.currentIdx
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : i < journey.currentIdx || journey.currentIdx === -1
                            ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                            : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500',
                      )}
                    >
                      {s.shortCode}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Stage Remarks — every prior stage move with a non-empty note.
              Lets a BM scan past context (why the lead was dropped, what the
              trial outcome was, etc.) without leaving the modal. */}
          {!loadingFull && stageRemarks.length > 0 && (
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Stage remarks ({stageRemarks.length})
              </h3>
              <ul className="space-y-1.5">
                {stageRemarks.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50"
                  >
                    <div className="mb-0.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {r.fromStage && (
                        <>
                          <span>{r.fromStage.shortCode}</span>
                          <ArrowRight className="h-2.5 w-2.5" />
                        </>
                      )}
                      {r.toStage && <span className="text-indigo-600 dark:text-indigo-300">{r.toStage.shortCode}</span>}
                      <span className="ml-auto normal-case tracking-normal text-slate-400">
                        {new Date(r.changedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-slate-900 dark:text-slate-100">
                      {r.note}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Move to stage — rule-filtered picker. Hidden when the modal is
              still loading the full opportunity (so we don't pre-fill from
              stale data) or when there are no valid transitions. */}
          {!loadingFull && (
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Move to stage
              </h3>
              {allowedToStages.length === 0 ? (
                <p className="text-xs italic text-slate-500 dark:text-slate-400">
                  {canBypassRules
                    ? 'No other stages available in this pipeline.'
                    : 'This is a terminal stage — no further moves are allowed from here.'}
                </p>
              ) : (
                <div className="flex items-center gap-2">
                  <MoveRight className="h-4 w-4 shrink-0 text-indigo-500" />
                  <select
                    value=""
                    onChange={(e) => {
                      const id = e.target.value
                      if (id) onChangeStage(id)
                    }}
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white [&>option]:bg-white [&>option]:text-slate-900 dark:[&>option]:bg-slate-800 dark:[&>option]:text-slate-100"
                    aria-label="Move this lead to a different stage"
                  >
                    <option value="">Pick a stage to move this lead to…</option>
                    {allowedToStages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.shortCode} — {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </section>
          )}

          {/* Student & Parent — editable. BMs / super-admins can fix
              misimported leads (parent name where the child name should
              be, missing age, etc.). The API allows any authenticated
              tenant user; granular role gating sits at the resolveSession
              level inside the contacts endpoint. */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Student & Parent
              </h3>
              {!isEditingStudent && (
                <button
                  type="button"
                  onClick={openStudentEditor}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
                >
                  <PenLine className="h-3 w-3" /> Edit
                </button>
              )}
            </div>
            {isEditingStudent ? (
              <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 dark:border-indigo-900/40 dark:bg-indigo-950/20">
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Student first name *</span>
                    <input
                      type="text"
                      value={studentDraft.firstName}
                      onChange={(e) => setStudentDraft((d) => ({ ...d, firstName: e.target.value }))}
                      disabled={savingStudent}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Last name</span>
                    <input
                      type="text"
                      value={studentDraft.lastName}
                      onChange={(e) => setStudentDraft((d) => ({ ...d, lastName: e.target.value }))}
                      disabled={savingStudent}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Student age</span>
                  <input
                    type="text"
                    placeholder='e.g. "10" or "10-12 years old"'
                    value={studentDraft.childAge1}
                    onChange={(e) => setStudentDraft((d) => ({ ...d, childAge1: e.target.value }))}
                    disabled={savingStudent}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Parent name</span>
                  <input
                    type="text"
                    value={studentDraft.parentFullName}
                    onChange={(e) => setStudentDraft((d) => ({ ...d, parentFullName: e.target.value }))}
                    disabled={savingStudent}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  />
                </label>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsEditingStudent(false)}
                    disabled={savingStudent}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveStudent()}
                    disabled={savingStudent || !studentDraft.firstName.trim()}
                    className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {savingStudent && <Loader2 className="h-3 w-3 animate-spin" />}
                    {savingStudent ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5">
                <div className="text-slate-500 dark:text-slate-400">Student</div>
                <div className="text-slate-900 dark:text-slate-100">
                  {isChild ? childOwnName : (contact.firstName + (contact.lastName ? ' ' + contact.lastName : ''))}
                  {(contact as unknown as { childAge1?: string | null }).childAge1 && (
                    <span className="ml-2 text-xs text-slate-500">
                      ({(contact as unknown as { childAge1?: string | null }).childAge1})
                    </span>
                  )}
                </div>
                <div className="text-slate-500 dark:text-slate-400">Parent</div>
                <div className="text-slate-900 dark:text-slate-100">
                  {isChild ? (contact.parentFullName ?? '—') : (contact.firstName + (contact.lastName ? ' ' + contact.lastName : ''))}
                </div>
              </div>
            )}
          </section>

          {/* Contact */}
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Contact
            </h3>
            <div className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5">
              <div className="text-slate-500 dark:text-slate-400">Parent</div>
              <div className="text-slate-900 dark:text-slate-100">{parentName || '—'}</div>
              {isChild && (
                <>
                  <div className="text-slate-500 dark:text-slate-400">Child</div>
                  <div className="text-slate-900 dark:text-slate-100">{childOwnName || '—'}</div>
                </>
              )}
              <div className="text-slate-500 dark:text-slate-400">Email</div>
              <div className="text-slate-900 dark:text-slate-100">{contact.email ?? '—'}</div>
              <div className="text-slate-500 dark:text-slate-400">Parent&apos;s Contact</div>
              <div className="text-slate-900 dark:text-slate-100">{contact.phone ?? '—'}</div>
              {contact.leadSource && (
                <>
                  <div className="text-slate-500 dark:text-slate-400">Source</div>
                  <div className="text-slate-900 dark:text-slate-100">{sourceLabel}</div>
                </>
              )}
              <div className="text-slate-500 dark:text-slate-400">Campaign</div>
              <div className="text-slate-900 dark:text-slate-100">{contact.campaignName || '-'}</div>
              <div className="text-slate-500 dark:text-slate-400">Created On</div>
              <div className="text-slate-900 dark:text-slate-100">{formatDateTime(opportunity.createdAt)}</div>
            </div>
          </section>

          {/* Children */}
          {children.length > 0 && (
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {children.length === 1 ? 'Child' : `Children (${children.length})`}
              </h3>
              <ul className="space-y-1.5">
                {children.map((c, i) => {
                  const category = getAgeCategory(c.age)
                  return (
                    <li key={i} className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                        {i + 1}
                      </span>
                      <span className="flex-1 truncate font-medium text-slate-900 dark:text-slate-100">{c.name}</span>
                      {c.age && (
                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                          {formatChildAge(c.age)}
                        </span>
                      )}
                      {category && (
                        <span
                          title={`Category: ${category}`}
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                            ageCategoryClasses(category),
                          )}
                        >
                          {category}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {/* Tags */}
          {contact.contactTags.length > 0 && (
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Tags
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {contact.contactTags.map(({ tag }) => (
                  <span
                    key={tag.id}
                    className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                    style={{ backgroundColor: tag.color }}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Parent's form remarks — the free-text the parent typed on the
              registration/Wix form, stored on the contact. Read-only. */}
          {formRemarks && (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <PenLine className="h-3 w-3" /> Remarks from form
              </h3>
              <p className="whitespace-pre-wrap rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-slate-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-slate-100">
                {formRemarks}
              </p>
            </section>
          )}

          {/* Notes — branch managers asked for an inline place to drop
              call/follow-up context without leaving the kanban. Posts to
              the existing /api/crm/contacts/[id]/notes POST endpoint. */}
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <PenLine className="h-3 w-3" /> Notes
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void handleAddNote()
              }}
              className="space-y-2"
            >
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note about this lead…"
                rows={2}
                disabled={savingNote}
                className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!noteText.trim() || savingNote}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingNote && <Loader2 className="h-3 w-3 animate-spin" />}
                  {savingNote ? 'Saving…' : 'Add note'}
                </button>
              </div>
            </form>

            {notes.length === 0 ? (
              <p className="mt-3 text-xs italic text-slate-500 dark:text-slate-400">
                No notes yet.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {notes.map((n) => (
                  <li
                    key={n.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50"
                  >
                    <p className="whitespace-pre-wrap text-sm text-slate-900 dark:text-slate-100">
                      {n.body}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                      {n.user?.name ?? n.user?.email ?? 'Unknown'}
                      {' · '}
                      {formatDate(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Meta */}
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Opportunity
            </h3>
            <div className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5">
              {branchName && (
                <>
                  <div className="text-slate-500 dark:text-slate-400">Branch</div>
                  <div className="text-slate-900 dark:text-slate-100">{branchName}</div>
                </>
              )}
              <div className="text-slate-500 dark:text-slate-400">Last moved</div>
              <div className="text-slate-900 dark:text-slate-100">
                {formatDate(opportunity.lastStageChangeAt)}
              </div>
              {opportunity.assignedUser && (
                <>
                  <div className="text-slate-500 dark:text-slate-400">Owner</div>
                  <div className="text-slate-900 dark:text-slate-100">
                    {opportunity.assignedUser.name ?? opportunity.assignedUser.email}
                  </div>
                </>
              )}
              {Number(opportunity.value) > 0 && (
                <>
                  <div className="text-slate-500 dark:text-slate-400">Value</div>
                  <div className="text-slate-900 dark:text-slate-100">{formatMYR(Number(opportunity.value))}</div>
                </>
              )}
            </div>
          </section>
        </div>

        {/* Action view (super-admin) — re-bucket week, edit trial/package/RSD */}
        {isSuperAdmin && adminTab === 'action' && (
          <div className="px-5 py-4">
            <LeadActionContent opportunityId={opportunity.id} onChanged={() => onChanged?.()} />
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-700 px-5 py-4">
          {canDelete ? (
            <button
              onClick={() => setConfirmDeleteOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              <Trash2 className="h-4 w-4" /> Delete lead
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={onClose}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Close
          </button>
        </div>
        </div>
      </div>

      {/* CONFIRM-typed delete dialog — same component used by bulk delete. */}
      <DeleteConfirmDialog
        open={confirmDeleteOpen}
        count={1}
        loading={deleteMutation.isPending}
        onClose={() => !deleteMutation.isPending && setConfirmDeleteOpen(false)}
        onConfirm={handleDelete}
      />
    </div>
  )
}

// ─── Invalid-transition warning modal ─────────────────────────────────────────

function TransitionBlockedModal({
  fromStageName,
  fromShortCode,
  toStageName,
  toShortCode,
  allowedStages,
  onClose,
}: {
  fromStageName: string
  fromShortCode: string
  toStageName: string
  toShortCode: string
  allowedStages: Array<{ id: string; name: string; shortCode: string }>
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="transition-blocked-title"
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md rounded-xl border border-amber-200 bg-white shadow-2xl dark:border-amber-800/60 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2
              id="transition-blocked-title"
              className="text-base font-semibold text-slate-900 dark:text-white"
            >
              Invalid stage transition
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Leads must follow the pipeline flow — you can&apos;t skip ahead.
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-3 px-5 py-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="flex-1 truncate rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-center text-xs font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {fromStageName}
              <span className="ml-1 text-slate-400">({fromShortCode})</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-red-500" />
            <span className="flex-1 truncate rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-center text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {toStageName}
              <span className="ml-1">({toShortCode})</span>
            </span>
          </div>

          {allowedStages.length > 0 ? (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                From {fromShortCode}, this lead can only move to:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {allowedStages.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                    title={s.name}
                  >
                    <span className="font-bold">{s.shortCode}</span>
                    <span className="opacity-75">— {s.name}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs italic text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              This is a terminal stage — no further moves are allowed.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-slate-200 px-5 py-3 dark:border-slate-700">
          <button
            onClick={onClose}
            autoFocus
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-700 active:bg-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
          >
            Acknowledge
          </button>
        </div>
      </div>
    </div>
  )
}
