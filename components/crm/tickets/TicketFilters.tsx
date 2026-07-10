'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, X, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/crm/utils'
import { useTktPlatforms, useTktBranches, type TicketFilters } from '@/hooks/crm/useTickets'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TicketFiltersProps {
  filters: TicketFilters
  onChange: (filters: TicketFilters) => void
  role: string
}

const STATUS_OPTIONS = [
  { value: 'received', label: 'Received' },
  { value: 'approved', label: 'Approved' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'complete', label: 'Complete' },
  { value: 'rejected', label: 'Rejected' },
]

const DEFAULT_FILTERS: TicketFilters = {
  search: '',
  platformId: '',
  branchId: '',
  status: '',
  dateFrom: '',
  dateTo: '',
  includeArchived: false,
  page: 1,
  pageSize: 10,
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TicketFilters({ filters, onChange, role }: TicketFiltersProps) {
  const { data: platforms = [] } = useTktPlatforms()
  const { data: branches = [] } = useTktBranches()

  // Local search state for debouncing
  const [localSearch, setLocalSearch] = useState(filters.search ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setLocalSearch(filters.search ?? '')
  }, [filters.search])

  function handleSearchChange(value: string) {
    setLocalSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onChange({ ...filters, search: value, page: 1 })
    }, 300)
  }

  function handleSelectChange(key: keyof TicketFilters, value: string) {
    onChange({ ...filters, [key]: value === '__all__' ? '' : value, page: 1 })
  }

  function handleDateChange(key: 'dateFrom' | 'dateTo', value: string) {
    onChange({ ...filters, [key]: value, page: 1 })
  }

  function handleReset() {
    setLocalSearch('')
    onChange(DEFAULT_FILTERS)
  }

  const hasActiveFilters =
    (filters.search ?? '') !== '' ||
    (filters.platformId ?? '') !== '' ||
    (filters.branchId ?? '') !== '' ||
    (filters.status ?? '') !== '' ||
    (filters.dateFrom ?? '') !== '' ||
    (filters.dateTo ?? '') !== '' ||
    filters.includeArchived === true

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-wrap items-end gap-3">
        {/* Search */}
        <div className="min-w-45 flex-1">
          <Label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Search</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Ticket #, submitter…"
              value={localSearch}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-8 text-sm"
            />
            {localSearch && (
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                onClick={() => handleSearchChange('')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Platform */}
        <div className="w-40">
          <Label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Platform</Label>
          <Select
            value={filters.platformId || '__all__'}
            onValueChange={(v) => handleSelectChange('platformId', v)}
          >
            <SelectTrigger className="text-sm">
              <SelectValue placeholder="All platforms" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All platforms</SelectItem>
              {platforms.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Branch */}
        <div className="w-40">
          <Label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Branch</Label>
          <Select
            value={filters.branchId || '__all__'}
            onValueChange={(v) => handleSelectChange('branchId', v)}
          >
            <SelectTrigger className="text-sm">
              <SelectValue placeholder="All branches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All branches</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status */}
        <div className="w-40">
          <Label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Status</Label>
          <Select
            value={filters.status || '__all__'}
            onValueChange={(v) => handleSelectChange('status', v)}
          >
            <SelectTrigger className="text-sm">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All statuses</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date From */}
        <div className="w-36">
          <Label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">From</Label>
          <Input
            type="date"
            value={filters.dateFrom ?? ''}
            onChange={(e) => handleDateChange('dateFrom', e.target.value)}
            className="text-sm"
          />
        </div>

        {/* Date To */}
        <div className="w-36">
          <Label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">To</Label>
          <Input
            type="date"
            value={filters.dateTo ?? ''}
            onChange={(e) => handleDateChange('dateTo', e.target.value)}
            className="text-sm"
          />
        </div>

        {/* Include Archived — super_admin only */}
        {role === 'super_admin' && (
          <div className="flex items-center gap-2 self-end pb-1">
            <input
              id="include-archived"
              type="checkbox"
              checked={filters.includeArchived ?? false}
              onChange={(e) =>
                onChange({ ...filters, includeArchived: e.target.checked, page: 1 })
              }
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <Label htmlFor="include-archived" className="text-sm text-slate-600 dark:text-slate-400">
              Archived
            </Label>
          </div>
        )}

        {/* Reset */}
        <div className="self-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={!hasActiveFilters}
            className={cn(!hasActiveFilters && 'invisible')}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset
          </Button>
        </div>
      </div>
    </div>
  )
}
