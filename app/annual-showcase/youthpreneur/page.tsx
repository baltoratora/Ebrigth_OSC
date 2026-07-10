"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useActiveEdition } from "@/app/hooks/useActiveEdition";
import { useDepartmentAccess } from "@/app/hooks/useDepartmentAccess";
import ManpowerPanel from "@/app/components/annual-showcase/ManpowerPanel";
import StatCard from "@/app/components/annual-showcase/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  boothId: string;
  name: string;
  price: number | null;
  description: string | null;
  createdAt: string;
}

interface Booth {
  id: string;
  editionId: string;
  boothNumber: string | null;
  businessName: string;
  ownerName: string;
  ownerAge: number | null;
  category: string | null;
  description: string | null;
  status: string;
  boothSize: string | null;
  specialNeeds: string | null;
  parentName: string | null;
  parentContact: string | null;
  products: Product[];
  createdAt: string;
}

interface LayoutConfig {
  rows: number;
  cols: number;
}

type ActiveTab = "registry" | "assignment" | "products" | "manpower";

// ─── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = ["Food", "Handcraft", "Tech", "Service", "Other"] as const;

const CATEGORY_BADGE: Record<string, string> = {
  Food:      "bg-orange-100 text-orange-700",
  Handcraft: "bg-pink-100   text-pink-700",
  Tech:      "bg-blue-100   text-blue-700",
  Service:   "bg-green-100  text-green-700",
  Other:     "bg-gray-100   text-gray-500",
};

const STATUS_BADGE: Record<string, string> = {
  PENDING:   "bg-yellow-100 text-yellow-700",
  CONFIRMED: "bg-green-100  text-green-700",
  CANCELLED: "bg-red-100    text-red-600",
};

const BOOTH_SIZES = ["Standard (2x2m)", "Small (1x2m)", "Large (3x2m)", "Double (4x2m)"] as const;

const TABS: { id: ActiveTab; label: string }[] = [
  { id: "registry",   label: "🏪 Booth Registry" },
  { id: "assignment", label: "🗺 Booth Assignment" },
  { id: "products",   label: "🛒 Products" },
  { id: "manpower",   label: "👥 Manpower" },
];

// ─── Booth Form ────────────────────────────────────────────────────────────────

