'use client'

import { useParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { TicketDetail } from '@/components/crm/tickets/TicketDetail'
import { useTicket } from '@/hooks/crm/useTickets'
import { useCrmSession } from '@/components/crm/providers'

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id ?? ''
  const { data: ticket, isLoading, isError } = useTicket(id)
  const { session } = useCrmSession()

  const role = (session?.user as { tktRole?: string } | undefined)?.tktRole ?? 'user'
  const canManage = role === 'platform_admin' || role === 'super_admin'
  const canReopen = role === 'super_admin'

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  if (isError || !ticket) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Ticket not found</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            This ticket may have been archived or you don&apos;t have permission to view it.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <TicketDetail ticket={ticket} canManage={canManage} canReopen={canReopen} />
    </div>
  )
}
