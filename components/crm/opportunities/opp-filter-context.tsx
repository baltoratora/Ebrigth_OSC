'use client'

/**
 * Shares the Opportunities kanban's day/week filter with sibling widgets in the
 * page header (notably the WhatsApp leads button), which live outside the
 * KanbanBoard component tree. The KanbanBoard writes its resolved date range
 * here; consumers read it. Range is ISO strings (or null = "all / no filter").
 */
import { createContext, useContext, useState, type ReactNode } from 'react'

export interface OppDateRange {
  from: string
  to: string
}

interface OppFilterValue {
  range: OppDateRange | null
  setRange: (r: OppDateRange | null) => void
}

// Default (no provider) → no filter + no-op setter, so consumers never crash
// when rendered outside the Opportunities page.
const OppFilterContext = createContext<OppFilterValue>({ range: null, setRange: () => {} })

export function useOppFilter(): OppFilterValue {
  return useContext(OppFilterContext)
}

export function OppFilterProvider({ children }: { children: ReactNode }) {
  const [range, setRange] = useState<OppDateRange | null>(null)
  return (
    <OppFilterContext.Provider value={{ range, setRange }}>
      {children}
    </OppFilterContext.Provider>
  )
}
