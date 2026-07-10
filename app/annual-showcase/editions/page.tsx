"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useActiveEdition } from "@/app/hooks/useActiveEdition";
import CreateEditionModal from "@/app/components/annual-showcase/CreateEditionModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { EditionSummary } from "@/app/components/annual-showcase/EditionContext";

// ─── Constants ────────────────────────────────────────────────────────────────

type EditionStatus =
  | "DRAFT"
  | "REGISTRATION_OPEN"
  | "TEST_RUN"
  | "EVENT_ACTIVE"
  | "POST_EVENT"
  | "ARCHIVED";

const STATUS_STYLES: Record<string, string> = {
  DRAFT:             "bg-gray-100 text-gray-600",
  REGISTRATION_OPEN: "bg-green-100 text-green-700",
  TEST_RUN:          "bg-blue-100 text-blue-700",
  EVENT_ACTIVE:      "bg-red-100 text-red-700",
  POST_EVENT:        "bg-purple-100 text-purple-700",
  ARCHIVED:          "bg-gray-100 text-gray-400",
};

const STATUS_OPTIONS: EditionStatus[] = [
  "DRAFT",
  "REGISTRATION_OPEN",
  "TEST_RUN",
  "EVENT_ACTIVE",
  "POST_EVENT",
  "ARCHIVED",
];

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded ${STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// ─── Clone Modal ──────────────────────────────────────────────────────────────

function bumpYear(name: string): string {
  return name.replace(/\b(\d{4})\b/, (_, y) => String(Number(y) + 1));
}

interface CloneModalProps {
  source: EditionSummary | null;
  onClose: () => void;
  onCloned: (id: string, name: string) => void;
}

function CloneModal({ source, onClose, onCloned }: CloneModalProps) {
  const [name,  setName ] = useState(source ? bumpYear(source.name)  : "");
  const [theme, setTheme] = useState(source?.theme ?? "");
  const [busy,  setBusy ] = useState(false);

  // Reset when source changes
  if (source && name === "") { setName(bumpYear(source.name)); setTheme(source.theme); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!source) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${source.id}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), theme: theme.trim() }),
      });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? "Failed");
      const data = await res.json() as { id: string; name: string };
      toast.success(`"${data.name}" created from "${source.name}"`);
      onCloned(data.id, data.name);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Clone failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!source} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Copy Edition from &quot;{source?.name}&quot;</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-gray-500 mt-1 -mb-1">
          Copies: categories, fee waves, department leads, scoring criteria, checklists, sponsor packages.<br />
          <strong>Not copied:</strong> participants, tasks, budget, sponsors, manpower (always start fresh).
        </p>
        <form onSubmit={handleSubmit} className="space-y-3 mt-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Edition Name *</label>
            <Input value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Theme *</label>
            <Input value={theme} onChange={e => setTheme(e.target.value)} required />
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy || !name.trim()} className="flex-1 bg-orange-600 hover:bg-orange-700">
              {busy ? "Creating..." : "Create Copy"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EditionsPage() {
  const router                                  = useRouter();
  const { allEditions, isLoading, setActiveEdition, refresh } = useActiveEdition();
  const [createModalOpen, setCreateModalOpen]   = useState(false);
  const [cloneSource,     setCloneSource    ]   = useState<EditionSummary | null>(null);
  const [updatingId, setUpdatingId]             = useState<string | null>(null);

  async function handleSetActive(id: string) {
    setUpdatingId(id);
    try {
      await setActiveEdition(id);
      toast.success("Active edition updated");
      router.push("/annual-showcase/oc");
    } catch {
      toast.error("Failed to switch edition");
      setUpdatingId(null);
    }
  }

  async function handleStatusChange(id: string, status: string) {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success("Status updated");
      await refresh();
    } catch {
      toast.error("Failed to update status");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleArchive(ed: EditionSummary) {
    if (!window.confirm(`Archive "${ed.name}"? It will no longer appear in the active edition list.`)) return;
    await handleStatusChange(ed.id, "ARCHIVED");
  }

  async function handleView(ed: EditionSummary) {
    setUpdatingId(ed.id);
    try {
      await setActiveEdition(ed.id);
      router.push("/annual-showcase/oc");
    } catch {
      toast.error("Failed to switch edition");
      setUpdatingId(null);
    }
  }

  async function handleCreated(newEd: EditionSummary) {
    setCreateModalOpen(false);
    try {
      await setActiveEdition(newEd.id);
      toast.success(`"${newEd.name}" created and set as active`);
    } catch {
      await refresh();
      toast.success("Edition created!");
    }
  }

  async function handleCloned(id: string, name: string) {
    setCloneSource(null);
    try {
      await setActiveEdition(id);
      toast.success(`"${name}" set as active`);
      router.push("/annual-showcase/oc");
    } catch {
      await refresh();
    }
  }

  function fmtDate(d: string | null) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📅 Edition Management</h1>
          <p className="text-sm text-gray-500 mt-1">Create and manage Annual Showcase editions across years</p>
        </div>
        <Button onClick={() => setCreateModalOpen(true)} className="bg-orange-600 hover:bg-orange-700">
          + New Edition
        </Button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        ) : allEditions.length === 0 ? (
          <div className="text-center py-16 px-6">
            <span className="text-5xl">🎪</span>
            <p className="text-gray-700 font-medium mt-4">No editions yet</p>
            <p className="text-sm text-gray-400 mt-1">Create your first edition to get started.</p>
            <Button onClick={() => setCreateModalOpen(true)} className="mt-4 bg-orange-600 hover:bg-orange-700">
              + Create Edition
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Edition</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Theme</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Event Dates</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Participants</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tasks</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {allEditions.map((ed, idx) => {
                  const busy = updatingId === ed.id;
                  return (
                    <tr
                      key={ed.id}
                      className={`border-b border-gray-50 ${idx % 2 === 1 ? "bg-gray-50/40" : ""} ${busy ? "opacity-60" : ""}`}
                    >
                      {/* Edition name + active badge */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{ed.name}</span>
                          {ed.isActive && (
                            <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                              Active
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Theme */}
                      <td className="px-5 py-4 text-gray-500 max-w-[160px] truncate">{ed.theme}</td>

                      {/* Status — inline dropdown */}
                      <td className="px-5 py-4">
                        <select
                          value={ed.status}
                          onChange={(e) => handleStatusChange(ed.id, e.target.value)}
                          disabled={busy}
                          className={`text-xs font-semibold px-2 py-1 rounded border-0 cursor-pointer outline-none ${STATUS_STYLES[ed.status] ?? "bg-gray-100 text-gray-600"}`}
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                          ))}
                        </select>
                      </td>

                      {/* Dates */}
                      <td className="px-5 py-4 text-gray-500 text-xs whitespace-nowrap">
                        {ed.startDate || ed.endDate
                          ? `${fmtDate(ed.startDate)} – ${fmtDate(ed.endDate)}`
                          : "—"}
                      </td>

                      {/* Participant count */}
                      <td className="px-5 py-4 text-right text-gray-600">
                        {ed._count?.participants ?? 0}
                        {ed.participantTarget > 0 && (
                          <span className="text-gray-400"> / {ed.participantTarget}</span>
                        )}
                      </td>

                      {/* Task count */}
                      <td className="px-5 py-4 text-right text-gray-600">
                        {ed._count?.tasks ?? 0}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleView(ed)}
                            disabled={busy}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                          >
                            View
                          </button>
                          {!ed.isActive && (
                            <button
                              onClick={() => handleSetActive(ed.id)}
                              disabled={busy}
                              className="text-xs text-green-600 hover:text-green-800 font-medium hover:bg-green-50 px-2 py-1 rounded transition-colors"
                            >
                              Set Active
                            </button>
                          )}
                          <button
                            onClick={() => setCloneSource(ed)}
                            disabled={busy}
                            className="text-xs text-purple-600 hover:text-purple-800 font-medium hover:bg-purple-50 px-2 py-1 rounded transition-colors"
                          >
                            Copy
                          </button>
                          {ed.status !== "ARCHIVED" && (
                            <button
                              onClick={() => handleArchive(ed)}
                              disabled={busy}
                              className="text-xs text-red-400 hover:text-red-600 font-medium hover:bg-red-50 px-2 py-1 rounded transition-colors"
                            >
                              Archive
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateEditionModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={handleCreated}
      />

      <CloneModal
        source={cloneSource}
        onClose={() => setCloneSource(null)}
        onCloned={handleCloned}
      />
    </div>
  );
}
