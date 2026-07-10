'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/crm/utils'

// ─── Form schema ──────────────────────────────────────────────────────────────

const FormSchema = z.object({
  contactName: z.string().min(1, 'Contact name is required'),
  contactPhone: z.string().min(1, 'Phone number is required'),
  contactEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  pipelineId: z.string().min(1, 'Pipeline is required'),
  stageId: z.string().min(1, 'Stage is required'),
  assignedUserId: z.string().optional(),
})
type FormValues = z.infer<typeof FormSchema>

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface OpportunityModalProps {
  pipelines: Pipeline[]
  users: BranchUser[]
  defaultPipelineId?: string
  defaultStageId?: string
  onClose: () => void
  onSuccess?: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OpportunityModal({
  pipelines,
  users,
  defaultPipelineId,
  defaultStageId,
  onClose,
  onSuccess,
}: OpportunityModalProps) {
  // Only allow real pipelines (skip synthetic "all:*" entries)
  const realPipelines = pipelines.filter((p) => !p.id.startsWith('all:') && !!p.branchId)
  const pickableDefault =
    defaultPipelineId && !defaultPipelineId.startsWith('all:')
      ? defaultPipelineId
      : realPipelines[0]?.id ?? ''

  const [submitting, setSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      contactName: '',
      contactPhone: '',
      contactEmail: '',
      pipelineId: pickableDefault,
      stageId: defaultStageId ?? '',
      assignedUserId: '',
    },
  })

  const selectedPipelineId = watch('pipelineId')
  const selectedPipeline = realPipelines.find((p) => p.id === selectedPipelineId)

  // Auto-select first stage whenever the pipeline changes
  useEffect(() => {
    if (selectedPipeline?.stages[0]) {
      setValue('stageId', selectedPipeline.stages[0].id)
    }
  }, [selectedPipelineId, selectedPipeline, setValue])

  async function onSubmit(values: FormValues) {
    if (!selectedPipeline) {
      toast.error('Please select a pipeline')
      return
    }
    setSubmitting(true)
    try {
      // 1. Create contact
      const fullName = values.contactName.trim().split(/\s+/)
      const firstName = fullName[0]
      const lastName = fullName.length > 1 ? fullName.slice(1).join(' ') : undefined

      const contactRes = await fetch('/api/crm/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          phone: values.contactPhone,
          email: values.contactEmail || undefined,
          branchId: selectedPipeline.branchId,
        }),
      })
      if (!contactRes.ok) {
        const err = await contactRes.json().catch(() => ({}))
        throw new Error(err.error ?? 'Failed to create contact')
      }
      const { contactId } = (await contactRes.json()) as { contactId: string }

      // 2. Create opportunity
      const oppRes = await fetch('/api/crm/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId,
          pipelineId: values.pipelineId,
          stageId: values.stageId,
          value: 0,
          assignedUserId: values.assignedUserId || undefined,
          branchId: selectedPipeline.branchId,
        }),
      })
      if (!oppRes.ok) {
        const err = await oppRes.json().catch(() => ({}))
        throw new Error(err.error ?? 'Failed to create opportunity')
      }

      toast.success('Opportunity created')
      onSuccess?.()
      onClose()
    } catch (e) {
      toast.error((e as Error).message || 'Failed to create opportunity')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">New Opportunity</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Create a new contact and opportunity in one step.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Contact section */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Contact Details
              </h3>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Contact Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  {...register('contactName')}
                  placeholder="Full name"
                  className={cn(
                    'w-full rounded-lg border px-3 py-2 text-sm',
                    'bg-white dark:bg-slate-800 text-slate-900 dark:text-white',
                    'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500',
                    errors.contactName
                      ? 'border-red-400 dark:border-red-500'
                      : 'border-slate-300 dark:border-slate-600',
                  )}
                />
                {errors.contactName && <p className="text-xs text-red-500">{errors.contactName.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Phone <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    {...register('contactPhone')}
                    placeholder="0123456789"
                    className={cn(
                      'w-full rounded-lg border px-3 py-2 text-sm',
                      'bg-white dark:bg-slate-800 text-slate-900 dark:text-white',
                      'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500',
                      errors.contactPhone
                        ? 'border-red-400 dark:border-red-500'
                        : 'border-slate-300 dark:border-slate-600',
                    )}
                  />
                  {errors.contactPhone && <p className="text-xs text-red-500">{errors.contactPhone.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
                  <input
                    type="email"
                    {...register('contactEmail')}
                    placeholder="optional"
                    className={cn(
                      'w-full rounded-lg border px-3 py-2 text-sm',
                      'bg-white dark:bg-slate-800 text-slate-900 dark:text-white',
                      'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500',
                      errors.contactEmail
                        ? 'border-red-400 dark:border-red-500'
                        : 'border-slate-300 dark:border-slate-600',
                    )}
                  />
                  {errors.contactEmail && <p className="text-xs text-red-500">{errors.contactEmail.message}</p>}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-700" />

            {/* Opportunity section */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Opportunity
              </h3>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Pipeline (Branch) <span className="text-red-500">*</span>
                </label>
                <select
                  {...register('pipelineId')}
                  className={cn(
                    'w-full rounded-lg border px-3 py-2 text-sm',
                    'bg-white dark:bg-slate-800 text-slate-900 dark:text-white',
                    'focus:outline-none focus:ring-2 focus:ring-indigo-500',
                    errors.pipelineId
                      ? 'border-red-400 dark:border-red-500'
                      : 'border-slate-300 dark:border-slate-600',
                  )}
                >
                  <option value="">Select a branch pipeline…</option>
                  {realPipelines.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {errors.pipelineId && <p className="text-xs text-red-500">{errors.pipelineId.message}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Stage <span className="text-red-500">*</span>
                </label>
                <select
                  {...register('stageId')}
                  disabled={!selectedPipeline}
                  className={cn(
                    'w-full rounded-lg border px-3 py-2 text-sm',
                    'bg-white dark:bg-slate-800 text-slate-900 dark:text-white',
                    'focus:outline-none focus:ring-2 focus:ring-indigo-500',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    errors.stageId
                      ? 'border-red-400 dark:border-red-500'
                      : 'border-slate-300 dark:border-slate-600',
                  )}
                >
                  <option value="">Select stage…</option>
                  {(selectedPipeline?.stages ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {errors.stageId && <p className="text-xs text-red-500">{errors.stageId.message}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Owner</label>
                <select
                  {...register('assignedUserId')}
                  className={cn(
                    'w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm',
                    'bg-white dark:bg-slate-800 text-slate-900 dark:text-white',
                    'focus:outline-none focus:ring-2 focus:ring-indigo-500',
                  )}
                >
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name ?? u.email}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-700 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Opportunity
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
