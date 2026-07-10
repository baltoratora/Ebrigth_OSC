'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Save,
  ExternalLink,
  Copy,
  ChevronUp,
  ChevronDown,
  Settings2,
  CornerDownRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/crm/utils'
import {
  type FormField,
  type FormFieldType,
  type FormSchemaV2,
  type FormStep,
  genId,
} from '@/lib/crm/forms-types'

interface FormRow {
  id: string
  name: string
  publicSlug: string
  branchId: string
  schema: FormSchemaV2
}

const FIELD_TYPES: Array<{ value: FormFieldType; label: string }> = [
  { value: 'text',     label: 'Short text' },
  { value: 'textarea', label: 'Paragraph' },
  { value: 'email',    label: 'Email' },
  { value: 'tel',      label: 'Phone' },
  { value: 'number',   label: 'Number' },
  { value: 'select',   label: 'Dropdown' },
  { value: 'choice',   label: 'Choice (buttons)' },
  { value: 'date',     label: 'Date' },
]

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const e = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((e as { error?: string }).error ?? res.statusText)
  }
  return res.json() as Promise<T>
}

export default function FormEditorPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id ?? ''
  const router = useRouter()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery<{ form: FormRow }>({
    queryKey: ['crm', 'forms', id],
    queryFn: () => fetchJson(`/api/crm/forms/${id}`),
    enabled: !!id,
  })

  const [schema, setSchema] = useState<FormSchemaV2 | null>(null)
  const [name, setName] = useState('')
  const [activeStepIdx, setActiveStepIdx] = useState(0)
  const [expandedField, setExpandedField] = useState<string | null>(null)

  useEffect(() => {
    if (data?.form) {
      setSchema(data.form.schema)
      setName(data.form.name)
    }
  }, [data])

  const saveMutation = useMutation({
    mutationFn: () =>
      fetchJson(`/api/crm/forms/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, schema }),
      }),
    onSuccess: () => {
      toast.success('Form saved')
      void qc.invalidateQueries({ queryKey: ['crm', 'forms'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function updateSchema(mut: (s: FormSchemaV2) => FormSchemaV2) {
    setSchema((s) => (s ? mut(s) : s))
  }

  function addStep() {
    updateSchema((s) => ({
      ...s,
      steps: [...s.steps, { id: genId('step'), title: `Step ${s.steps.length + 1}`, fields: [] }],
    }))
    setActiveStepIdx((schema?.steps.length ?? 0))
  }

  function removeStep(stepId: string) {
    updateSchema((s) => ({ ...s, steps: s.steps.filter((st) => st.id !== stepId) }))
    setActiveStepIdx((i) => Math.max(0, i - 1))
  }

  function updateStep(stepId: string, patch: Partial<FormStep>) {
    updateSchema((s) => ({
      ...s,
      steps: s.steps.map((st) => (st.id === stepId ? { ...st, ...patch } : st)),
    }))
  }

  function addField(stepId: string, type: FormFieldType = 'text') {
    const newId = genId()
    updateSchema((s) => ({
      ...s,
      steps: s.steps.map((st) =>
        st.id === stepId
          ? {
              ...st,
              fields: [
                ...st.fields,
                { id: newId, type, label: 'New field', required: false, options: type === 'select' || type === 'choice' ? ['Option 1', 'Option 2'] : undefined },
              ],
            }
          : st,
      ),
    }))
    setExpandedField(newId)
  }

  function updateField(stepId: string, fieldId: string, patch: Partial<FormField>) {
    updateSchema((s) => ({
      ...s,
      steps: s.steps.map((st) =>
        st.id === stepId
          ? { ...st, fields: st.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)) }
          : st,
      ),
    }))
  }

  function removeField(stepId: string, fieldId: string) {
    updateSchema((s) => ({
      ...s,
      steps: s.steps.map((st) =>
        st.id === stepId ? { ...st, fields: st.fields.filter((f) => f.id !== fieldId) } : st,
      ),
    }))
  }

  function moveField(stepId: string, fieldId: string, direction: -1 | 1) {
    updateSchema((s) => ({
      ...s,
      steps: s.steps.map((st) => {
        if (st.id !== stepId) return st
        const idx = st.fields.findIndex((f) => f.id === fieldId)
        const newIdx = idx + direction
        if (idx < 0 || newIdx < 0 || newIdx >= st.fields.length) return st
        const copy = [...st.fields]
        ;[copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]]
        return { ...st, fields: copy }
      }),
    }))
  }

  function copyLink() {
    if (!data?.form) return
    navigator.clipboard.writeText(`${window.location.origin}/f/${data.form.publicSlug}`)
    toast.success('Link copied')
  }

  const activeStep = useMemo(
    () => (schema ? schema.steps[activeStepIdx] ?? schema.steps[0] : undefined),
    [schema, activeStepIdx],
  )

  if (isLoading || !schema || !activeStep) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  const color = schema.primaryColor ?? '#dc2626'

  return (
    <div className="space-y-5 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/crm/forms"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400"
          >
            <ArrowLeft className="h-4 w-4" /> Forms
          </Link>
          <div className="h-4 w-px bg-slate-300 dark:bg-slate-700" />
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 w-72 text-lg font-semibold"
            placeholder="Form name"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Color picker */}
          <div className="flex items-center gap-1.5 rounded-md border border-slate-200 p-1 dark:border-slate-700">
            <Input
              type="color"
              value={color}
              onChange={(e) => updateSchema((s) => ({ ...s, primaryColor: e.target.value }))}
              className="h-7 w-10 cursor-pointer border-0 p-0"
            />
            <code className="pr-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">{color}</code>
          </div>
          <Button variant="outline" onClick={copyLink}>
            <Copy className="mr-2 h-4 w-4" /> Link
          </Button>
          <Button variant="outline" asChild>
            <Link href={data?.form ? `/f/${data.form.publicSlug}` : '#'} target="_blank">
              <ExternalLink className="mr-2 h-4 w-4" /> Open
            </Link>
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-[1fr_500px]">
        {/* LEFT: Editor */}
        <div className="space-y-4">
          {/* Step tabs */}
          <div className="flex flex-wrap items-center gap-2">
            {schema.steps.map((step, i) => (
              <button
                key={step.id}
                onClick={() => setActiveStepIdx(i)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition',
                  i === activeStepIdx
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400',
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                    i === activeStepIdx ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
                  )}
                >
                  {i + 1}
                </span>
                <span>{step.title || `Step ${i + 1}`}</span>
                {schema.steps.length > 1 && i === activeStepIdx && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation()
                      if (confirm(`Delete step "${step.title || i + 1}"?`)) removeStep(step.id)
                    }}
                    className="ml-1 cursor-pointer text-slate-400 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </span>
                )}
              </button>
            ))}
            <Button variant="outline" size="sm" onClick={addStep}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Step
            </Button>
          </div>

          {/* Step settings */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-slate-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Step {activeStepIdx + 1} Settings
              </span>
            </div>
            <div className="mt-3">
              <Label className="text-xs">Title (shown as red heading above fields)</Label>
              <Input
                value={activeStep.title ?? ''}
                onChange={(e) => updateStep(activeStep.id, { title: e.target.value })}
                placeholder={`Step ${activeStepIdx + 1}`}
                className="mt-1"
              />
            </div>
          </div>

          {/* Field list */}
          <div className="space-y-2">
            {activeStep.fields.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                No fields yet. Add your first field below.
              </div>
            )}

            {activeStep.fields.map((field, fIdx) => (
              <FieldCard
                key={field.id}
                field={field}
                isExpanded={expandedField === field.id}
                onToggleExpand={() => setExpandedField(expandedField === field.id ? null : field.id)}
                onUpdate={(patch) => updateField(activeStep.id, field.id, patch)}
                onRemove={() => removeField(activeStep.id, field.id)}
                onMoveUp={() => moveField(activeStep.id, field.id, -1)}
                onMoveDown={() => moveField(activeStep.id, field.id, 1)}
                canMoveUp={fIdx > 0}
                canMoveDown={fIdx < activeStep.fields.length - 1}
              />
            ))}
          </div>

          {/* Add field quick picker */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-2 flex items-center gap-2">
              <Plus className="h-4 w-4 text-slate-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Add a Field
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {FIELD_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => addField(activeStep.id, t.value)}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-indigo-500 dark:hover:bg-indigo-950"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Success message (last section) */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-3 flex items-center gap-2">
              <CornerDownRight className="h-4 w-4 text-slate-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Success Screen
              </span>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Title</Label>
                <Input
                  value={schema.successTitle ?? ''}
                  onChange={(e) => updateSchema((s) => ({ ...s, successTitle: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Message</Label>
                <Textarea
                  value={schema.successMessage ?? ''}
                  onChange={(e) => updateSchema((s) => ({ ...s, successMessage: e.target.value }))}
                  rows={2}
                  className="mt-1"
                />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Live preview */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="mb-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold uppercase tracking-wider">Live Preview — Step {activeStepIdx + 1} of {schema.steps.length}</span>
          </div>
          <div className="rounded-2xl bg-slate-200 p-6 dark:bg-slate-950/50">
            <PreviewForm schema={schema} stepIdx={activeStepIdx} color={color} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Field card (collapsible) ─────────────────────────────────────────────────

function FieldCard({
  field,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  field: FormField
  isExpanded: boolean
  onToggleExpand: () => void
  onUpdate: (patch: Partial<FormField>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      {/* Summary row */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-900"
      >
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMoveUp() }}
            disabled={!canMoveUp}
            className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMoveDown() }}
            disabled={!canMoveDown}
            className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{field.label}</span>
            {field.required && <span className="text-xs text-red-500">*</span>}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] dark:bg-slate-700">
              {FIELD_TYPES.find((t) => t.value === field.type)?.label ?? field.type}
            </span>
            {field.placeholder && <span className="truncate italic">&ldquo;{field.placeholder}&rdquo;</span>}
          </div>
        </div>

        <span
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950"
        >
          <Trash2 className="h-4 w-4" />
        </span>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {/* Expanded editor */}
      {isExpanded && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
          <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
            <div>
              <Label className="text-xs">Label</Label>
              <Input value={field.label} onChange={(e) => onUpdate({ label: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={field.type} onValueChange={(v) => onUpdate({ type: v as FormFieldType })}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <Checkbox
              checked={field.required ?? false}
              onCheckedChange={(v) => onUpdate({ required: !!v })}
            />
            Required field (shows red * asterisk)
          </label>

          {(field.type === 'text' || field.type === 'email' || field.type === 'tel' || field.type === 'number' || field.type === 'textarea') && (
            <div>
              <Label className="text-xs">Placeholder</Label>
              <Input
                value={field.placeholder ?? ''}
                onChange={(e) => onUpdate({ placeholder: e.target.value })}
                className="mt-1"
                placeholder="e.g. Example: Jonathan Tan"
              />
            </div>
          )}

          <div>
            <Label className="text-xs">Help Text (italic grey below input)</Label>
            <Input
              value={field.helpText ?? ''}
              onChange={(e) => onUpdate({ helpText: e.target.value })}
              className="mt-1"
              placeholder="e.g. Reminders will be sent via WhatsApp..."
            />
          </div>

          {(field.type === 'select' || field.type === 'choice') && (
            <div>
              <Label className="text-xs">Options (one per line)</Label>
              <Textarea
                value={(field.options ?? []).join('\n')}
                onChange={(e) =>
                  onUpdate({
                    options: e.target.value
                      .split('\n')
                      .map((x) => x.trim())
                      .filter(Boolean),
                  })
                }
                rows={4}
                className="mt-1"
                placeholder="1&#10;2&#10;3&#10;4"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Red preview ──────────────────────────────────────────────────────────────

function PreviewForm({ schema, stepIdx, color }: { schema: FormSchemaV2; stepIdx: number; color: string }) {
  const step = schema.steps[stepIdx]
  const progress = ((stepIdx + 1) / schema.steps.length) * 100
  const isLast = stepIdx === schema.steps.length - 1

  return (
    <div className="mx-auto w-full max-w-[420px] overflow-hidden rounded-2xl bg-white shadow-xl" style={{ borderTop: `6px solid ${color}` }}>
      <div
        className="px-6 py-6 text-center text-white"
        style={{ background: `linear-gradient(135deg, ${color}, ${shade(color, -15)})` }}
      >
        <h1 className="text-2xl font-extrabold tracking-tight">Trial Class</h1>
        <p className="mt-0.5 text-xs opacity-90">Registration</p>
        <div className="mx-auto mt-4 h-1 w-full rounded-full bg-white/30">
          <div className="h-full rounded-full bg-white transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="px-5 py-5">
        {step.title && (
          <h2 className="mb-4 text-xs font-bold uppercase tracking-wider" style={{ color }}>
            {step.title}
          </h2>
        )}
        {step.fields.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400 italic">(No fields yet)</p>
        ) : (
          <div className="space-y-4">
            {step.fields.map((f) => (
              <PreviewField key={f.id} field={f} color={color} />
            ))}
          </div>
        )}

        <div className="mt-5 space-y-2">
          <button
            type="button"
            disabled
            className="w-full rounded-xl py-2.5 text-sm font-bold uppercase tracking-wide text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${color}, ${shade(color, -15)})` }}
          >
            {isLast ? 'Submit' : 'Next'}
          </button>
          {stepIdx > 0 && (
            <button
              type="button"
              disabled
              className="w-full rounded-xl bg-slate-100 py-2.5 text-sm font-bold uppercase tracking-wide text-slate-600"
            >
              Back
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function PreviewField({ field, color }: { field: FormField; color: string }) {
  const labelEl = (
    <label className="mb-1 block text-xs font-bold text-slate-900">
      {field.label}
      {field.required && <span className="ml-1" style={{ color }}>*</span>}
    </label>
  )

  let control: React.ReactNode = null
  const inputClass = 'w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400'

  if (field.type === 'textarea') {
    control = <textarea disabled placeholder={field.placeholder} rows={3} className={inputClass} />
  } else if (field.type === 'select') {
    control = (
      <div className="relative">
        <select disabled className={`${inputClass} appearance-none pr-8`} style={{ borderColor: color }}>
          <option>{field.placeholder ?? 'Please select'}</option>
        </select>
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">▾</div>
      </div>
    )
  } else if (field.type === 'choice') {
    const opts = field.options ?? []
    const cols = opts.length <= 2 ? 'grid-cols-2' : opts.length === 3 ? 'grid-cols-3' : 'grid-cols-4'
    control = (
      <div className={`grid gap-2 ${cols}`}>
        {opts.slice(0, 4).map((o, i) => (
          <button
            key={o}
            disabled
            className="flex h-10 items-center justify-center rounded-lg border-2 text-sm font-bold"
            style={i === 0 ? { backgroundColor: color, borderColor: color, color: 'white' } : { borderColor: '#e2e8f0', color: '#334155' }}
          >
            {o}
          </button>
        ))}
      </div>
    )
  } else if (field.type === 'date') {
    control = <input type="date" disabled className={inputClass} />
  } else {
    control = <input type={field.type} disabled placeholder={field.placeholder} className={inputClass} />
  }

  return (
    <div>
      {labelEl}
      {control}
      {field.helpText && <p className="mt-1 text-[10px] italic text-slate-500">{field.helpText}</p>}
    </div>
  )
}

function shade(hex: string, amount: number): string {
  const h = hex.replace('#', '')
  if (h.length !== 6) return hex
  const num = parseInt(h, 16)
  let r = (num >> 16) + amount
  let g = ((num >> 8) & 0x00ff) + amount
  let b = (num & 0x0000ff) + amount
  r = Math.max(0, Math.min(255, r))
  g = Math.max(0, Math.min(255, g))
  b = Math.max(0, Math.min(255, b))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
