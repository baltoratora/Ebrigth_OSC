"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import Papa from "papaparse";
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

interface CueBlock {
  id: string;
  editionId: string;
  dayNumber: number;
  order: number;
  title: string;
  type: string;
  startTime: string;
  durationMins: number;
  pic: string | null;
  status: string;
  notes: string | null;
}

interface Category {
  id: string;
  name: string;
}

interface Participant {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  categoryId: string | null;
  category: Category | null;
  paymentStatus: string;
  dateOfBirth: string | null;
  isEbrighter: boolean;
  parentName: string | null;
  parentEmail: string | null;
  parentPhone: string | null;
  orderNo: number | null;
  registeredAt: string;
}

interface Score {
  id: string;
  participantId: string;
  judgeName: string;
  criteriaScores: Record<string, number>;
  total: number;
  locked: boolean;
  participant: {
    id: string;
    fullName: string;
    categoryId: string | null;
    category: Category | null;
  };
}

interface ScoringCriterion {
  name: string;
  weight: number;
}

interface ChecklistItem {
  id: string;
  name: string;
  assignedTo: string;
  notes: string;
  done: boolean;
}

type ActiveTab = "cuesheet" | "schedule" | "scoring" | "checklist" | "manpower";

// ─── Constants ─────────────────────────────────────────────────────────────────

const BLOCK_TYPES = ["OPENING", "SHOWCASE_SESSION", "BREAK", "VIP_SEGMENT", "AWARD", "CLOSING", "OTHER"] as const;

const BLOCK_TYPE_COLORS: Record<string, string> = {
  OPENING:          "bg-blue-100 text-blue-700",
  SHOWCASE_SESSION: "bg-purple-100 text-purple-700",
  BREAK:            "bg-gray-100 text-gray-600",
  VIP_SEGMENT:      "bg-yellow-100 text-yellow-700",
  AWARD:            "bg-orange-100 text-orange-700",
  CLOSING:          "bg-red-100 text-red-600",
  OTHER:            "bg-gray-100 text-gray-500",
};

const STATUS_BADGE: Record<string, string> = {
  UPCOMING: "bg-gray-100 text-gray-600",
  LIVE:     "bg-red-100 text-red-600",
  DONE:     "bg-green-100 text-green-700",
};

const PAYMENT_BADGE: Record<string, string> = {
  UNPAID:  "bg-yellow-100 text-yellow-700",
  PAID:    "bg-green-100 text-green-700",
  OVERDUE: "bg-red-100 text-red-600",
  WAIVED:  "bg-gray-100 text-gray-500",
};

const DEFAULT_CRITERIA: ScoringCriterion[] = [
  { name: "Content",    weight: 30 },
  { name: "Delivery",   weight: 40 },
  { name: "Confidence", weight: 30 },
];

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  "Sound System", "Microphones (x4)", "Stage Lighting", "Projector & Screen",
  "Podium", "Timer Display", "Judges Table Setup", "Participant Registration Desk",
  "Backdrop Banner", "Trophy/Medal Table", "PA System Test", "Emcee Briefing Done",
].map((name, i) => ({ id: `default-${i}`, name, assignedTo: "", notes: "", done: false }));

const TABS: { id: ActiveTab; label: string }[] = [
  { id: "cuesheet",  label: "📋 Cue Sheet" },
  { id: "schedule",  label: "🗓 Participant Schedule" },
  { id: "scoring",   label: "🏆 Scoring" },
  { id: "checklist", label: "✅ Stage Checklist" },
  { id: "manpower",  label: "👥 Manpower" },
];

function calcAge(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return age;
}

// ─── Cue Sheet Tab ─────────────────────────────────────────────────────────────

