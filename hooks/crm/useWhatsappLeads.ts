'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export interface WhatsappLeadItem {
  id: string
  wsLeadId: string
  source: string
  branchId: string
  branchName: string
  rawBranch: string | null
  fullName: string | null
  phone: string | null
  campaignName: string | null
  submittedAt: string | null
}

interface WhatsappLeadsResponse {
  count: number
  items: WhatsappLeadItem[]
  canManage: boolean
}

const KEY = ['crm', 'whatsapp-leads'] as const

/**
 * Pending WhatsApp interactions for the current branch scope. `branchId` mirrors
 * the topbar-selected branch (null = all the caller's branches). Polls every
 * 60s for the badge; pass `sync` to pull fresh ws_leads from ebrightleads_db.
 */
export function useWhatsappLeads(
  branchId: string | null,
  sync: boolean,
  range?: { from: string; to: string } | null,
) {
  return useQuery({
    queryKey: [...KEY, branchId ?? 'all', sync, range?.from ?? '', range?.to ?? ''],
    queryFn: async (): Promise<WhatsappLeadsResponse> => {
      const params = new URLSearchParams()
      if (branchId) params.set('branchId', branchId)
      if (sync) params.set('sync', '1')
      // Mirror the kanban day filter — narrows badge + list to submittedAt range.
      if (range) {
        params.set('from', range.from)
        params.set('to', range.to)
      }
      const qs = params.toString()
      const res = await fetch(`/api/crm/whatsapp-leads${qs ? `?${qs}` : ''}`)
      if (!res.ok) throw new Error('Failed to load WhatsApp leads')
      return res.json()
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
}

export function useCompleteWhatsappLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      parentName: string
      childName?: string
      phone: string
      email: string
    }) => {
      const res = await fetch('/api/crm/whatsapp-leads/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'Failed to submit')
      return res.json()
    },
    onSuccess: () => {
      toast.success('Lead added to New Lead')
      void qc.invalidateQueries({ queryKey: KEY })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useAddWhatsappLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { branchId: string; fullName?: string; phone?: string; campaignName?: string }) => {
      const res = await fetch('/api/crm/whatsapp-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'Failed to add')
      return res.json()
    },
    onSuccess: () => {
      toast.success('WhatsApp lead added')
      void qc.invalidateQueries({ queryKey: KEY })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteWhatsappLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; reason?: string }) => {
      const res = await fetch('/api/crm/whatsapp-leads', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'Failed to delete')
      return res.json()
    },
    onSuccess: () => {
      toast.success('WhatsApp lead deleted')
      void qc.invalidateQueries({ queryKey: KEY })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
