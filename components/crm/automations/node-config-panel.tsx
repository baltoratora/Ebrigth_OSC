'use client'

/**
 * Right-side configuration panel that opens when a node is clicked in the
 * automation editor. Renders different form fields depending on the node's
 * action type. Writes changes back via the onChange callback (which patches
 * the React-Flow node.data in the parent).
 */

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Node } from 'reactflow'
import { Button } from '@/components/ui/button'
import { useTeam } from '@/hooks/crm/useTeam'
import { ACTION_TYPE_LABELS, type ActionType } from '@/lib/crm/validations/automation'
import { Trash2, X, Variable } from 'lucide-react'

const TEMPLATE_TOKENS = [
  { token: '{{contact.firstName}}', label: 'First name' },
  { token: '{{contact.lastName}}', label: 'Last name' },
  { token: '{{contact.email}}', label: 'Email' },
  { token: '{{contact.phone}}', label: 'Phone' },
  { token: '{{contact.childName1}}', label: 'Child 1 name' },
  { token: '{{contact.preferredTrialDay}}', label: 'Preferred trial day' },
  { token: '{{contact.enrolledPackage}}', label: 'Enrolled package' },
  { token: '{{branch.name}}', label: 'Branch name' },
  { token: '{{branch.phone}}', label: 'Branch phone' },
  { token: '{{branch.address}}', label: 'Branch address' },
]

interface Tag { id: string; name: string; color: string }
interface Stage { id: string; name: string; shortCode: string; pipelineId: string }
interface Pipeline { id: string; name: string; stages: Stage[] }

function useTags() {
  return useQuery({
    queryKey: ['crm', 'tags'],
    queryFn: async () => {
      const r = await fetch('/api/crm/tags')
      if (!r.ok) throw new Error('Failed')
      return (await r.json()) as { tags: Tag[] }
    },
    staleTime: 60_000,
  })
}

function usePipelines() {
  return useQuery({
    queryKey: ['crm', 'pipelines'],
    queryFn: async () => {
      const r = await fetch('/api/crm/pipelines')
      if (!r.ok) throw new Error('Failed')
      return (await r.json()) as { pipelines: Pipeline[] }
    },
    staleTime: 60_000,
  })
}

interface Props {
  node: Node
  onChange: (data: Record<string, unknown>) => void
  onDelete: () => void
  onClose: () => void
}

export function NodeConfigPanel({ node, onChange, onDelete, onClose }: Props) {
  const [local, setLocal] = useState<Record<string, unknown>>(node.data ?? {})

  useEffect(() => {
    setLocal(node.data ?? {})
  }, [node.id, node.data])

  function patch(p: Record<string, unknown>) {
    const next = { ...local, ...p }
    setLocal(next)
    onChange(next)
  }

  const nodeType = node.type
  const actionType = (local.actionType ?? local.type) as string | undefined

  return (
    <aside className="w-80 shrink-0 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            {nodeType === 'trigger' ? 'Trigger' : nodeType === 'delay' ? 'Wait' : nodeType === 'condition' ? 'If / Else' : 'Action'}
          </p>
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
            {actionType && nodeType === 'action'
              ? ACTION_TYPE_LABELS[actionType as ActionType] ?? actionType
              : (local.label as string | undefined) ?? 'Configure'}
          </p>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
          <X className="h-4 w-4 text-slate-500" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 text-sm">
        <Field label="Display label">
          <input
            value={(local.label as string) ?? ''}
            onChange={(e) => patch({ label: e.target.value })}
            className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </Field>

        {nodeType === 'action' && actionType && (
          <ActionFields actionType={actionType as ActionType} local={local} patch={patch} />
        )}
        {nodeType === 'delay' && <DelayFields local={local} patch={patch} />}
        {nodeType === 'condition' && <ConditionFields local={local} patch={patch} />}
        {nodeType === 'trigger' && (
          <p className="rounded-md bg-blue-50 dark:bg-blue-950/40 px-3 py-2 text-xs text-blue-700 dark:text-blue-200">
            Trigger settings (lead source filter, stage filter, schedule) are set
            on the automation header. Connect outgoing edges to the next step.
          </p>
        )}
      </div>

      {nodeType !== 'trigger' && (
        <footer className="border-t border-slate-100 dark:border-slate-800 px-4 py-3">
          <Button
            variant="ghost"
            className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4 mr-2" /> Delete node
          </Button>
        </footer>
      )}
    </aside>
  )
}