function CueSheetTab({ blocks, editionId, onAdd, onUpdate, onDelete }: {
  blocks: CueBlock[];
  editionId: string;
  onAdd: (b: CueBlock) => void;
  onUpdate: (b: CueBlock) => void;
  onDelete: (id: string) => void;
}) {
  const [day,      setDay     ] = useState(1);
  const [liveMode, setLiveMode] = useState(false);
  const [addOpen,  setAddOpen ] = useState(false);
  const [editBlock,setEditBlock] = useState<CueBlock | null>(null);
  const [form, setForm] = useState({ dayNumber: 1, order: 1, title: "", type: "OPENING", startTime: "09:00", durationMins: 15, pic: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const dayBlocks = blocks.filter(b => b.dayNumber === day).sort((a, b) => a.order - b.order);

  useEffect(() => {
    if (addOpen) {
      const nextOrder = dayBlocks.length > 0 ? Math.max(...dayBlocks.map(b => b.order)) + 1 : 1;
      setForm(prev => ({ ...prev, dayNumber: day, order: nextOrder }));
    }
  }, [addOpen, day, dayBlocks]);

  useEffect(() => {
    if (editBlock) {
      setForm({
        dayNumber: editBlock.dayNumber, order: editBlock.order, title: editBlock.title,
        type: editBlock.type, startTime: editBlock.startTime, durationMins: editBlock.durationMins,
        pic: editBlock.pic ?? "", notes: editBlock.notes ?? "",
      });
    }
  }, [editBlock]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      const body = { ...form, pic: form.pic || undefined, notes: form.notes || undefined };
      if (editBlock) {
        const res = await fetch(`/api/annual-showcase/editions/${editionId}/cuesheet/${editBlock.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Failed");
        onUpdate(await res.json() as CueBlock);
        toast.success("Block updated");
        setEditBlock(null);
      } else {
        const res = await fetch(`/api/annual-showcase/editions/${editionId}/cuesheet`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Failed");
        onAdd(await res.json() as CueBlock);
        toast.success("Block added");
        setAddOpen(false);
      }
    } catch { toast.error("Failed to save block"); }
    finally { setSaving(false); }
  }

  async function handleStatusChange(block: CueBlock, status: string) {
    onUpdate({ ...block, status });
    const res = await fetch(`/api/annual-showcase/editions/${editionId}/cuesheet/${block.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
    if (!res.ok) { onUpdate(block); toast.error("Failed to update status"); }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Remove this block?")) return;
    onDelete(id);
    const res = await fetch(`/api/annual-showcase/editions/${editionId}/cuesheet/${id}`, { method: "DELETE" });
    if (!res.ok) toast.error("Failed to delete block");
  }

  async function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const reordered = Array.from(dayBlocks);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);

    const updated = reordered.map((b, i) => ({ ...b, order: i + 1 }));
    updated.forEach(onUpdate);

    await Promise.all(updated.map(b =>
      fetch(`/api/annual-showcase/editions/${editionId}/cuesheet/${b.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: b.order }),
      }),
    ));
  }

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const BlockForm = () => (
    <form onSubmit={handleSubmit} className="space-y-3 mt-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Day</label>
          <Select value={String(form.dayNumber)} onValueChange={v => setForm(p => ({ ...p, dayNumber: Number(v) }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Day 1</SelectItem>
              <SelectItem value="2">Day 2</SelectItem>
              <SelectItem value="3">Day 3</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Order #</label>
          <Input type="number" min={1} value={form.order} onChange={f("order")} className="h-9" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Session Title *</label>
        <Input value={form.title} onChange={f("title")} placeholder="e.g. Opening Ceremony" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {BLOCK_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
          <Input type="time" value={form.startTime} onChange={f("startTime")} className="h-9" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Duration (mins)</label>
          <Input type="number" min={1} value={form.durationMins} onChange={f("durationMins")} className="h-9" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Person In Charge</label>
          <Input value={form.pic} onChange={f("pic")} placeholder="Name" className="h-9" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
        <Textarea value={form.notes} onChange={f("notes")} rows={2} placeholder="Any special instructions..." />
      </div>
      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" onClick={() => { setAddOpen(false); setEditBlock(null); }} className="flex-1" disabled={saving}>Cancel</Button>
        <Button type="submit" disabled={saving} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white">
          {saving ? "Saving..." : editBlock ? "Save Changes" : "Add Block"}
        </Button>
      </div>
    </form>
  );

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Day selector */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {[1, 2, 3].map(d => (
            <button key={d} onClick={() => setDay(d)} className={`px-4 py-1.5 text-sm font-medium transition-colors ${day === d ? "bg-purple-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
              Day {d}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setLiveMode(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${liveMode ? "bg-red-600 text-white animate-pulse" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            {liveMode ? "🔴 Live Mode ON" : "🔴 Go Live"}
          </button>
          <Button size="sm" onClick={() => setAddOpen(true)} className="bg-purple-600 hover:bg-purple-700 text-white text-xs">
            + Add Block
          </Button>
        </div>
      </div>

      {/* Table */}
      {dayBlocks.length === 0 ? (
        <div className="text-center py-12">
          <span className="text-4xl">📋</span>
          <p className="text-sm text-gray-400 mt-3">No blocks for Day {day} yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="cuesheet">
              {provided => (
                <table className="w-full text-sm" ref={provided.innerRef} {...provided.droppableProps}>
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {["", "#", "Time", "Dur.", "Session", "Type", "PIC", "Status", ""].map(h => (
                        <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dayBlocks.map((block, index) => (
                      <Draggable key={block.id} draggableId={block.id} index={index}>
                        {(prov, snap) => (
                          <tr
                            ref={prov.innerRef}
                            {...prov.draggableProps}
                            className={`border-b border-gray-50 hover:bg-gray-50/50 ${snap.isDragging ? "shadow-md bg-white" : ""} ${block.status === "LIVE" ? "bg-red-50/30" : block.status === "DONE" ? "bg-gray-50/40 opacity-70" : ""}`}
                          >
                            <td className="px-2 py-2 w-5 cursor-grab text-gray-300 hover:text-gray-500" {...prov.dragHandleProps}>⠿</td>
                            <td className="px-3 py-2 text-xs font-mono text-gray-400">{block.order}</td>
                            <td className="px-3 py-2 text-xs font-semibold text-gray-700 whitespace-nowrap">{block.startTime}</td>
                            <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{block.durationMins}m</td>
                            <td className="px-3 py-2">
                              <p className="font-medium text-gray-800 text-xs">{block.title}</p>
                              {block.notes && <p className="text-[10px] text-gray-400 truncate max-w-[160px]">{block.notes}</p>}
                            </td>
                            <td className="px-3 py-2">
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${BLOCK_TYPE_COLORS[block.type] ?? "bg-gray-100 text-gray-500"}`}>
                                {block.type.replace(/_/g, " ")}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-500">{block.pic ?? "—"}</td>
                            <td className="px-3 py-2">
                              {liveMode ? (
                                <div className="flex gap-1">
                                  {block.status !== "LIVE" && (
                                    <button onClick={() => handleStatusChange(block, "LIVE")} className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 hover:bg-red-200 font-semibold">▶ Start</button>
                                  )}
                                  {block.status !== "DONE" && (
                                    <button onClick={() => handleStatusChange(block, "DONE")} className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 hover:bg-green-200 font-semibold">✓ Done</button>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_BADGE[block.status] ?? "bg-gray-100 text-gray-500"}`}>
                                    {block.status === "LIVE" && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-1 animate-pulse" />}
                                    {block.status}
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex gap-1.5">
                                <button onClick={() => setEditBlock(block)} className="text-xs text-blue-500 hover:text-blue-700">Edit</button>
                                <button onClick={() => handleDelete(block.id)} className="text-xs text-red-400 hover:text-red-600">Del</button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </tbody>
                </table>
              )}
            </Droppable>
          </DragDropContext>
        </div>
      )}

      {/* Add modal */}
      <Dialog open={addOpen} onOpenChange={o => !o && setAddOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Cue Sheet Block</DialogTitle></DialogHeader>
          <BlockForm />
        </DialogContent>
      </Dialog>

      {/* Edit modal */}
      <Dialog open={!!editBlock} onOpenChange={o => !o && setEditBlock(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Block</DialogTitle></DialogHeader>
          <BlockForm />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Participant Schedule Tab ──────────────────────────────────────────────────

interface CsvRow {
  fullName: string;
  dateOfBirth: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  isEbrighter: string;
  branch: string;
  _error?: string;
}

const CSV_TEMPLATE_HEADERS = ["name", "dob (DD/MM/YYYY)", "parentName", "parentEmail", "parentPhone", "isEbrighter (yes/no)", "branch"];

function ParticipantScheduleTab({ participants, categories, editionId, onAdd, onUpdate }: {
  participants: Participant[];
  categories: Category[];
  editionId: string;
  onAdd: (p: Participant) => void;
  onUpdate: (p: Participant) => void;
}) {
  const [activeCat,    setActiveCat   ] = useState<string>("all");
  const [addOpen,      setAddOpen     ] = useState(false);
  const [csvOpen,      setCsvOpen     ] = useState(false);
  const [csvRows,      setCsvRows     ] = useState<CsvRow[]>([]);
  const [importing,    setImporting   ] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    fullName: "", dateOfBirth: "", categoryId: "", isEbrighter: false,
    parentName: "", parentEmail: "", parentPhone: "", paymentStatus: "UNPAID",
  });
  const [saving, setSaving] = useState(false);

  function parseDDMMYYYY(s: string): boolean {
    const p = s.trim().split("/");
    if (p.length !== 3) return false;
    const d = new Date(`${p[2]}-${p[1]!.padStart(2,"0")}-${p[0]!.padStart(2,"0")}`);
    return !isNaN(d.getTime());
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: result => {
        const rows = result.data.slice(1); // skip header row
        const parsed: CsvRow[] = rows.map(cols => {
          const [name="", dob="", pName="", pEmail="", pPhone="", isEb="", branch=""] = cols;
          let error = "";
          if (!name.trim()) error = "Missing name";
          else if (dob.trim() && !parseDDMMYYYY(dob)) error = "Invalid date format (use DD/MM/YYYY)";
          return { fullName: name.trim(), dateOfBirth: dob.trim(), parentName: pName.trim(), parentEmail: pEmail.trim(), parentPhone: pPhone.trim(), isEbrighter: isEb.trim(), branch: branch.trim(), _error: error || undefined };
        });
        setCsvRows(parsed);
        setCsvOpen(true);
        if (fileInputRef.current) fileInputRef.current.value = "";
      },
    });
  }

  async function handleImport() {
    const valid = csvRows.filter(r => !r._error);
    if (valid.length === 0) { toast.error("No valid rows to import"); return; }
    setImporting(true);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}/participants/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participants: valid.map(r => ({
            fullName:    r.fullName,
            dateOfBirth: r.dateOfBirth || undefined,
            parentName:  r.parentName  || undefined,
            parentEmail: r.parentEmail || undefined,
            parentPhone: r.parentPhone || undefined,
            isEbrighter: r.isEbrighter.toLowerCase() === "yes",
          })),
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as { created: number; skipped: number; errors: string[] };
      toast.success(`${data.created} imported, ${data.skipped} skipped`);
      if (data.errors.length > 0) toast.error(`${data.errors.length} row errors`, { description: data.errors.slice(0, 3).join("; ") });
      setCsvOpen(false);
      setCsvRows([]);
      // Reload participants by re-fetching
      const pRes = await fetch(`/api/annual-showcase/editions/${editionId}/participants?limit=500`);
      if (pRes.ok) {
        const d = await pRes.json() as { participants: Participant[] };
        (d.participants ?? []).forEach(onAdd);
      }
    } catch { toast.error("Import failed"); }
    finally { setImporting(false); }
  }

  function downloadTemplate() {
    const csv = [CSV_TEMPLATE_HEADERS.join(","), "Ahmad Danial,15/03/2012,Siti Nora,siti@gmail.com,0123456789,yes,Petaling Jaya"].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), { href: url, download: "participants-template.csv" }).click();
    URL.revokeObjectURL(url);
  }

  function exportCSV() {
    const rows = [
      CSV_TEMPLATE_HEADERS.join(","),
      ...participants.map(p => {
        const dob = p.dateOfBirth ? (() => { const d = new Date(p.dateOfBirth!); return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`; })() : "";
        return [p.fullName, dob, p.parentName ?? "", p.parentEmail ?? "", p.parentPhone ?? "", p.isEbrighter ? "yes" : "no", ""].map(v => `"${v}"`).join(",");
      }),
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), { href: url, download: "participants-export.csv" }).click();
    URL.revokeObjectURL(url);
  }

  const filtered = activeCat === "all"
    ? participants
    : participants.filter(p => p.categoryId === activeCat);

  const sorted = [...filtered].sort((a, b) => (a.orderNo ?? 9999) - (b.orderNo ?? 9999));

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fullName.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName:    form.fullName,
          dateOfBirth: form.dateOfBirth || undefined,
          categoryId:  form.categoryId || undefined,
          isEbrighter: form.isEbrighter,
          parentName:  form.parentName  || undefined,
          parentEmail: form.parentEmail || undefined,
          parentPhone: form.parentPhone || undefined,
          paymentStatus: form.paymentStatus,
          orderNo: filtered.length + 1,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Participant added");
      onAdd(await res.json() as Participant);
      setAddOpen(false);
      setForm({ fullName: "", dateOfBirth: "", categoryId: "", isEbrighter: false, parentName: "", parentEmail: "", parentPhone: "", paymentStatus: "UNPAID" });
    } catch { toast.error("Failed to add participant"); }
    finally { setSaving(false); }
  }

  async function handleRandomize() {
    const shuffled = [...sorted].sort(() => Math.random() - 0.5);
    const updates = shuffled.map((p, i) => ({ ...p, orderNo: i + 1 }));
    updates.forEach(onUpdate);
    await Promise.all(updates.map(p =>
      fetch(`/api/annual-showcase/editions/${editionId}/participants/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNo: p.orderNo }),
      }).catch(() => null),
    ));
    toast.success("Order randomized");
  }

  if (categories.length === 0) {
    return (
      <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-xl text-center space-y-2">
        <p className="text-sm font-semibold text-yellow-800">⚠ No categories configured</p>
        <p className="text-xs text-yellow-600">Ask OC Admin to set up categories (Junior / Middler / Senior) in Edition Settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          <button
            onClick={() => setActiveCat("all")}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${activeCat === "all" ? "bg-purple-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
          >
            All ({participants.length})
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCat(cat.id)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-gray-200 ${activeCat === cat.id ? "bg-purple-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
            >
              {cat.name} ({participants.filter(p => p.categoryId === cat.id).length})
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {sorted.length > 0 && (
            <Button size="sm" variant="outline" onClick={handleRandomize} className="text-xs h-8">🔀 Randomize</Button>
          )}
          <Button size="sm" variant="outline" onClick={downloadTemplate} className="text-xs h-8">📄 Template</Button>
          {participants.length > 0 && (
            <Button size="sm" variant="outline" onClick={exportCSV} className="text-xs h-8">⬇ Export CSV</Button>
          )}
          <label className="cursor-pointer">
            <input ref={fileInputRef} type="file" accept=".csv" className="sr-only" onChange={handleFileSelect} />
            <span className="inline-flex items-center h-8 px-3 text-xs font-medium rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer">📥 Import CSV</span>
          </label>
          <Button size="sm" onClick={() => setAddOpen(true)} className="bg-purple-600 hover:bg-purple-700 text-white text-xs h-8">
            + Add
          </Button>
        </div>
      </div>

      {/* CSV Import Preview Dialog */}
      <Dialog open={csvOpen} onOpenChange={o => !o && setCsvOpen(false)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>CSV Import Preview</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            {(() => {
              const valid   = csvRows.filter(r => !r._error).length;
              const errored = csvRows.filter(r => !!r._error).length;
              return (
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-500">{csvRows.length} rows found</span>
                  <span className="text-green-600 font-semibold">{valid} valid</span>
                  {errored > 0 && <span className="text-red-500 font-semibold">{errored} with errors</span>}
                </div>
              );
            })()}
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    {["Status", "Name", "DOB", "Parent", "Email", "Phone", "Ebrighter"].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-gray-500 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvRows.map((row, i) => (
                    <tr key={i} className={`border-t border-gray-50 ${row._error ? "bg-red-50" : ""}`}>
                      <td className="px-3 py-1.5">
                        {row._error
                          ? <span className="text-red-500 text-[10px]">{row._error}</span>
                          : <span className="text-green-600">✓</span>}
                      </td>
                      <td className="px-3 py-1.5 font-medium">{row.fullName || "—"}</td>
                      <td className="px-3 py-1.5">{row.dateOfBirth || "—"}</td>
                      <td className="px-3 py-1.5">{row.parentName || "—"}</td>
                      <td className="px-3 py-1.5">{row.parentEmail || "—"}</td>
                      <td className="px-3 py-1.5">{row.parentPhone || "—"}</td>
                      <td className="px-3 py-1.5">{row.isEbrighter || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={() => setCsvOpen(false)} className="flex-1">Cancel</Button>
              <Button
                onClick={handleImport}
                disabled={importing || csvRows.filter(r => !r._error).length === 0}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
              >
                {importing ? "Importing..." : `Import ${csvRows.filter(r => !r._error).length} valid rows`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {sorted.length === 0 ? (
        <div className="text-center py-12">
          <span className="text-4xl">👤</span>
          <p className="text-sm text-gray-400 mt-3">No participants in this category yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Order</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Age</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ebrighter?</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Payment</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Parent</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p, idx) => {
                const age = calcAge(p.dateOfBirth);
                return (
                  <tr key={p.id} className={`border-b border-gray-50 hover:bg-gray-50/60 ${idx % 2 === 1 ? "bg-gray-50/30" : ""}`}>
                    <td className="px-4 py-2.5">
                      <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center">
                        {p.orderNo ?? idx + 1}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-gray-800 text-xs">{p.fullName}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{age !== null ? `${age}y` : "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{p.category?.name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs">
                      {p.isEbrighter
                        ? <span className="text-purple-600 font-semibold">✓ Yes</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${PAYMENT_BADGE[p.paymentStatus] ?? "bg-gray-100 text-gray-500"}`}>
                        {p.paymentStatus}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{p.parentName ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Participant Modal */}
      <Dialog open={addOpen} onOpenChange={o => !o && setAddOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Participant</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-3 mt-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <Input value={form.fullName} onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))} placeholder="Full name" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                <Input type="date" value={form.dateOfBirth} onChange={e => setForm(p => ({ ...p, dateOfBirth: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <Select value={form.categoryId} onValueChange={v => setForm(p => ({ ...p, categoryId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isEb" checked={form.isEbrighter} onChange={e => setForm(p => ({ ...p, isEbrighter: e.target.checked }))} className="rounded" />
              <label htmlFor="isEb" className="text-sm font-medium text-gray-700">Is Ebrighter?</label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parent Name *</label>
              <Input value={form.parentName} onChange={e => setForm(p => ({ ...p, parentName: e.target.value }))} placeholder="Parent / guardian name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parent Email *</label>
                <Input type="email" value={form.parentEmail} onChange={e => setForm(p => ({ ...p, parentEmail: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parent Phone</label>
                <Input value={form.parentPhone} onChange={e => setForm(p => ({ ...p, parentPhone: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Status</label>
              <Select value={form.paymentStatus} onValueChange={v => setForm(p => ({ ...p, paymentStatus: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["UNPAID", "PAID", "OVERDUE", "WAIVED"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)} className="flex-1" disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white">
                {saving ? "Saving..." : "Add Participant"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Scoring Tab ───────────────────────────────────────────────────────────────

function ScoringTab({ participants, categories, scores, editionId, initialCriteria, onScoreAdd, onScoreUpdate, onCriteriaSaved }: {
  participants: Participant[];
  categories: Category[];
  scores: Score[];
  editionId: string;
  initialCriteria: ScoringCriterion[];
  onScoreAdd: (s: Score) => void;
  onScoreUpdate: (s: Score) => void;
  onCriteriaSaved: (c: ScoringCriterion[]) => void;
}) {
  const [criteria, setCriteria] = useState<ScoringCriterion[]>(initialCriteria);
  const [activeCat, setActiveCat] = useState<string>("");
  const [savingCriteria, setSavingCriteria] = useState(false);
  const [judgeInputs, setJudgeInputs] = useState<Record<string, { judgeName: string; scores: Record<string, string> }>>({});

  useEffect(() => { setCriteria(initialCriteria); }, [initialCriteria]);
  useEffect(() => { if (categories.length > 0 && !activeCat) setActiveCat(categories[0]?.id ?? ""); }, [categories, activeCat]);

  const totalWeight = criteria.reduce((s, c) => s + c.weight, 0);

  async function saveCriteria() {
    if (totalWeight !== 100) { toast.error("Weights must sum to 100%"); return; }
    setSavingCriteria(true);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scoringCriteria: criteria }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Criteria saved");
      onCriteriaSaved(criteria);
    } catch { toast.error("Failed to save criteria"); }
    finally { setSavingCriteria(false); }
  }

  const catParticipants = participants
    .filter(p => p.categoryId === activeCat)
    .sort((a, b) => (a.orderNo ?? 9999) - (b.orderNo ?? 9999));

  function getScoreForParticipant(participantId: string) {
    return scores.find(s => s.participantId === participantId);
  }

  function calcWeightedTotal(criteriaScores: Record<string, string>): number {
    return criteria.reduce((sum, c) => {
      const v = Number(criteriaScores[c.name] ?? 0);
      return sum + (v * c.weight / 100);
    }, 0);
  }

  function getJudgeInput(participantId: string) {
    return judgeInputs[participantId] ?? { judgeName: "", scores: {} };
  }

  async function submitScore(participantId: string) {
    const input = getJudgeInput(participantId);
    if (!input.judgeName.trim()) { toast.error("Judge name required"); return; }
    const total = calcWeightedTotal(input.scores);
    const criteriaScores = Object.fromEntries(criteria.map(c => [c.name, Number(input.scores[c.name] ?? 0)]));
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}/scores`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId, judgeName: input.judgeName, criteriaScores, total }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Score submitted");
      onScoreAdd(await res.json() as Score);
    } catch { toast.error("Failed to submit score"); }
  }

  async function toggleLock(score: Score) {
    onScoreUpdate({ ...score, locked: !score.locked });
    const res = await fetch(`/api/annual-showcase/editions/${editionId}/scores/${score.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locked: !score.locked }),
    });
    if (!res.ok) { onScoreUpdate(score); toast.error("Failed"); }
  }

  // Leaderboard: rank participants by total score
  const ranked = [...catParticipants]
    .map(p => ({ p, score: getScoreForParticipant(p.id) }))
    .filter(x => x.score)
    .sort((a, b) => (b.score!.total) - (a.score!.total));

  return (
    <div className="space-y-4">
      {/* Criteria configurator */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Scoring Criteria</h3>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${totalWeight === 100 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
              Total: {totalWeight}%
            </span>
            <Button size="sm" onClick={saveCriteria} disabled={savingCriteria || totalWeight !== 100} className="bg-purple-600 hover:bg-purple-700 text-white text-xs h-7">
              {savingCriteria ? "Saving..." : "Save Criteria"}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {criteria.map((c, idx) => (
            <div key={idx} className="flex items-center gap-1.5 bg-purple-50 border border-purple-100 rounded-lg px-2 py-1">
              <Input
                value={c.name}
                onChange={e => setCriteria(prev => prev.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                className="h-6 w-24 text-xs border-0 bg-transparent p-0 font-medium text-purple-700"
              />
              <span className="text-xs text-purple-400">/</span>
              <Input
                type="number" min={1} max={100}
                value={c.weight}
                onChange={e => setCriteria(prev => prev.map((x, i) => i === idx ? { ...x, weight: Number(e.target.value) } : x))}
                className="h-6 w-12 text-xs border-0 bg-transparent p-0 text-center font-bold text-purple-700"
              />
              <span className="text-xs text-purple-400">%</span>
              <button onClick={() => setCriteria(prev => prev.filter((_, i) => i !== idx))} className="text-purple-300 hover:text-red-500 ml-1">×</button>
            </div>
          ))}
          <button
            onClick={() => setCriteria(prev => [...prev, { name: "New", weight: 0 }])}
            className="text-xs px-2 py-1 rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100 border border-dashed border-gray-200"
          >
            + Add Criterion
          </button>
        </div>
      </div>

      {categories.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No categories configured.</p>
      ) : (
        <div className="space-y-3">
          {/* Category tabs */}
          <div className="flex gap-1 border-b border-gray-100">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCat(cat.id)}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${activeCat === cat.id ? "border-purple-500 text-purple-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Scoring table */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-3 py-2.5 text-gray-500 font-semibold">#</th>
                    <th className="text-left px-3 py-2.5 text-gray-500 font-semibold">Participant</th>
                    <th className="px-3 py-2.5 text-gray-500 font-semibold text-center">Judge</th>
                    {criteria.map(c => (
                      <th key={c.name} className="px-3 py-2.5 text-gray-500 font-semibold text-center">{c.name}<br /><span className="font-normal text-gray-400">{c.weight}%</span></th>
                    ))}
                    <th className="px-3 py-2.5 text-gray-500 font-semibold text-center">Total</th>
                    <th className="px-3 py-2.5 text-gray-500 font-semibold text-center">Rank</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {catParticipants.map((p, idx) => {
                    const existing = getScoreForParticipant(p.id);
                    const input = getJudgeInput(p.id);
                    const previewTotal = calcWeightedTotal(input.scores);
                    const rank = ranked.findIndex(r => r.p.id === p.id) + 1;
                    return (
                      <tr key={p.id} className={`border-b border-gray-50 ${existing?.locked ? "bg-gray-50/40" : ""}`}>
                        <td className="px-3 py-2">{idx + 1}</td>
                        <td className="px-3 py-2 font-medium text-gray-700 max-w-[120px]">
                          <p className="truncate">{p.fullName}</p>
                        </td>
                        <td className="px-3 py-2">
                          {existing ? (
                            <span className="text-gray-500">{existing.judgeName}</span>
                          ) : (
                            <Input
                              value={input.judgeName}
                              onChange={e => setJudgeInputs(prev => ({ ...prev, [p.id]: { ...getJudgeInput(p.id), judgeName: e.target.value } }))}
                              placeholder="Judge name"
                              className="h-6 text-xs w-24"
                            />
                          )}
                        </td>
                        {criteria.map(c => (
                          <td key={c.name} className="px-3 py-2 text-center">
                            {existing ? (
                              <span className={existing.locked ? "text-gray-400" : "text-gray-700 font-semibold"}>
                                {existing.criteriaScores[c.name] ?? 0}
                              </span>
                            ) : (
                              <Input
                                type="number" min={0} max={100}
                                value={input.scores[c.name] ?? ""}
                                onChange={e => setJudgeInputs(prev => ({
                                  ...prev,
                                  [p.id]: { ...getJudgeInput(p.id), scores: { ...getJudgeInput(p.id).scores, [c.name]: e.target.value } },
                                }))}
                                className="h-6 text-xs w-14 text-center"
                                placeholder="0"
                              />
                            )}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-center font-bold text-purple-700">
                          {existing ? existing.total.toFixed(1) : previewTotal > 0 ? <span className="text-gray-400">{previewTotal.toFixed(1)}</span> : "—"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {rank > 0 ? <span className="font-bold text-gray-600">{rank}</span> : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {existing ? (
                            <button
                              onClick={() => toggleLock(existing)}
                              className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${existing.locked ? "bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-500" : "bg-green-100 text-green-700 hover:bg-gray-100 hover:text-gray-500"}`}
                            >
                              {existing.locked ? "🔒 Locked" : "🔓 Lock"}
                            </button>
                          ) : (
                            <button
                              onClick={() => submitScore(p.id)}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 hover:bg-purple-200 font-semibold"
                            >
                              Submit
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Leaderboard */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">🏆 Leaderboard</h3>
              {ranked.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No scores yet</p>
              ) : (
                <div className="space-y-2">
                  {ranked.slice(0, 5).map(({ p, score }, idx) => (
                    <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
                      <span className="text-lg">{idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}.`}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-700 truncate">{p.fullName}</p>
                        <p className="text-[10px] text-gray-400">{score!.judgeName}</p>
                      </div>
                      <span className="text-sm font-bold text-purple-700">{score!.total.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stage Checklist Tab ───────────────────────────────────────────────────────

function ChecklistTab({ editionId, initial }: { editionId: string; initial: ChecklistItem[] }) {
  const [items,  setItems ] = useState<ChecklistItem[]>(initial.length > 0 ? initial : DEFAULT_CHECKLIST);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (initial.length > 0) setItems(initial); }, [initial]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stageChecklist: items }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Checklist saved");
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  }

  function toggle(id: string) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, done: !it.done } : it));
  }

  function update(id: string, key: keyof ChecklistItem, value: string) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, [key]: value } : it));
  }

  function addItem() {
    const id = `item-${Date.now()}`;
    setItems(prev => [...prev, { id, name: "", assignedTo: "", notes: "", done: false }]);
  }

  const done = items.filter(i => i.done).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-500">{done}/{items.length} checked</p>
          <div className="h-1.5 w-32 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 rounded-full" style={{ width: `${items.length > 0 ? (done / items.length) * 100 : 0}%` }} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={addItem} className="text-xs h-8">+ Add Item</Button>
          <Button size="sm" onClick={save} disabled={saving} className="bg-purple-600 hover:bg-purple-700 text-white text-xs h-8">
            {saving ? "Saving..." : "Save Checklist"}
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-4 py-2.5 w-10" />
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Item</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Assigned To</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.id} className={`border-b border-gray-50 ${item.done ? "bg-gray-50/50" : ""} ${idx % 2 === 1 ? "bg-gray-50/20" : ""}`}>
                <td className="px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => toggle(item.id)}
                    className="rounded w-4 h-4 accent-purple-600"
                  />
                </td>
                <td className="px-4 py-2.5">
                  <Input
                    value={item.name}
                    onChange={e => update(item.id, "name", e.target.value)}
                    className={`h-7 text-xs border-0 bg-transparent p-0 ${item.done ? "line-through text-gray-400" : "text-gray-700 font-medium"}`}
                    placeholder="Item name"
                  />
                </td>
                <td className="px-4 py-2.5">
                  <Input value={item.assignedTo} onChange={e => update(item.id, "assignedTo", e.target.value)} className="h-7 text-xs" placeholder="Name" />
                </td>
                <td className="px-4 py-2.5">
                  <Input value={item.notes} onChange={e => update(item.id, "notes", e.target.value)} className="h-7 text-xs" placeholder="Notes..." />
                </td>
                <td className="px-4 py-2.5">
                  <button onClick={() => setItems(prev => prev.filter(i => i.id !== item.id))} className="text-gray-300 hover:text-red-500 text-sm">×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Showcase Page ────────────────────────────────────────────────────────

export default function ShowcaseProductionPage() {
  const router = useRouter();
  const { allowed } = useDepartmentAccess("SHOWCASE");
  const { edition: rawEdition, isLoading } = useActiveEdition();
  const edition = rawEdition as unknown as ({
    id: string; name: string; currency: string;
    scoringCriteria?: unknown; stageChecklist?: unknown;
    _count?: { participants: number; tasks: number };
  } | null);

  const [blocks,      setBlocks     ] = useState<CueBlock[]>([]);
  const [participants,setParticipants] = useState<Participant[]>([]);
  const [categories,  setCategories ] = useState<Category[]>([]);
  const [scores,      setScores     ] = useState<Score[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [activeTab,   setActiveTab  ] = useState<ActiveTab>("cuesheet");
  const [manpowerCount, setManpowerCount] = useState(0);

  const criteria: ScoringCriterion[] = Array.isArray(edition?.scoringCriteria)
    ? (edition!.scoringCriteria as ScoringCriterion[])
    : DEFAULT_CRITERIA;

  const stageChecklist: ChecklistItem[] = Array.isArray(edition?.stageChecklist)
    ? (edition!.stageChecklist as ChecklistItem[])
    : [];

  const loadData = useCallback(async (editionId: string) => {
    setDataLoading(true);
    try {
      const [blocksRes, participantsRes, scoresRes] = await Promise.all([
        fetch(`/api/annual-showcase/editions/${editionId}/cuesheet`),
        fetch(`/api/annual-showcase/editions/${editionId}/participants?limit=500`),
        fetch(`/api/annual-showcase/editions/${editionId}/scores`),
      ]);
      if (blocksRes.ok)        setBlocks(await blocksRes.json() as CueBlock[]);
      if (participantsRes.ok) {
        const d = await participantsRes.json() as { participants: Participant[]; total: number };
        setParticipants(d.participants ?? []);
      }
      if (scoresRes.ok) setScores(await scoresRes.json() as Score[]);
    } catch {
      toast.error("Failed to load data");
    } finally {
      setDataLoading(false);
    }
  }, []);

  // Fetch categories from edition
  const loadCategories = useCallback(async (editionId: string) => {
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}`);
      if (res.ok) {
        const d = await res.json() as { categories: Category[] };
        setCategories(d.categories ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (edition?.id) {
      loadData(edition.id);
      loadCategories(edition.id);
    }
  }, [edition?.id, loadData, loadCategories]);

  // Stats
  const totalParticipants = edition?._count?.participants ?? participants.length;
  const judgeCount        = 0; // derived from manpower with role containing Judge — show 0 if unknown
  const cueCount          = blocks.length;
  const catCount          = categories.length;

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
        <span className="text-5xl">🎤</span>
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

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Participants" value={totalParticipants} icon="🎤" subtext="registered" />
        <StatCard label="Categories"         value={catCount}          icon="📂" subtext="configured" accentColor="bg-purple-500" />
        <StatCard label="Cue Sheet Items"    value={cueCount}          icon="📋" subtext="all days"   accentColor="bg-blue-500" />
        <StatCard label="Judges"             value={manpowerCount > 0 ? "from manpower" : "—"} icon="⚖" subtext="add via Manpower tab" accentColor="bg-yellow-500" />
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? "border-purple-500 text-purple-600"
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
              {activeTab === "cuesheet" && (
                <CueSheetTab
                  blocks={blocks}
                  editionId={edition.id}
                  onAdd={b => setBlocks(prev => [...prev, b])}
                  onUpdate={b => setBlocks(prev => prev.map(x => x.id === b.id ? b : x))}
                  onDelete={id => setBlocks(prev => prev.filter(x => x.id !== id))}
                />
              )}
              {activeTab === "schedule" && (
                <ParticipantScheduleTab
                  participants={participants}
                  categories={categories}
                  editionId={edition.id}
                  onAdd={p => setParticipants(prev => [...prev, p])}
                  onUpdate={p => setParticipants(prev => prev.map(x => x.id === p.id ? p : x))}
                />
              )}
              {activeTab === "scoring" && (
                <ScoringTab
                  participants={participants}
                  categories={categories}
                  scores={scores}
                  editionId={edition.id}
                  initialCriteria={criteria}
                  onScoreAdd={s => setScores(prev => [...prev, s])}
                  onScoreUpdate={s => setScores(prev => prev.map(x => x.id === s.id ? s : x))}
                  onCriteriaSaved={() => {}}
                />
              )}
              {activeTab === "checklist" && (
                <ChecklistTab editionId={edition.id} initial={stageChecklist} />
              )}
              {activeTab === "manpower" && (
                <ManpowerPanel editionId={edition.id} unit="SHOWCASE" onCountChange={setManpowerCount} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
