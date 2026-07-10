'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type VisibilityState,
  type RowSelectionState,
} from '@tanstack/react-table'
import { useContacts, useDeleteContact, type ContactListItem } from '@/hooks/crm/useContacts'
import type { ContactsFilter } from '@/server/queries/contacts'
import { useBranchContext } from '@/components/crm/branch-context'
import { ContactModal } from './contact-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Plus,
  Search,
  Download,
  Columns,
  Trash2,
  UserPlus,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Users,
  Phone,
  Mail,
} from 'lucide-react'
import { cn, formatDate } from '@/lib/crm/utils'
import { useReadOnlyViewer } from '@/lib/crm/use-read-only-viewer'
import Link from 'next/link'
import { toast } from 'sonner'
import { bulkAssignContacts } from '@/server/actions/contacts'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stage {
  id: string
  name: string
  color: string
}

interface LeadSource {
  id: string
  name: string
}

interface CrmUser {
  id: string
  name: string | null
  email: string
  image?: string | null
}

interface Tag {
  id: string
  name: string
  color: string
}

interface Branch {
  id: string
  name: string
}

interface ContactsListProps {
  branchId: string
  tenantId: string
  stages?: Stage[]
  leadSources?: LeadSource[]
  users?: CrmUser[]
  tags?: Tag[]
  branches?: Branch[]
  currentUserId: string
  /** SUPER_ADMIN only — gates the Delete action (server also re-checks). */
  canDelete?: boolean
}

// ─── Column helper ────────────────────────────────────────────────────────────

const col = createColumnHelper<ContactListItem>()

// ─── Stage color → Tailwind ───────────────────────────────────────────────────

function stageBg(color: string) {
  const map: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-green-100 text-green-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    red: 'bg-red-100 text-red-700',
    purple: 'bg-purple-100 text-purple-700',
    orange: 'bg-orange-100 text-orange-700',
    gray: 'bg-slate-100 text-slate-600',
    pink: 'bg-pink-100 text-pink-700',
  }
  return map[color] ?? 'bg-slate-100 text-slate-600'
}

// ─── GHL-style avatar helpers ────────────────────────────────────────────────
// Contact gets a stable pastel color derived from their id, plus 2-letter
// initials from the name/email. Same contact → same color every time.

const AVATAR_PALETTE = [
  'bg-sky-100 text-sky-700',
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-teal-100 text-teal-700',
  'bg-fuchsia-100 text-fuchsia-700',
  'bg-orange-100 text-orange-700',
  'bg-indigo-100 text-indigo-700',
]

function avatarColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}

