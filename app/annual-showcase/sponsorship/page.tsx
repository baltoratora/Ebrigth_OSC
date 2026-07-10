"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
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

interface OutreachEntry {
  id: string;
  sponsorId: string;
  type: string;
  date: string;
  outcome: string | null;
  followUpDate: string | null;
  createdAt: string;
}

interface Sponsor {
  id: string;
  editionId: string;
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  packageType: string | null;
  amount: number;
  pipelineStatus: string;
  notes: string | null;
  isVVIP: boolean;
  outreachLog: OutreachEntry[];
  createdAt: string;
}

interface PackageTier {
  id: string;
  name: string;
  price: string;
  benefits: string[];
  color: string;
}

type ActiveTab = "pipeline" | "vvip" | "packages" | "manpower";

// ─── Constants ─────────────────────────────────────────────────────────────────

const KANBAN_COLS: { id: string; label: string; color: string; bg: string }[] = [
  { id: "LEAD",       label: "Lead",        color: "text-gray-600",   bg: "bg-gray-50" },
  { id: "CONTACTED",  label: "Contacted",   color: "text-blue-600",   bg: "bg-blue-50" },
  { id: "MEETING",    label: "Meeting",     color: "text-yellow-600", bg: "bg-yellow-50" },
  { id: "MOU_SIGNED", label: "MOU Signed",  color: "text-orange-600", bg: "bg-orange-50" },
  { id: "CONFIRMED",  label: "Confirmed",   color: "text-green-600",  bg: "bg-green-50" },
  { id: "FULFILLED",  label: "Fulfilled",   color: "text-purple-600", bg: "bg-purple-50" },
];

const PACKAGE_TIERS: PackageTier[] = [
  { id: "title",  name: "Title Sponsor",  price: "", benefits: ["Logo on all materials", "Keynote slot", "VIP seating", "Social media feature"], color: "text-yellow-600 bg-yellow-50" },
  { id: "gold",   name: "Gold",           price: "", benefits: ["Logo on stage backdrop", "Booth space", "Social media mention"], color: "text-amber-600 bg-amber-50" },
  { id: "silver", name: "Silver",         price: "", benefits: ["Logo on programme", "Social media mention"], color: "text-slate-600 bg-slate-50" },
  { id: "bronze", name: "Bronze",         price: "", benefits: ["Programme listing"], color: "text-orange-700 bg-orange-50" },
];

const OUTREACH_TYPE_ICONS: Record<string, string> = {
  CALL: "📞", EMAIL: "📧", MEETING: "🤝", WHATSAPP: "💬",
};

const PACKAGE_OPTIONS = ["Title Sponsor", "Gold", "Silver", "Bronze", "In-Kind", "Media Partner"];

const STATUS_BADGE: Record<string, string> = {
  LEAD:       "bg-gray-100 text-gray-600",
  CONTACTED:  "bg-blue-100 text-blue-700",
  MEETING:    "bg-yellow-100 text-yellow-700",
  MOU_SIGNED: "bg-orange-100 text-orange-700",
  CONFIRMED:  "bg-green-100 text-green-700",
  FULFILLED:  "bg-purple-100 text-purple-700",
};

const TABS: { id: ActiveTab; label: string }[] = [
  { id: "pipeline",  label: "🏗️ Sponsor Pipeline" },
  { id: "vvip",      label: "⭐ VVIP Guest List" },
  { id: "packages",  label: "📦 Sponsor Packages" },
  { id: "manpower",  label: "👥 Manpower" },
];

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDatetime(d: string) {
  return new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Sponsor Card ─────────────────────────────────────────────────────────────

function SponsorCard({ sponsor, onClick }: { sponsor: Sponsor; onClick: () => void }) {
  const lastOutreach = sponsor.outreachLog[0];
  const hasOverdueFollowUp = sponsor.outreachLog.some(
    e => e.followUpDate && new Date(e.followUpDate) < new Date(),
  );

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow space-y-2"
    >
      <p className="text-sm font-semibold text-gray-800 leading-snug">{sponsor.companyName}</p>
      {sponsor.contactName && (
        <p className="text-xs text-gray-500">{sponsor.contactName}</p>
      )}
      <div className="flex items-center gap-1.5 flex-wrap">
        {sponsor.packageType && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700">
            {sponsor.packageType}
          </span>
        )}
        {sponsor.isVVIP && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
            VVIP
          </span>
        )}
      </div>
      {lastOutreach && (
        <p className="text-[10px] text-gray-400">
          Last: {OUTREACH_TYPE_ICONS[lastOutreach.type] ?? "•"} {fmtDatetime(lastOutreach.date)}
        </p>
      )}
      {hasOverdueFollowUp && (
        <p className="text-[10px] text-red-500 font-medium">⚠ Follow-up overdue</p>
      )}
    </div>
  );
}

