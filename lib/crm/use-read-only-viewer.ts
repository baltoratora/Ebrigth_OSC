'use client'

import { useCrmSession } from '@/components/crm/providers'
import { isReadOnlyViewer } from '@/lib/crm/operation-accounts'

/**
 * True when the current CRM user is a read-only viewer (the marketing-advisor
 * monitor, e.g. mokhirsunrise@gmail.com — see AGENCY_VIEW_EMAILS). Use it to
 * HIDE every create / edit / delete / connect / invite affordance so the account
 * is purely view-only in the UI. Server-side guards (denyReadOnlyViewer +
 * middleware) are the real enforcement; this just keeps the UI honest.
 */
export function useReadOnlyViewer(): boolean {
  const { session } = useCrmSession()
  return isReadOnlyViewer(session?.user?.email)
}
