'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { ArrowLeft, ArrowRight, Loader2, Paperclip, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/crm/utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreateTicket, useTktPlatforms, useTktBranches } from '@/hooks/crm/useTickets'
import { PlatformFieldsForm } from './PlatformFieldsForm'
import { useCrmSession } from '@/components/crm/providers'
import { useBranchContext } from '@/components/crm/branch-context'
import { crmBranchToTktBranchNumber } from '@/lib/crm/branch-number'

const SUB_TYPES_BY_PLATFORM: Record<string, Array<{ value: string; label: string }>> = {
  aone: [
    { value: 'freeze_student',  label: 'Freeze Student' },
    { value: 'archive_student', label: 'Archive Student' },
    { value: 'extend',          label: 'Extend' },
    { value: 'delete_invoice',  label: 'Delete Invoice' },
    { value: 'login_issue',     label: 'Login Issue' },
    { value: 'others',          label: 'Others' },
  ],
  ghl: [
    { value: 'leads', label: 'Leads' },
    { value: 'tally', label: 'Tally' },
    { value: 'organizing_leads', label: 'Organizing Leads' },
    { value: 'booking', label: 'Booking' },
    { value: 'workflow', label: 'Workflow' },
    { value: 'others', label: 'Others' },
  ],
  'process-street': [
    { value: 'extend', label: 'Extend' },
    { value: 'others', label: 'Others' },
  ],
  clickup: [
    { value: 'missing', label: 'Missing' },
    { value: 'duplicate', label: 'Duplicate' },
    { value: 'linkage', label: 'Linkage' },
    { value: 'others', label: 'Others' },
  ],
  lead: [
    { value: 'missing', label: 'Missing' },
    { value: 'duplicate', label: 'Duplicate' },
    { value: 'delete', label: 'Delete' },
    { value: 'others', label: 'Others' },
  ],
  // For the catchall "Others" platform we don't show a generic issue list —
  // the user instead picks a *department* card on step 2 (see DEPARTMENT_CARDS
  // below). Keys still need to exist so SUB_TYPES_BY_PLATFORM[slug] doesn't
  // return undefined when re-entering step 2 from "Back".
  other:  [],
  others: [],
}

// Department cards rendered on step 2 when the user picked the "Others"
// platform on step 1. The chosen department becomes the ticket sub_type so
// downstream UIs (kanban / table) can group by department, and step 3 only
// has to ask for Position + Remarks.
const DEPARTMENT_CARDS: ReadonlyArray<{ value: string; label: string; color: string }> = [
  { value: 'ceo',             label: 'CEO',            color: '#ef4444' },
  { value: 'optimisation',    label: 'Optimisation',   color: '#3b82f6' },
  { value: 'finance',         label: 'Finance',        color: '#10b981' },
  { value: 'human_resource',  label: 'Human Resource', color: '#f59e0b' },
  { value: 'operation',       label: 'Operation',      color: '#8b5cf6' },
  { value: 'academy',         label: 'Academy',        color: '#06b6d4' },
  { value: 'marketing',       label: 'Marketing',      color: '#ec4899' },
]

function isOthersPlatform(slug: string): boolean {
  return slug === 'other' || slug === 'others'
}

type Step = 'platform' | 'subtype' | 'details'

interface FormValues {
  platformId: string
  platformSlug: string
  subType: string
  branchId: string
  fields: Record<string, unknown>
}

