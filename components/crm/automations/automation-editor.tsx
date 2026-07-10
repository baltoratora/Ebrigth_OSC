'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import ReactFlow, {
  Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge,
  MarkerType,
  type Node, type Edge, type Connection,
  type NodeTypes, Handle, Position,
} from 'reactflow'
import 'reactflow/dist/style.css'
import {
  useAutomation, useCreateAutomation, useUpdateAutomation,
  useTestRunAutomation,
} from '@/hooks/crm/useAutomations'
import { useContacts } from '@/hooks/crm/useContacts'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/crm/utils'
import {
  TRIGGER_TYPES, TRIGGER_TYPE_LABELS, ACTION_TYPE_LABELS,
  type ActionType, type TriggerType,
} from '@/lib/crm/validations/automation'
import { AUTOMATION_TEMPLATES } from '@/lib/crm/automation-templates'
import { NodeConfigPanel } from './node-config-panel'
import { RunsDrawer } from './runs-drawer'
import {
  ArrowLeft, Save, Zap, Clock, GitBranch, Play, Send,
  Tag, ArrowRight, User, CheckSquare, Bell, Edit3, Webhook, MessageSquare,
  History, BookOpen, AlertCircle,
} from 'lucide-react'

// ─── Node visuals ─────────────────────────────────────────────────────────────
//
// All action types here use the SCREAMING_SNAKE_CASE that the BullMQ worker
// dispatches on (see server/workers/automationWorker.ts). Previously this
// file used camelCase strings, which meant nodes saved here could never be
// matched by the worker — silently no-oping every action.

const ACTION_ICONS: Record<ActionType, React.ComponentType<{ className?: string }>> = {
  SEND_WHATSAPP: MessageSquare,
  SEND_EMAIL: Send,
  SEND_SMS: MessageSquare,
  ADD_TAG: Tag,
  REMOVE_TAG: Tag,
  MOVE_STAGE: ArrowRight,
  ASSIGN_USER: User,
  CREATE_TASK: CheckSquare,
  SEND_INTERNAL_NOTIFICATION: Bell,
  UPDATE_FIELD: Edit3,
  SEND_WEBHOOK: Webhook,
}

const ACTION_COLORS: Record<string, string> = {
  trigger: 'border-blue-400 bg-gradient-to-br from-blue-50 to-blue-50/40 dark:from-blue-950/40 dark:to-blue-950/10',
  SEND_WHATSAPP: 'border-emerald-400 bg-gradient-to-br from-emerald-50 to-emerald-50/40 dark:from-emerald-950/40 dark:to-emerald-950/10',
  SEND_EMAIL: 'border-violet-400 bg-gradient-to-br from-violet-50 to-violet-50/40 dark:from-violet-950/40 dark:to-violet-950/10',
  SEND_SMS: 'border-emerald-400 bg-gradient-to-br from-emerald-50 to-emerald-50/40 dark:from-emerald-950/40 dark:to-emerald-950/10',
  ADD_TAG: 'border-cyan-400 bg-gradient-to-br from-cyan-50 to-cyan-50/40 dark:from-cyan-950/40 dark:to-cyan-950/10',
  REMOVE_TAG: 'border-cyan-400 bg-gradient-to-br from-cyan-50 to-cyan-50/40 dark:from-cyan-950/40 dark:to-cyan-950/10',
  MOVE_STAGE: 'border-teal-400 bg-gradient-to-br from-teal-50 to-teal-50/40 dark:from-teal-950/40 dark:to-teal-950/10',
  ASSIGN_USER: 'border-indigo-400 bg-gradient-to-br from-indigo-50 to-indigo-50/40 dark:from-indigo-950/40 dark:to-indigo-950/10',
  CREATE_TASK: 'border-amber-400 bg-gradient-to-br from-amber-50 to-amber-50/40 dark:from-amber-950/40 dark:to-amber-950/10',
  SEND_INTERNAL_NOTIFICATION: 'border-pink-400 bg-gradient-to-br from-pink-50 to-pink-50/40 dark:from-pink-950/40 dark:to-pink-950/10',
  UPDATE_FIELD: 'border-slate-400 bg-gradient-to-br from-slate-50 to-slate-50/40 dark:from-slate-800 dark:to-slate-900',
  SEND_WEBHOOK: 'border-fuchsia-400 bg-gradient-to-br from-fuchsia-50 to-fuchsia-50/40 dark:from-fuchsia-950/40 dark:to-fuchsia-950/10',
  delay: 'border-amber-400 bg-gradient-to-br from-amber-50 to-amber-50/40 dark:from-amber-950/40 dark:to-amber-950/10',
  condition: 'border-orange-400 bg-gradient-to-br from-orange-50 to-orange-50/40 dark:from-orange-950/40 dark:to-orange-950/10',
  default: 'border-slate-300 bg-white dark:bg-slate-900',
}