function initialsFrom(firstName: string, lastName: string | null, email: string | null): string {
  const parts = [firstName, lastName ?? ''].join(' ').trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  if (parts.length === 1 && parts[0].length > 0) return parts[0].slice(0, 2).toUpperCase()
  if (email) return email.slice(0, 2).toUpperCase()
  return '??'
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 7 }).map((_, i) => (
        <tr key={i} className="border-b border-slate-100">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <Skeleton className="h-4 w-full" />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd?: () => void }) {
  return (
    <tr>
      <td colSpan={100} className="py-20 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
            <Users className="h-8 w-8 text-slate-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">No contacts yet</p>
            <p className="mt-1 text-xs text-slate-500">
              Start by adding your first contact to the CRM.
            </p>
          </div>
          {onAdd && (
            <Button size="sm" onClick={onAdd}>
              <Plus className="h-4 w-4" />
              Add your first contact
            </Button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ContactsList({
  branchId,
  tenantId,
  stages = [],
  leadSources = [],
  users = [],
  tags = [],
  branches = [],
  currentUserId,
  canDelete = false,
}: ContactsListProps) {
  const readOnly = useReadOnlyViewer()
  const [filter, setFilter] = useState<ContactsFilter>({
    page: 1,
    pageSize: 25,
    sortBy: 'createdAt',
    sortDir: 'desc',
  })
  const [search, setSearch] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }])
  const [colVisibility, setColVisibility] = useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignUserId, setAssignUserId] = useState('')

  // Topbar branch picker — when admin selects a branch, scope the contacts
  // list to that branch. Branch managers already get server-side scoping;
  // for them this just stays in sync with their assigned branch.
  const { selectedBranch } = useBranchContext()
  const filterWithBranch = useMemo<ContactsFilter>(
    () => ({
      ...filter,
      branchId: selectedBranch?.id ?? filter.branchId,
    }),
    [filter, selectedBranch?.id],
  )

  const { data, isLoading, isError } = useContacts(filterWithBranch)
  const deleteContact = useDeleteContact()

  // Debounced search
  const onSearchChange = useCallback((val: string) => {
    setSearch(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setFilter((f) => ({ ...f, search: val || undefined, page: 1 }))
    }, 300)
  }, [])

  // Sync sorting to filter
  useEffect(() => {
    const s = sorting[0]
    if (!s) return
    setFilter((f) => ({
      ...f,
      sortBy: s.id,
      sortDir: s.desc ? 'desc' : 'asc',
      page: 1,
    }))
  }, [sorting])

  // Export CSV
  const exportCsv = useCallback(() => {
    if (!data?.data) return
    const rows = data.data
    const headers = ['Name', 'Email', 'Phone', 'Stage', 'Lead Source', 'Assigned To', 'Created']
    const lines = [
      headers.join(','),
      ...rows.map((r) => [
        `"${r.firstName} ${r.lastName ?? ''}"`,
        r.email ?? '',
        r.phone ?? '',
        r.opportunities[0]?.stage.name ?? '',
        r.leadSource?.name ?? '',
        r.assignedUser?.name ?? '',
        formatDate(r.createdAt),
      ].join(',')),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    void logAuditExport()
  }, [data])

  async function logAuditExport() {
    await fetch(`/api/crm/contacts?export=1`, { method: 'GET' }).catch(() => null)
  }

  const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k])

  const handleBulkDelete = useCallback(async () => {
    const results = await Promise.allSettled(selectedIds.map((id) => deleteContact.mutateAsync(id)))
    const failed = results.filter((r) => r.status === 'rejected').length
    if (failed > 0) {
      toast.error(`Failed to delete ${failed} contact(s)`)
    } else {
      toast.success(`Deleted ${selectedIds.length} contact(s)`)
    }
    setRowSelection({})
    setDeleteOpen(false)
  }, [selectedIds, deleteContact])

  const handleBulkAssign = useCallback(async () => {
    if (!assignUserId) return
    const result = await bulkAssignContacts(selectedIds, assignUserId, currentUserId)
    if (result.success) {
      toast.success(`Assigned ${result.updated} contact(s)`)
      setRowSelection({})
      setAssignOpen(false)
    } else {
      toast.error(result.error)
    }
  }, [selectedIds, assignUserId, currentUserId])

  const columns = useMemo(
    () => [
      col.display({
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected()
                ? true
                : table.getIsSomePageRowsSelected()
                ? 'indeterminate'
                : false
            }
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
        size: 40,
      }),
      col.accessor(
        (row) => `${row.firstName} ${row.lastName ?? ''}`.trim(),
        {
          id: 'name',
          header: 'Contact name',
          cell: ({ row }) => {
            const r = row.original
            const fullName = `${r.firstName} ${r.lastName ?? ''}`.trim() || '(No name)'
            return (
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                    avatarColor(r.id),
                  )}
                  aria-hidden="true"
                >
                  {initialsFrom(r.firstName, r.lastName, r.email)}
                </span>
                <Link
                  href={`/crm/contacts/${r.id}`}
                  className="truncate font-semibold text-rose-700 hover:underline dark:text-rose-400"
                >
                  {fullName}
                </Link>
              </div>
            )
          },
          enableSorting: true,
        },
      ),
      col.accessor('phone', {
        header: 'Phone',
        cell: ({ getValue }) => {
          const v = getValue()
          if (!v) return <span className="text-xs text-slate-400">—</span>
          return (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <Phone className="h-3 w-3 text-slate-400" />
              <span className="font-mono">{v}</span>
            </span>
          )
        },
        enableSorting: false,
      }),
      col.accessor('email', {
        header: 'Email',
        cell: ({ getValue }) => {
          const v = getValue()
          if (!v) return <span className="text-xs text-slate-400">—</span>
          return (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <Mail className="h-3 w-3 shrink-0 text-slate-400" />
              <span className="truncate max-w-50">{v}</span>
            </span>
          )
        },
        enableSorting: false,
      }),
      col.display({
        id: 'stage',
        header: 'Stage',
        cell: ({ row }) => {
          const opp = row.original.opportunities[0]
          if (!opp) return <span className="text-xs text-slate-400">—</span>
          return (
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                stageBg(opp.stage.color),
              )}
            >
              {opp.stage.name}
            </span>
          )
        },
        enableSorting: false,
      }),
      col.display({
        id: 'leadSource',
        header: 'Lead Source',
        cell: ({ row }) => (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {row.original.leadSource?.name ?? '—'}
          </span>
        ),
        enableSorting: false,
      }),
      col.display({
        id: 'assignedUser',
        header: 'Assigned BM',
        cell: ({ row }) => {
          const u = row.original.assignedUser
          if (!u) return <span className="text-xs text-slate-400">—</span>
          return (
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarImage src={u.image ?? undefined} />
                <AvatarFallback className="text-[10px]">
                  {(u.name ?? u.email).slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="truncate text-xs text-slate-700 dark:text-slate-300">{u.name ?? u.email}</span>
            </div>
          )
        },
        enableSorting: false,
      }),
      col.display({
        id: 'tags',
        header: 'Tags',
        cell: ({ row }) => {
          const ctags = row.original.contactTags
          const visible = ctags.slice(0, 3)
          const rest = ctags.length - visible.length
          if (ctags.length === 0) {
            return <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
          }
          return (
            <div className="flex flex-wrap gap-1">
              {visible.map((ct) => (
                <span
                  key={ct.tagId}
                  className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium text-white"
                  style={{ backgroundColor: ct.tag.color }}
                >
                  {ct.tag.name}
                </span>
              ))}
              {rest > 0 && (
                <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  +{rest}
                </span>
              )}
            </div>
          )
        },
        enableSorting: false,
      }),
    ],
    [],
  )

  const table = useReactTable({
    data: data?.data ?? [],
    columns,
    state: {
      sorting,
      columnVisibility: colVisibility,
      rowSelection,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    rowCount: data?.total ?? 0,
    getRowId: (row) => row.id,
    enableRowSelection: true,
  })

  const totalPages = Math.ceil((data?.total ?? 0) / (filter.pageSize ?? 25))

  return (
    <div className="flex flex-col gap-4">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Count pill — GHL-style "X contacts" */}
        {!isLoading && (
          <span className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
            {(data?.total ?? 0).toLocaleString()} Contacts
          </span>
        )}

        {/* Search */}
        <div className="relative flex-1 min-w-55">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            className="pl-8"
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {/* Stage filter */}
        {stages.length > 0 && (
          <Select
            value={filter.stageId ?? '__all__'}
            onValueChange={(v) =>
              setFilter((f) => ({ ...f, stageId: v === '__all__' ? undefined : v, page: 1 }))
            }
          >
            <SelectTrigger className="w-35">
              <SelectValue placeholder="All stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All stages</SelectItem>
              {stages.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Lead source filter */}
        {leadSources.length > 0 && (
          <Select
            value={filter.leadSourceId ?? '__all__'}
            onValueChange={(v) =>
              setFilter((f) => ({ ...f, leadSourceId: v === '__all__' ? undefined : v, page: 1 }))
            }
          >
            <SelectTrigger className="w-37.5">
              <SelectValue placeholder="All sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All sources</SelectItem>
              {leadSources.map((ls) => (
                <SelectItem key={ls.id} value={ls.id}>
                  {ls.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Assigned user filter */}
        {users.length > 0 && (
          <Select
            value={filter.assignedUserId ?? '__all__'}
            onValueChange={(v) =>
              setFilter((f) => ({ ...f, assignedUserId: v === '__all__' ? undefined : v, page: 1 }))
            }
          >
            <SelectTrigger className="w-37.5">
              <SelectValue placeholder="All users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All users</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name ?? u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Column visibility */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns className="h-4 w-4" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table
                .getAllColumns()
                .filter((c) => c.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(v) => column.toggleVisibility(!!v)}
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Export */}
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data?.data?.length}>
            <Download className="h-4 w-4" />
            Export
          </Button>

          {/* New contact — hidden for read-only viewers */}
          {!readOnly && (
            <Button size="sm" onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4" />
              New Contact
            </Button>
          )}
        </div>
      </div>

      {/* ── Bulk actions bar ── */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2">
          <span className="text-sm font-medium text-indigo-700">
            {selectedIds.length} selected
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="border-indigo-300 text-indigo-700 hover:bg-indigo-100"
              onClick={() => setAssignOpen(true)}
            >
              <UserPlus className="h-4 w-4" />
              Assign to...
            </Button>
            {canDelete && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Table ── */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                      style={{ width: header.getSize() }}
                    >
                      {header.isPlaceholder ? null : (
                        <div
                          className={cn(
                            'flex items-center gap-1',
                            header.column.getCanSort() && 'cursor-pointer select-none',
                          )}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && (
                            <span className="flex flex-col">
                              <ChevronUp
                                className={cn(
                                  'h-3 w-3',
                                  header.column.getIsSorted() === 'asc'
                                    ? 'text-indigo-600 dark:text-indigo-400'
                                    : 'text-slate-300 dark:text-slate-600',
                                )}
                              />
                              <ChevronDown
                                className={cn(
                                  'h-3 w-3 -mt-1',
                                  header.column.getIsSorted() === 'desc'
                                    ? 'text-indigo-600 dark:text-indigo-400'
                                    : 'text-slate-300 dark:text-slate-600',
                                )}
                              />
                            </span>
                          )}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeleton cols={columns.length} />
              ) : isError ? (
                <tr>
                  <td colSpan={100} className="py-12 text-center text-sm text-red-500">
                    Failed to load contacts. Please try again.
                  </td>
                </tr>
              ) : table.getRowModel().rows.length === 0 ? (
                <EmptyState onAdd={readOnly ? undefined : () => setModalOpen(true)} />
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      'border-b border-slate-100 text-slate-800 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700/50',
                      row.getIsSelected() && 'bg-indigo-50 dark:bg-indigo-950',
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!isLoading && (data?.total ?? 0) > 0 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Showing{' '}
              <span className="font-medium">
                {((filter.page ?? 1) - 1) * (filter.pageSize ?? 25) + 1}
              </span>{' '}
              to{' '}
              <span className="font-medium">
                {Math.min(
                  (filter.page ?? 1) * (filter.pageSize ?? 25),
                  data?.total ?? 0,
                )}
              </span>{' '}
              of <span className="font-medium">{data?.total ?? 0}</span> contacts
            </p>
            <div className="flex items-center gap-2">
              <Select
                value={String(filter.pageSize ?? 25)}
                onValueChange={(v) =>
                  setFilter((f) => ({ ...f, pageSize: Number(v), page: 1 }))
                }
              >
                <SelectTrigger className="h-8 w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 25, 50, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} / page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={(filter.page ?? 1) <= 1}
                onClick={() => setFilter((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-slate-600">
                Page {filter.page ?? 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={(filter.page ?? 1) >= totalPages}
                onClick={() => setFilter((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      <ContactModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        mode="create"
        branchId={branchId}
        tenantId={tenantId}
        leadSources={leadSources}
        users={users}
        branches={branches}
        tags={tags}
      />

      {/* Delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.length} contact(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This will soft-delete the selected contacts. They can be recovered from the database
              but will no longer appear in the CRM. This action cannot be easily undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => void handleBulkDelete()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assign dialog */}
      <AlertDialog open={assignOpen} onOpenChange={setAssignOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Assign {selectedIds.length} contact(s)</AlertDialogTitle>
            <AlertDialogDescription>
              Choose a user to assign these contacts to.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Select value={assignUserId} onValueChange={setAssignUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a user..." />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name ?? u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={!assignUserId} onClick={() => void handleBulkAssign()}>
              Assign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
