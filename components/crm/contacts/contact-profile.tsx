'use client'

import { useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Phone,
  Mail,
  MessageSquare,
  CheckSquare,
  Plus,
  Edit2,
  Check,
  X,
  ArrowRight,
  Loader2,
  PhoneCall,
  FileText,
  Clock,
  Tag,
  User,
  DollarSign,
} from 'lucide-react'
import Link from 'next/link'

import { useContact, useUpdateContact, type ContactDetailItem } from '@/hooks/crm/useContacts'
import { UpdateContactSchema, type UpdateContactInput } from '@/lib/crm/validations/contact'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn, formatDate, formatDateTime } from '@/lib/crm/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContactProfileProps {
  contactId: string
  tenantId: string
  currentUserId: string
}

// ─── Stage color helper ───────────────────────────────────────────────────────

function stageBg(color: string) {
  const map: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-700 border-blue-200',
    green: 'bg-green-100 text-green-700 border-green-200',
    yellow: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    red: 'bg-red-100 text-red-700 border-red-200',
    purple: 'bg-purple-100 text-purple-700 border-purple-200',
    orange: 'bg-orange-100 text-orange-700 border-orange-200',
    gray: 'bg-slate-100 text-slate-600 border-slate-200',
    pink: 'bg-pink-100 text-pink-700 border-pink-200',
  }
  return map[color] ?? 'bg-slate-100 text-slate-600 border-slate-200'
}

// ─── Inline editable field ────────────────────────────────────────────────────

