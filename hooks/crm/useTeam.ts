'use client'

import { useQuery } from '@tanstack/react-query'

export interface TeamUser {
  id: string
  name: string | null
  email: string
  image: string | null
  createdAt: string
  branches: { id: string; name: string; role: string }[]
}

async function fetchTeam(): Promise<{ users: TeamUser[] }> {
  const res = await fetch('/api/crm/team')
  if (!res.ok) throw new Error('Failed to fetch team')
  return res.json()
}

export function useTeam() {
  return useQuery({
    queryKey: ['crm', 'team'],
    queryFn: fetchTeam,
    staleTime: 60_000,
  })
}
