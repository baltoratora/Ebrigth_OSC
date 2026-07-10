'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateAutomationInput } from '@/lib/crm/validations/automation'

const BASE = '/api/crm/automations'

async function fetcher<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts)
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<T>
}

// Shape returned by GET /api/crm/automations
export interface AutomationListRow {
  id: string
  name: string
  triggerType: string
  enabled: boolean
  branchId: string | null
  branchName: string | null
  createdAt: string
  updatedAt: string
  lastRun: {
    id: string
    status: string
    startedAt: string
    completedAt: string | null
  } | null
}

export function useAutomations(branchId?: string) {
  const params = branchId ? `?branchId=${branchId}` : ''
  return useQuery({
    queryKey: ['crm', 'automations', branchId],
    queryFn: async () => {
      const res = await fetcher<{ data: AutomationListRow[]; total: number }>(`${BASE}${params}`)
      return res.data
    },
  })
}

export function useAutomation(id: string) {
  return useQuery({
    queryKey: ['crm', 'automation', id],
    queryFn: () => fetcher(`${BASE}/${id}`),
    enabled: !!id,
  })
}

export function useAutomationRuns(automationId: string) {
  return useQuery({
    queryKey: ['crm', 'automation-runs', automationId],
    queryFn: () => fetcher(`${BASE}/${automationId}/runs`),
    enabled: !!automationId,
    refetchInterval: 5_000,
  })
}

export function useCreateAutomation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateAutomationInput) =>
      fetcher(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm', 'automations'] }),
  })
}

export function useUpdateAutomation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateAutomationInput> }) =>
      fetcher(`${BASE}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['crm', 'automations'] })
      qc.invalidateQueries({ queryKey: ['crm', 'automation', v.id] })
    },
  })
}

export function useToggleAutomation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      fetcher(`${BASE}/${id}/toggle`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm', 'automations'] }),
  })
}

export function useDuplicateAutomation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => fetcher(`${BASE}/${id}/duplicate`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm', 'automations'] }),
  })
}

export function useDeleteAutomation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => fetcher(`${BASE}/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm', 'automations'] }),
  })
}

export function useTestRunAutomation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, contactId }: { id: string; contactId: string }) =>
      fetcher(`${BASE}/${id}/test-run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contactId }) }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['crm', 'automation-runs', v.id] })
    },
  })
}
