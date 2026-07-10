'use client'

import { useRef, useState } from 'react'
import type { Control, FieldErrors } from 'react-hook-form'
import { Controller } from 'react-hook-form'
import { Paperclip, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/crm/utils'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlatformFieldsFormProps {
  platformSlug: string
  subType: string
  ticketId?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: FieldErrors<any>
}

interface UploadedFile {
  name: string
  s3Key: string
  url: string
}

// ─── File upload hook ─────────────────────────────────────────────────────────

function useFileUpload(fieldKey: string, ticketId?: string) {
  const [uploading, setUploading] = useState(false)
  const [uploaded, setUploaded] = useState<UploadedFile | null>(null)

  async function handleFile(
    file: File,
    onChange: (value: UploadedFile | null) => void,
  ): Promise<void> {
    setUploading(true)
    try {
      // Get presigned URL
      const presignRes = await fetch('/api/crm/tickets/presign-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: ticketId ?? 'draft',
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          fieldKey,
        }),
      })
      if (!presignRes.ok) {
        const err = await presignRes.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? 'Failed to get upload URL')
      }
      const { url, s3Key } = await presignRes.json() as { url: string; s3Key: string }

      // Upload directly to S3
      const uploadRes = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!uploadRes.ok) throw new Error('Upload failed')

      const result: UploadedFile = { name: file.name, s3Key, url }
      setUploaded(result)
      onChange(result)
      toast.success(`${file.name} uploaded`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  function remove(onChange: (value: UploadedFile | null) => void) {
    setUploaded(null)
    onChange(null)
  }

  return { uploading, uploaded, handleFile, remove }
}

// ─── File upload button ───────────────────────────────────────────────────────

interface FileUploadButtonProps {
  label: string
  fieldKey: string
  required?: boolean
  ticketId?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: FieldErrors<any>
}

function FileUploadButton({
  label,
  fieldKey,
  required = false,
  ticketId,
  control,
  errors,
}: FileUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { uploading, uploaded, handleFile, remove } = useFileUpload(fieldKey, ticketId)
  const error = errors[fieldKey]

  return (
    <Controller
      name={fieldKey}
      control={control}
      rules={required ? { required: `${label} is required` } : {}}
      render={({ field: { onChange } }) => (
        <div className="space-y-1">
          <Label className={cn('text-sm', required && 'after:ml-0.5 after:text-red-500 after:content-["*"]')}>
            {label}
          </Label>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleFile(file, onChange)
              // Reset so same file can be re-selected
              e.target.value = ''
            }}
          />
          {uploaded ? (
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-800 dark:bg-emerald-950">
              <Paperclip className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="flex-1 truncate text-emerald-700 dark:text-emerald-300">
                {uploaded.name}
              </span>
              <button
                type="button"
                onClick={() => remove(onChange)}
                className="text-emerald-500 hover:text-red-500"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="gap-2"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Paperclip className="h-4 w-4" />
              )}
              {uploading ? 'Uploading…' : `Choose ${label}`}
            </Button>
          )}
          {error && (
            <p className="text-xs text-red-500">{String(error.message ?? 'Required')}</p>
          )}
        </div>
      )}
    />
  )
}

// ─── Field components ─────────────────────────────────────────────────────────

function TextField({
  name,
  label,
  required,
  control,
  errors,
}: {
  name: string
  label: string
  required?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: FieldErrors<any>
}) {
  const error = errors[name]
  return (
    <Controller
      name={name}
      control={control}
      rules={required ? { required: `${label} is required` } : {}}
      render={({ field }) => (
        <div className="space-y-1">
          <Label
            htmlFor={name}
            className={cn('text-sm', required && 'after:ml-0.5 after:text-red-500 after:content-["*"]')}
          >
            {label}
          </Label>
          <Input id={name} {...field} className="text-sm" />
          {error && <p className="text-xs text-red-500">{String(error.message ?? 'Required')}</p>}
        </div>
      )}
    />
  )
}

function DateField({
  name,
  label,
  required,
  control,
  errors,
}: {
  name: string
  label: string
  required?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: FieldErrors<any>
}) {
  const error = errors[name]
  return (
    <Controller
      name={name}
      control={control}
      rules={required ? { required: `${label} is required` } : {}}
      render={({ field }) => (
        <div className="space-y-1">
          <Label
            htmlFor={name}
            className={cn('text-sm', required && 'after:ml-0.5 after:text-red-500 after:content-["*"]')}
          >
            {label}
          </Label>
          <Input id={name} type="date" {...field} className="text-sm" />
          {error && <p className="text-xs text-red-500">{String(error.message ?? 'Required')}</p>}
        </div>
      )}
    />
  )
}

// Lead pipeline stages — matches the canonical 16-stage lead pipeline used
// across all branches (see prisma/seed-from-powerbi.ts).
const LEAD_STAGE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'NL',  label: 'New Lead' },
  { value: 'CT',  label: 'Confirmed Trial' },
  { value: 'SU',  label: 'Show Up' },
  { value: 'ENR', label: 'Enrolled' },
  { value: 'CNS', label: 'Cancel No Show' },
  { value: 'SNE', label: 'Show No Engage' },
  { value: 'CL',  label: 'Cold Lead' },
  { value: 'OTH', label: 'Other' },
]

// Position options for the "Others" platform — Department was already
// chosen on step 2 (it's the ticket sub_type) so step 3 only asks for
// Position + Remarks.
const POSITION_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'ceo',              label: 'CEO' },
  { value: 'hod',              label: 'HOD' },
  { value: 'executive',        label: 'Executive' },
  { value: 'branch_manager',   label: 'Branch Manager' },
  { value: 'intern',           label: 'Intern' },
  { value: 'full_time_coach',  label: 'Full-time Coach' },
  { value: 'part_time_coach',  label: 'Part-time Coach' },
]

