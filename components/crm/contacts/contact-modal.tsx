'use client'

import { useState, useCallback, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { AlertCircle, Loader2, X } from 'lucide-react'
import Link from 'next/link'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/crm/utils'
import { CreateContactSchema, type CreateContactInput } from '@/lib/crm/validations/contact'
import { useCreateContact, useUpdateContact, type ContactDetailItem } from '@/hooks/crm/useContacts'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeadSource {
  id: string
  name: string
}

interface CrmUser {
  id: string
  name: string | null
  email: string
}

interface Branch {
  id: string
  name: string
}

interface Tag {
  id: string
  name: string
  color: string
}

interface ContactModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  contact?: ContactDetailItem
  branchId: string
  tenantId: string
  leadSources?: LeadSource[]
  users?: CrmUser[]
  branches?: Branch[]
  tags?: Tag[]
}

// ─── Duplicate detection ──────────────────────────────────────────────────────

interface DuplicateResult {
  duplicate: boolean
  contact?: { id: string; name: string }
}

async function checkDuplicate(
  tenantId: string,
  phone?: string,
  email?: string,
): Promise<DuplicateResult> {
  const params = new URLSearchParams({ tenantId })
  if (phone) params.set('phone', phone)
  if (email && email !== '') params.set('email', email)
  const res = await fetch(`/api/crm/contacts/check-duplicate?${params.toString()}`)
  if (!res.ok) return { duplicate: false }
  return res.json() as Promise<DuplicateResult>
}

// ─── Form field ───────────────────────────────────────────────────────────────

