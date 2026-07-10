"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ManpowerEntry {
  id: string;
  unit: string;
  type: string;
  name: string;
  role: string;
  phone: string | null;
  email: string | null;
  shift: string | null;
  day: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const SHIFT_OPTIONS = [
  { value: "FULL_DAY",  label: "Full Day" },
  { value: "MORNING",   label: "Morning" },
  { value: "AFTERNOON", label: "Afternoon" },
  { value: "EVENING",   label: "Evening" },
];

const DAY_OPTIONS = [
  { value: "DAY_1",    label: "Day 1" },
  { value: "DAY_2",    label: "Day 2" },
  { value: "DAY_3",    label: "Day 3" },
  { value: "ALL_DAYS", label: "All Days" },
];

const STATUS_OPTIONS = [
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "TENTATIVE", label: "Tentative" },
  { value: "CANCELLED", label: "Cancelled" },
];

const SHIFT_COLORS: Record<string, string> = {
  FULL_DAY:  "bg-orange-400",
  MORNING:   "bg-yellow-400",
  AFTERNOON: "bg-blue-400",
  EVENING:   "bg-purple-400",
};

const DAY_BADGE: Record<string, string> = {
  DAY_1:    "bg-gray-100 text-gray-600",
  DAY_2:    "bg-gray-100 text-gray-600",
  DAY_3:    "bg-gray-100 text-gray-600",
  ALL_DAYS: "bg-green-100 text-green-700",
};

const STATUS_BADGE: Record<string, string> = {
  CONFIRMED: "bg-green-100 text-green-700",
  TENTATIVE: "bg-yellow-100 text-yellow-700",
  CANCELLED: "bg-red-100 text-red-600",
};

// ─── Add / Edit Modal ──────────────────────────────────────────────────────────

interface ManpowerModalProps {
  open: boolean;
  onClose: () => void;
  type: "INTERNAL" | "EXTERNAL";
  existing?: ManpowerEntry;
  editionId: string;
  unit: string;
  onSaved: (entry: ManpowerEntry) => void;
}

