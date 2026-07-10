'use client'

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import type { KanbanData } from '@/server/queries/opportunities'
import type { CreateOpportunityInput } from '@/lib/crm/validations/opportunity'

// ─── Query keys ───────────────────────────────────────────────────────────────

export const opportunityKeys = {
  all: ['crm', 'opportunities'] as const,
  kanban: (pipelineId: string, branchId?: string, search?: string) =>
    ['crm', 'opportunities', 'kanban', pipelineId, branchId, search] as const,
  detail: (id: string) => ['crm', 'opportunities', id] as const,
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchKanban(
  pipelineId: string,
  branchId?: string,
  search?: string,
): Promise<KanbanData> {
  const sp = new URLSearchParams({ pipelineId })
  // Distinguish "no branch filter" (explicit all) from "user default" (undefined):
  //   - branchId = real uuid → filter to that branch
  //   - branchId = '' or undefined → send 'all' so server doesn't fall back to admin's branch
  sp.set('branchId', branchId && branchId !== 'all' ? branchId : 'all')
  if (search) sp.set('search', search)

  const res = await fetch(`/api/crm/opportunities?${sp}`)
  if (!res.ok) throw new Error('Failed to fetch kanban')
  return res.json()
}

async function fetchOpportunity(id: string) {
  const res = await fetch(`/api/crm/opportunities/${id}`)
  if (!res.ok) throw new Error('Failed to fetch opportunity')
  return res.json()
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useKanban(
  pipelineId: string,
  branchId?: string,
  search?: string,
): UseQueryResult<KanbanData> {
  return useQuery({
    queryKey: opportunityKeys.kanban(pipelineId, branchId, search),
    queryFn: () => fetchKanban(pipelineId, branchId, search),
    enabled: !!pipelineId,
    staleTime: 30_000,
  })
}

export function useOpportunity(id: string) {
  return useQuery({
    queryKey: opportunityKeys.detail(id),
    queryFn: () => fetchOpportunity(id),
    enabled: !!id,
  })
}

export function useMoveOpportunity() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      opportunityId,
      toStageId,
      note,
      trialDate,
      trialTimeSlot,
      enrollmentMonths,
      rescheduleDate,
    }: {
      opportunityId: string
      toStageId: string
      note?: string
      trialDate?: string
      trialTimeSlot?: string
      enrollmentMonths?: 3 | 6 | 9 | 12 | 18 | 24
      rescheduleDate?: string
    }) => {
      const res = await fetch(`/api/crm/opportunities/${opportunityId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toStageId, note, trialDate, trialTimeSlot, enrollmentMonths, rescheduleDate }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Move failed')
      }
      return res.json()
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: opportunityKeys.all })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

export function useBulkMoveOpportunities() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      opportunityIds,
      toStageId,
      note,
    }: {
      opportunityIds: string[]
      toStageId: string
      note?: string
    }) => {
      const res = await fetch(`/api/crm/opportunities/bulk/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityIds, toStageId, note }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Bulk move failed')
      }
      return res.json()
    },
    onSuccess: (data: { moved: number }) => {
      toast.success(`Moved ${data.moved} opportunities`)
      void qc.invalidateQueries({ queryKey: opportunityKeys.all })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

export function useCreateOpportunity() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateOpportunityInput & { branchId?: string }) => {
      const res = await fetch('/api/crm/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Create failed')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Opportunity created')
      void qc.invalidateQueries({ queryKey: opportunityKeys.all })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

export function useDeleteOpportunity() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (opportunityId: string) => {
      const res = await fetch(`/api/crm/opportunities/${opportunityId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Delete failed')
      return res.json()
    },
    onSuccess: () => {
      toast.success('Opportunity deleted')
      void qc.invalidateQueries({ queryKey: opportunityKeys.all })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}
