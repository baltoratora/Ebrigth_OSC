'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

async function fetcher<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts)
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<T>
}

export function useNotifications(filter: 'all' | 'unread' = 'all') {
  return useQuery({
    queryKey: ['crm', 'notifications', filter],
    queryFn: () => fetcher(`/api/crm/notifications?filter=${filter}`),
    refetchInterval: 30_000,
  })
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ['crm', 'notifications', 'unread-count'],
    queryFn: async () => {
      const data = await fetcher<{ total: number }>('/api/crm/notifications?filter=unread&pageSize=1')
      return data.total
    },
    refetchInterval: 30_000,
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      fetcher(`/api/crm/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'notifications'] })
    },
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => fetcher('/api/crm/notifications/mark-all-read', { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm', 'notifications'] }),
  })
}