function isNodeReady(node: Node): { ready: boolean; reason?: string } {
  if (node.type === 'trigger') return { ready: true }
  if (node.type === 'delay') {
    return (node.data?.delayMs as number | undefined)
      ? { ready: true }
      : { ready: false, reason: 'Set a delay duration' }
  }
  if (node.type === 'condition') {
    return node.data?.field ? { ready: true } : { ready: false, reason: 'Pick a field to check' }
  }
  const actionType = node.data?.actionType as ActionType | undefined
  switch (actionType) {
    case 'SEND_WHATSAPP':
    case 'SEND_SMS':
      return (node.data?.body as string)?.trim() ? { ready: true } : { ready: false, reason: 'Add a message body' }
    case 'SEND_EMAIL':
      return (node.data?.subject as string)?.trim() && (node.data?.body as string)?.trim()
        ? { ready: true }
        : { ready: false, reason: 'Add subject + body' }
    case 'ADD_TAG':
    case 'REMOVE_TAG':
      return node.data?.tagId ? { ready: true } : { ready: false, reason: 'Pick a tag' }
    case 'MOVE_STAGE':
      return node.data?.stageId ? { ready: true } : { ready: false, reason: 'Pick a target stage' }
    case 'ASSIGN_USER':
      return node.data?.userId ? { ready: true } : { ready: false, reason: 'Pick a user' }
    case 'CREATE_TASK':
      return (node.data?.title as string)?.trim() ? { ready: true } : { ready: false, reason: 'Add a task title' }
    case 'SEND_INTERNAL_NOTIFICATION':
      return node.data?.userId && (node.data?.body as string)?.trim()
        ? { ready: true }
        : { ready: false, reason: 'Pick a user + body' }
    case 'UPDATE_FIELD':
      return (node.data?.field as string)?.trim() ? { ready: true } : { ready: false, reason: 'Pick a field' }
    case 'SEND_WEBHOOK':
      return (node.data?.url as string)?.trim() ? { ready: true } : { ready: false, reason: 'Add a URL' }
    default:
      return { ready: false, reason: 'Pick an action type' }
  }
}

// ─── Custom nodes ─────────────────────────────────────────────────────────────

function TriggerNode({ data }: { data: { label: string; triggerType: string } }) {
  return (
    <div className={cn('rounded-xl border p-3 min-w-50 shadow-sm transition-shadow hover:shadow-md', ACTION_COLORS.trigger)}>
      <div className="flex items-center gap-1.5 mb-1">
        <Zap className="h-3.5 w-3.5 text-blue-600" />
        <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider">Trigger</span>
      </div>
      <p className="font-medium text-slate-900 dark:text-slate-100 text-sm leading-tight">{data.label}</p>
      <Handle type="source" position={Position.Bottom} className="bg-blue-500!" />
    </div>
  )
}