export function TicketForm() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('platform')
  const { data: platforms = [] } = useTktPlatforms()
  const { data: branches = [] } = useTktBranches()
  const createMutation = useCreateTicket()

  // Optional image attachment — ONLY offered for the Lead platform.
  const [attachment, setAttachment] = useState<File | null>(null)
  const [uploadingAttachment, setUploadingAttachment] = useState(false)

  function handleAttachmentChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) { setAttachment(null); return }
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(f.type)) {
      toast.error('Only JPG, JPEG, PNG or WebP images are allowed')
      e.target.value = ''
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error('Image must be 10MB or smaller')
      e.target.value = ''
      return
    }
    setAttachment(f)
  }

  // Upload a single image to a freshly-created ticket via the server-side proxy
  // route (one request: the server streams it to S3 and registers the row).
  // This replaces the old presign + browser-direct-PUT flow, which failed with
  // "Failed to fetch" when the S3 bucket's CORS blocked cross-origin PUTs.
  async function uploadLeadAttachment(ticketId: string, file: File) {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('fileType', 'general')
    const res = await fetch(`/api/crm/tickets/${ticketId}/attachments/upload`, {
      method: 'POST',
      body: fd,
    })
    if (!res.ok) {
      const msg = await res.json().catch(() => null)
      throw new Error(msg?.error || 'Upload failed')
    }
  }

  const { control, handleSubmit, watch, setValue, getValues, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      platformId: '',
      platformSlug: '',
      subType: '',
      branchId: '',
      fields: {},
    },
  })

  const platformSlug = watch('platformSlug')
  const subType = watch('subType')
  const branchId = watch('branchId')
  // Position lives at top-level form state (matches the existing Controller
  // pattern in PlatformFieldsForm). Used to decide whether to show Branch.
  const position = watch('position' as never) as unknown as string | undefined

  // Branch field is only relevant when the ticket actually targets a branch.
  // For Others tickets (Department in step 2) it depends on Position:
  //   - Branch Manager / Full-time Coach / Part-time Coach → branch needed
  //   - CEO / HOD / Executive / Intern                     → branch NOT shown
  const POSITIONS_NEEDING_BRANCH = new Set([
    'branch_manager',
    'full_time_coach',
    'part_time_coach',
  ])
  const isOthersPlatformSel = platformSlug === 'other' || platformSlug === 'others'
  const showBranchField = isOthersPlatformSel
    ? !!position && POSITIONS_NEEDING_BRANCH.has(position)
    : true

  // Branch picker is only OPEN for super_admin / agency_admin (mapped to
  // tktRole === 'super_admin' via the SSO bridge). Everyone else is locked
  // to their own branch — the API returns only their branches anyway, but
  // we also force-pick the first one and disable the dropdown so a multi-
  // branch BM still files against a single specific branch.
  //
  // Even for admins, if the topbar branch switcher is set to a specific
  // branch, the picker is locked to that branch (consistent with the
  // dashboard / list views — "branch view" applies to ticket creation too).
  const { session } = useCrmSession()
  const tktRole = (session?.user as { tktRole?: string | null } | undefined)?.tktRole ?? 'user'
  const { selectedBranch } = useBranchContext()
  const switcherBranchNumber = crmBranchToTktBranchNumber(selectedBranch?.name)
  const switcherLockedBranch = switcherBranchNumber
    ? branches.find((b) => b.branch_number === switcherBranchNumber) ?? null
    : null
  const canPickBranch = tktRole === 'super_admin' && !switcherLockedBranch

  // Auto-fill when the user can't pick (or when there's only one option).
  useEffect(() => {
    if (switcherLockedBranch) {
      // Topbar selection wins — even for admins.
      if (branchId !== switcherLockedBranch.id) {
        setValue('branchId', switcherLockedBranch.id)
      }
      return
    }
    if (!canPickBranch && branches.length > 0 && !branchId) {
      setValue('branchId', branches[0].id)
    }
    if (canPickBranch && branches.length === 1 && !branchId) {
      // Edge case: an admin with only one branch in the tenant — auto-fill too.
      setValue('branchId', branches[0].id)
    }
  }, [branches, branchId, canPickBranch, switcherLockedBranch, setValue])

  // When Branch is hidden (Others ticket with a non-branch position), the
  // CreateTicketSchema still requires a valid branchId.uuid — pre-fill it
  // with the first available branch (HQ / Ebright HR row will sort first
  // by branch_number) so the submit succeeds. Picking the actual branch
  // isn't meaningful for these positions and the kanban groups by sub_type
  // (department) anyway.
  useEffect(() => {
    if (!showBranchField && branches.length > 0 && !branchId) {
      setValue('branchId', branches[0].id)
    }
  }, [showBranchField, branches, branchId, setValue])

  async function onSubmit(values: FormValues) {
    // The dynamic field components inside PlatformFieldsForm register their
    // Controllers at top-level names (`remarks`, `position`, `stage`, …)
    // rather than nested under `fields.X`. Gather everything that isn't a
    // structural form key into the `fields` payload the API expects.
    const STRUCTURAL_KEYS = new Set([
      'platformId', 'platformSlug', 'subType', 'branchId', 'fields',
    ])
    const all = getValues() as unknown as Record<string, unknown>
    const collectedFields: Record<string, unknown> = { ...(values.fields ?? {}) }
    for (const [key, val] of Object.entries(all)) {
      if (STRUCTURAL_KEYS.has(key)) continue
      if (val === undefined || val === '') continue
      collectedFields[key] = val
    }

    const created = await createMutation.mutateAsync({
      platformSlug: values.platformSlug,
      branchId: values.branchId,
      subType: values.subType,
      fields: collectedFields,
    })

    // Lead-platform optional attachment — upload after the ticket exists.
    // A failed upload must NOT lose the ticket; warn and continue.
    if (attachment && values.platformSlug === 'lead') {
      setUploadingAttachment(true)
      try {
        await uploadLeadAttachment(created.ticketId, attachment)
      } catch (e) {
        toast.error(
          `Ticket created, but the image upload failed (${(e as Error).message}). You can add it from the ticket page.`,
        )
      } finally {
        setUploadingAttachment(false)
      }
    }

    router.push('/crm/tickets')
  }

  return (
    <div className="mx-auto max-w-3xl">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <StepIndicator step={step} />

        {step === 'platform' && (
          <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Select Platform</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {platforms.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setValue('platformId', p.id)
                    setValue('platformSlug', p.slug)
                    setValue('subType', '')
                    setStep('subtype')
                  }}
                  className="group flex flex-col items-start gap-2 rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-slate-400 hover:shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-500"
                >
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: p.accent_color }}
                  />
                  <div className="font-medium text-slate-900 dark:text-slate-100">{p.name}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Code {p.code}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'subtype' && (
          <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
              {isOthersPlatform(platformSlug) ? 'Select Department' : 'Select Issue Type'}
            </h2>

            {isOthersPlatform(platformSlug) ? (
              // Department cards — same look as the platform cards on step 1.
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {DEPARTMENT_CARDS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => {
                      setValue('subType', d.value)
                      setStep('details')
                    }}
                    className={cn(
                      'group flex flex-col items-start gap-2 rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-slate-400 hover:shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-500',
                      subType === d.value && 'border-blue-500 ring-2 ring-blue-200 dark:border-blue-400 dark:ring-blue-900',
                    )}
                  >
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: d.color }} />
                    <div className="font-medium text-slate-900 dark:text-slate-100">{d.label}</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid gap-2">
                {(SUB_TYPES_BY_PLATFORM[platformSlug] ?? []).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setValue('subType', opt.value)
                      setStep('details')
                    }}
                    className={cn(
                      'rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-500',
                      subType === opt.value && 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950',
                    )}
                  >
                    <div className="font-medium text-slate-900 dark:text-slate-100">{opt.label}</div>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 flex justify-between">
              <Button type="button" variant="outline" onClick={() => setStep('platform')}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
            </div>
          </div>
        )}

        {step === 'details' && (
          <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Ticket Details</h2>

            {showBranchField && (
              <div>
                <Label htmlFor="branchId">Branch</Label>
                <Select
                  value={watch('branchId')}
                  onValueChange={(v) => setValue('branchId', v)}
                  // Locked for anyone who isn't super_admin / agency_admin. They
                  // file tickets against their own branch only. Admins get the
                  // full dropdown to pick any branch in the tenant.
                  disabled={!canPickBranch || branches.length <= 1}
                >
                  <SelectTrigger id="branchId" className="mt-1">
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.branch_number} — {b.name} ({b.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!canPickBranch && (
                  <p className="mt-1 text-[11px] italic text-slate-500">
                    {switcherLockedBranch
                      ? `Locked to ${switcherLockedBranch.branch_number} — ${switcherLockedBranch.name} (topbar branch view).`
                      : 'Locked to your branch.'}
                  </p>
                )}
                {errors.branchId && <p className="mt-1 text-xs text-red-500">Branch is required</p>}
              </div>
            )}

            <PlatformFieldsForm
              platformSlug={platformSlug}
              subType={subType}
              control={control as unknown as Parameters<typeof PlatformFieldsForm>[0]['control']}
              errors={errors}
            />

            {/* Optional image attachment — Lead platform only. */}
            {platformSlug === 'lead' && (
              <div>
                <Label htmlFor="lead-attachment">
                  Attachment <span className="font-normal text-slate-400">(optional — JPG / JPEG / PNG / WebP)</span>
                </Label>
                {attachment ? (
                  <div className="mt-1 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
                    <span className="flex min-w-0 items-center gap-2 text-slate-700 dark:text-slate-200">
                      <Paperclip className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="truncate">{attachment.name}</span>
                      <span className="shrink-0 text-xs text-slate-400">
                        ({(attachment.size / 1024).toFixed(0)} KB)
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setAttachment(null)}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                      title="Remove attachment"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <label
                    htmlFor="lead-attachment"
                    className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-500 transition hover:border-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-500"
                  >
                    <Paperclip className="h-4 w-4" />
                    Click to attach an image
                  </label>
                )}
                <input
                  id="lead-attachment"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  onChange={handleAttachmentChange}
                  className="hidden"
                />
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button type="button" variant="outline" onClick={() => setStep('subtype')}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button type="submit" disabled={createMutation.isPending || uploadingAttachment}>
                {createMutation.isPending || uploadingAttachment ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {uploadingAttachment ? 'Uploading…' : 'Submitting...'}
                  </>
                ) : (
                  <>
                    Submit Ticket <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}

function StepIndicator({ step }: { step: Step }) {
  const steps: Array<{ key: Step; label: string }> = [
    { key: 'platform', label: 'Platform' },
    { key: 'subtype', label: 'Type' },
    { key: 'details', label: 'Details' },
  ]
  const activeIndex = steps.findIndex((s) => s.key === step)
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, idx) => (
        <div key={s.key} className="flex flex-1 items-center gap-2">
          <div
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium',
              idx <= activeIndex
                ? 'bg-blue-600 text-white'
                : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
            )}
          >
            {idx + 1}
          </div>
          <div className="flex-1 text-sm text-slate-700 dark:text-slate-300">{s.label}</div>
          {idx < steps.length - 1 && <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />}
        </div>
      ))}
    </div>
  )
}