function BoothForm({ initial, onSubmit, onClose, saving }: {
  initial?: Partial<Booth>;
  onSubmit: (data: Record<string, unknown>) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    businessName:  initial?.businessName  ?? "",
    ownerName:     initial?.ownerName     ?? "",
    ownerAge:      initial?.ownerAge      ? String(initial.ownerAge) : "",
    category:      initial?.category      ?? "",
    description:   initial?.description   ?? "",
    boothSize:     initial?.boothSize     ?? "",
    specialNeeds:  initial?.specialNeeds  ?? "",
    parentName:    initial?.parentName    ?? "",
    parentContact: initial?.parentContact ?? "",
    boothNumber:   initial?.boothNumber   ?? "",
    status:        initial?.status        ?? "PENDING",
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.businessName.trim()) { toast.error("Business name required"); return; }
    if (!form.ownerName.trim())    { toast.error("Owner name required");    return; }
    onSubmit({
      businessName:  form.businessName.trim(),
      ownerName:     form.ownerName.trim(),
      ownerAge:      form.ownerAge     ? Number(form.ownerAge) : undefined,
      category:      form.category     || undefined,
      description:   form.description  || undefined,
      boothSize:     form.boothSize    || undefined,
      specialNeeds:  form.specialNeeds || undefined,
      parentName:    form.parentName   || undefined,
      parentContact: form.parentContact|| undefined,
      boothNumber:   form.boothNumber  || undefined,
      status:        form.status,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 mt-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Business Name *</label>
          <Input value={form.businessName} onChange={set("businessName")} placeholder="e.g. Lil Bakers Co." required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Owner Name *</label>
          <Input value={form.ownerName} onChange={set("ownerName")} placeholder="Full name" required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Owner Age</label>
          <Input type="number" min={1} max={35} value={form.ownerAge} onChange={set("ownerAge")} placeholder="e.g. 16" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
            <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Business Description</label>
        <Textarea value={form.description} onChange={set("description")} rows={2} placeholder="What does this business sell / offer?" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Booth Size</label>
          <Select value={form.boothSize} onValueChange={v => setForm(p => ({ ...p, boothSize: v }))}>
            <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              {BOOTH_SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Booth Number (optional)</label>
          <Input value={form.boothNumber} onChange={set("boothNumber")} placeholder="e.g. A1" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Special Needs</label>
        <Input value={form.specialNeeds} onChange={set("specialNeeds")} placeholder="Power outlet, extra table, etc." />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Parent Name</label>
          <Input value={form.parentName} onChange={set("parentName")} placeholder="Guardian name" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Parent Contact</label>
          <Input value={form.parentContact} onChange={set("parentContact")} placeholder="Phone / email" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
        <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="CONFIRMED">Confirmed</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={saving}>Cancel</Button>
        <Button type="submit" disabled={saving} className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white">
          {saving ? "Saving..." : initial ? "Save Changes" : "Register Booth"}
        </Button>
      </div>
    </form>
  );
}

// ─── Booth Registry Tab ────────────────────────────────────────────────────────

function BoothRegistryTab({ booths, editionId, onAdd, onUpdate, onDelete }: {
  booths: Booth[];
  editionId: string;
  onAdd: (b: Booth) => void;
  onUpdate: (b: Booth) => void;
  onDelete: (id: string) => void;
}) {
  const [addOpen,  setAddOpen  ] = useState(false);
  const [editBooth,setEditBooth] = useState<Booth | null>(null);
  const [saving,   setSaving   ] = useState(false);
  const [search,   setSearch   ] = useState("");

  const filtered = booths.filter(b =>
    b.businessName.toLowerCase().includes(search.toLowerCase()) ||
    b.ownerName.toLowerCase().includes(search.toLowerCase()),
  );

  async function handleAdd(data: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}/youthpreneur`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed");
      const booth = await res.json() as Omit<Booth, "products"> & { products?: Product[] };
      toast.success("Booth registered");
      onAdd({ ...booth, products: booth.products ?? [] });
      setAddOpen(false);
    } catch { toast.error("Failed to register booth"); }
    finally { setSaving(false); }
  }

  async function handleEdit(data: Record<string, unknown>) {
    if (!editBooth) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}/youthpreneur/${editBooth.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed");
      const updated = await res.json() as Booth;
      onUpdate({ ...updated, products: editBooth.products });
      toast.success("Booth updated");
      setEditBooth(null);
    } catch { toast.error("Failed to update booth"); }
    finally { setSaving(false); }
  }

  async function handleStatusChange(booth: Booth, status: string) {
    onUpdate({ ...booth, status });
    const res = await fetch(`/api/annual-showcase/editions/${editionId}/youthpreneur/${booth.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
    if (!res.ok) { onUpdate(booth); toast.error("Failed"); }
  }

  async function handleDelete(booth: Booth) {
    if (!window.confirm(`Delete "${booth.businessName}"?`)) return;
    onDelete(booth.id);
    const res = await fetch(`/api/annual-showcase/editions/${editionId}/youthpreneur/${booth.id}`, { method: "DELETE" });
    if (!res.ok) toast.error("Failed to delete booth");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search business or owner..."
          className="max-w-xs h-9 text-sm"
        />
        <div className="ml-auto">
          <Button size="sm" onClick={() => setAddOpen(true)} className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs h-8">
            + Register Booth
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <span className="text-4xl">🏪</span>
          <p className="text-sm text-gray-400 mt-3">{booths.length === 0 ? "No booths registered yet" : "No results"}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["Booth #", "Business", "Owner", "Age", "Category", "Size", "Products", "Status", ""].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((b, idx) => (
                <tr key={b.id} className={`border-b border-gray-50 hover:bg-gray-50/60 ${idx % 2 === 1 ? "bg-gray-50/30" : ""}`}>
                  <td className="px-4 py-2.5">
                    <span className="text-xs font-mono font-bold text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded">
                      {b.boothNumber ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-xs text-gray-800">{b.businessName}</p>
                    {b.description && <p className="text-[10px] text-gray-400 truncate max-w-[140px]">{b.description}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-600">{b.ownerName}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{b.ownerAge ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    {b.category ? (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${CATEGORY_BADGE[b.category] ?? "bg-gray-100 text-gray-500"}`}>
                        {b.category}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{b.boothSize ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-center">
                    <span className="font-semibold text-cyan-700">{b.products.length}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_BADGE[b.status] ?? "bg-gray-100 text-gray-500"}`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5 flex-nowrap">
                      <button onClick={() => setEditBooth(b)} className="text-xs text-blue-500 hover:text-blue-700">Edit</button>
                      {b.status !== "CONFIRMED" && (
                        <button onClick={() => handleStatusChange(b, "CONFIRMED")} className="text-xs text-green-600 hover:text-green-800">Confirm</button>
                      )}
                      {b.status !== "CANCELLED" && (
                        <button onClick={() => handleStatusChange(b, "CANCELLED")} className="text-xs text-orange-400 hover:text-orange-600">Cancel</button>
                      )}
                      <button onClick={() => handleDelete(b)} className="text-xs text-red-400 hover:text-red-600">Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={o => !o && setAddOpen(false)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Register New Booth</DialogTitle></DialogHeader>
          <BoothForm onSubmit={handleAdd} onClose={() => setAddOpen(false)} saving={saving} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editBooth} onOpenChange={o => !o && setEditBooth(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Booth: {editBooth?.businessName}</DialogTitle></DialogHeader>
          {editBooth && <BoothForm initial={editBooth} onSubmit={handleEdit} onClose={() => setEditBooth(null)} saving={saving} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Booth Assignment Tab ──────────────────────────────────────────────────────

const GRID_LETTERS = "ABCDEFGHIJ";

function cellClass(booth: Booth | undefined) {
  if (!booth) return "bg-gray-50 border-dashed border-gray-300 text-gray-400 hover:bg-gray-100";
  if (booth.status === "CONFIRMED") return "bg-cyan-500 border-cyan-600 text-white hover:bg-cyan-600";
  if (booth.status === "PENDING")   return "bg-yellow-100 border-yellow-300 text-yellow-800 hover:bg-yellow-200";
  return "bg-red-100 border-red-200 text-red-400 hover:bg-red-50";
}

function BoothAssignmentTab({ booths, editionId, initialLayout, onUpdate }: {
  booths: Booth[];
  editionId: string;
  initialLayout: LayoutConfig | null;
  onUpdate: (b: Booth) => void;
}) {
  const [rows,         setRows        ] = useState(initialLayout?.rows ?? 4);
  const [cols,         setCols        ] = useState(initialLayout?.cols ?? 5);
  const [pendingRows,  setPendingRows ] = useState(initialLayout?.rows ?? 4);
  const [pendingCols,  setPendingCols ] = useState(initialLayout?.cols ?? 5);
  const [savingLayout, setSavingLayout] = useState(false);
  const [activeCell,   setActiveCell  ] = useState<{ label: string; booth: Booth | undefined } | null>(null);
  const [changeMode,   setChangeMode  ] = useState(false);
  const [selectedBoothId, setSelectedBoothId] = useState("none");
  const [assigning,    setAssigning   ] = useState(false);

  const unassignableBooths = booths.filter(b => !b.boothNumber && b.status !== "CANCELLED");

  const grid = Array.from({ length: rows * cols }, (_, i) => {
    const r     = Math.floor(i / cols);
    const c     = (i % cols) + 1;
    const label = `${GRID_LETTERS[r] ?? `R${r + 1}`}-${c}`;
    const booth = booths.find(b => b.boothNumber === label);
    return { label, booth };
  });

  async function applyLayout() {
    setRows(pendingRows);
    setCols(pendingCols);
    setSavingLayout(true);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youthpreneurLayout: { rows: pendingRows, cols: pendingCols } }),
      });
      if (!res.ok) throw new Error();
      toast.success("Layout saved");
    } catch { toast.error("Failed to save layout"); }
    finally { setSavingLayout(false); }
  }

  async function patchBooth(boothId: string, boothNumber: string | null) {
    const res = await fetch(`/api/annual-showcase/editions/${editionId}/youthpreneur/${boothId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boothNumber }),
    });
    if (!res.ok) throw new Error("PATCH failed");
    const booth = booths.find(b => b.id === boothId);
    if (booth) onUpdate({ ...booth, boothNumber });
  }

  async function handleAssign() {
    if (!activeCell || selectedBoothId === "none") return;
    setAssigning(true);
    try {
      // free any booth currently at this cell
      const existing = activeCell.booth;
      if (existing) await patchBooth(existing.id, null);
      // move previously-assigned cell for the selected booth → free it
      const alreadyAt = booths.find(b => b.id === selectedBoothId && b.boothNumber);
      if (alreadyAt) await patchBooth(alreadyAt.id, null);
      // assign
      await patchBooth(selectedBoothId, activeCell.label);
      toast.success(`Assigned to ${activeCell.label}`);
      setActiveCell(null);
      setChangeMode(false);
      setSelectedBoothId("none");
    } catch { toast.error("Failed to assign"); }
    finally { setAssigning(false); }
  }

  async function handleUnassign() {
    if (!activeCell?.booth) return;
    setAssigning(true);
    try {
      await patchBooth(activeCell.booth.id, null);
      toast.success("Booth unassigned");
      setActiveCell(null);
    } catch { toast.error("Failed to unassign"); }
    finally { setAssigning(false); }
  }

  async function autoAssignAll() {
    const toAssign = booths.filter(b => !b.boothNumber && b.status !== "CANCELLED");
    if (toAssign.length === 0) { toast.info("No unassigned booths"); return; }
    const usedLabels = new Set(booths.filter(b => b.boothNumber).map(b => b.boothNumber as string));
    const available  = grid.filter(c => !usedLabels.has(c.label)).map(c => c.label);
    const pairs      = toAssign.slice(0, available.length).map((b, i) => ({ booth: b, label: available[i] }));
    let count = 0;
    for (const { booth, label } of pairs) {
      try {
        await patchBooth(booth.id, label);
        count++;
      } catch { /* skip */ }
    }
    toast.success(`${count} booth${count !== 1 ? "s" : ""} assigned`);
  }

  async function clearAll() {
    if (!window.confirm("Unassign ALL booths from the map? This cannot be undone.")) return;
    const assigned = booths.filter(b => b.boothNumber);
    for (const booth of assigned) {
      try { await patchBooth(booth.id, null); } catch { /* skip */ }
    }
    toast.success("All assignments cleared");
  }

  const confirmedCount = booths.filter(b => b.status === "CONFIRMED").length;
  const assignedCount  = booths.filter(b => b.boothNumber).length;
  const availableSlots = rows * cols - assignedCount;

  const dialogBooth = activeCell?.booth;
  const isAssigned  = !!dialogBooth;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-600">Rows</span>
          <Input
            type="number" min={1} max={10}
            value={pendingRows}
            onChange={e => setPendingRows(Math.max(1, Math.min(10, Number(e.target.value))))}
            className="h-8 w-14 text-sm text-center"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-600">Cols</span>
          <Input
            type="number" min={1} max={10}
            value={pendingCols}
            onChange={e => setPendingCols(Math.max(1, Math.min(10, Number(e.target.value))))}
            className="h-8 w-14 text-sm text-center"
          />
        </div>
        <Button size="sm" onClick={applyLayout} disabled={savingLayout} className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs h-8">
          {savingLayout ? "Saving..." : "Apply Layout"}
        </Button>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={autoAssignAll} className="text-xs h-8">
            🎯 Auto-Assign All
          </Button>
          {assignedCount > 0 && (
            <Button size="sm" variant="outline" onClick={clearAll} className="text-xs h-8 text-red-500 hover:text-red-700 border-red-200 hover:border-red-400">
              🗑 Clear All
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-cyan-700">{confirmedCount}</p>
          <p className="text-xs text-cyan-600">Confirmed</p>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-green-700">{assignedCount}</p>
          <p className="text-xs text-green-600">Assigned</p>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-gray-600">{availableSlots}</p>
          <p className="text-xs text-gray-500">Available slots</p>
        </div>
      </div>

      {/* Grid */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Booth Map</h3>
          <p className="text-xs text-gray-400">{rows} rows × {cols} cols — click any cell to assign</p>
        </div>

        {/* Column headers */}
        <div className="overflow-x-auto">
          <div style={{ minWidth: `${cols * 72 + 24}px` }}>
            {/* Col number labels */}
            <div className="flex gap-1.5 mb-1 ml-7">
              {Array.from({ length: cols }, (_, c) => (
                <div key={c} className="flex-1 min-w-[60px] text-center text-[10px] font-semibold text-gray-400">{c + 1}</div>
              ))}
            </div>
            {/* Rows */}
            {Array.from({ length: rows }, (_, r) => (
              <div key={r} className="flex items-center gap-1.5 mb-1.5">
                {/* Row letter label */}
                <div className="w-6 text-center text-[10px] font-semibold text-gray-400 shrink-0">
                  {GRID_LETTERS[r] ?? `R${r + 1}`}
                </div>
                {Array.from({ length: cols }, (_, c) => {
                  const label = `${GRID_LETTERS[r] ?? `R${r + 1}`}-${c + 1}`;
                  const booth = booths.find(b => b.boothNumber === label);
                  return (
                    <button
                      key={label}
                      onClick={() => { setActiveCell({ label, booth }); setChangeMode(false); setSelectedBoothId("none"); }}
                      className={`flex-1 min-w-[60px] h-14 md:h-16 rounded-lg border-2 text-center p-1 transition-all cursor-pointer ${cellClass(booth)}`}
                    >
                      <p className="text-[10px] font-bold leading-tight">{label}</p>
                      {booth ? (
                        <>
                          <p className={`text-[9px] leading-tight truncate mt-0.5 font-medium ${booth.status === "CANCELLED" ? "line-through opacity-60" : "opacity-90"}`}>
                            {booth.businessName}
                          </p>
                          <p className="text-[8px] leading-tight truncate opacity-70">{booth.ownerName}</p>
                        </>
                      ) : (
                        <p className="text-[8px] leading-tight mt-0.5 opacity-50">tap to assign</p>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-cyan-500 border-2 border-cyan-600 inline-block" /> Confirmed</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-yellow-100 border-2 border-yellow-300 inline-block" /> Pending</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-100 border-2 border-red-200 inline-block" /> Cancelled</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-gray-50 border-2 border-dashed border-gray-300 inline-block" /> Available</span>
        </div>
      </div>

      {/* Cell interaction dialog */}
      <Dialog open={!!activeCell} onOpenChange={o => { if (!o) { setActiveCell(null); setChangeMode(false); } }}>
        <DialogContent className="max-w-sm">
          {activeCell && (
            isAssigned && !changeMode ? (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <span className="font-mono text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded text-sm">{activeCell.label}</span>
                    {dialogBooth!.businessName}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 mt-1">
                  <div className="space-y-1 text-sm">
                    <p className="text-gray-500">Owner: <span className="text-gray-800 font-medium">{dialogBooth!.ownerName}</span></p>
                    {dialogBooth!.ownerAge && <p className="text-gray-500">Age: <span className="text-gray-800 font-medium">{dialogBooth!.ownerAge}</span></p>}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {dialogBooth!.category && (
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${CATEGORY_BADGE[dialogBooth!.category] ?? "bg-gray-100 text-gray-500"}`}>
                        {dialogBooth!.category}
                      </span>
                    )}
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${STATUS_BADGE[dialogBooth!.status] ?? "bg-gray-100 text-gray-500"}`}>
                      {dialogBooth!.status}
                    </span>
                  </div>
                  {dialogBooth!.specialNeeds && (
                    <p className="text-xs text-gray-500">Special needs: {dialogBooth!.specialNeeds}</p>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" onClick={() => setChangeMode(true)} className="flex-1 text-xs h-8">
                      🔄 Change
                    </Button>
                    <Button onClick={handleUnassign} disabled={assigning} className="flex-1 text-xs h-8 bg-red-500 hover:bg-red-600 text-white">
                      {assigning ? "..." : "✕ Unassign"}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>
                    {isAssigned ? "Change Assignment" : "Assign Booth"} — <span className="font-mono text-cyan-700">{activeCell.label}</span>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 mt-2">
                  {unassignableBooths.length === 0 && !isAssigned ? (
                    <p className="text-sm text-gray-400 text-center py-4">No unassigned booths available. Register booths in the Registry tab first.</p>
                  ) : (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Select booth</label>
                        <Select value={selectedBoothId} onValueChange={setSelectedBoothId}>
                          <SelectTrigger><SelectValue placeholder="Choose a booth..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none" disabled>Choose a booth...</SelectItem>
                            {/* All booths without a number, plus the currently-assigned booth if changing */}
                            {booths
                              .filter(b => !b.boothNumber || (isAssigned && b.id === dialogBooth!.id))
                              .filter(b => b.status !== "CANCELLED")
                              .map(b => (
                                <SelectItem key={b.id} value={b.id}>
                                  {b.businessName} — {b.ownerName}
                                  {b.status === "PENDING" ? " (pending)" : ""}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button variant="outline" onClick={() => { setActiveCell(null); setChangeMode(false); }} className="flex-1 text-xs h-8">
                          Cancel
                        </Button>
                        <Button
                          onClick={handleAssign}
                          disabled={assigning || selectedBoothId === "none"}
                          className="flex-1 text-xs h-8 bg-cyan-600 hover:bg-cyan-700 text-white"
                        >
                          {assigning ? "Assigning..." : "Assign"}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </>
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Products Tab ──────────────────────────────────────────────────────────────

function ProductsTab({ booths, editionId, onBoothUpdate }: {
  booths: Booth[];
  editionId: string;
  onBoothUpdate: (b: Booth) => void;
}) {
  const [expanded,   setExpanded  ] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState<Record<string, { name: string; price: string; description: string }>>({});
  const [saving,     setSaving    ] = useState<string | null>(null);

  const confirmedBooths = booths.filter(b => b.status === "CONFIRMED");

  function getForm(boothId: string) {
    return newProduct[boothId] ?? { name: "", price: "", description: "" };
  }

  async function addProduct(booth: Booth) {
    const form = getForm(booth.id);
    if (!form.name.trim()) { toast.error("Product name required"); return; }
    setSaving(booth.id);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}/youthpreneur/${booth.id}/products`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), price: form.price ? Number(form.price) : undefined, description: form.description || undefined }),
      });
      if (!res.ok) throw new Error("Failed");
      const product = await res.json() as Product;
      onBoothUpdate({ ...booth, products: [...booth.products, product] });
      setNewProduct(p => ({ ...p, [booth.id]: { name: "", price: "", description: "" } }));
      toast.success("Product added");
    } catch { toast.error("Failed to add product"); }
    finally { setSaving(null); }
  }

  async function deleteProduct(booth: Booth, productId: string) {
    if (!window.confirm("Remove this product?")) return;
    onBoothUpdate({ ...booth, products: booth.products.filter(p => p.id !== productId) });
    const res = await fetch(`/api/annual-showcase/editions/${editionId}/youthpreneur/${booth.id}/products`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId }),
    });
    if (!res.ok) {
      onBoothUpdate(booth);
      toast.error("Failed to delete product");
    }
  }

  if (confirmedBooths.length === 0) {
    return (
      <div className="text-center py-12">
        <span className="text-4xl">🛒</span>
        <p className="text-sm text-gray-400 mt-3">No confirmed booths yet — confirm booths in Booth Registry first.</p>
      </div>
    );
  }

  const totalProducts = confirmedBooths.reduce((sum, b) => sum + b.products.length, 0);

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">{totalProducts} product{totalProducts !== 1 ? "s" : ""} across {confirmedBooths.length} booth{confirmedBooths.length !== 1 ? "s" : ""}</p>
      <div className="space-y-2">
        {confirmedBooths.map(booth => {
          const isOpen = expanded === booth.id;
          const form   = getForm(booth.id);
          return (
            <div key={booth.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <button
                onClick={() => setExpanded(isOpen ? null : booth.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50/60 transition-colors"
              >
                <span className="text-sm font-bold text-cyan-700 font-mono bg-cyan-50 px-2 py-0.5 rounded w-10 text-center flex-shrink-0">
                  {booth.boothNumber ?? "—"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-800 truncate">{booth.businessName}</p>
                  <p className="text-xs text-gray-400 truncate">{booth.ownerName}</p>
                </div>
                {booth.category && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${CATEGORY_BADGE[booth.category] ?? "bg-gray-100 text-gray-500"}`}>
                    {booth.category}
                  </span>
                )}
                <span className="text-xs text-gray-400 mr-1 flex-shrink-0">{booth.products.length} product{booth.products.length !== 1 ? "s" : ""}</span>
                <span className={`text-gray-400 transition-transform flex-shrink-0 ${isOpen ? "rotate-180" : ""}`}>▾</span>
              </button>

              {isOpen && (
                <div className="border-t border-gray-50 px-4 pb-4 pt-3 space-y-3">
                  {booth.products.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No products yet</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-50">
                          <th className="text-left py-1.5 text-gray-500 font-semibold">Product</th>
                          <th className="text-left py-1.5 text-gray-500 font-semibold">Price</th>
                          <th className="text-left py-1.5 text-gray-500 font-semibold">Description</th>
                          <th className="py-1.5 w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {booth.products.map(product => (
                          <tr key={product.id} className="border-b border-gray-50">
                            <td className="py-2 font-medium text-gray-700">{product.name}</td>
                            <td className="py-2 text-green-700">{product.price != null ? `RM ${product.price.toFixed(2)}` : "—"}</td>
                            <td className="py-2 text-gray-400 max-w-[180px] truncate">{product.description ?? "—"}</td>
                            <td className="py-2">
                              <button onClick={() => deleteProduct(booth, product.id)} className="text-gray-300 hover:text-red-500">×</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  <div className="flex flex-wrap gap-2 items-end pt-1 border-t border-gray-50">
                    <div className="flex-1 min-w-[8rem]">
                      <label className="text-[10px] text-gray-500 uppercase font-semibold block mb-1">Product Name *</label>
                      <Input
                        value={form.name}
                        onChange={e => setNewProduct(p => ({ ...p, [booth.id]: { ...getForm(booth.id), name: e.target.value } }))}
                        placeholder="e.g. Chocolate Cookies"
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="w-28">
                      <label className="text-[10px] text-gray-500 uppercase font-semibold block mb-1">Price (RM)</label>
                      <Input
                        type="number" min={0} step={0.01}
                        value={form.price}
                        onChange={e => setNewProduct(p => ({ ...p, [booth.id]: { ...getForm(booth.id), price: e.target.value } }))}
                        placeholder="0.00"
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="flex-1 min-w-[8rem]">
                      <label className="text-[10px] text-gray-500 uppercase font-semibold block mb-1">Description</label>
                      <Input
                        value={form.description}
                        onChange={e => setNewProduct(p => ({ ...p, [booth.id]: { ...getForm(booth.id), description: e.target.value } }))}
                        placeholder="Optional"
                        className="h-7 text-xs"
                      />
                    </div>
                    <Button size="sm" onClick={() => addProduct(booth)} disabled={saving === booth.id} className="bg-cyan-600 hover:bg-cyan-700 text-white h-7 text-xs px-3">
                      {saving === booth.id ? "..." : "+ Add"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function YouthpreneurPage() {
  const router = useRouter();
  const { allowed } = useDepartmentAccess("YOUTHPRENEUR");
  const { edition: rawEdition, isLoading } = useActiveEdition();
  const edition = rawEdition as unknown as ({
    id: string; name: string; currency: string;
    youthpreneurLayout?: unknown;
  } | null);

  const [booths,       setBooths      ] = useState<Booth[]>([]);
  const [dataLoading,  setDataLoading ] = useState(false);
  const [activeTab,    setActiveTab   ] = useState<ActiveTab>("registry");
  const [manpowerCount,setManpowerCount] = useState(0);

  const rawLayout = edition?.youthpreneurLayout as Record<string, unknown> | null | undefined;
  const layoutConfig: LayoutConfig | null = rawLayout && typeof rawLayout === "object" && ("rows" in rawLayout || "cols" in rawLayout)
    ? { rows: Number(rawLayout.rows ?? 4), cols: Number(rawLayout.cols ?? 5) }
    : null;

  const loadBooths = useCallback(async (editionId: string) => {
    setDataLoading(true);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}/youthpreneur`);
      if (res.ok) setBooths(await res.json() as Booth[]);
    } catch { toast.error("Failed to load booths"); }
    finally { setDataLoading(false); }
  }, []);

  useEffect(() => {
    if (edition?.id) loadBooths(edition.id);
  }, [edition?.id, loadBooths]);

  const totalBooths     = booths.length;
  const confirmedBooths = booths.filter(b => b.status === "CONFIRMED").length;
  const pendingBooths   = booths.filter(b => b.status === "PENDING").length;
  const totalProducts   = booths.reduce((s, b) => s + b.products.length, 0);

  if (!allowed) return null;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (!edition) {
    return (
      <div className="relative p-6 flex flex-col items-center justify-center min-h-[400px] gap-3">
        <button
          onClick={() => router.push('/annual-showcase/editions')}
          className="absolute top-4 left-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          ← Back to Editions
        </button>
        <span className="text-5xl">🏪</span>
        <p className="text-gray-600 font-medium">No active edition selected</p>
        <p className="text-sm text-gray-400">Select an edition from the switcher in the header.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <button
        onClick={() => router.push('/annual-showcase/editions')}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        ← Back to Editions
      </button>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Booths"    value={totalBooths}     icon="🏪" subtext="registered" />
        <StatCard label="Confirmed"       value={confirmedBooths} icon="✅" subtext="ready to go"         accentColor="bg-cyan-500" />
        <StatCard label="Pending"         value={pendingBooths}   icon="⏳" subtext="awaiting confirmation" accentColor="bg-yellow-500" />
        <StatCard label="Products Listed" value={totalProducts}   icon="🛒" subtext="across all booths"    accentColor="bg-green-500" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? "border-cyan-500 text-cyan-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.id === "manpower" && manpowerCount > 0 ? `👥 Manpower (${manpowerCount})` : tab.label}
            </button>
          ))}
        </div>

        <div className={dataLoading ? "p-6" : "p-5"}>
          {dataLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : (
            <>
              {activeTab === "registry" && (
                <BoothRegistryTab
                  booths={booths}
                  editionId={edition.id}
                  onAdd={b => setBooths(prev => [b, ...prev])}
                  onUpdate={b => setBooths(prev => prev.map(x => x.id === b.id ? b : x))}
                  onDelete={id => setBooths(prev => prev.filter(x => x.id !== id))}
                />
              )}
              {activeTab === "assignment" && (
                <BoothAssignmentTab
                  booths={booths}
                  editionId={edition.id}
                  initialLayout={layoutConfig}
                  onUpdate={b => setBooths(prev => prev.map(x => x.id === b.id ? b : x))}
                />
              )}
              {activeTab === "products" && (
                <ProductsTab
                  booths={booths}
                  editionId={edition.id}
                  onBoothUpdate={b => setBooths(prev => prev.map(x => x.id === b.id ? b : x))}
                />
              )}
              {activeTab === "manpower" && (
                <ManpowerPanel editionId={edition.id} unit="YOUTHPRENEUR" onCountChange={setManpowerCount} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