function SelectField({
  name,
  label,
  options,
  placeholder = 'Select…',
  required,
  control,
  errors,
}: {
  name: string
  label: string
  options: ReadonlyArray<{ value: string; label: string }>
  placeholder?: string
  required?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: FieldErrors<any>
}) {
  const error = errors[name]
  // Use the shadcn <Select> primitives so the trigger / chevron alignment
  // matches the rest of the form (notably the Branch picker in TicketForm).
  return (
    <Controller
      name={name}
      control={control}
      rules={required ? { required: `${label} is required` } : {}}
      render={({ field }) => (
        <div className="space-y-1">
          <Label
            htmlFor={name}
            className={cn('text-sm', required && 'after:ml-0.5 after:text-red-500 after:content-["*"]')}
          >
            {label}
          </Label>
          <Select
            value={(field.value as string) ?? ''}
            onValueChange={field.onChange}
          >
            <SelectTrigger id={name} className="w-full">
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {error && <p className="text-xs text-red-500">{String(error.message ?? 'Required')}</p>}
        </div>
      )}
    />
  )
}

function TextareaField({
  name,
  label,
  required,
  control,
  errors,
}: {
  name: string
  label: string
  required?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: FieldErrors<any>
}) {
  const error = errors[name]
  return (
    <Controller
      name={name}
      control={control}
      rules={required ? { required: `${label} is required` } : {}}
      render={({ field }) => (
        <div className="space-y-1">
          <Label
            htmlFor={name}
            className={cn('text-sm', required && 'after:ml-0.5 after:text-red-500 after:content-["*"]')}
          >
            {label}
          </Label>
          <textarea
            id={name}
            {...field}
            rows={3}
            className={cn(
              'w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-sm',
              'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
              'dark:border-slate-700 dark:text-slate-100',
            )}
          />
          {error && <p className="text-xs text-red-500">{String(error.message ?? 'Required')}</p>}
        </div>
      )}
    />
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PlatformFieldsForm({
  platformSlug,
  subType,
  ticketId,
  control,
  errors,
}: PlatformFieldsFormProps) {
  const key = `${platformSlug}/${subType}`

  if (key === 'aone/freeze_student') {
    return (
      <div className="space-y-4">
        <TextField name="studentName" label="Student Name" required control={control} errors={errors} />
        <div className="grid grid-cols-2 gap-4">
          <DateField name="startDate" label="Freeze Start Date" required control={control} errors={errors} />
          <DateField name="endDate" label="Freeze End Date" required control={control} errors={errors} />
        </div>
        <TextareaField name="reason" label="Reason" required control={control} errors={errors} />
      </div>
    )
  }

  if (key === 'aone/extend') {
    return (
      <div className="space-y-4">
        <TextField name="studentName" label="Student Name" required control={control} errors={errors} />
        <div className="grid grid-cols-2 gap-4">
          <DateField name="startDate" label="Extend Start Date" required control={control} errors={errors} />
          <DateField name="endDate" label="Extend End Date" required control={control} errors={errors} />
        </div>
        <TextareaField name="reason" label="Reason" required control={control} errors={errors} />
      </div>
    )
  }

  if (key === 'aone/archive_student') {
    return (
      <div className="space-y-4">
        <TextField name="studentName" label="Student Name" required control={control} errors={errors} />
        <TextareaField name="reason" label="Reason" required control={control} errors={errors} />
      </div>
    )
  }

  if (key === 'aone/delete_invoice') {
    return (
      <div className="space-y-4">
        <TextField name="studentName" label="Student Name" required control={control} errors={errors} />
        <TextField name="invoiceNumber" label="Invoice Number" required control={control} errors={errors} />
        <TextareaField name="reason" label="Reason" required control={control} errors={errors} />
      </div>
    )
  }

  // Lead tickets need:
  //   - Stage (which kanban column the issue concerns)
  //   - Opportunity Name / Contact / Email (so the admin handling the
  //     ticket can find the lead in the CRM without guesswork)
  //   - Remarks (free-text description)
  // Applies to every lead sub-type (missing / duplicate / delete / others).
  if (platformSlug === 'lead') {
    return (
      <div className="space-y-4">
        <SelectField
          name="stage"
          label="Stage"
          options={LEAD_STAGE_OPTIONS}
          placeholder="Select stage…"
          required
          control={control}
          errors={errors}
        />
        <TextField
          name="opportunityName"
          label="Opportunity Name"
          required
          control={control}
          errors={errors}
        />
        <TextField
          name="opportunityContact"
          label="Opportunity Contact"
          required
          control={control}
          errors={errors}
        />
        <TextField
          name="opportunityEmail"
          label="Opportunity Email"
          required
          control={control}
          errors={errors}
        />
        <TextareaField name="remarks" label="Remarks" required control={control} errors={errors} />
      </div>
    )
  }

  // "Others" platform → department was already picked on step 2 (it's the
  // ticket sub_type). Step 3 only collects Position + Remarks.
  if (platformSlug === 'other' || platformSlug === 'others') {
    return (
      <div className="space-y-4">
        <SelectField
          name="position"
          label="Position"
          options={POSITION_OPTIONS}
          placeholder="Select position…"
          required
          control={control}
          errors={errors}
        />
        <TextareaField name="remarks" label="Remarks" required control={control} errors={errors} />
      </div>
    )
  }

  // Default — all other platform/subType combos
  return (
    <div className="space-y-4">
      <TextareaField name="remarks" label="Remarks" required control={control} errors={errors} />
    </div>
  )
}