// ─── Per-action-type forms ────────────────────────────────────────────────────

function ActionFields({
  actionType,
  local,
  patch,
}: {
  actionType: ActionType
  local: Record<string, unknown>
  patch: (p: Record<string, unknown>) => void
}) {
  switch (actionType) {
    case 'SEND_WHATSAPP':
    case 'SEND_SMS':
      return (
        <>
          <Field label="Message body" hint="Supports variables like {{contact.firstName}}.">
            <Textarea value={(local.body as string) ?? ''} onChange={(v) => patch({ body: v })} rows={6} />
          </Field>
          <TemplateTokenChips onPick={(t) => patch({ body: ((local.body as string) ?? '') + t })} />
        </>
      )
    case 'SEND_EMAIL':
      return (
        <>
          <Field label="To (optional override)" hint="Leave blank to use the contact's email.">
            <input
              value={(local.to as string) ?? ''}
              onChange={(e) => patch({ to: e.target.value })}
              placeholder="hello@example.com"
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm"
            />
          </Field>
          <Field label="Subject">
            <input
              value={(local.subject as string) ?? ''}
              onChange={(e) => patch({ subject: e.target.value })}
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm"
            />
          </Field>
          <Field label="HTML body">
            <Textarea value={(local.body as string) ?? ''} onChange={(v) => patch({ body: v })} rows={8} />
          </Field>
          <TemplateTokenChips onPick={(t) => patch({ body: ((local.body as string) ?? '') + t })} />
        </>
      )
    case 'ADD_TAG':
    case 'REMOVE_TAG':
      return <TagPicker value={local.tagId as string | undefined} onPick={(id) => patch({ tagId: id })} />
    case 'MOVE_STAGE':
      return <StagePicker value={local.stageId as string | undefined} onPick={(id) => patch({ stageId: id })} />
    case 'ASSIGN_USER':
      return <UserPicker value={local.userId as string | undefined} onPick={(id) => patch({ userId: id })} />
    case 'CREATE_TASK':
      return (
        <>
          <Field label="Task title">
            <input
              value={(local.title as string) ?? ''}
              onChange={(e) => patch({ title: e.target.value })}
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm"
            />
          </Field>
          <Field label="Due in (hours)">
            <input
              type="number"
              min={1}
              value={(local.dueOffsetHours as number | undefined) ?? 24}
              onChange={(e) => patch({ dueOffsetHours: Number(e.target.value) })}
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm"
            />
          </Field>
          <UserPicker value={local.assignedUserId as string | undefined} onPick={(id) => patch({ assignedUserId: id })} label="Assign to (optional)" />
        </>
      )
    case 'SEND_INTERNAL_NOTIFICATION':
      return (
        <>
          <UserPicker value={local.userId as string | undefined} onPick={(id) => patch({ userId: id })} label="Notify user" />
          <Field label="Title">
            <input
              value={(local.title as string) ?? ''}
              onChange={(e) => patch({ title: e.target.value })}
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm"
            />
          </Field>
          <Field label="Body">
            <Textarea value={(local.body as string) ?? ''} onChange={(v) => patch({ body: v })} rows={4} />
          </Field>
        </>
      )
    case 'UPDATE_FIELD':
      return (
        <>
          <Field label="Field name" hint="e.g. enrolledPackage, assignedUserId. Unknown names are stored as custom values.">
            <input
              value={(local.field as string) ?? ''}
              onChange={(e) => patch({ field: e.target.value })}
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm font-mono"
            />
          </Field>
          <Field label="New value">
            <input
              value={(local.value as string) ?? ''}
              onChange={(e) => patch({ value: e.target.value })}
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm"
            />
          </Field>
        </>
      )
    case 'SEND_WEBHOOK':
      return (
        <Field label="Webhook URL" hint="POSTs JSON contact payload with a 10s timeout.">
          <input
            value={(local.url as string) ?? ''}
            onChange={(e) => patch({ url: e.target.value })}
            placeholder="https://hooks.example.com/automation"
            className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm font-mono"
          />
        </Field>
      )
    default:
      return null
  }
}

