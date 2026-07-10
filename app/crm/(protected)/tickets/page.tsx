'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TicketTable } from '@/components/crm/tickets/TicketTable'
import { TicketFilters as TicketFiltersComponent } from '@/components/crm/tickets/TicketFilters'
import { useTickets, type TicketFilters } from '@/hooks/crm/useTickets'
import { useCrmSession } from '@/components/crm/providers'

export default function TicketsPage() {
  const { session } = useCrmSession()
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<TicketFilters>(() => ({
    page: 1,
    pageSize: 25,
    branchId: searchParams.get('branchId') ?? undefined,
    platformId: searchParams.get('platformId') ?? undefined,
    status: searchParams.get('status') ?? undefined,
  }))
  const { data, isLoading } = useTickets(filters)

  // Re-sync if URL changes
  useEffect(() => {
    setFilters((f) => ({
      ...f,
      branchId: searchParams.get('branchId') ?? undefined,
      platformId: searchParams.get('platformId') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      page: 1,
    }))
  }, [searchParams])

  const role = (session?.user as { tktRole?: string } | undefined)?.tktRole ?? 'user'

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Tickets</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {data?.total ?? 0} total tickets
          </p>
        </div>
        <Button asChild>
          <Link href="/crm/tickets/new">
            <Plus className="mr-2 h-4 w-4" /> New Ticket
          </Link>
        </Button>
      </div>

      <TicketFiltersComponent filters={filters} onChange={setFilters} role={role} />

      <TicketTable
        data={data?.data ?? []}
        total={data?.total ?? 0}
        page={filters.page ?? 1}
        pageSize={filters.pageSize ?? 25}
        onPageChange={(page) => setFilters((f) => ({ ...f, page }))}
        onPageSizeChange={(pageSize) => setFilters((f) => ({ ...f, pageSize, page: 1 }))}
        isLoading={isLoading}
      />
    </div>
  )
}