function ManpowerModal({ open, onClose, type, existing, editionId, unit, onSaved }: ManpowerModalProps) {
  const [form, setForm] = useState({
    name: "", role: "", phone: "", email: "",
    shift: "", day: "", status: "CONFIRMED", notes: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(existing
        ? {
            name:   existing.name,
            role:   existing.role,
            phone:  existing.phone  ?? "",
            email:  existing.email  ?? "",
            shift:  existing.shift  ?? "",
            day:    existing.day    ?? "",
            status: existing.status,
            notes:  existing.notes  ?? "",
          }
        : { name: "", role: "", phone: "", email: "", shift: "", day: "", status: "CONFIRMED", notes: "" },
      );
    }
  }, [existing, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.role.trim()) { toast.error("Name and role are required"); return; }
    setSubmitting(true);
    try {
      const url = existing
        ? `/api/annual-showcase/editions/${editionId}/manpower/${existing.id}`
        : `/api/annual-showcase/editions/${editionId}/manpower`;
      const method = existing ? "PATCH" : "POST";
      const body = {
        unit, type,
        name:   form.name.trim(),
        role:   form.role.trim(),
        phone:  form.phone  || undefined,
        email:  form.email  || undefined,
        shift:  form.shift  || undefined,
        day:    form.day    || undefined,
        status: form.status,
        notes:  form.notes  || undefined,
      };
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? "Failed");
      const saved = await res.json() as ManpowerEntry;
      toast.success(existing ? "Updated" : `Added to ${type.toLowerCase()} manpower`);
      onSaved(saved);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {existing ? "Edit" : "Add"} {type === "INTERNAL" ? "Internal" : "External"} Manpower
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <Input value={form.name} onChange={f("name")} placeholder="Full name" required />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
              <Input
                value={form.role}
                onChange={f("role")}
                placeholder={type === "INTERNAL" ? "e.g. Registration Desk, Emcee" : "e.g. Photographer, Sound Engineer"}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <Input value={form.phone} onChange={f("phone")} placeholder="+60 1X-XXX XXXX" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <Input type="email" value={form.email} onChange={f("email")} placeholder="email@example.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Shift</label>
              <Select value={form.shift} onValueChange={(v) => setForm(prev => ({ ...prev, shift: v }))}>
                <SelectTrigger><SelectValue placeholder="Select shift" /></SelectTrigger>
                <SelectContent>
                  {SHIFT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Day</label>
              <Select value={form.day} onValueChange={(v) => setForm(prev => ({ ...prev, day: v }))}>
                <SelectTrigger><SelectValue placeholder="Select day" /></SelectTrigger>
                <SelectContent>
                  {DAY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <Select value={form.status} onValueChange={(v) => setForm(prev => ({ ...prev, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <Textarea value={form.notes} onChange={f("notes")} rows={2} placeholder="Optional notes" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={submitting}>Cancel</Button>
            <Button
              type="submit"
              disabled={submitting}
              className={`flex-1 ${type === "INTERNAL" ? "bg-blue-600 hover:bg-blue-700" : "bg-purple-600 hover:bg-purple-700"}`}
            >
              {submitting ? "Saving..." : existing ? "Save Changes" : "Add Person"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── ManpowerTable ─────────────────────────────────────────────────────────────

interface ManpowerTableProps {
  type: "INTERNAL" | "EXTERNAL";
  entries: ManpowerEntry[];
  editionId: string;
  unit: string;
  onAdded:   (e: ManpowerEntry) => void;
  onUpdated: (e: ManpowerEntry) => void;
  onDeleted: (id: string) => void;
}

function ManpowerTable({ type, entries, editionId, unit, onAdded, onUpdated, onDeleted }: ManpowerTableProps) {
  const [modal, setModal] = useState<{ open: boolean; existing?: ManpowerEntry }>({ open: false });

  const isInternal  = type === "INTERNAL";
  const typeLabel   = isInternal ? "Internal" : "External";
  const typeDesc    = isInternal ? "Ebright staff & OC members" : "Vendors, contractors, freelancers";
  const badgeClass  = isInternal ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700";
  const btnClass    = isInternal ? "bg-blue-600 hover:bg-blue-700" : "bg-purple-600 hover:bg-purple-700";

  const fullDay   = entries.filter(e => e.shift === "FULL_DAY").length;
  const morning   = entries.filter(e => e.shift === "MORNING").length;
  const afternoon = entries.filter(e => e.shift === "AFTERNOON").length;
  const evening   = entries.filter(e => e.shift === "EVENING").length;

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Remove "${name}" from ${typeLabel.toLowerCase()} manpower?`)) return;
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}/manpower/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Removed");
      onDeleted(id);
    } catch {
      toast.error("Failed to remove");
    }
  }

  function exportCSV() {
    const header = "Type,Name,Role,Phone,Email,Shift,Day,Status,Notes";
    const rows = entries.map(e =>
      [type, `"${e.name}"`, `"${e.role}"`, e.phone ?? "", e.email ?? "",
        e.shift ?? "", e.day ?? "", e.status, `"${(e.notes ?? "").replace(/"/g, '""')}"`].join(","),
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `manpower-${unit.toLowerCase()}-${type.toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded ${badgeClass}`}>
                {isInternal ? "👥" : "🌐"} {typeLabel}
              </span>
              <span className="text-xs text-gray-400">{entries.length} people</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{typeDesc}</p>
          </div>
          <Button size="sm" onClick={() => setModal({ open: true })} className={`${btnClass} text-xs`}>
            + Add
          </Button>
        </div>

        {entries.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-gray-400">No {typeLabel.toLowerCase()} manpower yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Shift</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Day</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {entries.map((e, idx) => (
                  <tr
                    key={e.id}
                    className={`border-b border-gray-50 cursor-pointer hover:bg-gray-50/70 transition-colors ${idx % 2 === 1 ? "bg-gray-50/30" : ""}`}
                    onClick={() => setModal({ open: true, existing: e })}
                  >
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-gray-800">{e.name}</p>
                      {e.phone && <p className="text-[10px] text-gray-400">{e.phone}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600 text-xs">{e.role}</td>
                    <td className="px-3 py-2.5">
                      {e.shift ? (
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${SHIFT_COLORS[e.shift] ?? "bg-gray-300"}`} />
                          <span className="text-xs text-gray-600">
                            {SHIFT_OPTIONS.find(s => s.value === e.shift)?.label ?? e.shift}
                          </span>
                        </div>
                      ) : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {e.day ? (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${DAY_BADGE[e.day] ?? "bg-gray-100 text-gray-600"}`}>
                          {DAY_OPTIONS.find(d => d.value === e.day)?.label ?? e.day}
                        </span>
                      ) : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_BADGE[e.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {e.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5" onClick={ev => ev.stopPropagation()}>
                      <button
                        onClick={() => handleDelete(e.id, e.name)}
                        className="text-gray-300 hover:text-red-500 transition-colors text-sm"
                        title="Remove"
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {entries.length > 0 && (
          <div className="px-4 py-2.5 border-t border-gray-50 bg-gray-50/50 flex items-center justify-between text-xs text-gray-500">
            <span>
              {entries.length} people
              {fullDay   > 0 ? ` · ${fullDay} full day`  : ""}
              {morning   > 0 ? ` · ${morning} morning`   : ""}
              {afternoon > 0 ? ` · ${afternoon} afternoon` : ""}
              {evening   > 0 ? ` · ${evening} evening`   : ""}
            </span>
            <button onClick={exportCSV} className="text-blue-500 hover:text-blue-700 font-medium">
              Export CSV
            </button>
          </div>
        )}
      </div>

      <ManpowerModal
        open={modal.open}
        onClose={() => setModal({ open: false })}
        type={type}
        existing={modal.existing}
        editionId={editionId}
        unit={unit}
        onSaved={(entry) => {
          modal.existing ? onUpdated(entry) : onAdded(entry);
          setModal({ open: false });
        }}
      />
    </>
  );
}

// ─── ManpowerPanel (exported) ─────────────────────────────────────────────────

interface ManpowerPanelProps {
  editionId: string;
  unit: string;
  onCountChange?: (count: number) => void;
}

export default function ManpowerPanel({ editionId, unit, onCountChange }: ManpowerPanelProps) {
  const [internal, setInternal] = useState<ManpowerEntry[]>([]);
  const [external, setExternal] = useState<ManpowerEntry[]>([]);
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    if (!editionId) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}/manpower?unit=${encodeURIComponent(unit)}`);
      if (res.ok) {
        const data = await res.json() as ManpowerEntry[];
        setInternal(data.filter(e => e.type === "INTERNAL"));
        setExternal(data.filter(e => e.type === "EXTERNAL"));
      }
    } catch {
      toast.error("Failed to load manpower data");
    } finally {
      setLoading(false);
    }
  }, [editionId, unit]);

  useEffect(() => { load(); }, [load]);

  const total = internal.length + external.length;
  useEffect(() => { onCountChange?.(total); }, [total, onCountChange]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[0, 1].map(i => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm h-48 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm text-gray-600 bg-gray-50 rounded-lg px-4 py-2.5">
        <span className="font-medium text-gray-800">Total Manpower:</span>
        <span>
          <span className="text-blue-600 font-semibold">{internal.length}</span> internal
          {" + "}
          <span className="text-purple-600 font-semibold">{external.length}</span> external
          {" = "}
          <span className="font-semibold">{total}</span> people
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ManpowerTable
          type="INTERNAL"
          entries={internal}
          editionId={editionId}
          unit={unit}
          onAdded={(e)   => setInternal(prev => [...prev, e])}
          onUpdated={(e) => setInternal(prev => prev.map(p => p.id === e.id ? e : p))}
          onDeleted={(id) => setInternal(prev => prev.filter(p => p.id !== id))}
        />
        <ManpowerTable
          type="EXTERNAL"
          entries={external}
          editionId={editionId}
          unit={unit}
          onAdded={(e)   => setExternal(prev => [...prev, e])}
          onUpdated={(e) => setExternal(prev => prev.map(p => p.id === e.id ? e : p))}
          onDeleted={(id) => setExternal(prev => prev.filter(p => p.id !== id))}
        />
      </div>
    </div>
  );
}
