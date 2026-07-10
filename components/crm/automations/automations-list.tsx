'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  useAutomations, useToggleAutomation, useDuplicateAutomation, useDeleteAutomation,
  useCreateAutomation,
  type AutomationListRow,
} from '@/hooks/crm/useAutomations'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useBranchContext } from '@/components/crm/branch-context'
import {
  Zap, Plus, Copy, Trash2, Edit, CheckCircle, XCircle, Loader2, Clock,
  Cog, ChevronRight, FileCode, Sparkles, Power, Activity, Settings2,
} from 'lucide-react'
import {
  SYSTEM_AUTOMATIONS,
  SYSTEM_AUTOMATION_CATEGORY_LABELS,
  type SystemAutomation,
  type SystemAutomationCategory,
} from '@/lib/crm/system-automations'
import { AUTOMATION_TEMPLATES } from '@/lib/crm/automation-templates'
import { useReadOnlyViewer } from '@/lib/crm/use-read-only-viewer'
import { TRIGGER_TYPE_LABELS, type TriggerType } from '@/lib/crm/validations/automation'

interface AutomationsListClientProps {
  userId: string
}

type TabId = 'custom' | 'system'

export function AutomationsListClient({ userId: _userId }: AutomationsListClientProps) {
  const router = useRouter()
  const readOnly = useReadOnlyViewer()
  const { selectedBranch } = useBranchContext()
  const { data, isLoading } = useAutomations(selectedBranch?.id)
  const toggle = useToggleAutomation()
  const duplicate = useDuplicateAutomation()
  const remove = useDeleteAutomation()
  const create = useCreateAutomation()

  const [tab, setTab] = useState<TabId>('custom')

  const automations: AutomationListRow[] = useMemo(() => (data ?? []), [data])

  const stats = useMemo(() => {
    const enabled = automations.filter((a) => a.enabled).length
    const lastRunOk = automations.filter((a) => a.lastRun?.status === 'COMPLETED').length
    const lastRunFail = automations.filter((a) => a.lastRun?.status === 'FAILED').length
    return {
      total: automations.length,
      enabled,
      disabled: automations.length - enabled,
      systemCount: SYSTEM_AUTOMATIONS.length,
      lastRunOk,
      lastRunFail,
    }
  }, [automations])

  async function handleToggle(id: string, current: boolean) {
    try {
      await toggle.mutateAsync({ id, enabled: !current })
      toast.success(current ? 'Automation disabled' : 'Automation enabled')
    } catch {
      toast.error('Failed to toggle automation')
    }
  }

  async function handleDuplicate(id: string) {
    try {
      await duplicate.mutateAsync(id)
      toast.success('Automation duplicated')
    } catch {
      toast.error('Failed to duplicate')
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    try {
      await remove.mutateAsync(id)
      toast.success('Automation deleted')
    } catch {
      toast.error('Failed to delete')
    }
  }

  async function createFromTemplate(templateId: string) {
    const tpl = AUTOMATION_TEMPLATES.find((t) => t.id === templateId)
    if (!tpl) return
    try {
      const created = await create.mutateAsync({
        name: tpl.name,
        triggerType: tpl.triggerType,
        triggerConfig: {},
        graph: tpl.graph as never,
        enabled: false,
      })
      const c = created as { automationId: string }
      toast.success(`Created "${tpl.name}" — opening editor`)
      router.push(`/crm/automations/${c.automationId}`)
    } catch {
      toast.error('Failed to create from template')
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Automations</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Build visual workflows that trigger when leads enter your CRM. Combine messages, tags, and stage moves.
          </p>
        </div>
        {!readOnly && (
          <Button onClick={() => router.push('/crm/automations/new')}>
            <Plus className="h-4 w-4 mr-1.5" /> New Automation
          </Button>
        )}
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard icon={Cog} label="Built-in" value={stats.systemCount} hint="Read-only, hard-coded flows" tone="indigo" />
        <StatCard icon={Settings2} label="Custom" value={stats.total} hint={`${stats.enabled} live · ${stats.disabled} draft`} tone="blue" />
        <StatCard icon={Power} label="Live" value={stats.enabled} hint="Workflows enabled" tone="emerald" />
        <StatCard
          icon={Activity}
          label="Last 24h"
          value={`${stats.lastRunOk}✓ ${stats.lastRunFail}✗`}
          hint="Most-recent run per automation"
          tone="amber"
        />
      </div>

      {/* Starter templates */}
      {!readOnly && automations.length === 0 && !isLoading && tab === 'custom' && (
        <TemplatesRow onPick={createFromTemplate} pending={create.isPending} />
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 mb-4">
        <TabButton active={tab === 'custom'} onClick={() => setTab('custom')}>
          Custom <span className="ml-1 text-xs text-slate-400">({stats.total})</span>
        </TabButton>
        <TabButton active={tab === 'system'} onClick={() => setTab('system')}>
          Built-in <span className="ml-1 text-xs text-slate-400">({stats.systemCount})</span>
        </TabButton>
      </div>

      {/* Tab content */}
      {tab === 'custom' && (
        <>
          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          )}

          {!isLoading && automations.length === 0 && (
            <div className="text-center py-12 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
              <Zap className="mx-auto h-10 w-10 text-slate-300 mb-3" />
              <p className="text-slate-600 dark:text-slate-300 font-medium">No custom automations yet</p>
              <p className="text-sm text-slate-400 mt-1">{readOnly ? 'No automations have been created yet.' : 'Pick a starter template above, or build one from scratch.'}</p>
              {!readOnly && (
                <Button className="mt-4" onClick={() => router.push('/crm/automations/new')}>
                  <Plus className="h-4 w-4 mr-1.5" /> Build from scratch
                </Button>
              )}
            </div>
          )}

          {!isLoading && automations.length > 0 && (
            <div className="space-y-2">
              {automations.map((a) => (
                <AutomationRow
                  key={a.id}
                  automation={a}
                  readOnly={readOnly}
                  onEdit={() => router.push(`/crm/automations/${a.id}`)}
                  onToggle={() => handleToggle(a.id, a.enabled)}
                  onDuplicate={() => handleDuplicate(a.id)}
                  onDelete={() => handleDelete(a.id, a.name)}
                />
              ))}

              {/* Show templates row below the list too, for adding more */}
              {!readOnly && (
                <div className="mt-6">
                  <TemplatesRow onPick={createFromTemplate} pending={create.isPending} compact />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {tab === 'system' && <SystemAutomationsSection />}
    </div>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  hint: string
  tone: 'indigo' | 'blue' | 'emerald' | 'amber'
}) {
  const tones: Record<typeof tone, string> = {
    indigo: 'border-indigo-200 bg-indigo-50/60 dark:bg-indigo-950/30 dark:border-indigo-900/50 text-indigo-700 dark:text-indigo-300',
    blue: 'border-blue-200 bg-blue-50/60 dark:bg-blue-950/30 dark:border-blue-900/50 text-blue-700 dark:text-blue-300',
    emerald: 'border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/30 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-300',
    amber: 'border-amber-200 bg-amber-50/60 dark:bg-amber-950/30 dark:border-amber-900/50 text-amber-700 dark:text-amber-300',
  }
  return (
    <div className={`rounded-xl border p-3 ${tones[tone]}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <p className="text-2xl font-bold mt-1 text-slate-900 dark:text-white">{value}</p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{hint}</p>
    </div>
  )
}

// ─── Tab button ───────────────────────────────────────────────────────────────

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
        active
          ? 'border-blue-500 text-blue-600 dark:text-blue-400'
          : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
      }`}
    >
      {children}
    </button>
  )
}

// ─── Starter templates ────────────────────────────────────────────────────────

function TemplatesRow({
  onPick,
  pending,
  compact = false,
}: {
  onPick: (id: string) => void
  pending: boolean
  compact?: boolean
}) {
  return (
    <section className={compact ? 'mt-2' : 'mb-5'}>
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-amber-500" />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
          Starter templates
        </h2>
        <span className="text-[11px] text-slate-400">Click to create — you can customize before saving.</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {AUTOMATION_TEMPLATES.map((tpl) => (
          <button
            key={tpl.id}
            onClick={() => onPick(tpl.id)}
            disabled={pending}
            className="text-left rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 hover:border-blue-400 hover:shadow-sm transition-all disabled:opacity-60"
          >
            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{tpl.name}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2 leading-snug">{tpl.summary}</p>
            <div className="mt-2 flex items-center gap-1.5">
              <Badge variant="secondary" className="text-[10px]">
                {TRIGGER_TYPE_LABELS[tpl.triggerType as TriggerType]}
              </Badge>
              <span className="text-[10px] text-slate-400">{tpl.graph.nodes.length} steps</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

// ─── Automation row ───────────────────────────────────────────────────────────

function AutomationRow({
  automation: a,
  readOnly = false,
  onEdit,
  onToggle,
  onDuplicate,
  onDelete,
}: {
  automation: AutomationListRow
  readOnly?: boolean
  onEdit: () => void
  onToggle: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  return (
    <div className="group flex items-center justify-between p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
      <button onClick={onEdit} className="flex items-center gap-3 min-w-0 flex-1 text-left">
        <div className={`p-2 rounded-lg ${a.enabled ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>
          <Zap className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-slate-900 dark:text-white truncate">{a.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Badge variant="secondary" className="text-[10px]">
              {TRIGGER_TYPE_LABELS[a.triggerType as TriggerType] ?? a.triggerType}
            </Badge>
            {a.branchName && (
              <span className="text-[11px] text-slate-400 truncate">· {a.branchName}</span>
            )}
            {a.lastRun && (
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {a.lastRun.status === 'COMPLETED' && <CheckCircle className="h-3 w-3 text-emerald-500" />}
                {a.lastRun.status === 'FAILED' && <XCircle className="h-3 w-3 text-red-500" />}
                {a.lastRun.status === 'RUNNING' && <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />}
                {new Date(a.lastRun.startedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>
      </button>

      <div className="flex items-center gap-1 ml-4 shrink-0">
        {readOnly ? (
          // View-only: show enabled/disabled as a static badge, no controls.
          <Badge variant="secondary" className="text-[10px]">{a.enabled ? 'Live' : 'Draft'}</Badge>
        ) : (
          <>
            <button
              onClick={onToggle}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${a.enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
              title={a.enabled ? 'Disable' : 'Enable'}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${a.enabled ? 'translate-x-4' : 'translate-x-1'}`} />
            </button>
            <Button variant="ghost" size="icon" onClick={onEdit} title="Edit">
              <Edit className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onDuplicate} title="Duplicate">
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700" onClick={onDelete} title="Delete">
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── System automations section ──────────────────────────────────────────────
//
// Read-only catalogue of hard-coded automations / flows that run in the
// backend. Sourced from lib/crm/system-automations.ts.

function SystemAutomationsSection() {
  const [expanded, setExpanded] = useState<string | null>(null)

  const byCategory: Record<SystemAutomationCategory, SystemAutomation[]> = {
    'lead-ingestion':     [],
    'lead-source-flow':   [],
    'stage-transition':   [],
    'notifications':      [],
    'branch-management':  [],
    'sibling-handling':   [],
  }
  for (const a of SYSTEM_AUTOMATIONS) byCategory[a.category].push(a)

  return (
    <section className="rounded-2xl border border-indigo-200 bg-indigo-50/30 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/20">
      <header className="mb-3 flex items-center gap-2">
        <Cog className="h-4 w-4 text-indigo-600 dark:text-indigo-300" />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
          Built-in flows
        </h2>
        <Badge variant="secondary" className="text-[10px]">Read-only</Badge>
        <p className="ml-auto text-[11px] italic text-slate-500 dark:text-slate-400">
          Hard-coded inside the platform. Tap a row to inspect.
        </p>
      </header>

      <div className="space-y-4">
        {(Object.keys(byCategory) as SystemAutomationCategory[]).map((cat) => {
          const items = byCategory[cat]
          if (items.length === 0) return null
          return (
            <div key={cat}>
              <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {SYSTEM_AUTOMATION_CATEGORY_LABELS[cat]}
              </h3>
              <ul className="space-y-1.5">
                {items.map((a) => {
                  const isOpen = expanded === a.id
                  return (
                    <li
                      key={a.id}
                      className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                    >
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : a.id)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >
                        <ChevronRight
                          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                            {a.name}
                          </p>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {a.summary}
                          </p>
                        </div>
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          {SYSTEM_AUTOMATION_CATEGORY_LABELS[a.category]}
                        </Badge>
                      </button>

                      {isOpen && (
                        <div className="space-y-3 border-t border-slate-100 bg-slate-50/50 px-3 py-3 text-xs dark:border-slate-700 dark:bg-slate-800/30">
                          <div>
                            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Trigger
                            </p>
                            <p className="text-slate-700 dark:text-slate-300">{a.trigger}</p>
                          </div>
                          <div>
                            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Actions
                            </p>
                            <ol className="list-decimal space-y-0.5 pl-4 text-slate-700 dark:text-slate-300">
                              {a.actions.map((step, i) => (
                                <li key={i}>{step}</li>
                              ))}
                            </ol>
                          </div>
                          <div>
                            <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              <FileCode className="h-3 w-3" /> Source files
                            </p>
                            <ul className="space-y-0.5 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                              {a.sources.map((src) => (
                                <li key={src} className="truncate" title={src}>{src}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}
