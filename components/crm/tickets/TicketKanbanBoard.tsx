'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/crm/utils'
import { formatDistanceToNow } from 'date-fns'
import { useBranchContext } from '@/components/crm/branch-context'
import { crmBranchToTktBranchNumber } from '@/lib/crm/branch-number'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PlatformOption {
  id: string
  name: string
  slug: string
  code: string
  accentColor: string
}

// Department options for the "Others" platform — must match the values
// stored in tkt_ticket.sub_type when the user picks Others on step 2 of
// the new-ticket flow (see DEPARTMENT_CARDS in TicketForm.tsx).
const DEPARTMENT_FILTER_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'ceo',             label: 'CEO' },
  { value: 'optimisation',    label: 'Optimisation' },
  { value: 'finance',         label: 'Finance' },
  { value: 'human_resource',  label: 'Human Resource' },
  { value: 'operation',       label: 'Operation' },
  { value: 'academy',         label: 'Academy' },
  { value: 'marketing',       label: 'Marketing' },
]

export interface TicketCard {
  id: string
  ticketNumber: string
  status: string
  subType: string
  createdAt: string
  platform: PlatformOption
  branch: { id: string; name: string; branchNumber: string; code: string }
}

interface TicketKanbanBoardProps {
  tickets: TicketCard[]
  platforms: PlatformOption[]
}

// ─── Stage definitions ───────────────────────────────────────────────────────
// Status keys must match tkt_ticket.status values; labels come from the
// product spec.

const STAGES: Array<{ key: string; label: string; color: string }> = [
  { key: 'received',    label: 'New Ticket Received', color: 'bg-slate-500'  },
  { key: 'approved',    label: 'Approved',            color: 'bg-blue-500'   },
  { key: 'rejected',    label: 'Rejected',            color: 'bg-red-500'    },
  { key: 'in_progress', label: 'In Progress',         color: 'bg-amber-500'  },
  { key: 'complete',    label: 'Finish',              color: 'bg-emerald-500'},
]

// ─── Component ───────────────────────────────────────────────────────────────

