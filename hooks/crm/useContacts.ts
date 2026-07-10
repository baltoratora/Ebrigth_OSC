'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ContactsFilter } from '@/server/queries/contacts'
import type { CreateContactInput, UpdateContactInput } from '@/lib/crm/validations/contact'

// ─── Fetch helpers ────────────────────────────────────────────────────────────

function buildQueryString(filter: ContactsFilter): string {
  const params = new URLSearchParams()
  if (filter.search) params.set('search', filter.search)
  if (filter.branchId) params.set('branchId', filter.branchId)
  if (filter.stageId) params.set('stageId', filter.stageId)
  if (filter.leadSourceId) params.set('leadSourceId', filter.leadSourceId)
  if (filter.assignedUserId) params.set('assignedUserId', filter.assignedUserId)
  if (filter.tagId) params.set('tagId', filter.tagId)
  if (filter.page !== undefined) params.set('page', String(filter.page))
  if (filter.pageSize !== undefined) params.set('pageSize', String(filter.pageSize))
  if (filter.sortBy) params.set('sortBy', filter.sortBy)
  if (filter.sortDir) params.set('sortDir', filter.sortDir)
  return params.toString()
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((err as { error?: string }).error ?? res.statusText)
  }
  return res.json() as Promise<T>
}

// ─── useContacts ──────────────────────────────────────────────────────────────

export function useContacts(filter: ContactsFilter) {
  return useQuery({
    queryKey: ['crm', 'contacts', filter],
    queryFn: () =>
      fetchJson<{
        data: ContactListItem[]
        total: number
        page: number
        pageSize: number
      }>(`/api/crm/contacts?${buildQueryString(filter)}`),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  })
}

// ─── useContact ───────────────────────────────────────────────────────────────

export function useContact(id: string) {
  return useQuery({
    queryKey: ['crm', 'contact', id],
    queryFn: () => fetchJson<ContactDetailItem>(`/api/crm/contacts/${id}`),
    enabled: !!id,
    staleTime: 30_000,
  })
}

// ─── useCreateContact ─────────────────────────────────────────────────────────

export function useCreateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ branchId, data }: { branchId: string; data: CreateContactInput }) =>
      fetchJson<{ contactId: string }>('/api/crm/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, branchId }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['crm', 'contacts'] })
    },
  })
}

// ─── useUpdateContact ─────────────────────────────────────────────────────────

export function useUpdateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateContactInput }) =>
      fetchJson<{ success: boolean }>(`/api/crm/contacts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: (_, variables) => {
      void qc.invalidateQueries({ queryKey: ['crm', 'contacts'] })
      void qc.invalidateQueries({ queryKey: ['crm', 'contact', variables.id] })
    },
  })
}

// ─── useDeleteContact ─────────────────────────────────────────────────────────

export function useDeleteContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      fetchJson<{ success: boolean }>(`/api/crm/contacts/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['crm', 'contacts'] })
    },
  })
}

// ─── Local types (mirrors server return types without importing server code) ──

export interface ContactListItem {
  id: string
  firstName: string
  lastName: string | null
  email: string | null
  phone: string | null
  branchId: string
  leadSourceId: string | null
  assignedUserId: string | null
  createdAt: string
  updatedAt: string
  contactTags: Array<{
    id: string
    tagId: string
    tag: { id: string; name: string; color: string }
  }>
  assignedUser: { id: string; name: string | null; email: string; image: string | null } | null
  leadSource: { id: string; name: string } | null
  opportunities: Array<{
    id: string
    stageId: string
    lastStageChangeAt: string
    stage: { id: string; name: string; color: string; shortCode: string }
  }>
}

export interface ContactDetailItem extends ContactListItem {
  preferredBranchId: string | null
  preferredTrialDay: string | null
  enrolledPackage: string | null
  childName1: string | null
  childAge1: string | null
  childName2: string | null
  childAge2: string | null
  childName3: string | null
  childAge3: string | null
  childName4: string | null
  childAge4: string | null
  notes: Array<{
    id: string
    body: string
    createdAt: string
    user: { id: string; name: string | null; image: string | null } | null
  }>
  tasks: Array<{
    id: string
    title: string
    dueAt: string | null
    completedAt: string | null
    createdAt: string
    branchId: string
    assignedUser: { id: string; name: string | null; image: string | null } | null
  }>
  messages: Array<{
    id: string
    channel: string
    direction: string
    body: string
    subject: string | null
    status: string
    createdAt: string
    user: { id: string; name: string | null; image: string | null } | null
  }>
  calls: Array<{
    id: string
    outcome: string | null
    notes: string | null
    duration: number | null
    createdAt: string
    user: { id: string; name: string | null; image: string | null } | null
  }>
  opportunities: Array<{
    id: string
    pipelineId: string
    stageId: string
    value: string
    lastStageChangeAt: string
    createdAt: string
    stage: { id: string; name: string; color: string; shortCode: string }
    pipeline: { id: string; name: string }
    assignedUser: { id: string; name: string | null; image: string | null } | null
    stageHistory: Array<{
      id: string
      fromStage: { id: string; name: string; color: string } | null
      toStage: { id: string; name: string; color: string }
      changedByUser: { id: string; name: string | null; image: string | null } | null
      note: string | null
      changedAt: string
    }>
  }>
}
