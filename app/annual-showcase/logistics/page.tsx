"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useActiveEdition } from "@/app/hooks/useActiveEdition";
import { useDepartmentAccess } from "@/app/hooks/useDepartmentAccess";
import ManpowerPanel from "@/app/components/annual-showcase/ManpowerPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface VenueSetupItem {
  id: string; item: string; location: string; pic: string;
  status: "CONFIRMED" | "PENDING" | "ISSUE"; notes: string;
}
interface BoothItem {
  id: string; name: string; size: string; assignedTo: string;
  status: "AVAILABLE" | "ASSIGNED" | "SETUP" | "DONE"; notes: string;
}
interface VenuePackItem {
  id: string; label: string; phase: "BEFORE" | "AFTER"; checked: boolean; notes: string;
}
interface EquipmentItem {
  id: string; item: string; quantity: string; supplier: string;
  deliveryDate: string; collectedBy: string;
  status: "PENDING" | "DELIVERED" | "COLLECTED" | "RETURNED";
}
interface ChecklistItem {
  id: string; label: string; phase: "PACKING" | "UNPACKING"; checked: boolean; notes: string;
}
interface ToDoItem {
  id: string; label: string; assignedTo: string; dueDate: string;
  priority: "HIGH" | "MEDIUM" | "LOW"; status: "PENDING" | "IN_PROGRESS" | "DONE"; notes: string;
}
interface LongLeadItem {
  id: string; item: string; leadWeeks: string; orderDate: string;
  expectedDelivery: string; supplier: string;
  status: "NOT_ORDERED" | "ORDERED" | "DELIVERED"; notes: string;
}
interface DailyTask {
  id: string; day: string; time: string; task: string;
  assignedTo: string; status: "PENDING" | "IN_PROGRESS" | "DONE"; notes: string;
}
interface AccomPerson { id: string; name: string; room: string; notes: string; }
interface AccomPlace {
  id: string; name: string; address: string; checkIn: string; checkOut: string;
  persons: AccomPerson[];
}
interface RegFlowStep {
  id: string; stepNum: number; title: string; description: string; pic: string; notes: string;
}
interface MealItem {
  id: string; type: "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK" | "OTHER";
  day: string; quantity: string; supplier: string;
  status: "PENDING" | "CONFIRMED" | "DELIVERED"; notes: string;
}

interface LogisticsData {
  venueSetup:    VenueSetupItem[];
  booths:        BoothItem[];
  venuePack:     VenuePackItem[];
  layoutNotes:   string;
  equipment:     EquipmentItem[];
  checklist:     ChecklistItem[];
  todo:          ToDoItem[];
  longLead:      LongLeadItem[];
  dailyTasks:    DailyTask[];
  accommodation: AccomPlace[];
  regFlow:       RegFlowStep[];
  meals:         MealItem[];
}

const EMPTY_DATA: LogisticsData = {
  venueSetup: [], booths: [], venuePack: [], layoutNotes: "",
  equipment: [], checklist: [], todo: [], longLead: [],
  dailyTasks: [], accommodation: [], regFlow: [], meals: [],
};

// ─── Badge helpers ─────────────────────────────────────────────────────────────

const VENUE_BADGE: Record<string, string>   = { CONFIRMED: "bg-green-100 text-green-700", PENDING: "bg-yellow-100 text-yellow-700", ISSUE: "bg-red-100 text-red-600" };
const EQUIP_BADGE: Record<string, string>   = { PENDING: "bg-yellow-100 text-yellow-700", DELIVERED: "bg-blue-100 text-blue-700", COLLECTED: "bg-green-100 text-green-700", RETURNED: "bg-gray-100 text-gray-600" };
const TODO_BADGE: Record<string, string>    = { PENDING: "bg-gray-100 text-gray-600", IN_PROGRESS: "bg-blue-100 text-blue-700", DONE: "bg-green-100 text-green-700" };
const PRIORITY_BADGE: Record<string, string>= { HIGH: "bg-red-100 text-red-700", MEDIUM: "bg-yellow-100 text-yellow-700", LOW: "bg-gray-100 text-gray-500" };
const LONGLEAD_BADGE: Record<string, string>= { NOT_ORDERED: "bg-gray-100 text-gray-500", ORDERED: "bg-blue-100 text-blue-700", DELIVERED: "bg-green-100 text-green-700" };
const MEAL_BADGE: Record<string, string>    = { PENDING: "bg-yellow-100 text-yellow-700", CONFIRMED: "bg-blue-100 text-blue-700", DELIVERED: "bg-green-100 text-green-700" };
const BOOTH_BADGE: Record<string, string>   = { AVAILABLE: "bg-gray-100 text-gray-500", ASSIGNED: "bg-blue-100 text-blue-700", SETUP: "bg-yellow-100 text-yellow-700", DONE: "bg-green-100 text-green-700" };

type LogisticsTab = "manpower" | "venue" | "equipment" | "checklist" | "todo" | "longlead" | "daily" | "accommodation" | "regflow" | "meals";

const TABS: { id: LogisticsTab; label: string }[] = [
  { id: "manpower",      label: "👥 Manpower" },
  { id: "venue",         label: "📍 Venue & Site" },
  { id: "equipment",     label: "📦 Loading Bay" },
  { id: "checklist",     label: "✅ Pack Checklist" },
  { id: "todo",          label: "📋 To-Do List" },
  { id: "longlead",      label: "⏳ Long Lead Items" },
  { id: "daily",         label: "📅 Daily Tasks" },
  { id: "accommodation", label: "🏠 Accommodation" },
  { id: "regflow",       label: "🔄 Registration Flow" },
  { id: "meals",         label: "🍽️ Meals & Refreshment" },
];

function newId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

// ─── Shared: simple add-row table ─────────────────────────────────────────────

function SectionHeader({ title, count, onAdd, adding }: { title: string; count?: number; onAdd: () => void; adding: boolean }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
      <h3 className="font-semibold text-gray-800">
        {title}
        {count !== undefined && count > 0 && <span className="ml-2 text-xs font-normal text-gray-400">{count} item{count !== 1 ? "s" : ""}</span>}
      </h3>
      {!adding && (
        <Button size="sm" onClick={onAdd} className="bg-cyan-600 hover:bg-cyan-700 text-xs">+ Add</Button>
      )}
    </div>
  );
}

// ─── Venue & Site Tab ──────────────────────────────────────────────────────────