// ─── Add Sponsor Modal ─────────────────────────────────────────────────────────

interface SponsorModalProps {
  open: boolean;
  onClose: () => void;
  editionId: string;
  existing?: Sponsor;
  defaultVvip?: boolean;
  onSaved: (s: Sponsor) => void;
}

function SponsorModal({ open, onClose, editionId, existing, defaultVvip, onSaved }: SponsorModalProps) {
  const [form, setForm] = useState({
    companyName: "", contactName: "", contactEmail: "", contactPhone: "",
    packageType: "", pipelineStatus: "LEAD", isVVIP: false, amount: "", notes: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(existing
        ? {
            companyName:    existing.companyName,
            contactName:    existing.contactName  ?? "",
            contactEmail:   existing.contactEmail ?? "",
            contactPhone:   existing.contactPhone ?? "",
            packageType:    existing.packageType  ?? "",
            pipelineStatus: existing.pipelineStatus,
            isVVIP:         existing.isVVIP,
            amount:         existing.amount > 0 ? String(existing.amount) : "",
            notes:          existing.notes ?? "",
          }
        : { companyName: "", contactName: "", contactEmail: "", contactPhone: "", packageType: "", pipelineStatus: "LEAD", isVVIP: defaultVvip ?? false, amount: "", notes: "" },
      );
    }
  }, [open, existing, defaultVvip]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.companyName.trim()) { toast.error("Company name is required"); return; }
    setSubmitting(true);
    try {
      const url    = existing ? `/api/annual-showcase/editions/${editionId}/sponsors/${existing.id}` : `/api/annual-showcase/editions/${editionId}/sponsors`;
      const method = existing ? "PATCH" : "POST";
      const body   = { ...form, amount: form.amount ? Number(form.amount) : 0 };
      const res    = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? "Failed");
      const saved = await res.json() as Sponsor;
      toast.success(existing ? "Sponsor updated" : "Sponsor added");
      onSaved(saved);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Sponsor" : "Add Sponsor"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
            <Input value={form.companyName} onChange={f("companyName")} placeholder="Company or organization name" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
              <Input value={form.contactName} onChange={f("contactName")} placeholder="Full name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <Input value={form.contactPhone} onChange={f("contactPhone")} placeholder="+60 1X-XXX XXXX" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
              <Input type="email" value={form.contactEmail} onChange={f("contactEmail")} placeholder="email@example.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (MYR)</label>
              <Input type="number" min={0} step="0.01" value={form.amount} onChange={f("amount")} placeholder="0.00" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Package Tier</label>
              <Select value={form.packageType} onValueChange={v => setForm(p => ({ ...p, packageType: v }))}>
                <SelectTrigger><SelectValue placeholder="Select tier" /></SelectTrigger>
                <SelectContent>
                  {PACKAGE_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <Select value={form.pipelineStatus} onValueChange={v => setForm(p => ({ ...p, pipelineStatus: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KANBAN_COLS.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="isVvip" checked={form.isVVIP} onChange={e => setForm(p => ({ ...p, isVVIP: e.target.checked }))} className="rounded" />
            <label htmlFor="isVvip" className="text-sm font-medium text-gray-700">Mark as VVIP Guest</label>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <Textarea value={form.notes} onChange={f("notes")} rows={2} placeholder="Internal notes..." />
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting} className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white">
              {submitting ? "Saving..." : existing ? "Save Changes" : "Add Sponsor"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sponsor Detail Modal ──────────────────────────────────────────────────────

interface SponsorDetailProps {
  sponsor: Sponsor | null;
  editionId: string;
  onClose: () => void;
  onUpdated: (s: Sponsor) => void;
  onDeleted: (id: string) => void;
}

function SponsorDetailModal({ sponsor, editionId, onClose, onUpdated, onDeleted }: SponsorDetailProps) {
  const [editOpen, setEditOpen]   = useState(false);
  const [logForm, setLogForm]     = useState({ type: "CALL", date: new Date().toISOString().slice(0, 10), outcome: "", followUpDate: "" });
  const [loggingActivity, setLoggingActivity] = useState(false);
  const [submittingLog, setSubmittingLog]     = useState(false);
  const [localLog, setLocalLog]   = useState<OutreachEntry[]>([]);

  useEffect(() => {
    if (sponsor) setLocalLog(sponsor.outreachLog);
  }, [sponsor]);

  async function handleLogActivity(e: React.FormEvent) {
    e.preventDefault();
    if (!sponsor) return;
    setSubmittingLog(true);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}/sponsors/${sponsor.id}/outreach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: logForm.type, date: logForm.date, outcome: logForm.outcome || undefined, followUpDate: logForm.followUpDate || undefined }),
      });
      if (!res.ok) throw new Error("Failed to log");
      const entry = await res.json() as OutreachEntry;
      toast.success("Activity logged");
      setLocalLog(prev => [entry, ...prev]);
      onUpdated({ ...sponsor, outreachLog: [entry, ...localLog] });
      setLogForm({ type: "CALL", date: new Date().toISOString().slice(0, 10), outcome: "", followUpDate: "" });
      setLoggingActivity(false);
    } catch {
      toast.error("Failed to log activity");
    } finally {
      setSubmittingLog(false);
    }
  }

  async function handleDelete() {
    if (!sponsor) return;
    if (!window.confirm(`Remove "${sponsor.companyName}" from the sponsor list?`)) return;
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}/sponsors/${sponsor.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast.success("Sponsor removed");
      onDeleted(sponsor.id);
      onClose();
    } catch {
      toast.error("Failed to remove sponsor");
    }
  }

  if (!sponsor) return null;

  return (
    <>
      <Dialog open={!!sponsor} onOpenChange={o => !o && onClose()}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between">
              <div>
                <DialogTitle className="text-lg">{sponsor.companyName}</DialogTitle>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STATUS_BADGE[sponsor.pipelineStatus] ?? "bg-gray-100 text-gray-600"}`}>
                    {KANBAN_COLS.find(c => c.id === sponsor.pipelineStatus)?.label ?? sponsor.pipelineStatus}
                  </span>
                  {sponsor.packageType && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-yellow-50 text-yellow-700">
                      {sponsor.packageType}
                    </span>
                  )}
                  {sponsor.isVVIP && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-100 text-purple-700">⭐ VVIP</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>Edit</Button>
                <Button size="sm" variant="outline" onClick={handleDelete} className="text-red-500 hover:text-red-700 hover:border-red-300">Remove</Button>
              </div>
            </div>
          </DialogHeader>

          {/* Contact info */}
          <div className="grid grid-cols-2 gap-3 mt-2 text-sm">
            {[
              { label: "Contact", value: sponsor.contactName },
              { label: "Phone",   value: sponsor.contactPhone },
              { label: "Email",   value: sponsor.contactEmail },
              { label: "Amount",  value: sponsor.amount > 0 ? `MYR ${sponsor.amount.toLocaleString()}` : null },
            ].map(({ label, value }) => value ? (
              <div key={label}>
                <p className="text-xs text-gray-400">{label}</p>
                <p className="text-gray-800 font-medium">{value}</p>
              </div>
            ) : null)}
          </div>
          {sponsor.notes && (
            <div className="mt-2 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">{sponsor.notes}</div>
          )}

          {/* Outreach Log */}
          <div className="mt-4 border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700">Outreach Log</h4>
              <Button size="sm" variant="outline" onClick={() => setLoggingActivity(v => !v)} className="text-xs">
                {loggingActivity ? "Cancel" : "+ Log Activity"}
              </Button>
            </div>

            {loggingActivity && (
              <form onSubmit={handleLogActivity} className="bg-yellow-50/40 border border-yellow-100 rounded-lg p-3 mb-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                    <Select value={logForm.type} onValueChange={v => setLogForm(p => ({ ...p, type: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CALL">📞 Call</SelectItem>
                        <SelectItem value="EMAIL">📧 Email</SelectItem>
                        <SelectItem value="MEETING">🤝 Meeting</SelectItem>
                        <SelectItem value="WHATSAPP">💬 WhatsApp</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                    <Input type="date" value={logForm.date} onChange={e => setLogForm(p => ({ ...p, date: e.target.value }))} className="h-8 text-xs" required />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Outcome</label>
                  <Textarea value={logForm.outcome} onChange={e => setLogForm(p => ({ ...p, outcome: e.target.value }))} rows={2} placeholder="What happened? Next steps?" className="text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Follow-up Date</label>
                  <Input type="date" value={logForm.followUpDate} onChange={e => setLogForm(p => ({ ...p, followUpDate: e.target.value }))} className="h-8 text-xs" />
                </div>
                <Button type="submit" disabled={submittingLog} size="sm" className="bg-yellow-500 hover:bg-yellow-600 text-white text-xs">
                  {submittingLog ? "Saving..." : "Log Activity"}
                </Button>
              </form>
            )}

            {localLog.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-3">No activities logged yet</p>
            ) : (
              <div className="space-y-2">
                {localLog.map(entry => (
                  <div key={entry.id} className="flex gap-3 p-2 rounded-lg hover:bg-gray-50">
                    <div className="text-lg shrink-0 mt-0.5">{OUTREACH_TYPE_ICONS[entry.type] ?? "•"}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-700">{entry.type}</span>
                        <span className="text-xs text-gray-400">{fmtDatetime(entry.date)}</span>
                        {entry.followUpDate && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${new Date(entry.followUpDate) < new Date() ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"}`}>
                            Follow-up: {fmtDate(entry.followUpDate)}
                          </span>
                        )}
                      </div>
                      {entry.outcome && <p className="text-xs text-gray-500 mt-0.5">{entry.outcome}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <SponsorModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        editionId={editionId}
        existing={sponsor}
        onSaved={updated => { onUpdated(updated); setEditOpen(false); }}
      />
    </>
  );
}