function ActionNode({ data, selected }: { data: { label: string; actionType: ActionType; body?: string; tagId?: string; stageId?: string; userId?: string; title?: string; url?: string }; selected?: boolean }) {
  const Icon = ACTION_ICONS[data.actionType] ?? Play
  const colorClass = ACTION_COLORS[data.actionType] ?? ACTION_COLORS.default
  const fakeNode = { type: 'action', data } as unknown as Node
  const status = isNodeReady(fakeNode)
  const preview = data.body || data.title || data.url
  return (
    <div
      className={cn(
        'rounded-xl border p-3 min-w-55 shadow-sm transition-all hover:shadow-md cursor-pointer',
        colorClass,
        selected && 'ring-2 ring-blue-500',
      )}
    >
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 text-slate-700 dark:text-slate-300" />
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Action</span>
        </div>
        {!status.ready && (
          <span title={status.reason} className="text-amber-500">
            <AlertCircle className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <p className="font-medium text-slate-900 dark:text-slate-100 text-sm leading-tight">{data.label}</p>
      {preview && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">{preview}</p>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

function DelayNode({ data, selected }: { data: { label: string; amount?: number; unit?: string }; selected?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3 min-w-45 shadow-sm transition-all hover:shadow-md cursor-pointer',
        ACTION_COLORS.delay,
        selected && 'ring-2 ring-blue-500',
      )}
    >
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-1.5 mb-1">
        <Clock className="h-3.5 w-3.5 text-amber-600" />
        <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider">Wait</span>
      </div>
      <p className="font-medium text-slate-900 dark:text-slate-100 text-sm">
        {data.amount ? `${data.amount} ${data.unit ?? 'minutes'}` : 'Set delay…'}
      </p>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

function ConditionNode({ data, selected }: { data: { label: string; field?: string; operator?: string; value?: string }; selected?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3 min-w-55 shadow-sm transition-all hover:shadow-md cursor-pointer',
        ACTION_COLORS.condition,
        selected && 'ring-2 ring-blue-500',
      )}
    >
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-1.5 mb-1">
        <GitBranch className="h-3.5 w-3.5 text-orange-600" />
        <span className="text-[10px] font-semibold text-orange-600 uppercase tracking-wider">If / Else</span>
      </div>
      <p className="font-medium text-slate-900 dark:text-slate-100 text-sm">{data.label}</p>
      {data.field && (
        <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
          {data.field} {data.operator ?? '='} {data.value ?? '?'}
        </p>
      )}
      <Handle type="source" position={Position.Bottom} id="yes" style={{ left: '30%', background: '#10b981' }} />
      <Handle type="source" position={Position.Bottom} id="no" style={{ left: '70%', background: '#ef4444' }} />
      <div className="flex justify-between mt-1.5 text-[10px] font-semibold px-1">
        <span className="text-emerald-600 dark:text-emerald-400">Yes</span>
        <span className="text-red-500 dark:text-red-400">No</span>
      </div>
    </div>
  )
}

const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  delay: DelayNode,
  condition: ConditionNode,
}

// ─── Palette ──────────────────────────────────────────────────────────────────

interface PaletteItem {
  type: 'action' | 'delay' | 'condition'
  actionType?: ActionType
  label: string
  group: 'Messages' | 'Lead' | 'Flow'
}

const PALETTE: PaletteItem[] = [
  { type: 'action', actionType: 'SEND_WHATSAPP',              label: 'Send WhatsApp',             group: 'Messages' },
  { type: 'action', actionType: 'SEND_EMAIL',                 label: 'Send Email',                group: 'Messages' },
  { type: 'action', actionType: 'SEND_SMS',                   label: 'Send SMS',                  group: 'Messages' },
  { type: 'action', actionType: 'SEND_INTERNAL_NOTIFICATION', label: 'Internal Notification',     group: 'Messages' },
  { type: 'action', actionType: 'ADD_TAG',                    label: 'Add Tag',                   group: 'Lead' },
  { type: 'action', actionType: 'REMOVE_TAG',                 label: 'Remove Tag',                group: 'Lead' },
  { type: 'action', actionType: 'MOVE_STAGE',                 label: 'Move Stage',                group: 'Lead' },
  { type: 'action', actionType: 'ASSIGN_USER',                label: 'Assign User',               group: 'Lead' },
  { type: 'action', actionType: 'CREATE_TASK',                label: 'Create Task',               group: 'Lead' },
  { type: 'action', actionType: 'UPDATE_FIELD',               label: 'Update Field',              group: 'Lead' },
  { type: 'delay',                                            label: 'Wait / Delay',              group: 'Flow' },
  { type: 'condition',                                        label: 'If / Else',                 group: 'Flow' },
  { type: 'action', actionType: 'SEND_WEBHOOK',               label: 'Send Webhook',              group: 'Flow' },
]

const PALETTE_GROUPS: ('Messages' | 'Lead' | 'Flow')[] = ['Messages', 'Lead', 'Flow']

let nodeCounter = 100

interface AutomationEditorProps {
  automationId: string | null
  userId: string
}

export function AutomationEditor({ automationId, userId: _userId }: AutomationEditorProps) {
  const router = useRouter()
  const { data: automation, isLoading } = useAutomation(automationId ?? '')
  const createAutomation = useCreateAutomation()
  const updateAutomation = useUpdateAutomation()
  const testRun = useTestRunAutomation()

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [name, setName] = useState('New Automation')
  const [triggerType, setTriggerType] = useState<TriggerType>('NEW_LEAD')
  const [enabled, setEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [rightPanel, setRightPanel] = useState<'config' | 'runs' | null>(null)
  const [testContactId, setTestContactId] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastLoadedId = useRef<string | null>(null)

  // Load existing automation. Only seeds the graph from server data once per
  // automationId so subsequent autosaves don't wipe in-flight edits.
  useEffect(() => {
    const a = automation as { id?: string; name?: string; triggerType?: TriggerType; enabled?: boolean; graph?: { nodes?: Node[]; edges?: Edge[] } } | undefined
    if (!a || !a.id) return
    if (lastLoadedId.current === a.id) return
    lastLoadedId.current = a.id

    setName(a.name ?? 'New Automation')
    setTriggerType(a.triggerType ?? 'NEW_LEAD')
    setEnabled(a.enabled ?? false)

    const g = a.graph as { nodes?: Node[]; edges?: Edge[] } | undefined
    if (g?.nodes?.length) {
      setNodes(g.nodes)
      setEdges(g.edges ?? [])
    } else {
      initDefaultGraph(a.triggerType ?? 'NEW_LEAD')
    }
  }, [automation]) // eslint-disable-line react-hooks/exhaustive-deps

  // Seed a default trigger node for new automations.
  useEffect(() => {
    if (!automationId && nodes.length === 0) initDefaultGraph(triggerType)
  }, [automationId]) // eslint-disable-line react-hooks/exhaustive-deps

  function initDefaultGraph(trigger: TriggerType) {
    const label = TRIGGER_TYPE_LABELS[trigger] ?? trigger
    setNodes([{ id: 'trigger-1', type: 'trigger', position: { x: 220, y: 40 }, data: { label, triggerType: trigger } }])
    setEdges([])
  }

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges],
  )

  // Auto-save debounced — only fires for existing automations (need an id to PATCH).
  useEffect(() => {
    if (!automationId) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        await updateAutomation.mutateAsync({
          id: automationId,
          data: { graph: { nodes, edges } as never },
        })
      } catch {
        // silent autosave failures
      }
    }, 1200)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [nodes, edges, automationId]) // eslint-disable-line react-hooks/exhaustive-deps

  function addNode(item: PaletteItem) {
    const id = `node-${++nodeCounter}`
    const label = item.actionType ? ACTION_TYPE_LABELS[item.actionType] : item.label
    const newNode: Node = {
      id,
      type: item.type,
      position: { x: 220, y: nodes.length * 130 + 180 },
      data: { label, actionType: item.actionType },
    }
    setNodes((ns) => [...ns, newNode])
    if (nodes.length > 0) {
      const lastNode = nodes[nodes.length - 1]
      setEdges((es) => addEdge({ source: lastNode.id, target: id, id: `e-${lastNode.id}-${id}` }, es))
    }
    setSelectedNodeId(id)
    setRightPanel('config')
  }

  function applyTemplate(templateId: string) {
    const tpl = AUTOMATION_TEMPLATES.find((t) => t.id === templateId)
    if (!tpl) return
    setTriggerType(tpl.triggerType)
    setNodes(tpl.graph.nodes)
    setEdges(tpl.graph.edges)
    setName(tpl.name)
    toast.success(`Loaded "${tpl.name}" — customize the nodes and save.`)
  }

  function patchNodeData(nodeId: string, patch: Record<string, unknown>) {
    setNodes((ns) =>
      ns.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)),
    )
  }

  function deleteNode(nodeId: string) {
    setNodes((ns) => ns.filter((n) => n.id !== nodeId))
    setEdges((es) => es.filter((e) => e.source !== nodeId && e.target !== nodeId))
    setSelectedNodeId(null)
    setRightPanel(null)
  }

  async function handleSave() {
    setSaving(true)
    const graph = { nodes, edges }
    try {
      if (automationId) {
        await updateAutomation.mutateAsync({
          id: automationId,
          data: { name, triggerType, graph: graph as never, enabled },
        })
      } else {
        const created = await createAutomation.mutateAsync({
          name,
          triggerType,
          triggerConfig: {},
          graph: graph as never,
          enabled,
        })
        const c = created as { automationId: string }
        router.replace(`/crm/automations/${c.automationId}`)
      }
      toast.success('Automation saved')
    } catch {
      toast.error('Failed to save automation')
    } finally {
      setSaving(false)
    }
  }

  async function handleTestRun() {
    if (!automationId) {
      toast.error('Save the automation first before running a test.')
      return
    }
    if (!testContactId) {
      toast.error('Pick a contact to test against.')
      return
    }
    try {
      await testRun.mutateAsync({ id: automationId, contactId: testContactId })
      toast.success('Test run enqueued — see Runs panel for output.')
      setRightPanel('runs')
    } catch {
      toast.error('Failed to start test run')
    }
  }

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  )

  const readinessIssues = useMemo(() => {
    return nodes
      .map((n) => ({ id: n.id, label: n.data?.label as string | undefined, ...isNodeReady(n) }))
      .filter((r) => !r.ready)
  }, [nodes])

  // Decorate edges for clarity: an If/Else node's branches become a green
  // labelled "Yes" edge and a red "No" edge, and every edge gets an arrowhead
  // so flow direction is obvious. Derived at render — sourceHandle (which the
  // worker uses to pick the branch) is preserved untouched, the saved graph
  // stays clean, and pre-existing automations get the styling automatically.
  const displayEdges = useMemo(
    () =>
      edges.map((e) => {
        if (e.sourceHandle === 'yes') {
          return {
            ...e,
            label: 'Yes',
            labelBgPadding: [6, 2] as [number, number],
            labelBgBorderRadius: 4,
            labelBgStyle: { fill: '#ecfdf5' },
            labelStyle: { fill: '#047857', fontWeight: 600, fontSize: 11 },
            style: { stroke: '#10b981', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#10b981' },
          }
        }
        if (e.sourceHandle === 'no') {
          return {
            ...e,
            label: 'No',
            labelBgPadding: [6, 2] as [number, number],
            labelBgBorderRadius: 4,
            labelBgStyle: { fill: '#fef2f2' },
            labelStyle: { fill: '#b91c1c', fontWeight: 600, fontSize: 11 },
            style: { stroke: '#ef4444', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#ef4444' },
          }
        }
        return {
          ...e,
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#94a3b8' },
        }
      }),
    [edges],
  )

  if (isLoading && automationId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm z-10">
        <Button variant="ghost" size="icon" onClick={() => router.push('/crm/automations')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="text-base font-semibold bg-transparent border-none outline-none text-slate-900 dark:text-white min-w-0 flex-1"
          placeholder="Automation name…"
        />

        <select
          value={triggerType}
          onChange={(e) => {
            const t = e.target.value as TriggerType
            setTriggerType(t)
            // Update the existing trigger node's label/triggerType in-place
            // instead of resetting the whole graph (which would wipe work).
            setNodes((ns) =>
              ns.map((n) =>
                n.type === 'trigger'
                  ? { ...n, data: { ...n.data, triggerType: t, label: TRIGGER_TYPE_LABELS[t] } }
                  : n,
              ),
            )
          }}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 dark:border-slate-700"
        >
          {TRIGGER_TYPES.map((t) => (
            <option key={t} value={t}>{TRIGGER_TYPE_LABELS[t]}</option>
          ))}
        </select>

        <TestRunControls
          testContactId={testContactId}
          setTestContactId={setTestContactId}
          onTest={handleTestRun}
          loading={testRun.isPending}
          disabled={!automationId}
        />

        <Button
          variant={rightPanel === 'runs' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setRightPanel(rightPanel === 'runs' ? null : 'runs')}
          disabled={!automationId}
        >
          <History className="h-4 w-4 mr-1.5" /> Runs
        </Button>

        <label className="flex items-center gap-1.5 text-sm pl-2 border-l border-slate-200 dark:border-slate-700">
          <span className="text-slate-600 dark:text-slate-300 text-xs">{enabled ? 'Live' : 'Draft'}</span>
          <button
            onClick={() => setEnabled(!enabled)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-4' : 'translate-x-1'}`} />
          </button>
        </label>

        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-1.5" />
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Palette */}
        <div className="w-56 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col overflow-y-auto p-3 gap-3 shrink-0">
          {!automationId && (
            <details open className="group">
              <summary className="cursor-pointer list-none mb-1 flex items-center gap-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <BookOpen className="h-3 w-3" /> Start from template
              </summary>
              <div className="space-y-1 mt-1">
                {AUTOMATION_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => applyTemplate(tpl.id)}
                    className="w-full text-left px-2.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:bg-blue-50/40 dark:hover:bg-blue-950/30 transition-colors"
                    title={tpl.summary}
                  >
                    <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">{tpl.name}</p>
                    <p className="text-[10px] text-slate-500 line-clamp-2 leading-tight mt-0.5">{tpl.summary}</p>
                  </button>
                ))}
              </div>
            </details>
          )}

          {PALETTE_GROUPS.map((group) => (
            <div key={group}>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                {group}
              </p>
              <div className="flex flex-col gap-1">
                {PALETTE.filter((p) => p.group === group).map((item) => {
                  const Icon = item.actionType ? ACTION_ICONS[item.actionType] : item.type === 'delay' ? Clock : GitBranch
                  return (
                    <button
                      key={`${item.type}-${item.label}`}
                      onClick={() => addNode(item)}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Canvas */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes.map((n) => ({ ...n, selected: n.id === selectedNodeId }))}
            edges={displayEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => {
              setSelectedNodeId(node.id)
              setRightPanel('config')
            }}
            onPaneClick={() => setSelectedNodeId(null)}
            nodeTypes={nodeTypes}
            fitView
            className="bg-slate-50 dark:bg-slate-950"
            defaultEdgeOptions={{
              animated: true,
              type: 'smoothstep',
              style: { stroke: '#94a3b8', strokeWidth: 1.5 },
            }}
          >
            <Background gap={20} color="#cbd5e1" />
            <Controls className="shadow-md!" />
            <MiniMap className="bg-white! dark:bg-slate-800! border! border-slate-200! dark:border-slate-700!" />
          </ReactFlow>

          {/* Readiness banner */}
          {enabled && readinessIssues.length > 0 && (
            <div className="absolute left-4 top-4 max-w-sm rounded-lg border border-amber-300 bg-amber-50/95 dark:bg-amber-950/90 dark:border-amber-800 px-3 py-2 text-xs shadow-md">
              <p className="font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                {readinessIssues.length} node{readinessIssues.length === 1 ? '' : 's'} need attention
              </p>
              <ul className="mt-1 ml-4 list-disc text-amber-700 dark:text-amber-300 space-y-0.5">
                {readinessIssues.slice(0, 4).map((r) => (
                  <li key={r.id}>{r.label ?? r.id} — {r.reason}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Status badge */}
          <div className="absolute bottom-4 right-4 z-10 pointer-events-none">
            <Badge variant={enabled ? 'default' : 'secondary'} className={enabled ? 'bg-emerald-500 hover:bg-emerald-500' : ''}>
              {enabled ? 'Live' : 'Draft'}
            </Badge>
          </div>
        </div>

        {/* Right panel: config or runs */}
        {rightPanel === 'config' && selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            onChange={(d) => patchNodeData(selectedNode.id, d)}
            onDelete={() => deleteNode(selectedNode.id)}
            onClose={() => setRightPanel(null)}
          />
        )}
        {rightPanel === 'runs' && automationId && (
          <RunsDrawer automationId={automationId} onClose={() => setRightPanel(null)} />
        )}
      </div>
    </div>
  )
}

// ─── Test-run controls ────────────────────────────────────────────────────────

function TestRunControls({
  testContactId,
  setTestContactId,
  onTest,
  loading,
  disabled,
}: {
  testContactId: string
  setTestContactId: (id: string) => void
  onTest: () => void
  loading: boolean
  disabled: boolean
}) {
  const { data } = useContacts({ pageSize: 20 })
  const contacts = (data as { data?: { id: string; firstName?: string | null; lastName?: string | null }[] } | undefined)?.data ?? []
  return (
    <div className="flex items-center gap-1">
      <select
        value={testContactId}
        onChange={(e) => setTestContactId(e.target.value)}
        className="text-xs border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 bg-white dark:bg-slate-800 max-w-40"
        title="Pick a contact to run a one-off test against"
        disabled={disabled}
      >
        <option value="">Test against…</option>
        {contacts.map((c) => (
          <option key={c.id} value={c.id}>
            {(c.firstName ?? '') + ' ' + (c.lastName ?? '')}
          </option>
        ))}
      </select>
      <Button
        variant="outline"
        size="sm"
        onClick={onTest}
        disabled={disabled || !testContactId || loading}
        title={disabled ? 'Save the automation first' : 'Fire a one-off run against the selected contact'}
      >
        <Play className="h-3.5 w-3.5 mr-1" /> {loading ? 'Running…' : 'Test run'}
      </Button>
    </div>
  )
}