function InlineField({
  label,
  value,
  field,
  onSave,
  type = 'text',
}: {
  label: string
  value: string | null | undefined
  field: keyof UpdateContactInput
  onSave: (field: keyof UpdateContactInput, value: string) => Promise<void>
  type?: string
}) {
  const [editing, setEditing] = useState(false)
  const [inputVal, setInputVal] = useState(value ?? '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(field, inputVal)
      setEditing(false)
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setInputVal(value ?? '')
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-500">{label}</label>
        <div className="flex items-center gap-2">
          <Input
            type={type}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            className="h-8 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSave()
              if (e.key === 'Escape') handleCancel()
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-green-600 hover:bg-green-50"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:bg-slate-100"
            onClick={handleCancel}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="group space-y-0.5">
      <label className="text-xs font-medium text-slate-500">{label}</label>
      <div className="flex items-center gap-1">
        <span className={cn('text-sm text-slate-800', !value && 'text-slate-400 italic')}>
          {value || 'Not set'}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="invisible ml-1 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 group-hover:visible"
        >
          <Edit2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

// ─── Avatar initials helper ───────────────────────────────────────────────────

function initials(name: string | null | undefined, email: string | null | undefined) {
  const n = name ?? email ?? '?'
  return n.slice(0, 2).toUpperCase()
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <Skeleton className="h-[400px] w-full rounded-xl" />
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ContactProfile({ contactId, tenantId, currentUserId }: ContactProfileProps) {
  const { data: contact, isLoading, isError } = useContact(contactId)
  const updateContact = useUpdateContact()

  const [noteBody, setNoteBody] = useState('')
  const [noteSubmitting, setNoteSubmitting] = useState(false)
  const [callOpen, setCallOpen] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)
  const [messageChannel, setMessageChannel] = useState<'EMAIL' | 'WHATSAPP'>('WHATSAPP')
  const [messageBody, setMessageBody] = useState('')
  const [messageSending, setMessageSending] = useState(false)
  const [callOutcome, setCallOutcome] = useState('Answered')
  const [callNotes, setCallNotes] = useState('')
  const [callDuration, setCallDuration] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDue, setTaskDue] = useState('')
  const [taskSubmitting, setTaskSubmitting] = useState(false)
  const [callSubmitting, setCallSubmitting] = useState(false)

  const handleInlineSave = useCallback(
    async (field: keyof UpdateContactInput, value: string) => {
      await updateContact.mutateAsync({
        id: contactId,
        data: { [field]: value } as UpdateContactInput,
      })
      toast.success('Saved')
    },
    [contactId, updateContact],
  )

  const handleAddNote = async () => {
    if (!noteBody.trim()) return
    setNoteSubmitting(true)
    try {
      const res = await fetch(`/api/crm/contacts/${contactId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: noteBody, userId: currentUserId }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Note added')
      setNoteBody('')
      void updateContact.mutateAsync({ id: contactId, data: {} }) // trigger refetch via invalidation
    } catch {
      toast.error('Failed to add note')
    } finally {
      setNoteSubmitting(false)
    }
  }

  const handleCompleteTask = async (taskId: string, completed: boolean) => {
    try {
      await fetch(`/api/crm/contacts/${contactId}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completedAt: completed ? new Date().toISOString() : null }),
      })
      void updateContact.mutateAsync({ id: contactId, data: {} })
    } catch {
      toast.error('Failed to update task')
    }
  }

  const handleSendMessage = async () => {
    if (!messageBody.trim()) return
    setMessageSending(true)
    try {
      const res = await fetch(`/api/crm/contacts/${contactId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: messageChannel,
          body: messageBody,
          direction: 'OUT',
          userId: currentUserId,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Message sent')
      setMessageBody('')
      void updateContact.mutateAsync({ id: contactId, data: {} })
    } catch {
      toast.error('Failed to send message')
    } finally {
      setMessageSending(false)
    }
  }

  const handleLogCall = async () => {
    setCallSubmitting(true)
    try {
      const res = await fetch(`/api/crm/contacts/${contactId}/calls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outcome: callOutcome,
          notes: callNotes,
          duration: callDuration ? Number(callDuration) : null,
          userId: currentUserId,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Call logged')
      setCallOpen(false)
      setCallOutcome('Answered')
      setCallNotes('')
      setCallDuration('')
      void updateContact.mutateAsync({ id: contactId, data: {} })
    } catch {
      toast.error('Failed to log call')
    } finally {
      setCallSubmitting(false)
    }
  }

  const handleAddTask = async () => {
    if (!taskTitle.trim()) return
    setTaskSubmitting(true)
    try {
      const res = await fetch(`/api/crm/contacts/${contactId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: taskTitle,
          dueAt: taskDue || null,
          assignedUserId: currentUserId,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Task added')
      setTaskOpen(false)
      setTaskTitle('')
      setTaskDue('')
      void updateContact.mutateAsync({ id: contactId, data: {} })
    } catch {
      toast.error('Failed to add task')
    } finally {
      setTaskSubmitting(false)
    }
  }

  if (isLoading) return <ProfileSkeleton />
  if (isError || !contact) {
    return (
      <div className="py-20 text-center text-sm text-red-500">
        Failed to load contact. Please refresh.
      </div>
    )
  }

  const primaryOpp = contact.opportunities[0]
  const primaryStage = primaryOpp?.stage

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4 flex-wrap">
          <Avatar className="h-16 w-16 text-lg">
            <AvatarImage src={undefined} />
            <AvatarFallback className="bg-indigo-100 text-indigo-700 text-xl font-semibold">
              {contact.firstName.slice(0, 1)}{contact.lastName?.slice(0, 1) ?? ''}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900">
                {contact.firstName} {contact.lastName ?? ''}
              </h1>
              {primaryStage && (
                <span
                  className={cn(
                    'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                    stageBg(primaryStage.color),
                  )}
                >
                  {primaryStage.name}
                </span>
              )}
              {contact.leadSource && (
                <Badge variant="secondary" className="text-xs">
                  {contact.leadSource.name}
                </Badge>
              )}
            </div>
            {(contact as ContactDetailItem).childName1 && (
              <p className="mt-0.5 text-sm text-slate-500">
                Parent of {(contact as ContactDetailItem).childName1}
                {(contact as ContactDetailItem).childAge1 &&
                  ` (${(contact as ContactDetailItem).childAge1})`}
              </p>
            )}
            <div className="mt-2 flex items-center gap-4 text-sm text-slate-500 flex-wrap">
              {contact.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" />
                  {contact.phone}
                </span>
              )}
              {contact.email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" />
                  {contact.email}
                </span>
              )}
              {contact.assignedUser && (
                <span className="flex items-center gap-1.5">
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={contact.assignedUser.image ?? undefined} />
                    <AvatarFallback className="text-[9px]">
                      {initials(contact.assignedUser.name, contact.assignedUser.email)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-slate-600">
                    {contact.assignedUser.name ?? contact.assignedUser.email}
                  </span>
                </span>
              )}
            </div>
          </div>
          {/* Quick actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {contact.phone && (
              <Button
                size="sm"
                variant="outline"
                className="text-green-700 border-green-200 hover:bg-green-50"
                onClick={() => window.open(`https://wa.me/${contact.phone?.replace(/\D/g, '')}`, '_blank')}
              >
                <MessageSquare className="h-4 w-4" />
                WhatsApp
              </Button>
            )}
            {contact.email && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(`mailto:${contact.email}`, '_blank')}
              >
                <Mail className="h-4 w-4" />
                Email
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setTaskOpen(true)}>
              <CheckSquare className="h-4 w-4" />
              Task
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCallOpen(true)}>
              <PhoneCall className="h-4 w-4" />
              Log Call
            </Button>
          </div>
        </div>
      </div>

      {/* ── Content tabs ── */}
      <Tabs defaultValue="overview">
        <TabsList className="h-auto flex-wrap gap-1 bg-transparent p-0 border-b border-slate-200 rounded-none w-full justify-start">
          {[
            { value: 'overview', label: 'Overview' },
            { value: 'activity', label: 'Activity' },
            { value: 'messages', label: `Messages (${contact.messages.length})` },
            { value: 'calls', label: `Calls (${contact.calls.length})` },
            { value: 'notes', label: `Notes (${contact.notes.length})` },
            { value: 'tasks', label: `Tasks (${contact.tasks.length})` },
            { value: 'opportunities', label: `Opportunities (${contact.opportunities.length})` },
          ].map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-indigo-600 pb-2"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── Overview ── */}
        <TabsContent value="overview" className="mt-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Personal info */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <User className="h-4 w-4 text-indigo-500" />
                Personal Info
              </h3>
              <div className="space-y-4">
                <InlineField label="First Name" value={contact.firstName} field="firstName" onSave={handleInlineSave} />
                <InlineField label="Last Name" value={contact.lastName} field="lastName" onSave={handleInlineSave} />
                <InlineField label="Email" value={contact.email} field="email" type="email" onSave={handleInlineSave} />
                <InlineField label="Phone" value={contact.phone} field="phone" onSave={handleInlineSave} />
              </div>
            </div>

            {/* Child info */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Tag className="h-4 w-4 text-indigo-500" />
                Child Info
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {([1, 2, 3, 4] as const).map((n) => {
                  const c = contact as ContactDetailItem
                  const nameKey = `childName${n}` as keyof ContactDetailItem
                  const ageKey = `childAge${n}` as keyof ContactDetailItem
                  return (
                    <div key={n} className="space-y-3">
                      <InlineField
                        label={`Child ${n}`}
                        value={c[nameKey] as string | null}
                        field={`childName${n}` as keyof UpdateContactInput}
                        onSave={handleInlineSave}
                      />
                      <InlineField
                        label={`Age ${n}`}
                        value={c[ageKey] as string | null}
                        field={`childAge${n}` as keyof UpdateContactInput}
                        onSave={handleInlineSave}
                      />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Preferences */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold text-slate-700">Preferences</h3>
              <div className="space-y-4">
                <InlineField
                  label="Preferred Trial Day"
                  value={(contact as ContactDetailItem).preferredTrialDay}
                  field="preferredTrialDay"
                  onSave={handleInlineSave}
                />
                <InlineField
                  label="Enrolled Package"
                  value={(contact as ContactDetailItem).enrolledPackage}
                  field="enrolledPackage"
                  onSave={handleInlineSave}
                />
              </div>
            </div>

            {/* Tags */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold text-slate-700">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {contact.contactTags.length === 0 ? (
                  <p className="text-xs text-slate-400">No tags assigned</p>
                ) : (
                  contact.contactTags.map((ct) => (
                    <span
                      key={ct.tagId}
                      className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium text-white"
                      style={{ backgroundColor: ct.tag.color }}
                    >
                      {ct.tag.name}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── Activity Timeline ── */}
        <TabsContent value="activity" className="mt-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-slate-700">Activity Timeline</h3>
            <ActivityTimeline contact={contact} />
          </div>
        </TabsContent>

        {/* ── Messages ── */}
        <TabsContent value="messages" className="mt-6">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col" style={{ maxHeight: '600px' }}>
            {/* Channel toggle */}
            <div className="flex border-b border-slate-200">
              {(['WHATSAPP', 'EMAIL'] as const).map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setMessageChannel(ch)}
                  className={cn(
                    'flex-1 py-3 text-sm font-medium transition-colors',
                    messageChannel === ch
                      ? 'border-b-2 border-indigo-600 text-indigo-600'
                      : 'text-slate-500 hover:text-slate-700',
                  )}
                >
                  {ch === 'WHATSAPP' ? 'WhatsApp' : 'Email'}
                </button>
              ))}
            </div>

            {/* Messages list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {contact.messages
                .filter((m) => m.channel === messageChannel)
                .map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      'flex',
                      m.direction === 'OUT' ? 'justify-end' : 'justify-start',
                    )}
                  >
                    <div
                      className={cn(
                        'max-w-[75%] rounded-xl px-3 py-2 text-sm',
                        m.direction === 'OUT'
                          ? 'bg-indigo-600 text-white rounded-br-sm'
                          : 'bg-slate-100 text-slate-800 rounded-bl-sm',
                      )}
                    >
                      {m.subject && (
                        <p className="mb-1 text-xs font-semibold opacity-80">{m.subject}</p>
                      )}
                      <p>{m.body}</p>
                      <p
                        className={cn(
                          'mt-1 text-[10px]',
                          m.direction === 'OUT' ? 'text-indigo-200' : 'text-slate-400',
                        )}
                      >
                        {formatDateTime(m.createdAt)}{' '}
                        {m.status !== 'delivered' && (
                          <span className="ml-1 opacity-70">({m.status})</span>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              {contact.messages.filter((m) => m.channel === messageChannel).length === 0 && (
                <p className="py-10 text-center text-xs text-slate-400">
                  No {messageChannel.toLowerCase()} messages yet.
                </p>
              )}
            </div>

            {/* Send form */}
            <div className="border-t border-slate-200 p-3">
              <div className="flex gap-2">
                <Textarea
                  className="flex-1 min-h-[60px] resize-none"
                  placeholder={`Type a ${messageChannel === 'WHATSAPP' ? 'WhatsApp' : 'email'} message...`}
                  value={messageBody}
                  onChange={(e) => setMessageBody(e.target.value)}
                />
                <Button
                  size="sm"
                  disabled={!messageBody.trim() || messageSending}
                  onClick={() => void handleSendMessage()}
                  className="self-end"
                >
                  {messageSending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send'}
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── Calls ── */}
        <TabsContent value="calls" className="mt-6">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setCallOpen(true)}>
                <PhoneCall className="h-4 w-4" />
                Log Call
              </Button>
            </div>
            {contact.calls.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-white py-12 text-center">
                <PhoneCall className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                <p className="text-sm text-slate-400">No calls logged yet</p>
              </div>
            )}
            <div className="space-y-3">
              {contact.calls.map((call) => (
                <div
                  key={call.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CallOutcomeBadge outcome={call.outcome} />
                      {call.duration != null && (
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <Clock className="h-3 w-3" />
                          {Math.floor(call.duration / 60)}m {call.duration % 60}s
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-400">{formatDateTime(call.createdAt)}</span>
                  </div>
                  {call.notes && (
                    <p className="mt-2 text-sm text-slate-600">{call.notes}</p>
                  )}
                  {call.user && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-[9px]">
                          {initials(call.user.name, null)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-slate-500">{call.user.name}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ── Notes ── */}
        <TabsContent value="notes" className="mt-6">
          <div className="space-y-4">
            {/* Add note */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <Textarea
                placeholder="Add a note..."
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                className="min-h-20"
              />
              <div className="mt-2 flex justify-end">
                <Button
                  size="sm"
                  disabled={!noteBody.trim() || noteSubmitting}
                  onClick={() => void handleAddNote()}
                >
                  {noteSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Add Note
                </Button>
              </div>
            </div>

            {/* Notes list */}
            {contact.notes.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-white py-12 text-center">
                <FileText className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                <p className="text-sm text-slate-400">No notes yet</p>
              </div>
            )}
            <div className="space-y-3">
              {contact.notes.map((note) => (
                <div
                  key={note.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div
                    className="prose prose-sm max-w-none text-slate-800"
                    // sanitized via server — body is plain text notes
                    dangerouslySetInnerHTML={{ __html: note.body.replace(/\n/g, '<br>') }}
                  />
                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                    {note.user && (
                      <>
                        <Avatar className="h-4 w-4">
                          <AvatarFallback className="text-[8px]">
                            {initials(note.user.name, null)}
                          </AvatarFallback>
                        </Avatar>
                        <span>{note.user.name}</span>
                        <span>·</span>
                      </>
                    )}
                    <span>{formatDateTime(note.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ── Tasks ── */}
        <TabsContent value="tasks" className="mt-6">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setTaskOpen(true)}>
                <Plus className="h-4 w-4" />
                Add Task
              </Button>
            </div>
            {contact.tasks.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-white py-12 text-center">
                <CheckSquare className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                <p className="text-sm text-slate-400">No tasks yet</p>
              </div>
            )}
            <div className="space-y-2">
              {contact.tasks.map((task) => {
                const isOverdue =
                  task.dueAt &&
                  !task.completedAt &&
                  new Date(task.dueAt) < new Date()
                return (
                  <div
                    key={task.id}
                    className={cn(
                      'flex items-start gap-3 rounded-xl border bg-white p-3 shadow-sm',
                      isOverdue ? 'border-red-200' : 'border-slate-200',
                    )}
                  >
                    <Checkbox
                      checked={!!task.completedAt}
                      onCheckedChange={(v) => void handleCompleteTask(task.id, !!v)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          'text-sm font-medium',
                          task.completedAt
                            ? 'text-slate-400 line-through'
                            : 'text-slate-800',
                        )}
                      >
                        {task.title}
                      </p>
                      {task.dueAt && (
                        <p
                          className={cn(
                            'mt-0.5 text-xs',
                            isOverdue && !task.completedAt
                              ? 'text-red-500 font-medium'
                              : 'text-slate-400',
                          )}
                        >
                          Due {formatDateTime(task.dueAt)}
                          {isOverdue && !task.completedAt && ' · Overdue'}
                        </p>
                      )}
                    </div>
                    {task.completedAt && (
                      <span className="text-xs text-green-600">
                        Done {formatDate(task.completedAt)}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </TabsContent>

        {/* ── Opportunities ── */}
        <TabsContent value="opportunities" className="mt-6">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" asChild>
                <Link href={`/crm/contacts/${contactId}/opportunity/new`}>
                  <Plus className="h-4 w-4" />
                  Add Opportunity
                </Link>
              </Button>
            </div>
            {contact.opportunities.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-white py-12 text-center">
                <DollarSign className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                <p className="text-sm text-slate-400">No opportunities yet</p>
              </div>
            )}
            <div className="space-y-3">
              {contact.opportunities.map((opp) => (
                <div
                  key={opp.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{opp.pipeline.name}</p>
                      <span
                        className={cn(
                          'mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                          stageBg(opp.stage.color),
                        )}
                      >
                        {opp.stage.name}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-800">
                        RM {Number(opp.value).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-slate-400">
                        {formatDate(opp.lastStageChangeAt)}
                      </p>
                    </div>
                  </div>
                  {opp.stageHistory.length > 0 && (
                    <div className="mt-3 border-t border-slate-100 pt-3 space-y-1">
                      <p className="text-xs font-medium text-slate-500 mb-1">Stage history</p>
                      {opp.stageHistory.slice(0, 3).map((sh) => (
                        <div key={sh.id} className="flex items-center gap-1 text-xs text-slate-500">
                          {sh.fromStage && (
                            <>
                              <span
                                className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                                style={{ backgroundColor: sh.fromStage.color + '20', color: sh.fromStage.color }}
                              >
                                {sh.fromStage.name}
                              </span>
                              <ArrowRight className="h-3 w-3 text-slate-400" />
                            </>
                          )}
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                            style={{ backgroundColor: sh.toStage.color + '20', color: sh.toStage.color }}
                          >
                            {sh.toStage.name}
                          </span>
                          <span className="ml-1 text-slate-400">{formatDate(sh.changedAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Log Call dialog ── */}
      <Dialog open={callOpen} onOpenChange={setCallOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Log a Call</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Outcome</label>
              <Select value={callOutcome} onValueChange={setCallOutcome}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['Answered', 'No Answer', 'Voicemail', 'Busy'].map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Duration (seconds)</label>
              <Input
                type="number"
                min={0}
                placeholder="e.g. 120"
                value={callDuration}
                onChange={(e) => setCallDuration(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Notes</label>
              <Textarea
                placeholder="Call notes..."
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCallOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleLogCall()} disabled={callSubmitting}>
              {callSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Log Call
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Task dialog ── */}
      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Task Title</label>
              <Input
                placeholder="e.g. Follow up call"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Due Date</label>
              <Input
                type="datetime-local"
                value={taskDue}
                onChange={(e) => setTaskDue(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleAddTask()}
              disabled={!taskTitle.trim() || taskSubmitting}
            >
              {taskSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Add Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Call outcome badge ───────────────────────────────────────────────────────

function CallOutcomeBadge({ outcome }: { outcome: string | null }) {
  const map: Record<string, string> = {
    Answered: 'bg-green-100 text-green-700',
    'No Answer': 'bg-slate-100 text-slate-600',
    Voicemail: 'bg-yellow-100 text-yellow-700',
    Busy: 'bg-red-100 text-red-600',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        map[outcome ?? ''] ?? 'bg-slate-100 text-slate-600',
      )}
    >
      <PhoneCall className="mr-1 h-3 w-3" />
      {outcome ?? 'Unknown'}
    </span>
  )
}

// ─── Activity Timeline ────────────────────────────────────────────────────────

function ActivityTimeline({ contact }: { contact: ContactDetailItem }) {
  // Build unified timeline from all sub-collections
  type TimelineItem =
    | { kind: 'note'; id: string; body: string; createdAt: string; user: { name: string | null } | null }
    | { kind: 'task'; id: string; title: string; completedAt: string | null; dueAt: string | null; createdAt: string }
    | { kind: 'call'; id: string; outcome: string | null; notes: string | null; createdAt: string; user: { name: string | null } | null }
    | { kind: 'message'; id: string; channel: string; direction: string; body: string; createdAt: string }
    | { kind: 'stage'; id: string; fromStage: { name: string; color: string } | null; toStage: { name: string; color: string }; changedAt: string; changedByUser: { name: string | null } | null }

  const items: TimelineItem[] = [
    ...contact.notes.map((n) => ({ kind: 'note' as const, id: n.id, body: n.body, createdAt: n.createdAt, user: n.user })),
    ...contact.tasks.map((t) => ({ kind: 'task' as const, id: t.id, title: t.title, completedAt: t.completedAt, dueAt: t.dueAt, createdAt: t.createdAt })),
    ...contact.calls.map((c) => ({ kind: 'call' as const, id: c.id, outcome: c.outcome, notes: c.notes, createdAt: c.createdAt, user: c.user })),
    ...contact.messages.map((m) => ({ kind: 'message' as const, id: m.id, channel: m.channel, direction: m.direction, body: m.body, createdAt: m.createdAt })),
    ...contact.opportunities.flatMap((opp) =>
      opp.stageHistory.map((sh) => ({
        kind: 'stage' as const,
        id: sh.id,
        fromStage: sh.fromStage,
        toStage: sh.toStage,
        changedAt: sh.changedAt,
        changedByUser: sh.changedByUser,
      })),
    ),
  ].sort((a, b) => {
    const da = 'changedAt' in a ? a.changedAt : a.createdAt
    const db = 'changedAt' in b ? b.changedAt : b.createdAt
    return new Date(db).getTime() - new Date(da).getTime()
  })

  if (items.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-slate-400">No activity yet.</div>
    )
  }

  return (
    <div className="relative space-y-4">
      {/* vertical line */}
      <div className="absolute left-4 top-2 bottom-2 w-px bg-slate-200" />
      {items.map((item) => {
        const date = 'changedAt' in item ? item.changedAt : item.createdAt
        return (
          <div key={item.id} className="relative flex gap-4 pl-10">
            {/* dot */}
            <div
              className={cn(
                'absolute left-3 top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white',
                item.kind === 'note' ? 'bg-blue-400' :
                item.kind === 'task' ? 'bg-green-400' :
                item.kind === 'call' ? 'bg-orange-400' :
                item.kind === 'message' ? 'bg-purple-400' :
                'bg-indigo-400',
              )}
            />
            <div className="flex-1 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
              {item.kind === 'note' && (
                <>
                  <p className="font-medium text-slate-700">Note</p>
                  <p className="text-slate-600 mt-0.5 line-clamp-2">{item.body}</p>
                  {item.user && <p className="mt-1 text-xs text-slate-400">by {item.user.name}</p>}
                </>
              )}
              {item.kind === 'task' && (
                <>
                  <p className="font-medium text-slate-700">Task: {item.title}</p>
                  {item.dueAt && <p className="text-xs text-slate-400">Due {formatDate(item.dueAt)}</p>}
                  {item.completedAt && <p className="text-xs text-green-600">Completed {formatDate(item.completedAt)}</p>}
                </>
              )}
              {item.kind === 'call' && (
                <>
                  <p className="font-medium text-slate-700">
                    Call — <CallOutcomeBadge outcome={item.outcome} />
                  </p>
                  {item.notes && <p className="text-slate-600 mt-0.5 text-xs">{item.notes}</p>}
                  {item.user && <p className="mt-1 text-xs text-slate-400">by {item.user.name}</p>}
                </>
              )}
              {item.kind === 'message' && (
                <>
                  <p className="font-medium text-slate-700">
                    {item.channel} {item.direction === 'OUT' ? 'sent' : 'received'}
                  </p>
                  <p className="text-slate-600 mt-0.5 line-clamp-1 text-xs">{item.body}</p>
                </>
              )}
              {item.kind === 'stage' && (
                <div className="flex items-center gap-1 flex-wrap">
                  <p className="font-medium text-slate-700 mr-1">Stage changed</p>
                  {item.fromStage && (
                    <>
                      <span
                        className="rounded px-1.5 py-0.5 text-xs font-medium"
                        style={{ backgroundColor: item.fromStage.color + '20', color: item.fromStage.color }}
                      >
                        {item.fromStage.name}
                      </span>
                      <ArrowRight className="h-3 w-3 text-slate-400" />
                    </>
                  )}
                  <span
                    className="rounded px-1.5 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: item.toStage.color + '20', color: item.toStage.color }}
                  >
                    {item.toStage.name}
                  </span>
                  {item.changedByUser && (
                    <span className="ml-1 text-xs text-slate-400">by {item.changedByUser.name}</span>
                  )}
                </div>
              )}
              <p className="mt-1 text-[10px] text-slate-400">{formatDateTime(date)}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

