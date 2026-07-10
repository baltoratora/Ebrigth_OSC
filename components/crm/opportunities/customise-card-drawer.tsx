'use client'

import { useEffect, useState } from 'react'
import { X, Phone, MessageCircle, Tag, FileText, CheckSquare, Calendar } from 'lucide-react'
import { cn } from '@/lib/crm/utils'
import {
  ALL_CARD_FIELDS,
  ALL_QUICK_ACTIONS,
  CARD_FIELD_GROUPS,
  type CardFieldKey,
  type CardLayout,
  type CardPrefs,
  type QuickActionKey,
} from '@/lib/crm/kanban-card-prefs'
import { KanbanCard } from './kanban-card'
import type { OpportunityCard } from '@/server/queries/opportunities'

// ─── Static preview opportunity ──────────────────────────────────────────────
// Synthetic data that exercises every field — used by the live Card Preview
// so toggling a checkbox immediately reflects in a real KanbanCard render.

const PREVIEW_OPP: OpportunityCard = {
  id: 'preview',
  tenantId: 'preview',
  branchId: 'preview',
  contactId: 'preview',
  pipelineId: 'preview',
  stageId: 'preview',
  value: '1960',
  assignedUserId: 'preview-user',
  lastStageChangeAt: new Date(Date.now() - 3 * 3600 * 1000),
  deletedAt: null,
  createdAt: new Date(Date.now() - 24 * 3600 * 1000),
  updatedAt: new Date(),
  contact: {
    id: 'preview',
    firstName: 'Wani',
    lastName: null,
    email: 'wani.parent@example.com',
    phone: '+60123456789',
    childName1: null,
    childAge1: '10',
    childName2: null,
    childAge2: null,
    parentFullName: 'Aishah Wani',
    campaignName: 'May Open House',
    preferredBranchId: null,
    leadSourceId: 'preview',
    leadSource: { id: 'preview', name: 'TikTok' },
    contactTags: [
      { tag: { id: 't1', name: 'Hot', color: '#ef4444' } },
      { tag: { id: 't2', name: 'Trial Booked', color: '#10b981' } },
    ],
    // Required by the OpportunityCard type after the trial-timeslot field
    // was added. Empty here so the preview card doesn't render a fake pill.
    appointments: [],
  },
  assignedUser: {
    id: 'preview-user',
    name: 'Denize',
    email: 'admin@ebright.my',
    image: null,
  },
}

const PREVIEW_STAGE = { shortCode: 'FU3', name: 'Follow-Up 3rd Attempt' }

// ─── Drawer ──────────────────────────────────────────────────────────────────

interface CustomiseCardDrawerProps {
  open: boolean
  value: CardPrefs
  onClose: () => void
  onApply: (prefs: CardPrefs) => void
}