function VenueTab({ data, onSetupChange, onBoothChange, onPackChange, onLayoutChange }: {
  data: { venueSetup: VenueSetupItem[]; booths: BoothItem[]; venuePack: VenuePackItem[]; layoutNotes: string };
  onSetupChange: (v: VenueSetupItem[]) => void;
  onBoothChange: (v: BoothItem[]) => void;
  onPackChange:  (v: VenuePackItem[]) => void;
  onLayoutChange:(v: string) => void;
}) {
  const [setupForm,    setSetupForm]    = useState<Partial<VenueSetupItem>>({});
  const [setupEditing, setSetupEditing] = useState<string | null>(null);
  const [boothForm,    setBoothForm]    = useState<Partial<BoothItem>>({});
  const [boothEditing, setBoothEditing] = useState<string | null>(null);
  const [packForm,     setPackForm]     = useState<Partial<VenuePackItem>>({});
  const [packEditing,  setPackEditing]  = useState<string | null>(null);
  const [layout,       setLayout]       = useState(data.layoutNotes);

  function saveSetup() {
    if (!setupForm.item?.trim()) { toast.error("Item is required"); return; }
    if (setupEditing === "new") {
      onSetupChange([...data.venueSetup, { id: newId(), item: "", location: "", pic: "", status: "PENDING", notes: "", ...setupForm } as VenueSetupItem]);
    } else if (setupEditing) {
      onSetupChange(data.venueSetup.map(v => v.id === setupEditing ? { ...v, ...setupForm } as VenueSetupItem : v));
    }
    setSetupEditing(null); setSetupForm({});
  }

  function saveBooth() {
    if (!boothForm.name?.trim()) { toast.error("Booth name is required"); return; }
    if (boothEditing === "new") {
      onBoothChange([...data.booths, { id: newId(), name: "", size: "", assignedTo: "", status: "AVAILABLE", notes: "", ...boothForm } as BoothItem]);
    } else if (boothEditing) {
      onBoothChange(data.booths.map(b => b.id === boothEditing ? { ...b, ...boothForm } as BoothItem : b));
    }
    setBoothEditing(null); setBoothForm({});
  }

  function savePack() {
    if (!packForm.label?.trim()) { toast.error("Label is required"); return; }
    if (!packForm.phase) { toast.error("Select Before or After event"); return; }
    if (packEditing === "new") {
      onPackChange([...data.venuePack, { id: newId(), label: "", phase: "BEFORE", checked: false, notes: "", ...packForm } as VenuePackItem]);
    } else if (packEditing) {
      onPackChange(data.venuePack.map(p => p.id === packEditing ? { ...p, ...packForm } as VenuePackItem : p));
    }
    setPackEditing(null); setPackForm({});
  }

  const beforePack = data.venuePack.filter(p => p.phase === "BEFORE");
  const afterPack  = data.venuePack.filter(p => p.phase === "AFTER");

  return (
    <div className="space-y-6">

      {/* ── Venue Setup ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <SectionHeader title="Venue Setup" count={data.venueSetup.length} onAdd={() => { setSetupEditing("new"); setSetupForm({}); }} adding={!!setupEditing} />
        {setupEditing && (
          <div className="p-4 bg-cyan-50/40 border-b border-cyan-100">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <Input placeholder="Item / Area *" value={setupForm.item ?? ""} onChange={e => setSetupForm(p => ({ ...p, item: e.target.value }))} />
              <Input placeholder="Location" value={setupForm.location ?? ""} onChange={e => setSetupForm(p => ({ ...p, location: e.target.value }))} />
              <Input placeholder="Person in Charge" value={setupForm.pic ?? ""} onChange={e => setSetupForm(p => ({ ...p, pic: e.target.value }))} />
              <Select value={setupForm.status ?? "PENDING"} onValueChange={v => setSetupForm(p => ({ ...p, status: v as VenueSetupItem["status"] }))}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                  <SelectItem value="ISSUE">Issue</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="Notes" value={setupForm.notes ?? ""} onChange={e => setSetupForm(p => ({ ...p, notes: e.target.value }))} className="sm:col-span-2" />
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={saveSetup} className="bg-cyan-600 hover:bg-cyan-700">Save</Button>
              <Button size="sm" variant="outline" onClick={() => { setSetupEditing(null); setSetupForm({}); }}>Cancel</Button>
            </div>
          </div>
        )}
        {data.venueSetup.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">No venue setup items yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {["Item / Area","Location","PIC","Status","Notes",""].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.venueSetup.map((v, idx) => (
                  <tr key={v.id} className={`border-b border-gray-50 ${idx % 2 ? "bg-gray-50/30" : ""}`}>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{v.item}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{v.location || "—"}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{v.pic || "—"}</td>
                    <td className="px-4 py-2.5"><span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${VENUE_BADGE[v.status]}`}>{v.status}</span></td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs">{v.notes || "—"}</td>
                    <td className="px-4 py-2.5 flex gap-2">
                      <button onClick={() => { setSetupEditing(v.id); setSetupForm({ ...v }); }} className="text-xs text-blue-500 hover:text-blue-700">Edit</button>
                      <button onClick={() => { if (window.confirm("Remove?")) onSetupChange(data.venueSetup.filter(x => x.id !== v.id)); }} className="text-xs text-red-400 hover:text-red-600">Del</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Layout Plan & Seating ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Layout Plan & Seating</h3>
          <p className="text-xs text-gray-400 mt-0.5">Describe the venue layout, seating arrangement, and key zones</p>
        </div>
        <div className="p-4">
          <textarea
            className="w-full min-h-[140px] text-sm border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-cyan-400 resize-y"
            placeholder="e.g. Stage at north end, audience seating for 300 (rows A–Z), VIP section rows A–C, registration table at entrance, media pit in front of stage..."
            value={layout}
            onChange={e => setLayout(e.target.value)}
            onBlur={() => onLayoutChange(layout)}
          />
        </div>
      </div>

      {/* ── Booths ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <SectionHeader title="Booths" count={data.booths.length} onAdd={() => { setBoothEditing("new"); setBoothForm({}); }} adding={!!boothEditing} />
        {boothEditing && (
          <div className="p-4 bg-cyan-50/40 border-b border-cyan-100">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <Input placeholder="Booth Name *" value={boothForm.name ?? ""} onChange={e => setBoothForm(p => ({ ...p, name: e.target.value }))} />
              <Input placeholder="Size / Dimensions" value={boothForm.size ?? ""} onChange={e => setBoothForm(p => ({ ...p, size: e.target.value }))} />
              <Input placeholder="Assigned To" value={boothForm.assignedTo ?? ""} onChange={e => setBoothForm(p => ({ ...p, assignedTo: e.target.value }))} />
              <Select value={boothForm.status ?? "AVAILABLE"} onValueChange={v => setBoothForm(p => ({ ...p, status: v as BoothItem["status"] }))}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AVAILABLE">Available</SelectItem>
                  <SelectItem value="ASSIGNED">Assigned</SelectItem>
                  <SelectItem value="SETUP">Being Setup</SelectItem>
                  <SelectItem value="DONE">Done</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="Notes" value={boothForm.notes ?? ""} onChange={e => setBoothForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={saveBooth} className="bg-cyan-600 hover:bg-cyan-700">Save</Button>
              <Button size="sm" variant="outline" onClick={() => { setBoothEditing(null); setBoothForm({}); }}>Cancel</Button>
            </div>
          </div>
        )}
        {data.booths.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">No booths added yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[450px]">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {["Name","Size","Assigned To","Status","Notes",""].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.booths.map((b, idx) => (
                  <tr key={b.id} className={`border-b border-gray-50 ${idx % 2 ? "bg-gray-50/30" : ""}`}>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{b.name}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{b.size || "—"}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{b.assignedTo || "—"}</td>
                    <td className="px-4 py-2.5"><span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${BOOTH_BADGE[b.status]}`}>{b.status}</span></td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs">{b.notes || "—"}</td>
                    <td className="px-4 py-2.5 flex gap-2">
                      <button onClick={() => { setBoothEditing(b.id); setBoothForm({ ...b }); }} className="text-xs text-blue-500 hover:text-blue-700">Edit</button>
                      <button onClick={() => { if (window.confirm("Remove?")) onBoothChange(data.booths.filter(x => x.id !== b.id)); }} className="text-xs text-red-400 hover:text-red-600">Del</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Before/After Event Pack ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <SectionHeader title="Event Pack Checklist" count={data.venuePack.length} onAdd={() => { setPackEditing("new"); setPackForm({ phase: "BEFORE" }); }} adding={!!packEditing} />
        {packEditing && (
          <div className="p-4 bg-cyan-50/40 border-b border-cyan-100">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <Input placeholder="Item label *" value={packForm.label ?? ""} onChange={e => setPackForm(p => ({ ...p, label: e.target.value }))} />
              <Select value={packForm.phase ?? "BEFORE"} onValueChange={v => setPackForm(p => ({ ...p, phase: v as VenuePackItem["phase"] }))}>
                <SelectTrigger><SelectValue placeholder="Phase" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BEFORE">Before Event</SelectItem>
                  <SelectItem value="AFTER">After Event</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="Notes" value={packForm.notes ?? ""} onChange={e => setPackForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={savePack} className="bg-cyan-600 hover:bg-cyan-700">Save</Button>
              <Button size="sm" variant="outline" onClick={() => { setPackEditing(null); setPackForm({}); }}>Cancel</Button>
            </div>
          </div>
        )}
        {data.venuePack.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">No pack checklist items yet</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {[{ label: "Before Event", phase: "BEFORE" as const, rows: beforePack }, { label: "After Event", phase: "AFTER" as const, rows: afterPack }].map(({ label, phase, rows }) => rows.length > 0 && (
              <div key={phase}>
                <div className="px-5 py-2 bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{label}</div>
                {rows.map(item => (
                  <div key={item.id} className={`flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50/60 ${item.checked ? "opacity-60" : ""}`}>
                    <input type="checkbox" checked={item.checked} onChange={() => onPackChange(data.venuePack.map(p => p.id === item.id ? { ...p, checked: !p.checked } : p))}
                      className="w-4 h-4 rounded accent-cyan-600 cursor-pointer shrink-0" />
                    <span className={`flex-1 text-sm text-gray-800 ${item.checked ? "line-through text-gray-400" : ""}`}>{item.label}</span>
                    {item.notes && <span className="text-xs text-gray-400 hidden md:block truncate max-w-[200px]">{item.notes}</span>}
                    <button onClick={() => { if (window.confirm("Remove?")) onPackChange(data.venuePack.filter(p => p.id !== item.id)); }} className="text-xs text-red-400 hover:text-red-600 shrink-0">Del</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Equipment Tab ─────────────────────────────────────────────────────────────

function EquipmentTab({ equipment, onChange }: { equipment: EquipmentItem[]; onChange: (e: EquipmentItem[]) => void }) {
  const [form, setForm] = useState<Partial<EquipmentItem>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  function save() {
    if (!form.item?.trim()) { toast.error("Item name is required"); return; }
    if (editingId === "new") {
      onChange([...equipment, { id: newId(), item: "", quantity: "", supplier: "", deliveryDate: "", collectedBy: "", status: "PENDING", ...form } as EquipmentItem]);
    } else if (editingId) {
      onChange(equipment.map(e => e.id === editingId ? { ...e, ...form } as EquipmentItem : e));
    }
    setEditingId(null); setForm({});
  }
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <SectionHeader title="Loading Bay & Equipment" count={equipment.length} onAdd={() => { setEditingId("new"); setForm({}); }} adding={!!editingId} />
      {editingId && (
        <div className="p-4 bg-cyan-50/40 border-b border-cyan-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <Input placeholder="Item Name *" value={form.item ?? ""} onChange={e => setForm(p => ({ ...p, item: e.target.value }))} />
            <Input placeholder="Quantity" value={form.quantity ?? ""} onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} />
            <Input placeholder="Supplier" value={form.supplier ?? ""} onChange={e => setForm(p => ({ ...p, supplier: e.target.value }))} />
            <Input placeholder="Delivery Date" value={form.deliveryDate ?? ""} onChange={e => setForm(p => ({ ...p, deliveryDate: e.target.value }))} />
            <Input placeholder="Collected By" value={form.collectedBy ?? ""} onChange={e => setForm(p => ({ ...p, collectedBy: e.target.value }))} />
            <Select value={form.status ?? "PENDING"} onValueChange={v => setForm(p => ({ ...p, status: v as EquipmentItem["status"] }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="DELIVERED">Delivered</SelectItem>
                <SelectItem value="COLLECTED">Collected</SelectItem>
                <SelectItem value="RETURNED">Returned</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={save} className="bg-cyan-600 hover:bg-cyan-700">Save</Button>
            <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setForm({}); }}>Cancel</Button>
          </div>
        </div>
      )}
      {equipment.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">No equipment items yet</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>{["Item","Qty","Supplier","Delivery Date","Collected By","Status",""].map(h => <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">{h}</th>)}</tr>
            </thead>
            <tbody>
              {equipment.map((e, idx) => (
                <tr key={e.id} className={`border-b border-gray-50 ${idx % 2 ? "bg-gray-50/30" : ""}`}>
                  <td className="px-4 py-2.5 font-medium text-gray-800">{e.item}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{e.quantity || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{e.supplier || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{e.deliveryDate || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{e.collectedBy || "—"}</td>
                  <td className="px-4 py-2.5"><span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${EQUIP_BADGE[e.status]}`}>{e.status}</span></td>
                  <td className="px-4 py-2.5 flex gap-2">
                    <button onClick={() => { setEditingId(e.id); setForm({ ...e }); }} className="text-xs text-blue-500 hover:text-blue-700">Edit</button>
                    <button onClick={() => { if (window.confirm("Remove?")) onChange(equipment.filter(x => x.id !== e.id)); }} className="text-xs text-red-400 hover:text-red-600">Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Pack Checklist Tab ────────────────────────────────────────────────────────

function ChecklistPanel({
  phase, label: panelLabel, icon, accentClass, items, onChange,
}: {
  phase: "PACKING" | "UNPACKING";
  label: string;
  icon: string;
  accentClass: string;
  items: ChecklistItem[];
  onChange: (v: ChecklistItem[]) => void;
}) {
  const [inputLabel, setInputLabel] = useState("");
  const [inputNotes, setInputNotes] = useState("");
  const [adding, setAdding] = useState(false);

  const mine = items.filter(i => i.phase === phase);
  const done = mine.filter(i => i.checked).length;

  function add() {
    if (!inputLabel.trim()) { toast.error("Label is required"); return; }
    onChange([...items, { id: newId(), label: inputLabel.trim(), phase, notes: inputNotes.trim(), checked: false }]);
    setInputLabel(""); setInputNotes(""); setAdding(false);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex-1 min-w-0">
      {/* Header */}
      <div className={`flex items-center justify-between px-5 py-3.5 border-b border-gray-100 ${accentClass}`}>
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <h3 className="font-semibold text-gray-800">{panelLabel}</h3>
          {mine.length > 0 && (
            <span className="text-xs font-normal text-gray-400">{done}/{mine.length} done</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {mine.length > 0 && (
            <div className="w-20 bg-gray-200 rounded-full h-1.5 overflow-hidden">
              <div className="h-full bg-cyan-500 rounded-full transition-all" style={{ width: `${Math.round((done / mine.length) * 100)}%` }} />
            </div>
          )}
          {!adding && (
            <Button size="sm" onClick={() => setAdding(true)} className="bg-cyan-600 hover:bg-cyan-700 text-xs">+ Add</Button>
          )}
        </div>
      </div>

      {/* Add row */}
      {adding && (
        <div className="p-3 bg-cyan-50/40 border-b border-cyan-100 flex flex-wrap gap-2 items-center">
          <Input
            placeholder="Item label *"
            value={inputLabel}
            onChange={e => setInputLabel(e.target.value)}
            onKeyDown={e => e.key === "Enter" && add()}
            className="flex-1 min-w-[140px] text-sm"
            autoFocus
          />
          <Input
            placeholder="Notes"
            value={inputNotes}
            onChange={e => setInputNotes(e.target.value)}
            className="flex-1 min-w-[100px] text-sm"
          />
          <Button size="sm" onClick={add} className="bg-cyan-600 hover:bg-cyan-700 shrink-0">Save</Button>
          <Button size="sm" variant="outline" onClick={() => { setAdding(false); setInputLabel(""); setInputNotes(""); }} className="shrink-0">Cancel</Button>
        </div>
      )}

      {/* List */}
      {mine.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">No items yet</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {mine.map(item => (
            <div key={item.id} className={`flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50/60 transition-colors ${item.checked ? "opacity-55" : ""}`}>
              <input
                type="checkbox"
                checked={item.checked}
                onChange={() => onChange(items.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i))}
                className="w-4 h-4 rounded accent-cyan-600 cursor-pointer shrink-0"
              />
              <span className={`flex-1 text-sm text-gray-800 ${item.checked ? "line-through text-gray-400" : ""}`}>{item.label}</span>
              {item.notes && <span className="text-xs text-gray-400 hidden sm:block truncate max-w-[180px]">{item.notes}</span>}
              <button
                onClick={() => { if (window.confirm("Remove?")) onChange(items.filter(i => i.id !== item.id)); }}
                className="text-xs text-red-400 hover:text-red-600 shrink-0"
              >Del</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChecklistTab({ items, onChange }: { items: ChecklistItem[]; onChange: (v: ChecklistItem[]) => void }) {
  const done  = items.filter(i => i.checked).length;

  return (
    <div className="space-y-4">
      {items.length > 0 && (
        <div className="flex items-center gap-3 px-1">
          <span className="text-sm text-gray-500 font-medium">Overall: {done}/{items.length} done</span>
          <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
            <div className="h-full bg-cyan-500 rounded-full transition-all" style={{ width: `${Math.round((done / items.length) * 100)}%` }} />
          </div>
          <span className="text-sm font-semibold text-cyan-700">{Math.round((done / items.length) * 100)}%</span>
        </div>
      )}
      <div className="flex flex-col lg:flex-row gap-4">
        <ChecklistPanel
          phase="PACKING"
          label="Packing"
          icon="📦"
          accentClass="bg-amber-50/40"
          items={items}
          onChange={onChange}
        />
        <ChecklistPanel
          phase="UNPACKING"
          label="Unpacking"
          icon="📤"
          accentClass="bg-blue-50/40"
          items={items}
          onChange={onChange}
        />
      </div>
    </div>
  );
}

// ─── To-Do List Tab ────────────────────────────────────────────────────────────

function TodoTab({ items, onChange }: { items: ToDoItem[]; onChange: (v: ToDoItem[]) => void }) {
  const [form, setForm] = useState<Partial<ToDoItem>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  function save() {
    if (!form.label?.trim()) { toast.error("Task is required"); return; }
    if (editingId === "new") {
      onChange([...items, { id: newId(), label: "", assignedTo: "", dueDate: "", priority: "MEDIUM", status: "PENDING", notes: "", ...form } as ToDoItem]);
    } else if (editingId) {
      onChange(items.map(i => i.id === editingId ? { ...i, ...form } as ToDoItem : i));
    }
    setEditingId(null); setForm({});
  }
  const done = items.filter(i => i.status === "DONE").length;
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
        <h3 className="font-semibold text-gray-800">To-Do List {items.length > 0 && <span className="ml-2 text-xs font-normal text-gray-400">{done}/{items.length} done</span>}</h3>
        {!editingId && <Button size="sm" onClick={() => { setEditingId("new"); setForm({ priority: "MEDIUM", status: "PENDING" }); }} className="bg-cyan-600 hover:bg-cyan-700 text-xs">+ Add Task</Button>}
      </div>
      {editingId && (
        <div className="p-4 bg-cyan-50/40 border-b border-cyan-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <Input placeholder="Task *" value={form.label ?? ""} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} className="sm:col-span-2 md:col-span-1" />
            <Input placeholder="Assigned To" value={form.assignedTo ?? ""} onChange={e => setForm(p => ({ ...p, assignedTo: e.target.value }))} />
            <Input placeholder="Due Date" value={form.dueDate ?? ""} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} />
            <Select value={form.priority ?? "MEDIUM"} onValueChange={v => setForm(p => ({ ...p, priority: v as ToDoItem["priority"] }))}>
              <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={form.status ?? "PENDING"} onValueChange={v => setForm(p => ({ ...p, status: v as ToDoItem["status"] }))}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                <SelectItem value="DONE">Done</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Notes" value={form.notes ?? ""} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={save} className="bg-cyan-600 hover:bg-cyan-700">Save</Button>
            <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setForm({}); }}>Cancel</Button>
          </div>
        </div>
      )}
      {items.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">No tasks yet</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {items.map(item => (
            <div key={item.id} className={`flex items-start gap-3 px-5 py-3 hover:bg-gray-50/60 ${item.status === "DONE" ? "opacity-60" : ""}`}>
              <input type="checkbox" checked={item.status === "DONE"}
                onChange={() => onChange(items.map(i => i.id === item.id ? { ...i, status: i.status === "DONE" ? "PENDING" : "DONE" } : i))}
                className="w-4 h-4 rounded accent-cyan-600 cursor-pointer shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium text-gray-800 ${item.status === "DONE" ? "line-through text-gray-400" : ""}`}>{item.label}</p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${PRIORITY_BADGE[item.priority]}`}>{item.priority}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${TODO_BADGE[item.status]}`}>{item.status.replace("_", " ")}</span>
                  {item.assignedTo && <span className="text-[10px] text-gray-400">👤 {item.assignedTo}</span>}
                  {item.dueDate && <span className="text-[10px] text-gray-400">📅 {item.dueDate}</span>}
                  {item.notes && <span className="text-[10px] text-gray-400 truncate max-w-[200px]">{item.notes}</span>}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => { setEditingId(item.id); setForm({ ...item }); }} className="text-xs text-blue-500 hover:text-blue-700">Edit</button>
                <button onClick={() => { if (window.confirm("Remove?")) onChange(items.filter(i => i.id !== item.id)); }} className="text-xs text-red-400 hover:text-red-600">Del</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Long Lead Items Tab ───────────────────────────────────────────────────────

function LongLeadTab({ items, onChange }: { items: LongLeadItem[]; onChange: (v: LongLeadItem[]) => void }) {
  const [form, setForm] = useState<Partial<LongLeadItem>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  function save() {
    if (!form.item?.trim()) { toast.error("Item is required"); return; }
    if (editingId === "new") {
      onChange([...items, { id: newId(), item: "", leadWeeks: "", orderDate: "", expectedDelivery: "", supplier: "", status: "NOT_ORDERED", notes: "", ...form } as LongLeadItem]);
    } else if (editingId) {
      onChange(items.map(i => i.id === editingId ? { ...i, ...form } as LongLeadItem : i));
    }
    setEditingId(null); setForm({});
  }
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <SectionHeader title="Long Lead Items" count={items.length} onAdd={() => { setEditingId("new"); setForm({ status: "NOT_ORDERED" }); }} adding={!!editingId} />
      {editingId && (
        <div className="p-4 bg-cyan-50/40 border-b border-cyan-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <Input placeholder="Item *" value={form.item ?? ""} onChange={e => setForm(p => ({ ...p, item: e.target.value }))} />
            <Input placeholder="Lead Time (weeks)" value={form.leadWeeks ?? ""} onChange={e => setForm(p => ({ ...p, leadWeeks: e.target.value }))} />
            <Input placeholder="Supplier" value={form.supplier ?? ""} onChange={e => setForm(p => ({ ...p, supplier: e.target.value }))} />
            <Input placeholder="Order Date" value={form.orderDate ?? ""} onChange={e => setForm(p => ({ ...p, orderDate: e.target.value }))} />
            <Input placeholder="Expected Delivery" value={form.expectedDelivery ?? ""} onChange={e => setForm(p => ({ ...p, expectedDelivery: e.target.value }))} />
            <Select value={form.status ?? "NOT_ORDERED"} onValueChange={v => setForm(p => ({ ...p, status: v as LongLeadItem["status"] }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NOT_ORDERED">Not Ordered</SelectItem>
                <SelectItem value="ORDERED">Ordered</SelectItem>
                <SelectItem value="DELIVERED">Delivered</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Notes" value={form.notes ?? ""} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={save} className="bg-cyan-600 hover:bg-cyan-700">Save</Button>
            <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setForm({}); }}>Cancel</Button>
          </div>
        </div>
      )}
      {items.length === 0 ? <div className="py-8 text-center text-sm text-gray-400">No long lead items yet</div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>{["Item","Lead (wks)","Supplier","Order Date","Exp. Delivery","Status","Notes",""].map(h => <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">{h}</th>)}</tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.id} className={`border-b border-gray-50 ${idx % 2 ? "bg-gray-50/30" : ""}`}>
                  <td className="px-4 py-2.5 font-medium text-gray-800">{item.item}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{item.leadWeeks || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{item.supplier || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{item.orderDate || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{item.expectedDelivery || "—"}</td>
                  <td className="px-4 py-2.5"><span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${LONGLEAD_BADGE[item.status]}`}>{item.status.replace("_"," ")}</span></td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{item.notes || "—"}</td>
                  <td className="px-4 py-2.5 flex gap-2">
                    <button onClick={() => { setEditingId(item.id); setForm({ ...item }); }} className="text-xs text-blue-500 hover:text-blue-700">Edit</button>
                    <button onClick={() => { if (window.confirm("Remove?")) onChange(items.filter(i => i.id !== item.id)); }} className="text-xs text-red-400 hover:text-red-600">Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Daily Tasks Tab ───────────────────────────────────────────────────────────

function DailyTaskTab({ items, onChange }: { items: DailyTask[]; onChange: (v: DailyTask[]) => void }) {
  const [form, setForm] = useState<Partial<DailyTask>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  function save() {
    if (!form.task?.trim()) { toast.error("Task is required"); return; }
    if (editingId === "new") {
      onChange([...items, { id: newId(), day: "", time: "", task: "", assignedTo: "", status: "PENDING", notes: "", ...form } as DailyTask]);
    } else if (editingId) {
      onChange(items.map(i => i.id === editingId ? { ...i, ...form } as DailyTask : i));
    }
    setEditingId(null); setForm({});
  }
  const days = Array.from(new Set(items.map(i => i.day).filter(Boolean)));
  const groups = days.length > 0
    ? days.map(d => ({ day: d, rows: items.filter(i => i.day === d) })).concat(items.filter(i => !i.day).length ? [{ day: "", rows: items.filter(i => !i.day) }] : [])
    : [{ day: "", rows: items }];
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <SectionHeader title="Daily Tasks" count={items.length} onAdd={() => { setEditingId("new"); setForm({ status: "PENDING" }); }} adding={!!editingId} />
      {editingId && (
        <div className="p-4 bg-cyan-50/40 border-b border-cyan-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <Input placeholder="Day (e.g. Day 1, Setup Day)" value={form.day ?? ""} onChange={e => setForm(p => ({ ...p, day: e.target.value }))} />
            <Input placeholder="Time (e.g. 08:00)" value={form.time ?? ""} onChange={e => setForm(p => ({ ...p, time: e.target.value }))} />
            <Input placeholder="Task *" value={form.task ?? ""} onChange={e => setForm(p => ({ ...p, task: e.target.value }))} />
            <Input placeholder="Assigned To" value={form.assignedTo ?? ""} onChange={e => setForm(p => ({ ...p, assignedTo: e.target.value }))} />
            <Select value={form.status ?? "PENDING"} onValueChange={v => setForm(p => ({ ...p, status: v as DailyTask["status"] }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                <SelectItem value="DONE">Done</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Notes" value={form.notes ?? ""} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={save} className="bg-cyan-600 hover:bg-cyan-700">Save</Button>
            <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setForm({}); }}>Cancel</Button>
          </div>
        </div>
      )}
      {items.length === 0 ? <div className="py-8 text-center text-sm text-gray-400">No daily tasks yet</div> : (
        <div className="divide-y divide-gray-50">
          {groups.map(({ day, rows }) => (
            <div key={day || "__none"}>
              {day && <div className="px-5 py-2 bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{day}</div>}
              {rows.map((item, idx) => (
                <div key={item.id} className={`flex items-start gap-3 px-5 py-2.5 hover:bg-gray-50/60 ${idx % 2 ? "bg-gray-50/20" : ""}`}>
                  <span className="text-xs text-gray-400 w-12 shrink-0 mt-0.5">{item.time || "—"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{item.task}</p>
                    <div className="flex flex-wrap gap-1.5 mt-0.5">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${TODO_BADGE[item.status]}`}>{item.status.replace("_"," ")}</span>
                      {item.assignedTo && <span className="text-[10px] text-gray-400">👤 {item.assignedTo}</span>}
                      {item.notes && <span className="text-[10px] text-gray-400 truncate max-w-[200px]">{item.notes}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => { setEditingId(item.id); setForm({ ...item }); }} className="text-xs text-blue-500 hover:text-blue-700">Edit</button>
                    <button onClick={() => { if (window.confirm("Remove?")) onChange(items.filter(i => i.id !== item.id)); }} className="text-xs text-red-400 hover:text-red-600">Del</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Accommodation Tab ─────────────────────────────────────────────────────────

function AccommodationTab({ places, onChange }: { places: AccomPlace[]; onChange: (v: AccomPlace[]) => void }) {
  const [addingPlace, setAddingPlace] = useState(false);
  const [placeForm, setPlaceForm] = useState<Partial<AccomPlace>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [personForms, setPersonForms] = useState<Record<string, Partial<AccomPerson>>>({});

  function savePlace() {
    if (!placeForm.name?.trim()) { toast.error("Place name is required"); return; }
    onChange([...places, { id: newId(), name: "", address: "", checkIn: "", checkOut: "", persons: [], ...placeForm } as AccomPlace]);
    setAddingPlace(false); setPlaceForm({});
  }
  function addPerson(placeId: string) {
    const pf = personForms[placeId] ?? {};
    if (!pf.name?.trim()) { toast.error("Person name is required"); return; }
    onChange(places.map(p => p.id === placeId ? { ...p, persons: [...p.persons, { id: newId(), name: "", room: "", notes: "", ...pf } as AccomPerson] } : p));
    setPersonForms(prev => ({ ...prev, [placeId]: {} }));
  }
  return (
    <div className="space-y-4">
      {!addingPlace && (
        <Button size="sm" onClick={() => setAddingPlace(true)} className="bg-cyan-600 hover:bg-cyan-700 text-xs">+ Add Accommodation</Button>
      )}
      {addingPlace && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700">New Accommodation</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input placeholder="Hotel / Venue Name *" value={placeForm.name ?? ""} onChange={e => setPlaceForm(p => ({ ...p, name: e.target.value }))} />
            <Input placeholder="Address" value={placeForm.address ?? ""} onChange={e => setPlaceForm(p => ({ ...p, address: e.target.value }))} />
            <Input placeholder="Check-In Date" value={placeForm.checkIn ?? ""} onChange={e => setPlaceForm(p => ({ ...p, checkIn: e.target.value }))} />
            <Input placeholder="Check-Out Date" value={placeForm.checkOut ?? ""} onChange={e => setPlaceForm(p => ({ ...p, checkOut: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={savePlace} className="bg-cyan-600 hover:bg-cyan-700">Save</Button>
            <Button size="sm" variant="outline" onClick={() => { setAddingPlace(false); setPlaceForm({}); }}>Cancel</Button>
          </div>
        </div>
      )}
      {places.length === 0 && !addingPlace && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-8 text-center text-sm text-gray-400">No accommodation added yet</div>
      )}
      {places.map(place => (
        <div key={place.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 cursor-pointer" onClick={() => setExpandedId(expandedId === place.id ? null : place.id)}>
            <div>
              <p className="font-semibold text-gray-800">{place.name}</p>
              <p className="text-xs text-gray-400">{place.address || "No address"} · {place.checkIn || "?"} → {place.checkOut || "?"} · {place.persons.length} person{place.persons.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={e => { e.stopPropagation(); if (window.confirm("Remove this accommodation and all its persons?")) onChange(places.filter(p => p.id !== place.id)); }}
                className="text-xs text-red-400 hover:text-red-600">Remove</button>
              <span className="text-gray-400 text-sm">{expandedId === place.id ? "▲" : "▼"}</span>
            </div>
          </div>
          {expandedId === place.id && (
            <div className="p-4 space-y-3">
              {/* Add person row */}
              <div className="flex flex-wrap gap-2 items-center">
                <Input placeholder="Person Name *" value={personForms[place.id]?.name ?? ""} onChange={e => setPersonForms(prev => ({ ...prev, [place.id]: { ...prev[place.id], name: e.target.value } }))} className="flex-1 min-w-[140px]" />
                <Input placeholder="Room No." value={personForms[place.id]?.room ?? ""} onChange={e => setPersonForms(prev => ({ ...prev, [place.id]: { ...prev[place.id], room: e.target.value } }))} className="w-28" />
                <Input placeholder="Notes" value={personForms[place.id]?.notes ?? ""} onChange={e => setPersonForms(prev => ({ ...prev, [place.id]: { ...prev[place.id], notes: e.target.value } }))} className="flex-1 min-w-[120px]" />
                <Button size="sm" onClick={() => addPerson(place.id)} className="bg-cyan-600 hover:bg-cyan-700 shrink-0">+ Person</Button>
              </div>
              {place.persons.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-2">No persons added yet</p>
              ) : (
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">#</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Name</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Room</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Notes</th>
                        <th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {place.persons.map((person, idx) => (
                        <tr key={person.id} className={`border-b border-gray-50 ${idx % 2 ? "bg-gray-50/30" : ""}`}>
                          <td className="px-4 py-2 text-gray-400 text-xs">{idx + 1}</td>
                          <td className="px-4 py-2 font-medium text-gray-800">{person.name}</td>
                          <td className="px-4 py-2 text-gray-500 text-xs">{person.room || "—"}</td>
                          <td className="px-4 py-2 text-gray-400 text-xs">{person.notes || "—"}</td>
                          <td className="px-4 py-2">
                            <button onClick={() => onChange(places.map(p => p.id === place.id ? { ...p, persons: p.persons.filter(x => x.id !== person.id) } : p))}
                              className="text-xs text-red-400 hover:text-red-600">Remove</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Registration Flow Tab ─────────────────────────────────────────────────────

function RegFlowTab({ steps, onChange }: { steps: RegFlowStep[]; onChange: (v: RegFlowStep[]) => void }) {
  const [form, setForm] = useState<Partial<RegFlowStep>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  function save() {
    if (!form.title?.trim()) { toast.error("Title is required"); return; }
    const nextNum = steps.length > 0 ? Math.max(...steps.map(s => s.stepNum)) + 1 : 1;
    if (editingId === "new") {
      onChange([...steps, { id: newId(), stepNum: nextNum, title: "", description: "", pic: "", notes: "", ...form } as RegFlowStep]);
    } else if (editingId) {
      onChange(steps.map(s => s.id === editingId ? { ...s, ...form } as RegFlowStep : s));
    }
    setEditingId(null); setForm({});
  }
  const sorted = [...steps].sort((a, b) => a.stepNum - b.stepNum);
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <SectionHeader title="Registration Flow" count={steps.length} onAdd={() => { setEditingId("new"); setForm({}); }} adding={!!editingId} />
      {editingId && (
        <div className="p-4 bg-cyan-50/40 border-b border-cyan-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <Input placeholder="Step No." type="number" value={form.stepNum ?? ""} onChange={e => setForm(p => ({ ...p, stepNum: Number(e.target.value) }))} className="w-24" />
            <Input placeholder="Step Title *" value={form.title ?? ""} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className="sm:col-span-1" />
            <Input placeholder="Person in Charge" value={form.pic ?? ""} onChange={e => setForm(p => ({ ...p, pic: e.target.value }))} />
            <Input placeholder="Description" value={form.description ?? ""} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="sm:col-span-2" />
            <Input placeholder="Notes" value={form.notes ?? ""} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={save} className="bg-cyan-600 hover:bg-cyan-700">Save</Button>
            <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setForm({}); }}>Cancel</Button>
          </div>
        </div>
      )}
      {steps.length === 0 ? <div className="py-8 text-center text-sm text-gray-400">No steps defined yet</div> : (
        <div className="divide-y divide-gray-50">
          {sorted.map(step => (
            <div key={step.id} className="flex items-start gap-4 px-5 py-3.5 hover:bg-gray-50/60">
              <div className="w-9 h-9 rounded-full bg-cyan-600 text-white text-sm font-bold flex items-center justify-center shrink-0">{step.stepNum}</div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800">{step.title}</p>
                {step.description && <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>}
                <div className="flex flex-wrap gap-2 mt-1">
                  {step.pic  && <span className="text-[10px] text-gray-400">👤 {step.pic}</span>}
                  {step.notes && <span className="text-[10px] text-gray-400">{step.notes}</span>}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => { setEditingId(step.id); setForm({ ...step }); }} className="text-xs text-blue-500 hover:text-blue-700">Edit</button>
                <button onClick={() => { if (window.confirm("Remove?")) onChange(steps.filter(s => s.id !== step.id)); }} className="text-xs text-red-400 hover:text-red-600">Del</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Meals & Refreshment Tab ───────────────────────────────────────────────────

function MealsTab({ items, onChange }: { items: MealItem[]; onChange: (v: MealItem[]) => void }) {
  const [form, setForm] = useState<Partial<MealItem>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  function save() {
    if (!form.type) { toast.error("Meal type is required"); return; }
    if (editingId === "new") {
      onChange([...items, { id: newId(), type: "BREAKFAST", day: "", quantity: "", supplier: "", status: "PENDING", notes: "", ...form } as MealItem]);
    } else if (editingId) {
      onChange(items.map(i => i.id === editingId ? { ...i, ...form } as MealItem : i));
    }
    setEditingId(null); setForm({});
  }
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <SectionHeader title="Meals & Refreshment" count={items.length} onAdd={() => { setEditingId("new"); setForm({ type: "BREAKFAST", status: "PENDING" }); }} adding={!!editingId} />
      {editingId && (
        <div className="p-4 bg-cyan-50/40 border-b border-cyan-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <Select value={form.type ?? "BREAKFAST"} onValueChange={v => setForm(p => ({ ...p, type: v as MealItem["type"] }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BREAKFAST">Breakfast</SelectItem>
                <SelectItem value="LUNCH">Lunch</SelectItem>
                <SelectItem value="DINNER">Dinner</SelectItem>
                <SelectItem value="SNACK">Snack / Tea Break</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Day / Date" value={form.day ?? ""} onChange={e => setForm(p => ({ ...p, day: e.target.value }))} />
            <Input placeholder="Quantity / Pax" value={form.quantity ?? ""} onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} />
            <Input placeholder="Supplier / Caterer" value={form.supplier ?? ""} onChange={e => setForm(p => ({ ...p, supplier: e.target.value }))} />
            <Select value={form.status ?? "PENDING"} onValueChange={v => setForm(p => ({ ...p, status: v as MealItem["status"] }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                <SelectItem value="DELIVERED">Delivered</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Notes" value={form.notes ?? ""} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={save} className="bg-cyan-600 hover:bg-cyan-700">Save</Button>
            <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setForm({}); }}>Cancel</Button>
          </div>
        </div>
      )}
      {items.length === 0 ? <div className="py-8 text-center text-sm text-gray-400">No meals planned yet</div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>{["Type","Day","Qty / Pax","Supplier","Status","Notes",""].map(h => <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">{h}</th>)}</tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.id} className={`border-b border-gray-50 ${idx % 2 ? "bg-gray-50/30" : ""}`}>
                  <td className="px-4 py-2.5 font-medium text-gray-800">{item.type}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{item.day || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{item.quantity || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{item.supplier || "—"}</td>
                  <td className="px-4 py-2.5"><span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${MEAL_BADGE[item.status]}`}>{item.status}</span></td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{item.notes || "—"}</td>
                  <td className="px-4 py-2.5 flex gap-2">
                    <button onClick={() => { setEditingId(item.id); setForm({ ...item }); }} className="text-xs text-blue-500 hover:text-blue-700">Edit</button>
                    <button onClick={() => { if (window.confirm("Remove?")) onChange(items.filter(i => i.id !== item.id)); }} className="text-xs text-red-400 hover:text-red-600">Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function LogisticsPage() {
  const router = useRouter();
  const { allowed } = useDepartmentAccess("LOGISTICS");
  const { edition: rawEdition, isLoading } = useActiveEdition();
  const edition = rawEdition as { id: string; name: string; logisticsData?: unknown } | null;

  const [activeTab,     setActiveTab]     = useState<LogisticsTab>("manpower");
  const [manpowerCount, setManpowerCount] = useState(0);
  const [saving,        setSaving]        = useState(false);
  const [data,          setData]          = useState<LogisticsData>(EMPTY_DATA);

  useEffect(() => {
    if (!edition) return;
    const raw = edition.logisticsData as Partial<LogisticsData> | undefined;
    setData({ ...EMPTY_DATA, ...raw });
  }, [edition?.id]);

  const save = useCallback(async (updated: LogisticsData) => {
    if (!edition) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${edition.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logisticsData: updated }),
      });
      if (!res.ok) throw new Error();
      toast.success("Saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }, [edition]);

  function update(patch: Partial<LogisticsData>) {
    const next = { ...data, ...patch };
    setData(next);
    save(next);
  }

  if (!allowed) return null;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64 rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  }

  if (!edition) {
    return (
      <div className="relative p-6 flex flex-col items-center justify-center min-h-[400px] gap-3">
        <button onClick={() => router.push("/annual-showcase/editions")} className="absolute top-4 left-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">← Back to Editions</button>
        <span className="text-5xl">🚛</span>
        <h2 className="text-xl font-semibold text-gray-800">No edition selected</h2>
        <p className="text-sm text-gray-500 text-center max-w-sm">Select an active edition using the edition switcher in the header.</p>
      </div>
    );
  }

  const tabs = TABS.map(t => t.id === "manpower" && manpowerCount > 0 ? { ...t, label: `👥 Manpower (${manpowerCount})` } : t);

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <button onClick={() => router.push("/annual-showcase/editions")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">← Back to Editions</button>

      <div className="flex items-center gap-3">
        <span className="text-3xl sm:text-4xl">🚛</span>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Logistics</h1>
          <p className="text-sm text-gray-500">{edition.name}</p>
        </div>
        {saving && <span className="text-xs text-gray-400 ml-auto">Saving…</span>}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id ? "text-cyan-700 border-b-2 border-cyan-600 bg-cyan-50/30" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
        <div className="p-3 sm:p-5">
          {activeTab === "manpower" && <ManpowerPanel editionId={edition.id} unit="LOGISTICS" onCountChange={setManpowerCount} />}
          {activeTab === "venue" && (
            <VenueTab
              data={{ venueSetup: data.venueSetup, booths: data.booths, venuePack: data.venuePack, layoutNotes: data.layoutNotes }}
              onSetupChange={v  => update({ venueSetup: v })}
              onBoothChange={v  => update({ booths: v })}
              onPackChange={v   => update({ venuePack: v })}
              onLayoutChange={v => update({ layoutNotes: v })}
            />
          )}
          {activeTab === "equipment"     && <EquipmentTab     equipment={data.equipment} onChange={v => update({ equipment: v })} />}
          {activeTab === "checklist"     && <ChecklistTab     items={data.checklist}     onChange={v => update({ checklist: v })} />}
          {activeTab === "todo"          && <TodoTab          items={data.todo}           onChange={v => update({ todo: v })} />}
          {activeTab === "longlead"      && <LongLeadTab      items={data.longLead}      onChange={v => update({ longLead: v })} />}
          {activeTab === "daily"         && <DailyTaskTab     items={data.dailyTasks}    onChange={v => update({ dailyTasks: v })} />}
          {activeTab === "accommodation" && <AccommodationTab places={data.accommodation} onChange={v => update({ accommodation: v })} />}
          {activeTab === "regflow"       && <RegFlowTab       steps={data.regFlow}       onChange={v => update({ regFlow: v })} />}
          {activeTab === "meals"         && <MealsTab         items={data.meals}         onChange={v => update({ meals: v })} />}
        </div>
      </div>
    </div>
  );
}