function Field({
  label,
  error,
  children,
  className,
}: {
  label: string
  error?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <Label className="text-xs font-medium text-slate-600">{label}</Label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ContactModal({
  open,
  onOpenChange,
  mode,
  contact,
  branchId,
  tenantId,
  leadSources = [],
  users = [],
  branches = [],
  tags = [],
}: ContactModalProps) {
  const createContact = useCreateContact()
  const updateContact = useUpdateContact()
  const [duplicate, setDuplicate] = useState<DuplicateResult | null>(null)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(
    contact?.contactTags.map((ct) => ct.tagId) ?? [],
  )

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateContactInput>({
    resolver: zodResolver(CreateContactSchema),
    defaultValues: {
      firstName: contact?.firstName ?? '',
      lastName: contact?.lastName ?? '',
      email: contact?.email ?? '',
      phone: contact?.phone ?? '',
      leadSourceId: contact?.leadSourceId ?? undefined,
      assignedUserId: contact?.assignedUserId ?? undefined,
      preferredBranchId: (contact as ContactDetailItem | undefined)?.preferredBranchId ?? undefined,
      preferredTrialDay: (contact as ContactDetailItem | undefined)?.preferredTrialDay as
        | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN'
        | undefined,
      enrolledPackage: (contact as ContactDetailItem | undefined)?.enrolledPackage ?? '',
      childName1: (contact as ContactDetailItem | undefined)?.childName1 ?? '',
      childAge1: (contact as ContactDetailItem | undefined)?.childAge1 ?? '',
      childName2: (contact as ContactDetailItem | undefined)?.childName2 ?? '',
      childAge2: (contact as ContactDetailItem | undefined)?.childAge2 ?? '',
      childName3: (contact as ContactDetailItem | undefined)?.childName3 ?? '',
      childAge3: (contact as ContactDetailItem | undefined)?.childAge3 ?? '',
      childName4: (contact as ContactDetailItem | undefined)?.childName4 ?? '',
      childAge4: (contact as ContactDetailItem | undefined)?.childAge4 ?? '',
      tagIds: contact?.contactTags.map((ct) => ct.tagId) ?? [],
    },
  })

  // Reset when contact changes
  useEffect(() => {
    if (contact) {
      reset({
        firstName: contact.firstName,
        lastName: contact.lastName ?? '',
        email: contact.email ?? '',
        phone: contact.phone ?? '',
        leadSourceId: contact.leadSourceId ?? undefined,
        assignedUserId: contact.assignedUserId ?? undefined,
        preferredBranchId: (contact as ContactDetailItem).preferredBranchId ?? undefined,
        preferredTrialDay: (contact as ContactDetailItem).preferredTrialDay as
          | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN'
          | undefined,
        enrolledPackage: (contact as ContactDetailItem).enrolledPackage ?? '',
        childName1: (contact as ContactDetailItem).childName1 ?? '',
        childAge1: (contact as ContactDetailItem).childAge1 ?? '',
        childName2: (contact as ContactDetailItem).childName2 ?? '',
        childAge2: (contact as ContactDetailItem).childAge2 ?? '',
        childName3: (contact as ContactDetailItem).childName3 ?? '',
        childAge3: (contact as ContactDetailItem).childAge3 ?? '',
        childName4: (contact as ContactDetailItem).childName4 ?? '',
        childAge4: (contact as ContactDetailItem).childAge4 ?? '',
        tagIds: contact.contactTags.map((ct) => ct.tagId),
      })
      setSelectedTagIds(contact.contactTags.map((ct) => ct.tagId))
    }
  }, [contact, reset])

  const handlePhoneBlur = useCallback(
    async (phone: string) => {
      if (!phone) return setDuplicate(null)
      const result = await checkDuplicate(tenantId, phone)
      // Don't flag as duplicate on edit if it's the same contact
      if (result.duplicate && contact && result.contact?.id === contact.id) {
        setDuplicate(null)
        return
      }
      setDuplicate(result)
    },
    [tenantId, contact],
  )

  const handleEmailBlur = useCallback(
    async (email: string) => {
      if (!email) return setDuplicate(null)
      const result = await checkDuplicate(tenantId, undefined, email)
      if (result.duplicate && contact && result.contact?.id === contact.id) {
        setDuplicate(null)
        return
      }
      setDuplicate(result)
    },
    [tenantId, contact],
  )

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    )
  }

  const onSubmit = async (data: CreateContactInput) => {
    const payload = { ...data, tagIds: selectedTagIds }
    try {
      if (mode === 'create') {
        const result = await createContact.mutateAsync({ branchId, data: payload })
        toast.success('Contact created successfully')
        onOpenChange(false)
        reset()
        setSelectedTagIds([])
        setDuplicate(null)
        return result
      } else if (contact) {
        await updateContact.mutateAsync({ id: contact.id, data: payload })
        toast.success('Contact updated successfully')
        onOpenChange(false)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  const trialDays = ['WED', 'THU', 'FRI', 'SAT', 'SUN'] as const

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'New Contact' : 'Edit Contact'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Duplicate warning */}
          {duplicate?.duplicate && duplicate.contact && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Duplicate detected:{' '}
                <Link
                  href={`/crm/contacts/${duplicate.contact.id}`}
                  className="font-medium underline hover:text-amber-900"
                  target="_blank"
                >
                  {duplicate.contact.name}
                </Link>{' '}
                already exists with this phone/email.
              </span>
            </div>
          )}

          <Tabs defaultValue="basic">
            <TabsList className="w-full justify-start h-auto flex-wrap gap-1 bg-transparent p-0 border-b border-slate-200 rounded-none">
              {['basic', 'children', 'preferences', 'tags'].map((tab) => (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-indigo-600 pb-2 capitalize"
                >
                  {tab === 'basic' ? 'Basic Info' : tab === 'children' ? 'Child Info' : tab}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* ── Basic Info ── */}
            <TabsContent value="basic" className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="First Name *" error={errors.firstName?.message}>
                  <Input {...register('firstName')} placeholder="First name" />
                </Field>
                <Field label="Last Name" error={errors.lastName?.message}>
                  <Input {...register('lastName')} placeholder="Last name" />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Email" error={errors.email?.message}>
                  <Input
                    {...register('email')}
                    type="email"
                    placeholder="email@example.com"
                    onBlur={(e) => void handleEmailBlur(e.target.value)}
                  />
                </Field>
                <Field label="Phone (MY)" error={errors.phone?.message}>
                  <div className="flex gap-1">
                    <span className="inline-flex items-center rounded-l-md border border-r-0 border-slate-200 bg-slate-50 px-2 text-xs text-slate-500">
                      🇲🇾 +60
                    </span>
                    <Input
                      {...register('phone')}
                      className="rounded-l-none"
                      placeholder="12-3456789"
                      onBlur={(e) => void handlePhoneBlur(e.target.value)}
                    />
                  </div>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Lead Source" error={errors.leadSourceId?.message}>
                  <Select
                    defaultValue={watch('leadSourceId')}
                    onValueChange={(v) => setValue('leadSourceId', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select source..." />
                    </SelectTrigger>
                    <SelectContent>
                      {leadSources.map((ls) => (
                        <SelectItem key={ls.id} value={ls.id}>
                          {ls.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Assigned To" error={errors.assignedUserId?.message}>
                  <Select
                    defaultValue={watch('assignedUserId')}
                    onValueChange={(v) => setValue('assignedUserId', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Assign to..." />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name ?? u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </TabsContent>

            {/* ── Child Info ── */}
            <TabsContent value="children" className="mt-4 space-y-4">
              {([1, 2, 3, 4] as const).map((n) => (
                <div key={n} className="grid grid-cols-2 gap-4">
                  <Field label={`Child ${n} Name`}>
                    <Input
                      {...register(`childName${n}` as 'childName1')}
                      placeholder={`Child ${n} name`}
                    />
                  </Field>
                  <Field label={`Child ${n} Age`}>
                    <Input
                      {...register(`childAge${n}` as 'childAge1')}
                      placeholder="e.g. 7 years"
                    />
                  </Field>
                </div>
              ))}
            </TabsContent>

            {/* ── Preferences ── */}
            <TabsContent value="preferences" className="mt-4 space-y-4">
              <Field label="Preferred Branch">
                <Select
                  defaultValue={watch('preferredBranchId')}
                  onValueChange={(v) => setValue('preferredBranchId', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select branch..." />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Preferred Trial Day">
                <Select
                  defaultValue={watch('preferredTrialDay')}
                  onValueChange={(v) =>
                    setValue('preferredTrialDay', v as 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN')
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select day..." />
                  </SelectTrigger>
                  <SelectContent>
                    {trialDays.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Enrolled Package">
                <Input {...register('enrolledPackage')} placeholder="e.g. Junior 3x/week" />
              </Field>
            </TabsContent>

            {/* ── Tags ── */}
            <TabsContent value="tags" className="mt-4 space-y-3">
              <p className="text-sm text-slate-500">Select tags to apply to this contact.</p>
              {tags.length === 0 && (
                <p className="text-sm text-slate-400">No tags available. Create tags in Settings.</p>
              )}
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => {
                  const selected = selectedTagIds.includes(tag.id)
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-all',
                        selected
                          ? 'border-transparent text-white shadow-sm'
                          : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50',
                      )}
                      style={selected ? { backgroundColor: tag.color, borderColor: tag.color } : {}}
                    >
                      {selected && <X className="h-3 w-3" />}
                      {tag.name}
                    </button>
                  )
                })}
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="pt-4 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === 'create' ? 'Create Contact' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
