'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface TicketFilters {
  search?: string
  platformId?: string
  branchId?: string
  /**
   * Filter by `tkt_branch.branch_number` (e.g. "01", "15") — what the GET
   * /api/crm/tickets endpoint actually consumes. Set this when the topbar
   * branch switcher selects a specific branch.
   */
  branchNumber?: string
  status?: string
  dateFrom?: string
  dateTo?: string
  includeArchived?: boolean
  page?: number
  pageSize?: number
}

export interface TktPlatform {
  id: string
  name: string
  slug: string
  code: string
  accent_color: string
}

export interface TktBranch {
  id: string
  name: string
  code: string
  branch_number: string
}

export interface TicketAttachment {
  id: string
  ticket_id: string
  file_type: string
  original_name: string
  s3_key: string
  mime_type: string | null
  size_bytes: number | null
  uploaded_by: string
  uploaded_at: string
}

export interface TicketEvent {
  id: string
  ticket_id: string
  actor_id: string
  type: string
  from_value: string | null
  to_value: string | null
  payload: Record<string, unknown> | null
  created_at: string
}

export interface Ticket {
  id: string
  ticket_number: string
  tenant_id: string
  branch_id: string
  platform_id: string
  user_id: string
  issue_context: string
  sub_type: string
  fields: Record<string, unknown>
  status: string
  admin_remark: string | null
  rejection_reason: string | null
  assigned_admin_id: string | null
  completed_at: string | null
  visible_until: string | null
  created_at: string
  updated_at: string
  platform: TktPlatform
  branch: TktBranch
  submitter: {
    user_id: string
    role: string
    email_notifications: boolean
  }
  attachments: TicketAttachment[]
  events: TicketEvent[]
}

export interface TicketListResponse {
  data: Ticket[]
  total: number
  page: number
  pageSize: number
}

// ─── Fetch helper ─────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((err as { error?: string }).error ?? res.statusText)
  }
  return res.json() as Promise<T>
}

function buildTicketParams(filters: TicketFilters): string {
  const params = new URLSearchParams()
  if (filters.search) params.set('search', filters.search)
  if (filters.platformId) params.set('platformId', filters.platformId)
  if (filters.branchId) params.set('branchId', filters.branchId)
  if (filters.branchNumber) params.set('branch', filters.branchNumber)
  if (filters.status) params.set('status', filters.status)
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
  if (filters.dateTo) params.set('dateTo', filters.dateTo)
  if (filters.includeArchived) params.set('includeArchived', 'true')
  if (filters.page !== undefined) params.set('page', String(filters.page))
  if (filters.pageSize !== undefined) params.set('pageSize', String(filters.pageSize))
  return params.toString()
}

// ─── useTickets ───────────────────────────────────────────────────────────────

export function useTickets(filters: TicketFilters) {
  return useQuery({
    queryKey: ['tickets', filters],
    queryFn: () =>
      fetchJson<TicketListResponse>(`/api/crm/tickets?${buildTicketParams(filters)}`),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  })
}

// ─── useTicket ────────────────────────────────────────────────────────────────

export function useTicket(id: string) {
  return useQuery({
    queryKey: ['tickets', 'detail', id],
    // GET /api/crm/tickets/[id] returns { data: Ticket } — unwrap so callers
    // get the Ticket directly. (The list endpoint returns
    // { data: Ticket[], total, ... } and is typed correctly via
    // TicketListResponse, so only the single-ticket hook needs unwrapping.)
    queryFn: async () => {
      const res = await fetchJson<{ data: Ticket }>(`/api/crm/tickets/${id}`)
      return res.data
    },
    enabled: !!id,
    staleTime: 30_000,
  })
}

// ─── useCreateTicket ──────────────────────────────────────────────────────────

export interface CreateTicketInput {
  platformSlug: string
  branchId: string
  subType: string
  fields: Record<string, unknown>
}

export function useCreateTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateTicketInput) =>
      fetchJson<{ ticketId: string; ticketNumber: string }>('/api/crm/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ['tickets'] })
      toast.success(`Ticket ${data.ticketNumber} created successfully`)
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'Failed to create ticket')
    },
  })
}

// ─── useUpdateTicketStatus ────────────────────────────────────────────────────

export interface UpdateStatusInput {
  id: string
  status: string
  adminRemark?: string
  rejectionReason?: string
}

export function useUpdateTicketStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateStatusInput) =>
      fetchJson<{ success: boolean }>(`/api/crm/tickets/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: (_, variables) => {
      void qc.invalidateQueries({ queryKey: ['tickets'] })
      void qc.invalidateQueries({ queryKey: ['tickets', 'detail', variables.id] })
      toast.success('Ticket status updated')
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'Failed to update status')
    },
  })
}

// ─── useDeleteTicket ──────────────────────────────────────────────────────────

export function useDeleteTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      fetchJson<{ success: boolean }>(`/api/crm/tickets/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tickets'] })
      toast.success('Ticket deleted')
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'Failed to delete ticket')
    },
  })
}

// ─── useAssignTicket ──────────────────────────────────────────────────────────

export interface AssignTicketInput {
  id: string
  adminId: string
}

export function useAssignTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, adminId }: AssignTicketInput) =>
      fetchJson<{ success: boolean }>(`/api/crm/tickets/${id}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId }),
      }),
    onSuccess: (_, variables) => {
      void qc.invalidateQueries({ queryKey: ['tickets'] })
      void qc.invalidateQueries({ queryKey: ['tickets', 'detail', variables.id] })
      toast.success('Ticket assigned')
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'Failed to assign ticket')
    },
  })
}

// ─── useTktPlatforms ─────────────────────────────────────────────────────────

export function useTktPlatforms() {
  return useQuery({
    queryKey: ['tkt-platforms'],
    queryFn: () => fetchJson<TktPlatform[]>('/api/crm/tkt-platforms'),
    staleTime: 5 * 60_000,
  })
}

// ─── useTktBranches ───────────────────────────────────────────────────────────

export function useTktBranches() {
  return useQuery({
    queryKey: ['tkt-branches'],
    queryFn: () => fetchJson<TktBranch[]>('/api/crm/tkt-branches'),
    staleTime: 5 * 60_000,
  })
}
