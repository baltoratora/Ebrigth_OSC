'use client'

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import { BranchProvider } from './branch-context'

// ─── Session context ──────────────────────────────────────────────────────────

export interface SessionUser {
  id: string
  email: string
  name?: string | null
  /** Ticket-module role: 'super_admin' | 'platform_admin' | 'user'; null if no tkt profile */
  tktRole?: string | null
  /** Ticket-module branch assignments */
  tktBranchIds?: string[]
}

interface CrmSessionContextValue {
  session: { user: SessionUser }
}

const CrmSessionContext = createContext<CrmSessionContextValue | null>(null)

export function useCrmSession(): CrmSessionContextValue {
  const ctx = useContext(CrmSessionContext)
  if (!ctx) {
    throw new Error('useCrmSession must be used within CrmProviders')
  }
  return ctx
}

// ─── Provider tree ────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 min
        retry: 1,
      },
    },
  })
}

// Keep the client stable across re-renders (React 19 safe pattern)
let browserQueryClient: QueryClient | undefined

function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: always make a new client
    return makeQueryClient()
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient()
  }
  return browserQueryClient
}

interface CrmProvidersProps {
  session: { user: SessionUser }
  children: ReactNode
}

export function CrmProviders({ session, children }: CrmProvidersProps) {
  const queryClient = getQueryClient()

  return (
    <CrmSessionContext.Provider value={{ session }}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <BranchProvider>
            {children}
            <Toaster position="top-right" richColors closeButton />
          </BranchProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </CrmSessionContext.Provider>
  )
}