// ─── Pipeline Tab ──────────────────────────────────────────────────────────────

function PipelineTab({ sponsors, editionId, onAdd, onUpdate, onDelete }: {
  sponsors: Sponsor[];
  editionId: string;
  onAdd: (s: Sponsor) => void;
  onUpdate: (s: Sponsor) => void;
  onDelete: (id: string) => void;
}) {
  const [addOpen, setAddOpen]       = useState(false);
  const [detail, setDetail]         = useState<Sponsor | null>(null);

  async function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const newStatus = destination.droppableId;
    const sponsor   = sponsors.find(s => s.id === draggableId);
    if (!sponsor || sponsor.pipelineStatus === newStatus) return;

    onUpdate({ ...sponsor, pipelineStatus: newStatus });
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}/sponsors/${draggableId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineStatus: newStatus }),
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      onUpdate({ ...sponsor, pipelineStatus: sponsor.pipelineStatus });
      toast.error("Failed to update status");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAddOpen(true)} className="bg-yellow-500 hover:bg-yellow-600 text-white text-xs">
          + Add Sponsor
        </Button>
      </div>

      <div className="overflow-x-auto pb-2">
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-3" style={{ minWidth: `${KANBAN_COLS.length * 200}px` }}>
            {KANBAN_COLS.map(col => {
              const colSponsors = sponsors.filter(s => s.pipelineStatus === col.id);
              return (
                <div key={col.id} className="flex flex-col" style={{ width: 200, minWidth: 200 }}>
                  <div className={`flex items-center justify-between mb-2 px-2 py-1.5 rounded-lg ${col.bg}`}>
                    <span className={`text-xs font-semibold uppercase tracking-wide ${col.color}`}>{col.label}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${col.bg} ${col.color} border`}>
                      {colSponsors.length}
                    </span>
                  </div>
                  <Droppable droppableId={col.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 min-h-[160px] rounded-lg p-1.5 space-y-2 transition-colors ${snapshot.isDraggingOver ? "bg-yellow-50 border-2 border-yellow-200 border-dashed" : "bg-gray-50/60"}`}
                      >
                        {colSponsors.map((sponsor, index) => (
                          <Draggable key={sponsor.id} draggableId={sponsor.id} index={index}>
                            {(prov, snap) => (
                              <div
                                ref={prov.innerRef}
                                {...prov.draggableProps}
                                {...prov.dragHandleProps}
                                className={snap.isDragging ? "opacity-80" : ""}
                              >
                                <SponsorCard sponsor={sponsor} onClick={() => setDetail(sponsor)} />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      </div>

      <SponsorModal open={addOpen} onClose={() => setAddOpen(false)} editionId={editionId} onSaved={s => { onAdd(s); setAddOpen(false); }} />
      <SponsorDetailModal
        sponsor={detail}
        editionId={editionId}
        onClose={() => setDetail(null)}
        onUpdated={s => { onUpdate(s); setDetail(s); }}
        onDeleted={id => { onDelete(id); setDetail(null); }}
      />
    </div>
  );
}

// ─── VVIP Tab ──────────────────────────────────────────────────────────────────

function VvipTab({ sponsors, editionId, onAdd, onUpdate, onDelete }: {
  sponsors: Sponsor[];
  editionId: string;
  onAdd: (s: Sponsor) => void;
  onUpdate: (s: Sponsor) => void;
  onDelete: (id: string) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [detail, setDetail]   = useState<Sponsor | null>(null);
  const vvips = sponsors.filter(s => s.isVVIP);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{vvips.length} VVIP guest{vvips.length !== 1 ? "s" : ""}</p>
        <Button size="sm" onClick={() => setAddOpen(true)} className="bg-purple-600 hover:bg-purple-700 text-white text-xs">
          + Add VVIP
        </Button>
      </div>

      {vvips.length === 0 ? (
        <div className="text-center py-12">
          <span className="text-4xl">⭐</span>
          <p className="text-sm text-gray-400 mt-3">No VVIP guests added yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name / Organization</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Contact</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Package</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {vvips.map((s, idx) => (
                <tr
                  key={s.id}
                  className={`border-b border-gray-50 cursor-pointer hover:bg-gray-50/70 ${idx % 2 === 1 ? "bg-gray-50/30" : ""}`}
                  onClick={() => setDetail(s)}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{s.companyName}</p>
                    {s.contactName && <p className="text-xs text-gray-400">{s.contactName}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {s.contactEmail ?? s.contactPhone ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {s.packageType
                      ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700">{s.packageType}</span>
                      : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_BADGE[s.pipelineStatus] ?? "bg-gray-100 text-gray-600"}`}>
                      {KANBAN_COLS.find(c => c.id === s.pipelineStatus)?.label ?? s.pipelineStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => setDetail(s)}
                      className="text-xs text-blue-500 hover:text-blue-700"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SponsorModal open={addOpen} onClose={() => setAddOpen(false)} editionId={editionId} defaultVvip={true} onSaved={s => { onAdd(s); setAddOpen(false); }} />
      <SponsorDetailModal
        sponsor={detail}
        editionId={editionId}
        onClose={() => setDetail(null)}
        onUpdated={s => { onUpdate(s); setDetail(s); }}
        onDeleted={id => { onDelete(id); setDetail(null); }}
      />
    </div>
  );
}

// ─── Sponsor Packages Tab ──────────────────────────────────────────────────────

function PackagesTab({ sponsors, editionId, initialPackages, onSaved }: {
  sponsors: Sponsor[];
  editionId: string;
  initialPackages: PackageTier[];
  onSaved: (p: PackageTier[]) => void;
}) {
  const [tiers, setTiers]   = useState<PackageTier[]>(initialPackages);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setTiers(initialPackages); }, [initialPackages]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sponsorPackages: tiers }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Packages saved");
      onSaved(tiers);
    } catch {
      toast.error("Failed to save packages");
    } finally {
      setSaving(false);
    }
  }

  function updateTier(id: string, key: keyof PackageTier, value: unknown) {
    setTiers(prev => prev.map(t => t.id === id ? { ...t, [key]: value } : t));
  }

  function addBenefit(id: string) {
    setTiers(prev => prev.map(t => t.id === id ? { ...t, benefits: [...t.benefits, ""] } : t));
  }

  function updateBenefit(id: string, idx: number, value: string) {
    setTiers(prev => prev.map(t => t.id === id ? { ...t, benefits: t.benefits.map((b, i) => i === idx ? value : b) } : t));
  }

  function removeBenefit(id: string, idx: number) {
    setTiers(prev => prev.map(t => t.id === id ? { ...t, benefits: t.benefits.filter((_, i) => i !== idx) } : t));
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={saving} className="bg-yellow-500 hover:bg-yellow-600 text-white text-xs">
          {saving ? "Saving..." : "Save Packages"}
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {tiers.map(tier => {
          const sponsorCount = sponsors.filter(s => s.packageType === tier.name).length;
          return (
            <div key={tier.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${tier.color}`}>{tier.name}</span>
                <span className="text-xs text-gray-400">{sponsorCount} sponsor{sponsorCount !== 1 ? "s" : ""}</span>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tier Name</label>
                <Input value={tier.name} onChange={e => updateTier(tier.id, "name", e.target.value)} className="h-8 text-xs" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Price / Value (MYR)</label>
                <Input value={tier.price} onChange={e => updateTier(tier.id, "price", e.target.value)} placeholder="e.g. 5,000" className="h-8 text-xs" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-gray-500">Benefits</label>
                  <button onClick={() => addBenefit(tier.id)} className="text-[10px] text-yellow-600 hover:text-yellow-800 font-medium">+ Add</button>
                </div>
                <div className="space-y-1">
                  {tier.benefits.map((b, i) => (
                    <div key={i} className="flex gap-1">
                      <Input value={b} onChange={e => updateBenefit(tier.id, i, e.target.value)} className="h-7 text-xs flex-1" />
                      <button onClick={() => removeBenefit(tier.id, i)} className="text-gray-300 hover:text-red-500 text-sm px-1">×</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Sponsorship Page ─────────────────────────────────────────────────────

export default function SponsorshipPage() {
  const router = useRouter();
  const { allowed } = useDepartmentAccess("SPONSORSHIP");
  const { edition: rawEdition, isLoading } = useActiveEdition();
  const edition = rawEdition as unknown as ({ id: string; name: string; currency: string; sponsorPackages?: unknown } | null);

  const [sponsors,       setSponsors      ] = useState<Sponsor[]>([]);
  const [dataLoading,    setDataLoading   ] = useState(false);
  const [budgetRevenue,  setBudgetRevenue ] = useState(0);
  const [activeTab,      setActiveTab     ] = useState<ActiveTab>("pipeline");
  const [manpowerCount,  setManpowerCount ] = useState(0);
  const [packages,       setPackages      ] = useState<PackageTier[]>(PACKAGE_TIERS);

  const currency = edition?.currency ?? "MYR";

  const loadData = useCallback(async (editionId: string) => {
    setDataLoading(true);
    try {
      const [sponsorsRes, budgetRes] = await Promise.all([
        fetch(`/api/annual-showcase/editions/${editionId}/sponsors`),
        fetch(`/api/annual-showcase/editions/${editionId}/budget`),
      ]);
      if (sponsorsRes.ok) setSponsors(await sponsorsRes.json() as Sponsor[]);
      if (budgetRes.ok) {
        const d = await budgetRes.json() as { totalRevenue: number };
        setBudgetRevenue(d.totalRevenue ?? 0);
      }
    } catch {
      toast.error("Failed to load data");
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => { if (edition?.id) loadData(edition.id); }, [edition?.id, loadData]);

  useEffect(() => {
    if (rawEdition?.sponsorPackages) {
      setPackages(rawEdition.sponsorPackages as PackageTier[]);
    }
  }, [rawEdition?.sponsorPackages]);

  // Stats
  const totalSponsors = sponsors.length;
  const confirmed     = sponsors.filter(s => s.pipelineStatus === "CONFIRMED" || s.pipelineStatus === "FULFILLED").length;
  const vvipCount     = sponsors.filter(s => s.isVVIP).length;

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
        <span className="text-5xl">🤝</span>
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
        <StatCard label="Total Sponsors"   value={totalSponsors} icon="🤝" subtext="in pipeline" />
        <StatCard label="Confirmed"        value={confirmed}     icon="✅" subtext="confirmed + fulfilled" accentColor="bg-green-500"
          progress={totalSponsors > 0 ? Math.round((confirmed / totalSponsors) * 100) : 0} />
        <StatCard label="VVIP Guests"      value={vvipCount}     icon="⭐" subtext="VVIP flagged" accentColor="bg-purple-500" />
        <StatCard label="Pipeline Revenue" value={`${currency} ${budgetRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          icon="💰" subtext="paid revenue items" accentColor="bg-yellow-500" />
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
                  ? "border-yellow-500 text-yellow-600"
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
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : (
            <>
              {activeTab === "pipeline" && (
                <PipelineTab
                  sponsors={sponsors}
                  editionId={edition.id}
                  onAdd={s => setSponsors(prev => [...prev, s])}
                  onUpdate={s => setSponsors(prev => prev.map(p => p.id === s.id ? s : p))}
                  onDelete={id => setSponsors(prev => prev.filter(p => p.id !== id))}
                />
              )}
              {activeTab === "vvip" && (
                <VvipTab
                  sponsors={sponsors}
                  editionId={edition.id}
                  onAdd={s => setSponsors(prev => [...prev, s])}
                  onUpdate={s => setSponsors(prev => prev.map(p => p.id === s.id ? s : p))}
                  onDelete={id => setSponsors(prev => prev.filter(p => p.id !== id))}
                />
              )}
              {activeTab === "packages" && (
                <PackagesTab
                  sponsors={sponsors}
                  editionId={edition.id}
                  initialPackages={packages}
                  onSaved={setPackages}
                />
              )}
              {activeTab === "manpower" && (
                <ManpowerPanel editionId={edition.id} unit="SPONSORSHIP" onCountChange={setManpowerCount} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
