"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useActiveEdition } from "@/app/hooks/useActiveEdition";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import StatCard from "@/app/components/annual-showcase/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ─── Types ─────────────────────────────────────────────────────────────────────

type PaymentStatus =
  | "UNPAID" | "PENDING" | "CONFIRMED" | "PAID"
  | "OVERDUE" | "WAIVED" | "REFUNDED";

interface Category { id: string; name: string }
interface FeeWave  { id: string; name: string; amount: number; deadline: string }

interface Participant {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  teamName: string | null;
  dateOfBirth: string | null;
  isEbrighter: boolean;
  parentName: string | null;
  parentEmail: string | null;
  parentPhone: string | null;
  orderNo: number | null;
  paymentStatus: PaymentStatus;
  paymentLog: { status: string; note?: string; at: string }[] | null;
  registeredAt: string;
  category: { id: string; name: string } | null;
  feeWave:  { id: string; name: string; amount: number } | null;
}

type ActiveTab = "list" | "add" | "reports";

// ─── Constants ─────────────────────────────────────────────────────────────────

const PAYMENT_STATUS_BADGE: Record<PaymentStatus, string> = {
  UNPAID:    "bg-gray-100 text-gray-500",
  PENDING:   "bg-yellow-100 text-yellow-700",
  CONFIRMED: "bg-blue-100 text-blue-700",
  PAID:      "bg-green-100 text-green-700",
  OVERDUE:   "bg-red-100 text-red-700",
  WAIVED:    "bg-purple-100 text-purple-600",
  REFUNDED:  "bg-orange-100 text-orange-600",
};

const PAYMENT_STATUSES: PaymentStatus[] = [
  "UNPAID", "PENDING", "CONFIRMED", "PAID", "OVERDUE", "WAIVED", "REFUNDED",
];

const TABS: { id: ActiveTab; label: string }[] = [
  { id: "list",    label: "📋 Registrations List" },
  { id: "add",     label: "➕ Add Registration" },
  { id: "reports", label: "📊 Reports" },
];

