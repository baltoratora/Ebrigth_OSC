'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, X, Search } from 'lucide-react'
import { cn } from '@/lib/crm/utils'
import { useBranchContext } from '@/components/crm/branch-context'
import { useOppFilter } from '@/components/crm/opportunities/opp-filter-context'
import {
  useWhatsappLeads,
  useCompleteWhatsappLead,
  useAddWhatsappLead,
  useDeleteWhatsappLead,
  type WhatsappLeadItem,
} from '@/hooks/crm/useWhatsappLeads'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// WhatsApp brand glyph.
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.413c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.149-.174.198-.298.298-.497.099-.198.05-.372-.025-.521-.074-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z" />
    </svg>
  )
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-MY', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
    })
  } catch {
    return '—'
  }
}

export function WhatsappLeadsButton() {
  const { selectedBranch, branches } = useBranchContext()
  const branchId = selectedBranch?.id ?? null

  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Mirror the kanban day/week filter — badge + list both follow it.
  const { range } = useOppFilter()

  // Always sync=1 — ws_leads is tiny, so each poll cheaply pulls new inbound
  // interactions and bumps the badge without anyone opening the dropdown.
  const { data, isLoading } = useWhatsappLeads(branchId, true, range)
  const items = data?.items ?? []
  const count = data?.count ?? 0
  const canManage = data?.canManage ?? false

  // Super-admin can filter the list by ws_lead_id to locate a specific
  // interaction a branch reported. The badge still reflects the true pending
  // count, not the filtered view.
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const visibleItems =
    canManage && q
      ? items.filter((i) => i.wsLeadId.toLowerCase().includes(q))
      : items

  const complete = useCompleteWhatsappLead()
  const addLead = useAddWhatsappLead()
  const deleteLead = useDeleteWhatsappLead()

  // Form-modal state (completing a lead).
  const [formItem, setFormItem] = useState<WhatsappLeadItem | null>(null)
  const [parentName, setParentName] = useState('')
  const [childName, setChildName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')

  // Add-modal state (super admin).
  const [addOpen, setAddOpen] = useState(false)
  const [addBranchId, setAddBranchId] = useState('')
  const [addName, setAddName] = useState('')
  const [addPhone, setAddPhone] = useState('')
  const [addCampaign, setAddCampaign] = useState('')

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  function openForm(item: WhatsappLeadItem) {
    setFormItem(item)
    setParentName(item.fullName ?? '')
    setChildName('')
    setPhone(item.phone ?? '')
    setEmail('')
    setOpen(false)
  }

  function submitForm() {
    if (!formItem) return
    if (!parentName.trim() || !phone.trim() || !email.trim()) return
    complete.mutate(
      { id: formItem.id, parentName, childName: childName || undefined, phone, email },
      { onSuccess: () => setFormItem(null) },
    )
  }

  function submitAdd() {
    if (!addBranchId) return
    addLead.mutate(
      { branchId: addBranchId, fullName: addName || undefined, phone: addPhone || undefined, campaignName: addCampaign || undefined },
      {
        onSuccess: () => {
          setAddOpen(false)
          setAddBranchId(''); setAddName(''); setAddPhone(''); setAddCampaign('')
        },
      },
    )
  }

  function onDelete(item: WhatsappLeadItem) {
    if (!confirm(`Delete WhatsApp lead ${item.wsLeadId} (${item.branchName})? The branch is no longer required to process it.`)) return
    deleteLead.mutate({ id: item.id })
  }

  const formValid = parentName.trim() !== '' && phone.trim() !== '' && email.trim() !== '' && email.includes('@')

  return (
    <div className="relative" ref={panelRef}>
      {/* Icon trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="WhatsApp leads — clear all pending"
        className={cn(
          'relative flex h-12 w-12 items-center justify-center rounded-xl border transition-colors',
          count > 0
            ? 'border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
            : 'border-slate-200 bg-white text-emerald-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800',
        )}
      >
        <WhatsAppIcon className="h-8 w-8" />
        {count > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-white shadow ring-2 ring-white dark:ring-slate-900">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-96 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 bg-emerald-50 px-4 py-3 dark:border-slate-700 dark:bg-emerald-950/30">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <WhatsAppIcon className="h-5 w-5" />
              <span className="text-sm font-semibold">WhatsApp Leads</span>
              <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">{count}</span>
            </div>
            <div className="flex items-center gap-1">
              {canManage && (
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Super-admin: search by ws_lead_id (the code a branch sends to ask
              for a deletion). Branch managers don't need it. */}
          {canManage && (
            <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-800">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by WhatsApp lead ID…"
                  className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-7 text-xs font-mono dark:border-slate-700 dark:bg-slate-800"
                />
                {search && (
                  <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400">No pending WhatsApp leads. 🎉</p>
            ) : visibleItems.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400">No lead matches “{search}”.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {visibleItems.map((item) => (
                  <li key={item.id} className="flex items-start gap-2 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                    <button type="button" onClick={() => openForm(item)} className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-slate-900 dark:text-white">
                          {item.fullName || 'WhatsApp interaction'}
                        </span>
                        {item.source === 'manual' && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Manual</span>
                        )}
                      </div>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{item.branchName}</p>
                      {/* ID is what a branch quotes to a super admin for deletion,
                          so branch managers see the ws_lead_id (never the campaign).
                          Super admins see the campaign too. */}
                      <p className="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400" title={item.wsLeadId}>
                        {item.wsLeadId}
                      </p>
                      {canManage && item.campaignName && (
                        <p className="truncate text-xs text-slate-400" title={item.campaignName}>{item.campaignName}</p>
                      )}
                      <p className="mt-0.5 text-[11px] text-slate-400">{fmtDate(item.submittedAt)}</p>
                    </button>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => onDelete(item)}
                        title="Delete (parent only had a question)"
                        className="mt-0.5 rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400 dark:border-slate-800">
            Fill the form for each lead to clear it. Parent only asking a question? Ask a super admin to delete it.
          </p>
        </div>
      )}

      {/* Complete-lead form modal */}
      <Dialog open={!!formItem} onOpenChange={(o) => !o && setFormItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <WhatsAppIcon className="h-5 w-5 text-emerald-600" /> New WhatsApp Lead
            </DialogTitle>
          </DialogHeader>
          {formItem && (
            <p className="-mt-2 text-xs text-slate-500 dark:text-slate-400">
              {formItem.branchName}
              {' · '}
              {/* Branch managers see the ws_lead_id; only super admins see the campaign. */}
              {canManage && formItem.campaignName ? formItem.campaignName : (
                <span className="font-mono">{formItem.wsLeadId}</span>
              )}
            </p>
          )}
          <div className="space-y-3 py-1">
            <div>
              <Label className="mb-1 block text-xs">Parent&rsquo;s name <span className="text-red-500">*</span></Label>
              <Input value={parentName} onChange={(e) => setParentName(e.target.value)} placeholder="e.g. Sara Yahya" />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Child&rsquo;s name <span className="text-slate-400">(optional)</span></Label>
              <Input value={childName} onChange={(e) => setChildName(e.target.value)} placeholder="e.g. Adam" />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Phone <span className="text-red-500">*</span></Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0123456789" />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Email <span className="text-red-500">*</span></Label>
              <Input value={email} type="email" onChange={(e) => setEmail(e.target.value)} placeholder="parent@email.com" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFormItem(null)}>Cancel</Button>
            <Button onClick={submitForm} disabled={!formValid || complete.isPending} className="bg-emerald-600 hover:bg-emerald-700">
              {complete.isPending ? 'Saving…' : 'Add as New Lead'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Super-admin add modal */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add WhatsApp Lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="mb-1 block text-xs">Branch <span className="text-red-500">*</span></Label>
              <select
                value={addBranchId}
                onChange={(e) => setAddBranchId(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">Select a branch…</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="mb-1 block text-xs">Name <span className="text-slate-400">(optional)</span></Label>
              <Input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Parent name / note" />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Phone <span className="text-slate-400">(optional)</span></Label>
              <Input value={addPhone} onChange={(e) => setAddPhone(e.target.value)} placeholder="0123456789" />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Campaign / source note <span className="text-slate-400">(optional)</span></Label>
              <Input value={addCampaign} onChange={(e) => setAddCampaign(e.target.value)} placeholder="e.g. Walk-in WhatsApp" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={submitAdd} disabled={!addBranchId || addLead.isPending} className="bg-emerald-600 hover:bg-emerald-700">
              {addLead.isPending ? 'Adding…' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
