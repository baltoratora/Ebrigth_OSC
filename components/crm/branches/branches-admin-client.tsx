'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, X, Loader2, Building2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/crm/utils'

export interface BranchRow {
  id: string
  name: string
  code: string | null
  region: 'A' | 'B' | 'C' | null
  address: string | null
  phone: string | null
  email: string | null
}

interface BranchesAdminClientProps {
  initial: BranchRow[]
}

const REGION_OPTIONS: Array<'A' | 'B' | 'C'> = ['A', 'B', 'C']
const REGION_BADGE_CLASS: Record<string, string> = {
  A: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  B: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  C: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
}

export function BranchesAdminClient({ initial }: BranchesAdminClientProps) {
  const router = useRouter()
  const [rows, setRows] = useState<BranchRow[]>(initial)
  const [editTarget, setEditTarget] = useState<BranchRow | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [filter, setFilter] = useState('')

  // Filter rows by name / code / region — kept client-side because the
  // canonical branch list is bounded (~25 entries) and instant filtering
  // beats a roundtrip per keystroke.
  const filtered = filter
    ? rows.filter((r) => {
        const lower = filter.toLowerCase()
        return (
          r.name.toLowerCase().includes(lower) ||
          (r.code ?? '').toLowerCase().includes(lower) ||
          (r.region ?? '').toLowerCase().includes(lower)
        )
      })
    : rows

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name / code / region…"
          className="h-9 w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
        />
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> Add Branch
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Code</th>
              <th className="px-4 py-2.5">Region</th>
              <th className="px-4 py-2.5">Phone</th>
              <th className="px-4 py-2.5">Email</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                  <Building2 className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
                  No branches match this filter.
                </td>
              </tr>
            ) : (
              filtered.map((b) => (
                <tr key={b.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                    {b.name}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-300">
                    {b.code ?? <span className="italic text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {b.region ? (
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', REGION_BADGE_CLASS[b.region])}>
                        {b.region}
                      </span>
                    ) : (
                      <span className="italic text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-300">
                    {b.phone ?? <span className="italic text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-300">
                    {b.email ?? <span className="italic text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => setEditTarget(b)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-indigo-400 hover:text-indigo-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editTarget && (
        <BranchFormDialog
          mode="edit"
          initial={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={(updated) => {
            setRows((rs) => rs.map((r) => (r.id === updated.id ? updated : r)))
            setEditTarget(null)
            router.refresh()
          }}
        />
      )}
      {showAdd && (
        <BranchFormDialog
          mode="create"
          onClose={() => setShowAdd(false)}
          onSaved={(created) => {
            setRows((rs) => [...rs, created].sort((a, b) => a.name.localeCompare(b.name)))
            setShowAdd(false)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

// ─── Add/Edit dialog ──────────────────────────────────────────────────────────

interface BranchFormDialogProps {
  mode: 'create' | 'edit'
  initial?: BranchRow
  onClose: () => void
  onSaved: (row: BranchRow) => void
}

function BranchFormDialog({ mode, initial, onClose, onSaved }: BranchFormDialogProps) {
  const [name,    setName]    = useState(initial?.name    ?? '')
  const [code,    setCode]    = useState(initial?.code    ?? '')
  const [region,  setRegion]  = useState<'A' | 'B' | 'C' | ''>(initial?.region ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [phone,   setPhone]   = useState(initial?.phone   ?? '')
  const [email,   setEmail]   = useState(initial?.email   ?? '')
  const [saving,  setSaving]  = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }
    setSaving(true)

    const body = {
      name:    name.trim(),
      code:    code.trim() || null,
      region:  region || null,
      address: address.trim() || undefined,
      phone:   phone.trim() || undefined,
      email:   email.trim() || undefined,
    }

    try {
      const res = await fetch(
        mode === 'create'
          ? '/api/crm/branches'
          : `/api/crm/branches/${initial!.id}`,
        {
          method: mode === 'create' ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      )
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error((errBody as { error?: string }).error ?? 'Failed to save')
      }
      const saved = await res.json() as {
        id:      string
        name:    string
        code:    string | null
        region:  string | null
        address: string | null
        phone:   string | null
        email:   string | null
      }
      onSaved({
        id:      saved.id,
        name:    saved.name,
        code:    saved.code,
        region:  (saved.region as 'A' | 'B' | 'C' | null) ?? null,
        address: saved.address,
        phone:   saved.phone,
        email:   saved.email,
      })
      toast.success(mode === 'create' ? 'Branch created' : 'Branch updated')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900"
      >
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {mode === 'create' ? 'Add Branch' : 'Edit Branch'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {mode === 'create'
                ? 'Auto-creates the kanban pipeline + ticket-module branch row.'
                : `Editing ${initial?.name}.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-3 px-5 py-4">
          <Field label="Name *" hint='Format: "NN Ebright (Place)" — the leading two digits become the ticket-module branch_number.'>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              placeholder="e.g. 24 Ebright (NewPlace)"
              className={fieldClass}
              required
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Code">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                disabled={saving}
                placeholder="AMP"
                maxLength={10}
                className={fieldClass}
              />
            </Field>
            <Field label="Region">
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value as 'A' | 'B' | 'C' | '')}
                disabled={saving}
                className={fieldClass + ' bg-white dark:bg-slate-800'}
              >
                <option value="">— None —</option>
                {REGION_OPTIONS.map((r) => (
                  <option key={r} value={r}>Region {r}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Address">
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={saving}
              className={fieldClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={saving}
                className={fieldClass}
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={saving}
                className={fieldClass}
              />
            </Field>
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saving ? 'Saving…' : mode === 'create' ? 'Create Branch' : 'Save changes'}
          </button>
        </footer>
      </form>
    </div>
  )
}

const fieldClass =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white disabled:opacity-60'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-[10px] italic text-slate-400">{hint}</span>
      )}
    </label>
  )
}