export function CustomiseCardDrawer({
  open,
  value,
  onClose,
  onApply,
}: CustomiseCardDrawerProps) {
  // Local working copy — committed only on Apply. Reset whenever the drawer
  // is re-opened so a previous Cancel doesn't leak into the next session.
  const [draft, setDraft] = useState<CardPrefs>(value)
  const [tab, setTab] = useState<'fields' | 'quick'>('fields')

  useEffect(() => {
    if (open) {
      setDraft(value)
      setTab('fields')
    }
  }, [open, value])

  if (!open) return null

  function toggleField(key: CardFieldKey) {
    setDraft((d) => ({
      ...d,
      fields: d.fields.includes(key)
        ? d.fields.filter((k) => k !== key)
        : [...d.fields, key],
    }))
  }

  function toggleQuickAction(key: QuickActionKey) {
    setDraft((d) => ({
      ...d,
      quickActions: d.quickActions.includes(key)
        ? d.quickActions.filter((k) => k !== key)
        : [...d.quickActions, key],
    }))
  }

  function setLayout(layout: CardLayout) {
    setDraft((d) => ({ ...d, layout }))
  }

  const fieldsSelectedCount = draft.fields.length
  const fieldsTotal = ALL_CARD_FIELDS.length

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Customise Card">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside
        className={cn(
          'absolute right-0 top-0 h-full w-full max-w-md',
          'flex flex-col bg-white shadow-2xl dark:bg-slate-900',
          'border-l border-slate-200 dark:border-slate-700',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Customise Card
          </h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scroll body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Card preview */}
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Card preview
            </h3>
            <div className="rounded-lg bg-slate-100 p-3 dark:bg-slate-800/40">
              <KanbanCard
                opportunity={PREVIEW_OPP}
                stageShortCode={PREVIEW_STAGE.shortCode}
                stageName={PREVIEW_STAGE.name}
                prefs={draft}
              />
            </div>
          </section>

          {/* Card layout */}
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Card layout
            </h3>
            <div className="flex gap-2">
              {(['default', 'compact'] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setLayout(opt)}
                  className={cn(
                    'flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize transition',
                    draft.layout === opt
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-950/40 dark:text-indigo-300'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300',
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          </section>

          {/* Tabs */}
          <section>
            <div className="flex border-b border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setTab('fields')}
                className={cn(
                  'px-4 py-2 text-sm font-medium transition',
                  tab === 'fields'
                    ? 'border-b-2 border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-300'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
                )}
              >
                Fields ({fieldsSelectedCount} out of {fieldsTotal})
              </button>
              <button
                type="button"
                onClick={() => setTab('quick')}
                className={cn(
                  'px-4 py-2 text-sm font-medium transition',
                  tab === 'quick'
                    ? 'border-b-2 border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-300'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
                )}
              >
                Quick actions
              </button>
            </div>

            {tab === 'fields' && (
              <div className="mt-3 space-y-4">
                {CARD_FIELD_GROUPS.map((g) => {
                  const fields = ALL_CARD_FIELDS.filter((f) => f.group === g.key)
                  if (fields.length === 0) return null
                  return (
                    <div key={g.key}>
                      <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {g.label}
                      </h4>
                      <ul className="space-y-1">
                        {fields.map((f) => {
                          const checked = draft.fields.includes(f.key)
                          return (
                            <li
                              key={f.key}
                              className={cn(
                                'flex items-center gap-3 rounded-md px-2 py-1.5',
                                f.locked
                                  ? 'bg-slate-50 dark:bg-slate-800/50'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/50',
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={checked || !!f.locked}
                                disabled={!!f.locked}
                                onChange={() => !f.locked && toggleField(f.key)}
                                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-60"
                              />
                              <span className={cn(
                                'flex-1 text-sm',
                                f.locked
                                  ? 'font-medium text-slate-900 dark:text-slate-100'
                                  : 'text-slate-700 dark:text-slate-300',
                              )}>
                                {f.label}
                              </span>
                              {f.locked && (
                                <span
                                  className="text-[10px] uppercase tracking-wide text-slate-400"
                                  title="Always shown"
                                >
                                  locked
                                </span>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )
                })}
              </div>
            )}

            {tab === 'quick' && (
              <>
                <p className="mt-3 text-[11px] italic text-slate-500 dark:text-slate-400">
                  Quick-action icons appear at the bottom of every card.
                  Counts populate where the underlying data is available
                  (Tags + Notes today; the rest are placeholders for now).
                </p>
                <ul className="mt-3 space-y-1.5">
                  {ALL_QUICK_ACTIONS.map((a) => {
                    const checked = draft.quickActions.includes(a.key)
                    return (
                      <li
                        key={a.key}
                        className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleQuickAction(a.key)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="flex-1 text-sm text-slate-700 dark:text-slate-300">
                          {a.label}
                        </span>
                        <QuickActionIcon action={a.key} />
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onApply(draft)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            Apply
          </button>
        </div>
      </aside>
    </div>
  )
}

// Exported so KanbanCard's quick-actions row can render identical icons.
export function QuickActionIcon({ action }: { action: QuickActionKey }) {
  const map = {
    call:          Phone,
    conversations: MessageCircle,
    tags:          Tag,
    notes:         FileText,
    tasks:         CheckSquare,
    appointment:   Calendar,
  } as const
  const Icon = map[action]
  return <Icon className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
}
