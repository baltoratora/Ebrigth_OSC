'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

export interface BranchInfo {
  id: string
  name: string
  address?: string | null
  tenantId?: string
}

interface BranchContextValue {
  branches: BranchInfo[]
  selectedBranch: BranchInfo | null
  setSelectedBranch: (branch: BranchInfo | null) => void
  loading: boolean
  /** CRM role of the logged-in viewer — populated from /api/crm/branches */
  viewerRole: string | null
}

const BranchContext = createContext<BranchContextValue | null>(null)

export function useBranchContext(): BranchContextValue {
  const ctx = useContext(BranchContext)
  if (!ctx) {
    throw new Error('useBranchContext must be used within BranchProvider')
  }
  return ctx
}

interface BranchProviderProps {
  initialBranches?: BranchInfo[]
  children: ReactNode
}

const STORAGE_KEY = 'crm.selectedBranchId'
const CACHE_KEY = 'crm.branchesCache'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes — branches change rarely

function readBranchCache(): BranchInfo[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { ts: number; list: BranchInfo[] }
    if (Date.now() - parsed.ts > CACHE_TTL) return null
    return parsed.list
  } catch {
    return null
  }
}

function writeBranchCache(list: BranchInfo[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), list }))
  } catch {
    // quota or disabled — ignore
  }
}

export function BranchProvider({
  initialBranches = [],
  children,
}: BranchProviderProps) {
  // Hydrate from localStorage cache if present so navigation feels instant
  const [branches, setBranches] = useState<BranchInfo[]>(() => {
    if (initialBranches.length > 0) return initialBranches
    return readBranchCache() ?? []
  })
  const [selectedBranch, setSelectedBranchState] = useState<BranchInfo | null>(null)
  const [loading, setLoading] = useState(branches.length === 0)
  const [viewerRole, setViewerRole] = useState<string | null>(null)

  // Fetch branches once per session and refresh cache
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/crm/branches')
        if (!res.ok) return
        const data = (await res.json()) as { branches?: BranchInfo[]; viewerRole?: string }
        if (cancelled) return
        const list = data.branches ?? []
        setBranches(list)
        writeBranchCache(list)
        if (data.viewerRole) setViewerRole(data.viewerRole)

        // Restore selection from localStorage
        const savedId = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
        if (savedId && savedId !== 'all') {
          const match = list.find((b) => b.id === savedId)
          if (match) setSelectedBranchState(match)
        }
      } catch {
        // network error — keep cached branches if any
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
     
  }, [])

  const setSelectedBranch = (branch: BranchInfo | null) => {
    setSelectedBranchState(branch)
    if (typeof window !== 'undefined') {
      if (branch) localStorage.setItem(STORAGE_KEY, branch.id)
      else        localStorage.setItem(STORAGE_KEY, 'all')
    }
  }

  return (
    <BranchContext.Provider value={{ branches, selectedBranch, setSelectedBranch, loading, viewerRole }}>
      {children}
    </BranchContext.Provider>
  )
}

export { BranchContext }