export function TicketKanbanBoard({ tickets: initialTickets, platforms }: TicketKanbanBoardProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { selectedBranch } = useBranchContext()
  const [tickets, setTickets] = useState<TicketCard[]>(initialTickets)
  const [platformId, setPlatformId] = useState<string>('all')
  // When the user selects the "Others" platform, an extra Department filter
  // appears (CEO / Optimisation / Finance / …). 'all' = no department filter.
  const [department, setDepartment] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [moving, setMoving] = useState<string | null>(null)

  const selectedPlatform = useMemo(
    () => platforms.find((p) => p.id === platformId) ?? null,
    [platforms, platformId],
  )
  const isOthersPlatform =
    selectedPlatform?.slug === 'other' || selectedPlatform?.slug === 'others'

  // Sync the URL `?branch=NN` with the topbar branch switcher. Server-side
  // page reads this param and pre-filters tickets at fetch time. When the
  // branch changes we navigate so the page re-fetches with the new scope.
  useEffect(() => {
    const targetBranch = crmBranchToTktBranchNumber(selectedBranch?.name)
    const currentBranch = searchParams.get('branch')
    if (targetBranch === currentBranch) return
    if (targetBranch === null && currentBranch === null) return
    const next = new URLSearchParams(searchParams.toString())
    if (targetBranch) {
      next.set('branch', targetBranch)
    } else {
      next.delete('branch')
    }
    router.replace(`/crm/tickets/kanban${next.toString() ? `?${next}` : ''}`)
  }, [selectedBranch?.name, searchParams, router])

  // Reset the department filter whenever the platform changes — only
  // meaningful when "Others" is the selected platform.
  useEffect(() => {
    setDepartment('all')
  }, [platformId])

  // Filter visible tickets by platform + (when Others) department + search.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tickets.filter((t) => {
      if (platformId !== 'all' && t.platform.id !== platformId) return false
      // For Others tickets, sub_type carries the department slug
      // (ceo / optimisation / …). Apply the department filter only when
      // that platform is the active one.
      if (isOthersPlatform && department !== 'all' && t.subType !== department) return false
      if (q) {
        const hay = `${t.ticketNumber} ${t.branch.name} ${t.subType}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [tickets, platformId, department, isOthersPlatform, search])

  const byStatus = useMemo(() => {
    const groups: Record<string, TicketCard[]> = {}
    for (const stage of STAGES) groups[stage.key] = []
    for (const t of filtered) {
      ;(groups[t.status] ??= []).push(t)
    }
    return groups
  }, [filtered])

  // ── Drag end ───────────────────────────────────────────────────────────────
  async function onDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result
    if (!destination) return
    if (source.droppableId === destination.droppableId) return

    const newStatus = destination.droppableId
    const card = tickets.find((t) => t.id === draggableId)
    if (!card) return
    const oldStatus = card.status

    // Optimistic update
    setTickets((prev) =>
      prev.map((t) => (t.id === draggableId ? { ...t, status: newStatus } : t)),
    )
    setMoving(draggableId)

    try {
      const res = await fetch(`/api/crm/tickets/${draggableId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      toast.success(`Moved to ${STAGES.find((s) => s.key === newStatus)?.label ?? newStatus}`)
    } catch (e) {
      // Roll back
      setTickets((prev) =>
        prev.map((t) => (t.id === draggableId ? { ...t, status: oldStatus } : t)),
      )
      toast.error((e as Error).message)
    } finally {
      setMoving(null)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
        {/* Platform dropdown — replaces the branch switcher */}
        <div className="relative">
          <select
            value={platformId}
            onChange={(e) => setPlatformId(e.target.value)}
            className="appearance-none rounded-lg border border-slate-300 bg-white pl-3 pr-8 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          >
            <option value="all">All platforms</option>
            {platforms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        </div>

        {/* Department dropdown — appears only when Others platform is picked */}
        {isOthersPlatform && (
          <div className="relative">
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="appearance-none rounded-lg border border-slate-300 bg-white pl-3 pr-8 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              <option value="all">All departments</option>
              {DEPARTMENT_FILTER_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ticket # / branch / sub-type"
            className="w-64 rounded-lg border border-slate-300 bg-white pl-8 pr-8 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="ml-auto text-xs text-slate-500 dark:text-slate-400">
          {filtered.length.toLocaleString()} of {tickets.length.toLocaleString()} tickets
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-900">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex h-full gap-4 p-4 items-start">
            {STAGES.map((stage) => {
              const items = byStatus[stage.key] ?? []
              const total = items.reduce((acc) => acc + 1, 0)
              return (
                <div
                  key={stage.key}
                  className="flex flex-col w-72 shrink-0 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50"
                >
                  {/* Column header */}
                  <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-200 dark:border-slate-700">
                    <div className={cn('h-2.5 w-2.5 rounded-full shrink-0', stage.color)} />
                    <span className="flex-1 truncate text-sm font-semibold text-slate-800 dark:text-white">
                      {stage.label}
                    </span>
                    <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                      {total}
                    </span>
                  </div>

                  {/* Cards */}
                  <Droppable droppableId={stage.key} type="TICKET">
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={cn(
                          'flex flex-col gap-2 p-2 flex-1 min-h-20 transition-colors overflow-y-auto',
                          snapshot.isDraggingOver && 'bg-indigo-50 dark:bg-indigo-950/30',
                        )}
                        style={{ minHeight: 80, maxHeight: 'calc(100vh - 240px)' }}
                      >
                        {items.length === 0 && (
                          <p className="px-3 py-6 text-center text-xs italic text-slate-400">
                            No tickets
                          </p>
                        )}
                        {items.map((ticket, index) => (
                          <Draggable key={ticket.id} draggableId={ticket.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                onClick={(e) => {
                                  // Don't navigate if currently dragging
                                  if (snapshot.isDragging) return
                                  if (moving === ticket.id) return
                                  // Open detail page
                                  e.preventDefault()
                                  router.push(`/crm/tickets/${ticket.id}`)
                                }}
                                className={cn(
                                  'cursor-pointer rounded-lg border bg-white p-3 shadow-sm transition-all hover:shadow-md dark:bg-slate-800',
                                  'border-slate-200 dark:border-slate-700',
                                  snapshot.isDragging && 'rotate-1 shadow-xl opacity-90',
                                  moving === ticket.id && 'opacity-60',
                                )}
                              >
                                {/* Header — ticket # and branch */}
                                <div className="flex items-start justify-between gap-2">
                                  <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
                                    {ticket.ticketNumber}
                                  </span>
                                  <span
                                    className="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[9px] font-bold text-white"
                                    style={{ backgroundColor: ticket.platform.accentColor }}
                                    title={ticket.platform.name}
                                  >
                                    {ticket.platform.code}
                                  </span>
                                </div>

                                <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300 truncate">
                                  {ticket.branch.branchNumber} · {ticket.branch.name}
                                </p>

                                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                                  <span className="truncate">{ticket.subType}</span>
                                  <span className="shrink-0">
                                    {formatDistanceToNow(new Date(ticket.createdAt), {
                                      addSuffix: true,
                                    })}
                                  </span>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              )
            })}
          </div>
        </DragDropContext>
      </div>
    </div>
  )
}
