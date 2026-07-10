'use client'

import { useQuery } from '@tanstack/react-query'
import {
  startOfDay,
  endOfDay,
  subDays,
  startOfMonth,
  startOfQuarter,
} from 'date-fns'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import type { DashboardStats } from '@/server/queries/dashboard'

const KL_TZ = 'Asia/Kuala_Lumpur'

export type DateRangePreset =
  | 'today'
  | '7d'
  | '30d'
  | 'this_month'
  | 'this_quarter'
  | 'custom'

async function fetchDashboard(
  preset: DateRangePreset,
  branchId?: string,
  customRange?: { from: Date; to: Date },
): Promise<DashboardStats> {
  const params = new URLSearchParams()
  params.set('preset', preset)

  if (preset === 'custom' && customRange) {
    params.set('from', customRange.from.toISOString())
    params.set('to', customRange.to.toISOString())
  }
  if (branchId) params.set('branchId', branchId)

  const res = await fetch(`/api/crm/dashboard?${params.toString()}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((body as { error?: string }).error ?? res.statusText)
  }
  return res.json() as Promise<DashboardStats>
}

export function useDashboardStats(
  preset: DateRangePreset,
  branchId?: string,
  customRange?: { from: Date; to: Date },
) {
  return useQuery({
    queryKey: ['crm', 'dashboard', preset, branchId, customRange?.from, customRange?.to],
    queryFn: () => fetchDashboard(preset, branchId, customRange),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
    enabled: preset !== 'custom' || (!!customRange?.from && !!customRange?.to),
  })
}
