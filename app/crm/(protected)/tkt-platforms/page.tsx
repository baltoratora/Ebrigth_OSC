'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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

interface Platform {
  id: string
  name: string
  slug: string
  code: string
  accent_color: string
  ticket_count: number
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const e = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((e as { error?: string }).error ?? res.statusText)
  }
  return res.json() as Promise<T>
}

export default function TktPlatformsPage() {
  const qc = useQueryClient()
  const { data: platforms = [], isLoading } = useQuery<Platform[]>({
    queryKey: ['tkt-platforms'],
    queryFn: () => fetchJson<Platform[]>('/api/crm/tkt-platforms'),
  })

  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; platform?: Platform } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Platform | null>(null)

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetchJson<{ success: boolean }>(`/api/crm/tkt-platforms/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Platform deleted')
      void qc.invalidateQueries({ queryKey: ['tkt-platforms'] })
      setDeleteTarget(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Ticket Platforms</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Configured platforms for ticket categorisation
          </p>
        </div>
        <Button onClick={() => setModal({ mode: 'create' })}>
          <Plus className="mr-2 h-4 w-4" /> Add Platform
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Accent</th>
              <th className="px-4 py-3">Tickets</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : platforms.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
                  No platforms yet. Click &ldquo;Add Platform&rdquo; to create one.
                </td>
              </tr>
            ) : (
              platforms.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 text-slate-800 last:border-0 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700/50">
                  <td className="px-4 py-3 font-mono text-xs">{p.code}</td>
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{p.slug}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-4 w-4 rounded-full border border-slate-300 dark:border-slate-600"
                        style={{ backgroundColor: p.accent_color }}
                      />
                      <span className="font-mono text-xs">{p.accent_color}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                      {p.ticket_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setModal({ mode: 'edit', platform: p })}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(p)}
                        disabled={p.ticket_count > 0}
                        title={p.ticket_count > 0 ? 'Cannot delete — has tickets' : 'Delete'}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create / Edit modal */}
      {modal && (
        <PlatformFormDialog
          mode={modal.mode}
          platform={modal.platform}
          onClose={() => setModal(null)}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete platform &ldquo;{deleteTarget?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The platform will only delete if it has no tickets.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function PlatformFormDialog({
  mode,
  platform,
  onClose,
}: {
  mode: 'create' | 'edit'
  platform?: Platform
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: platform?.name ?? '',
    slug: platform?.slug ?? '',
    code: platform?.code ?? '',
    accent_color: platform?.accent_color ?? '#6b7280',
  })

  const saveMutation = useMutation({
    mutationFn: () => {
      const url = mode === 'create' ? '/api/crm/tkt-platforms' : `/api/crm/tkt-platforms/${platform!.id}`
      const method = mode === 'create' ? 'POST' : 'PATCH'
      return fetchJson(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
    },
    onSuccess: () => {
      toast.success(mode === 'create' ? 'Platform created' : 'Platform updated')
      void qc.invalidateQueries({ queryKey: ['tkt-platforms'] })
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Add Platform' : 'Edit Platform'}</DialogTitle>
          <DialogDescription>
            Platforms categorise tickets. The 2-digit code is used in ticket numbers.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Aone"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') }))}
              placeholder="e.g. aone"
              className="mt-1 font-mono"
            />
            <p className="mt-1 text-xs text-slate-500">Lowercase, hyphens only. Used in URLs.</p>
          </div>
          <div>
            <Label htmlFor="code">Code (2 digits)</Label>
            <Input
              id="code"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
              placeholder="e.g. 01"
              className="mt-1 font-mono"
              maxLength={2}
            />
            <p className="mt-1 text-xs text-slate-500">Appears in ticket numbers (YYMM-BBII-00KT).</p>
          </div>
          <div>
            <Label htmlFor="accent">Accent Color</Label>
            <div className="mt-1 flex items-center gap-2">
              <Input
                id="accent"
                type="color"
                value={form.accent_color}
                onChange={(e) => setForm((f) => ({ ...f, accent_color: e.target.value }))}
                className="h-10 w-16 cursor-pointer p-1"
              />
              <Input
                value={form.accent_color}
                onChange={(e) => setForm((f) => ({ ...f, accent_color: e.target.value }))}
                className="font-mono"
                placeholder="#dc2626"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !form.name || !form.slug || !form.code}
          >
            {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {mode === 'create' ? 'Create' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