const PIE_COLORS = ["#6366f1", "#e5e7eb"];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function calcAge(dob: string | null): number | null {
  if (!dob) return null;
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function suggestCategory(dob: string | null, categories: Category[]): string {
  const age = calcAge(dob);
  if (age === null || categories.length === 0) return "";
  const lower = categories.map(c => c.name.toLowerCase());
  if (age <= 8  && lower.some(n => n.includes("junior")))  return categories[lower.findIndex(n => n.includes("junior"))].id;
  if (age <= 12 && lower.some(n => n.includes("mid")))     return categories[lower.findIndex(n => n.includes("mid"))].id;
  if (age >= 13 && lower.some(n => n.includes("senior")))  return categories[lower.findIndex(n => n.includes("senior"))].id;
  return "";
}

// ─── Edit Modal ────────────────────────────────────────────────────────────────

interface EditModalProps {
  participant: Participant;
  editionId: string;
  onClose: () => void;
  onUpdated: (p: Participant) => void;
}

function EditModal({ participant, editionId, onClose, onUpdated }: EditModalProps) {
  const [status, setStatus] = useState<PaymentStatus>(participant.paymentStatus);
  const [note,   setNote  ] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/annual-showcase/editions/${editionId}/participants/${participant.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentStatus: status, note: note.trim() || undefined }),
        },
      );
      if (!res.ok) throw new Error();
      const updated = await res.json() as Participant;
      toast.success("Updated");
      onUpdated(updated);
      onClose();
    } catch {
      toast.error("Failed to update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit — {participant.fullName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value as PaymentStatus)}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-white"
            >
              {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
            <Input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Transfer ref #1234"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tab 1 — Registrations List ───────────────────────────────────────────────

interface RegistrationsListProps {
  participants: Participant[];
  currency: string;
  editionId: string;
  editionName: string;
  onDelete: (id: string) => void;
  onMarkPaid: (id: string) => void;
  onUpdated: (p: Participant) => void;
}

function RegistrationsList({
  participants, currency, editionId, editionName, onDelete, onMarkPaid, onUpdated,
}: RegistrationsListProps) {
  const [search,         setSearch        ] = useState("");
  const [statusFilter,   setStatusFilter  ] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [ebrghFilter,    setEbrghFilter   ] = useState("all");
  const [editTarget,     setEditTarget    ] = useState<Participant | null>(null);

  const categories = Array.from(
    new Set(participants.filter(p => p.category).map(p => p.category!.name)),
  );

  const filtered = participants.filter(p => {
    if (search.trim()) {
      const q = search.toLowerCase();
      if (
        !p.fullName.toLowerCase().includes(q) &&
        !(p.parentEmail ?? "").toLowerCase().includes(q) &&
        !(p.parentName  ?? "").toLowerCase().includes(q) &&
        !(p.parentPhone ?? "").toLowerCase().includes(q)
      ) return false;
    }
    if (statusFilter   !== "all" && p.paymentStatus  !== statusFilter)   return false;
    if (categoryFilter !== "all" && p.category?.name !== categoryFilter) return false;
    if (ebrghFilter    === "yes" && !p.isEbrighter) return false;
    if (ebrghFilter    === "no"  &&  p.isEbrighter) return false;
    return true;
  });

  // Quick status summary
  const statusTotals = filtered.reduce((acc, p) => {
    acc[p.paymentStatus] = (acc[p.paymentStatus] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  function exportCSV() {
    const header = [
      "No", "Name", "Category", "Age", "Is Ebrighter",
      "Branch", "Parent Name", "Parent Email", "Parent Phone",
      "Payment Status", "Fee Wave", `Amount (${currency})`, "Registered At",
    ].join(",");

    const rows = filtered.map((p, idx) => {
      const age = calcAge(p.dateOfBirth);
      return [
        idx + 1,
        `"${p.fullName}"`,
        `"${p.category?.name ?? ""}"`,
        age ?? "",
        p.isEbrighter ? "Yes" : "No",
        `"${p.teamName ?? ""}"`,
        `"${p.parentName ?? ""}"`,
        `"${p.parentEmail ?? ""}"`,
        `"${p.parentPhone ?? ""}"`,
        p.paymentStatus,
        `"${p.feeWave?.name ?? ""}"`,
        p.feeWave ? p.feeWave.amount.toFixed(2) : "",
        new Date(p.registeredAt).toLocaleDateString(),
      ].join(",");
    });

    const csv  = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `registrations-${editionName.replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name / parent…"
          className="max-w-52 h-8 text-sm"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="all">All Statuses</option>
          {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {categories.length > 0 && (
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="all">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <select
          value={ebrghFilter}
          onChange={e => setEbrghFilter(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="all">All Participants</option>
          <option value="yes">Ebrighters only</option>
          <option value="no">External only</option>
        </select>
        <div className="flex-1" />
        <span className="text-xs text-gray-400">{filtered.length} of {participants.length}</span>
        <Button size="sm" variant="outline" onClick={exportCSV} className="h-8 text-xs">
          ⬇ Export CSV
        </Button>
      </div>

      {/* Status chips */}
      {Object.keys(statusTotals).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(Object.entries(statusTotals) as [PaymentStatus, number][]).map(([s, n]) => (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
              className={`text-xs font-semibold px-2 py-0.5 rounded transition-opacity ${
                PAYMENT_STATUS_BADGE[s] ?? "bg-gray-100 text-gray-500"
              } ${statusFilter !== "all" && statusFilter !== s ? "opacity-40" : ""}`}
            >
              {s}: {n}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            {participants.length === 0 ? "No registrations yet" : "No results match the filter"}
          </div>
        ) : (
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {[
                  "No", "Name", "Category", "Age", "Ebrighter",
                  "Parent Name", "Contact", "Status", "Actions",
                ].map(h => (
                  <th
                    key={h}
                    className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, idx) => {
                const age = calcAge(p.dateOfBirth);
                const isPaid = p.paymentStatus === "PAID" || p.paymentStatus === "CONFIRMED";
                return (
                  <tr
                    key={p.id}
                    className={`border-b border-gray-50 hover:bg-indigo-50/20 ${idx % 2 === 1 ? "bg-gray-50/30" : ""}`}
                  >
                    <td className="px-3 py-2.5 text-gray-400 tabular-nums text-xs">{idx + 1}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-gray-800 whitespace-nowrap">{p.fullName}</p>
                      {p.teamName && (
                        <p className="text-xs text-indigo-500 mt-0.5">{p.teamName}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {p.category ? (
                        <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full whitespace-nowrap">
                          {p.category.name}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600 tabular-nums">
                      {age !== null ? age : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {p.isEbrighter ? (
                        <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-semibold">✓</span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">
                      {p.parentName ?? <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {p.parentEmail && (
                        <p className="text-xs text-gray-500 whitespace-nowrap">{p.parentEmail}</p>
                      )}
                      {p.parentPhone && (
                        <p className="text-xs text-gray-500 whitespace-nowrap">{p.parentPhone}</p>
                      )}
                      {!p.parentEmail && !p.parentPhone && (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        PAYMENT_STATUS_BADGE[p.paymentStatus] ?? "bg-gray-100 text-gray-500"
                      }`}>
                        {p.paymentStatus}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        {!isPaid && (
                          <button
                            onClick={() => onMarkPaid(p.id)}
                            className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 font-medium transition-colors"
                          >
                            Mark Paid
                          </button>
                        )}
                        <button
                          onClick={() => setEditTarget(p)}
                          className="text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 font-medium transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onDelete(p.id)}
                          className="text-gray-300 hover:text-red-500 transition-colors text-sm ml-0.5"
                          title="Delete"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit modal */}
      {editTarget && (
        <EditModal
          participant={editTarget}
          editionId={editionId}
          onClose={() => setEditTarget(null)}
          onUpdated={updated => {
            onUpdated(updated);
            setEditTarget(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Tab 2 — Add Registration ─────────────────────────────────────────────────

const BLANK_FORM = {
  fullName: "", dateOfBirth: "", isEbrighter: false,
  branch: "", parentName: "", parentEmail: "", parentPhone: "",
  categoryId: "", feeWaveId: "", paymentStatus: "UNPAID" as PaymentStatus,
};

interface AddRegistrationTabProps {
  editionId: string;
  categories: Category[];
  feeWaves: FeeWave[];
  currency: string;
  onAdded: () => void;
  onGoToList: () => void;
}

function AddRegistrationTab({
  editionId, categories, feeWaves, currency, onAdded, onGoToList,
}: AddRegistrationTabProps) {
  const [form,       setForm      ] = useState(BLANK_FORM);
  const [submitting, setSubmitting] = useState(false);

  const age           = calcAge(form.dateOfBirth || null);
  const suggestedCatId = suggestCategory(form.dateOfBirth || null, categories);

  function set<K extends keyof typeof BLANK_FORM>(key: K, value: (typeof BLANK_FORM)[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  // Auto-fill category when DOB changes
  useEffect(() => {
    if (suggestedCatId && !form.categoryId) {
      setForm(prev => ({ ...prev, categoryId: suggestedCatId }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedCatId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fullName.trim()) { toast.error("Participant name is required"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName:      form.fullName.trim(),
          dateOfBirth:   form.dateOfBirth || undefined,
          isEbrighter:   form.isEbrighter,
          teamName:      form.branch.trim() || undefined,
          parentName:    form.parentName.trim()    || undefined,
          parentEmail:   form.parentEmail.trim()   || undefined,
          parentPhone:   form.parentPhone.trim()   || undefined,
          categoryId:    form.categoryId  || undefined,
          feeWaveId:     form.feeWaveId   || undefined,
          paymentStatus: form.paymentStatus,
        }),
      });
      if (!res.ok) {
        const msg = (await res.json() as { error?: string }).error ?? "Failed";
        throw new Error(msg);
      }
      toast.success(`${form.fullName} added`);
      setForm(BLANK_FORM);
      onAdded();
      onGoToList();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add registration");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Participant */}
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-5 space-y-4">
          <h3 className="font-semibold text-gray-800 text-sm">Participant</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
              <Input
                value={form.fullName}
                onChange={e => set("fullName", e.target.value)}
                required
                placeholder="Participant full name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
              <Input
                type="date"
                value={form.dateOfBirth}
                onChange={e => set("dateOfBirth", e.target.value)}
              />
              {age !== null && (
                <p className="text-xs text-indigo-600 mt-1 font-medium">Age: {age} years old</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Branch / School</label>
              <Input
                value={form.branch}
                onChange={e => set("branch", e.target.value)}
                placeholder="e.g. Puchong Utama"
              />
            </div>
            {categories.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={form.categoryId}
                  onChange={e => set("categoryId", e.target.value)}
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-white"
                >
                  <option value="">— Select category —</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {suggestedCatId && form.categoryId === suggestedCatId && (
                  <p className="text-xs text-indigo-500 mt-1">Auto-suggested based on age</p>
                )}
              </div>
            )}
            <div className="flex items-center gap-2 mt-1">
              <input
                type="checkbox"
                id="isEbrighter"
                checked={form.isEbrighter}
                onChange={e => set("isEbrighter", e.target.checked)}
                className="rounded accent-indigo-600"
              />
              <label htmlFor="isEbrighter" className="text-sm text-gray-700">Is an Ebrighter</label>
            </div>
          </div>
        </div>

        {/* Parent / Guardian */}
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-5 space-y-4">
          <h3 className="font-semibold text-gray-800 text-sm">Parent / Guardian</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parent Name</label>
              <Input
                value={form.parentName}
                onChange={e => set("parentName", e.target.value)}
                placeholder="Parent / guardian name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parent Email</label>
              <Input
                type="email"
                value={form.parentEmail}
                onChange={e => set("parentEmail", e.target.value)}
                placeholder="parent@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parent Phone</label>
              <Input
                value={form.parentPhone}
                onChange={e => set("parentPhone", e.target.value)}
                placeholder="+60 12-345 6789"
              />
            </div>
          </div>
        </div>

        {/* Payment */}
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-5 space-y-4">
          <h3 className="font-semibold text-gray-800 text-sm">Payment</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {feeWaves.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fee Wave</label>
                <select
                  value={form.feeWaveId}
                  onChange={e => set("feeWaveId", e.target.value)}
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-white"
                >
                  <option value="">No wave assigned</option>
                  {feeWaves.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name} — {currency} {w.amount.toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Status</label>
              <select
                value={form.paymentStatus}
                onChange={e => set("paymentStatus", e.target.value as PaymentStatus)}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-white"
              >
                {(["UNPAID", "PENDING", "CONFIRMED", "PAID", "WAIVED"] as PaymentStatus[]).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={() => setForm(BLANK_FORM)} className="flex-1">
            Reset
          </Button>
          <Button
            type="submit"
            disabled={submitting}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {submitting ? "Adding…" : "Add Registration"}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ─── Tab 3 — Reports ──────────────────────────────────────────────────────────

interface ReportsTabProps {
  participants: Participant[];
  currency: string;
  participantTarget: number;
}

function ReportsTab({ participants, currency, participantTarget }: ReportsTabProps) {
  // Category breakdown
  const catMap = participants.reduce((acc, p) => {
    const key = p.category?.name ?? "Uncategorised";
    if (!acc[key]) acc[key] = { total: 0, paid: 0, revenue: 0 };
    acc[key].total++;
    if (p.paymentStatus === "PAID" || p.paymentStatus === "CONFIRMED") {
      acc[key].paid++;
      acc[key].revenue += p.feeWave?.amount ?? 0;
    }
    return acc;
  }, {} as Record<string, { total: number; paid: number; revenue: number }>);

  const catRows  = Object.entries(catMap)
    .map(([name, d]) => ({ name, ...d }))
    .sort((a, b) => b.total - a.total);
  const catChart = catRows.map(r => ({ name: r.name, total: r.total, paid: r.paid }));

  // Ebrighter breakdown
  const ebCount  = participants.filter(p =>  p.isEbrighter).length;
  const extCount = participants.filter(p => !p.isEbrighter).length;
  const pieData  = [
    { name: "Ebrighter", value: ebCount },
    { name: "External",  value: extCount },
  ].filter(d => d.value > 0);

  // Payment collection
  const paidCount    = participants.filter(p => p.paymentStatus === "PAID" || p.paymentStatus === "CONFIRMED").length;
  const paidRevenue  = participants
    .filter(p => p.paymentStatus === "PAID" || p.paymentStatus === "CONFIRMED")
    .reduce((s, p) => s + (p.feeWave?.amount ?? 0), 0);
  const paymentRate  = participants.length > 0 ? Math.round(paidCount / participants.length * 100) : 0;
  const fillRate     = participantTarget > 0 ? Math.min(100, Math.round(participants.length / participantTarget * 100)) : null;

  const fmtRev = (v: number) =>
    `${currency} ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (participants.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 text-sm">
        <span className="text-4xl block mb-3">📊</span>
        No registrations yet — reports will appear once participants are added.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Payment collection progress */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
        <h3 className="font-semibold text-gray-800 text-sm">Payment Collection</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Collected (Paid/Confirmed)</p>
            <p className="font-bold text-green-700 text-lg">{paidCount} participants</p>
            <p className="text-xs text-gray-400">{fmtRev(paidRevenue)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Payment Rate</p>
            <p className="font-bold text-indigo-700 text-lg">{paymentRate}%</p>
            <p className="text-xs text-gray-400">{paidCount} of {participants.length}</p>
          </div>
          {fillRate !== null && (
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Target Fill Rate</p>
              <p className="font-bold text-gray-800 text-lg">{fillRate}%</p>
              <p className="text-xs text-gray-400">{participants.length} of {participantTarget}</p>
            </div>
          )}
        </div>
        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Payment collection</span>
            <span>{paymentRate}%</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-500"
              style={{ width: `${paymentRate}%` }}
            />
          </div>
        </div>
        {fillRate !== null && (
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Slots filled</span>
              <span>{fillRate}%</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-green-500 transition-all duration-500"
                style={{ width: `${fillRate}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Registrations by category */}
        {catChart.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-semibold text-gray-800 text-sm mb-4">Registrations by Category</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={catChart} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(value) => [Number(value ?? 0)]} />
                <Bar dataKey="total" fill="#6366f1" name="Total"    radius={[3, 3, 0, 0]} />
                <Bar dataKey="paid"  fill="#10b981" name="Paid"     radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Ebrighter vs External */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 text-sm mb-4">Ebrighter vs External</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                innerRadius={40}
                paddingAngle={2}
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [Number(value ?? 0), "participants"]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 mt-1">
            {pieData.map((d, i) => (
              <span key={d.name} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                />
                {d.name}: {d.value}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Category breakdown table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800 text-sm">Category Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Paid / Confirmed</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Revenue</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">% Share</th>
              </tr>
            </thead>
            <tbody>
              {catRows.map((r, idx) => (
                <tr key={r.name} className={`border-b border-gray-50 ${idx % 2 === 1 ? "bg-gray-50/50" : ""}`}>
                  <td className="px-4 py-2.5 font-medium text-gray-800">{r.name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{r.total}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-green-700 font-medium">{r.paid}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-800 font-medium">{fmtRev(r.revenue)}</td>
                  <td className="px-4 py-2.5 text-right text-gray-500">
                    {participants.length > 0 ? Math.round(r.total / participants.length * 100) : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function RegisterManagementPage() {
  const router = useRouter();
  const { edition: rawEdition, isLoading: editionLoading } = useActiveEdition();

  const [participants,        setParticipants       ] = useState<Participant[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [categories,          setCategories         ] = useState<Category[]>([]);
  const [feeWaves,            setFeeWaves           ] = useState<FeeWave[]>([]);
  const [activeTab,           setActiveTab          ] = useState<ActiveTab>("list");

  const edition  = rawEdition;
  const currency = edition?.currency ?? "MYR";

  const loadParticipants = useCallback(async (editionId: string) => {
    setParticipantsLoading(true);
    try {
      let all: Participant[] = [];
      let page = 1;
      while (true) {
        const res = await fetch(
          `/api/annual-showcase/editions/${editionId}/participants?limit=100&page=${page}`,
        );
        if (!res.ok) break;
        const data = await res.json() as { participants: Participant[]; total: number };
        all = [...all, ...data.participants];
        if (all.length >= data.total) break;
        page++;
      }
      setParticipants(all);
    } catch {
      toast.error("Failed to load participants");
    } finally {
      setParticipantsLoading(false);
    }
  }, []);

  const loadEditionDetail = useCallback(async (editionId: string) => {
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}`);
      if (!res.ok) return;
      const data = await res.json() as { categories?: Category[]; feeWaves?: FeeWave[] };
      setCategories(data.categories ?? []);
      setFeeWaves(data.feeWaves ?? []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (edition?.id) {
      loadParticipants(edition.id);
      loadEditionDetail(edition.id);
    }
  }, [edition?.id, loadParticipants, loadEditionDetail]);

  async function handleMarkPaid(participantId: string) {
    if (!edition) return;
    try {
      const res = await fetch(
        `/api/annual-showcase/editions/${edition.id}/participants/${participantId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentStatus: "PAID" }),
        },
      );
      if (!res.ok) throw new Error();
      const updated = await res.json() as Participant;
      setParticipants(prev => prev.map(p => p.id === participantId ? updated : p));
      toast.success("Marked as Paid");
    } catch {
      toast.error("Failed to update payment");
    }
  }

  async function handleDelete(participantId: string) {
    if (!edition) return;
    if (!confirm("Delete this registration? This cannot be undone.")) return;
    try {
      const res = await fetch(
        `/api/annual-showcase/editions/${edition.id}/participants/${participantId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error();
      setParticipants(prev => prev.filter(p => p.id !== participantId));
      toast.success("Registration deleted");
    } catch {
      toast.error("Failed to delete");
    }
  }

  // ─── Stats ──────────────────────────────────────────────────────────────────

  const totalCount  = participants.length;
  const paidCount   = participants.filter(
    p => p.paymentStatus === "PAID" || p.paymentStatus === "CONFIRMED",
  ).length;
  const pendingCount = participants.filter(
    p => p.paymentStatus === "UNPAID" || p.paymentStatus === "PENDING" || p.paymentStatus === "OVERDUE",
  ).length;
  const ebCount = participants.filter(p => p.isEbrighter).length;

  // ─── Loading ────────────────────────────────────────────────────────────────

  if (editionLoading) {
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
          onClick={() => router.push("/annual-showcase/editions")}
          className="absolute top-4 left-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          ← Back to Editions
        </button>
        <span className="text-5xl">📝</span>
        <p className="text-gray-600 font-medium">No active edition selected</p>
        <p className="text-sm text-gray-400">Select an edition from the switcher in the header.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <button
        onClick={() => router.push("/annual-showcase/editions")}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        ← Back to Editions
      </button>

      {/* Page title */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">📝 Registration Management</h1>
        <p className="text-sm text-gray-400 mt-0.5">{edition.name}</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Registered"
          value={totalCount}
          icon="📝"
          subtext={
            edition.participantTarget > 0
              ? `of ${edition.participantTarget} target`
              : "participants"
          }
          progress={
            edition.participantTarget > 0
              ? Math.round(totalCount / edition.participantTarget * 100)
              : undefined
          }
          accentColor="bg-indigo-500"
        />
        <StatCard
          label="Paid / Confirmed"
          value={paidCount}
          icon="✅"
          subtext={
            totalCount > 0
              ? `${Math.round(paidCount / totalCount * 100)}% payment rate`
              : "no payments yet"
          }
          accentColor="bg-green-500"
        />
        <StatCard
          label="Pending Payment"
          value={pendingCount}
          icon="⏳"
          subtext="unpaid + pending + overdue"
          accentColor="bg-yellow-500"
        />
        <StatCard
          label="Ebrighters"
          value={ebCount}
          icon="⭐"
          subtext={
            totalCount > 0
              ? `${Math.round(ebCount / totalCount * 100)}% of registrations`
              : "no data yet"
          }
          accentColor="bg-indigo-500"
        />
      </div>

      {/* Tab container */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        {/* Tab nav */}
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-5">
          {participantsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-lg" />
              ))}
            </div>
          ) : (
            <>
              {activeTab === "list" && (
                <RegistrationsList
                  participants={participants}
                  currency={currency}
                  editionId={edition.id}
                  editionName={edition.name}
                  onDelete={handleDelete}
                  onMarkPaid={handleMarkPaid}
                  onUpdated={updated =>
                    setParticipants(prev => prev.map(p => p.id === updated.id ? updated : p))
                  }
                />
              )}
              {activeTab === "add" && (
                <AddRegistrationTab
                  editionId={edition.id}
                  categories={categories}
                  feeWaves={feeWaves}
                  currency={currency}
                  onAdded={() => loadParticipants(edition.id)}
                  onGoToList={() => setActiveTab("list")}
                />
              )}
              {activeTab === "reports" && (
                <ReportsTab
                  participants={participants}
                  currency={currency}
                  participantTarget={edition.participantTarget}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