function DelayFields({ local, patch }: { local: Record<string, unknown>; patch: (p: Record<string, unknown>) => void }) {
  const unit = (local.unit as string) ?? 'minutes'
  const amount = (local.amount as number | undefined) ?? 60
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Wait for">
          <input
            type="number"
            min={1}
            value={amount}
            onChange={(e) => {
              const v = Number(e.target.value)
              patch({ amount: v, delayMs: toMs(v, unit) })
            }}
            className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm"
          />
        </Field>
        <Field label="Unit">
          <select
            value={unit}
            onChange={(e) => {
              const u = e.target.value
              patch({ unit: u, delayMs: toMs(amount, u) })
            }}
            className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm"
          >
            <option value="minutes">minutes</option>
            <option value="hours">hours</option>
            <option value="days">days</option>
          </select>
        </Field>
      </div>
      <p className="text-[11px] text-slate-500">
        The job will be re-enqueued after the delay. Requires a running BullMQ worker
        with Redis — staging without Redis will skip the wait silently.
      </p>
    </>
  )
}

function toMs(amount: number, unit: string): number {
  if (unit === 'days') return amount * 86_400_000
  if (unit === 'hours') return amount * 3_600_000
  return amount * 60_000
}

function ConditionFields({ local, patch }: { local: Record<string, unknown>; patch: (p: Record<string, unknown>) => void }) {
  return (
    <>
      <Field label="Field">
        <select
          value={(local.field as string) ?? 'stage.shortCode'}
          onChange={(e) => patch({ field: e.target.value })}
          className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm"
        >
          <option value="stage.shortCode">Current stage code</option>
          <option value="contact.leadSource">Lead source</option>
          <option value="contact.assignedUserId">Assigned user</option>
          <option value="contact.phone">Phone</option>
          <option value="contact.email">Email</option>
          <option value="contact.enrolledPackage">Enrolled package</option>
          <option value="tag.name">Tag name</option>
        </select>
      </Field>
      <Field label="Operator">
        <select
          value={(local.operator as string) ?? 'equals'}
          onChange={(e) => patch({ operator: e.target.value })}
          className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm"
        >
          <option value="equals">equals</option>
          <option value="not_equals">does not equal</option>
          <option value="contains">contains</option>
          <option value="not_contains">does not contain</option>
          <option value="exists">exists</option>
          <option value="not_exists">does not exist</option>
        </select>
      </Field>
      <Field label="Value">
        <input
          value={(local.value as string) ?? ''}
          onChange={(e) => patch({ value: e.target.value })}
          placeholder='e.g. CT'
          className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm font-mono"
        />
      </Field>
    </>
  )
}

// ─── Selectors ────────────────────────────────────────────────────────────────

function TagPicker({ value, onPick }: { value: string | undefined; onPick: (id: string) => void }) {
  const { data } = useTags()
  const tags = data?.tags ?? []
  return (
    <Field label="Tag">
      <select
        value={value ?? ''}
        onChange={(e) => onPick(e.target.value)}
        className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm"
      >
        <option value="">Select a tag…</option>
        {tags.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
    </Field>
  )
}

function StagePicker({ value, onPick }: { value: string | undefined; onPick: (id: string) => void }) {
  const { data } = usePipelines()
  const pipelines = data?.pipelines ?? []
  return (
    <Field label="Target stage">
      <select
        value={value ?? ''}
        onChange={(e) => onPick(e.target.value)}
        className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm"
      >
        <option value="">Select a stage…</option>
        {pipelines.map((p) => (
          <optgroup key={p.id} label={p.name}>
            {p.stages.map((s) => (
              <option key={s.id} value={s.id}>{s.shortCode} — {s.name}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </Field>
  )
}

function UserPicker({ value, onPick, label = 'Assign user' }: { value: string | undefined; onPick: (id: string) => void; label?: string }) {
  const { data } = useTeam()
  const users = data?.users ?? []
  return (
    <Field label={label}>
      <select
        value={value ?? ''}
        onChange={(e) => onPick(e.target.value)}
        className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm"
      >
        <option value="">Select a user…</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
        ))}
      </select>
    </Field>
  )
}

// ─── Atoms ────────────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  )
}

function Textarea({ value, onChange, rows }: { value: string; onChange: (v: string) => void; rows: number }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/40"
    />
  )
}

function TemplateTokenChips({ onPick }: { onPick: (token: string) => void }) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        <Variable className="h-3 w-3" /> Insert variable
      </p>
      <div className="flex flex-wrap gap-1">
        {TEMPLATE_TOKENS.map((t) => (
          <button
            key={t.token}
            type="button"
            onClick={() => onPick(t.token)}
            title={t.token}
            className="rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-mono text-slate-700 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600"
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}
