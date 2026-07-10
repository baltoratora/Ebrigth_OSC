"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useActiveEdition } from "@/app/hooks/useActiveEdition";
import { useDepartmentAccess } from "@/app/hooks/useDepartmentAccess";
import ManpowerPanel from "@/app/components/annual-showcase/ManpowerPanel";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import StatCard from "@/app/components/annual-showcase/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ─── Types ────────────────────────────────────────────────────────────────────

type BudgetType   = "REVENUE" | "EXPENSE";
type BudgetStatus = "PENDING" | "APPROVED" | "PAID" | "REJECTED";
type ActiveTab    = "budget" | "inventory" | "payments" | "tracker" | "manpower" | "waitlist" | "pax-pay";

interface BudgetItem {
  id: string;
  unit: string;
  type: BudgetType;
  description: string;
  amount: number;
  status: BudgetStatus;
  approvedBy: { id: number; name: string | null } | null;
  createdAt: string;
}

interface GoodieBagItem {
  id: string;
  name: string;
  qtyPerBag: number;
  category: string;
  packed: boolean;
  notes: string;
}

interface Edition {
  id: string;
  name: string;
  theme: string;
  status: string;
  currency: string;
  profitabilityTarget: number;
  goodieBagChecklist: GoodieBagItem[] | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const UNITS            = ["OC", "Procurement", "Sponsorship", "Media", "Showcase", "Youthpreneur", "CEO"];
const REVENUE_CATS     = ["Registration", "Sponsorship", "Booth Fees", "Other"];
const EXPENSE_CATS     = ["Venue", "Production", "Catering", "Goodie Bags", "Medals", "Print Materials", "Transport", "Marketing", "Other"];
const GOODIE_CATS      = ["Junior", "Middler", "Senior", "All"];
const INVENTORY_UNIT   = "Inventory";

const STATUS_BADGE: Record<BudgetStatus, string> = {
  PENDING:  "bg-yellow-100 text-yellow-700",
  APPROVED: "bg-blue-100 text-blue-700",
  PAID:     "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
};

const TABS: { id: ActiveTab; label: string }[] = [
  { id: "budget",    label: "Budget & P&L" },
  { id: "inventory", label: "Inventory" },
  { id: "payments",  label: "Payment Requests" },
  { id: "tracker",   label: "Expense Tracker" },
  { id: "manpower",  label: "👥 Manpower" },
  { id: "pax-pay",   label: "💳 Participant Payments" },
  { id: "waitlist",  label: "📋 Waitlist" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isPaymentRequest(item: BudgetItem) {
  return item.type === "EXPENSE" && (UNITS as string[]).includes(item.unit);
}

function isBudgetExpense(item: BudgetItem) {
  return item.type === "EXPENSE" && item.unit !== INVENTORY_UNIT && !(UNITS as string[]).includes(item.unit);
}

// ─── Add Budget Item Modal ────────────────────────────────────────────────────

interface AddBudgetItemModalProps {
  open: boolean;
  onClose: () => void;
  editionId: string;
  type: BudgetType;
  onCreated: (item: BudgetItem) => void;
}

function AddBudgetItemModal({ open, onClose, editionId, type, onCreated }: AddBudgetItemModalProps) {
  const [form, setForm] = useState({ unit: "", description: "", amount: "", status: "PENDING" });
  const [submitting, setSubmitting] = useState(false);
  const categories = type === "REVENUE" ? REVENUE_CATS : EXPENSE_CATS;

  function reset() { setForm({ unit: "", description: "", amount: "", status: "PENDING" }); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.unit || !form.description.trim() || !form.amount) {
      toast.error("All fields are required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}/budget`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          unit:        form.unit,
          description: form.description.trim(),
          amount:      Number(form.amount),
          status:      form.status,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const item = await res.json();
      toast.success(`${type === "REVENUE" ? "Revenue" : "Expense"} item added`);
      onCreated(item);
      onClose();
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add item");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {type === "REVENUE" ? "Revenue" : "Expense"} Item</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
            <Select value={form.unit} onValueChange={(v) => setForm((f) => ({ ...f, unit: v }))}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
            <Input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Describe this item"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (MYR) *</label>
              <Input
                type="number" min={0} step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="PAID">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => { onClose(); reset(); }} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={submitting} className={`flex-1 ${type === "REVENUE" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}>
              {submitting ? "Adding..." : "Add Item"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Inventory Item Modal ─────────────────────────────────────────────────

interface AddInventoryItemModalProps {
  open: boolean;
  onClose: () => void;
  editionId: string;
  onCreated: (item: BudgetItem) => void;
}

function AddInventoryItemModal({ open, onClose, editionId, onCreated }: AddInventoryItemModalProps) {
  const [form, setForm] = useState({ description: "", amount: "", status: "PENDING" });
  const [submitting, setSubmitting] = useState(false);

  function reset() { setForm({ description: "", amount: "", status: "PENDING" }); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.description.trim()) { toast.error("Item name is required"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}/budget`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type:        "EXPENSE",
          unit:        INVENTORY_UNIT,
          description: form.description.trim(),
          amount:      form.amount ? Number(form.amount) : 0,
          status:      form.status,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const item = await res.json();
      toast.success("Inventory item added");
      onCreated(item);
      onClose();
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add item");
    } finally {
      setSubmitting(false);
    }
  }

  const statusLabels: Record<string, string> = {
    PENDING:  "Pending Order",
    APPROVED: "Ordered / In Transit",
    PAID:     "Arrived",
    REJECTED: "Cancelled",
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Inventory Item</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Item Name *</label>
            <Input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Event T-shirts, Lanyards"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Total Cost (MYR)</label>
              <Input
                type="number" min={0} step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(statusLabels).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => { onClose(); reset(); }} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={submitting} className="flex-1 bg-green-600 hover:bg-green-700">
              {submitting ? "Adding..." : "Add Item"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Payment Request Modal ────────────────────────────────────────────────────

interface PaymentRequestModalProps {
  open: boolean;
  onClose: () => void;
  editionId: string;
  onCreated: (item: BudgetItem) => void;
}

function PaymentRequestModal({ open, onClose, editionId, onCreated }: PaymentRequestModalProps) {
  const [form, setForm] = useState({ title: "", unit: "", amount: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);

  function reset() { setForm({ title: "", unit: "", amount: "", notes: "" }); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.unit || !form.amount) {
      toast.error("Title, unit, and amount are required");
      return;
    }
    setSubmitting(true);
    try {
      const description = form.notes.trim()
        ? `${form.title.trim()} — ${form.notes.trim()}`
        : form.title.trim();

      const res = await fetch(`/api/annual-showcase/editions/${editionId}/budget`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type:        "EXPENSE",
          unit:        form.unit,
          description,
          amount:      Number(form.amount),
          status:      "PENDING",
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const item = await res.json();
      toast.success("Payment request submitted");
      onCreated(item);
      onClose();
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Payment Request</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Request Title *</label>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="What is being purchased?"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Requesting Unit *</label>
              <Select value={form.unit} onValueChange={(v) => setForm((f) => ({ ...f, unit: v }))}>
                <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (MYR) *</label>
              <Input
                type="number" min={0} step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Justification / Notes</label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Why is this purchase needed?"
              rows={2}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => { onClose(); reset(); }} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={submitting} className="flex-1 bg-orange-600 hover:bg-orange-700">
              {submitting ? "Submitting..." : "Submit Request"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tab 1 — Budget & P&L ─────────────────────────────────────────────────────

interface BudgetPnLProps {
  items: BudgetItem[];
  edition: Edition;
  onAdd: (item: BudgetItem) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: BudgetStatus) => void;
}

function BudgetPnL({ items, edition, onAdd, onDelete, onStatusChange }: BudgetPnLProps) {
  const [modal, setModal] = useState<{ open: boolean; type: BudgetType }>({ open: false, type: "REVENUE" });
  const currency = edition.currency;

  const revenueItems  = items.filter((i) => i.type === "REVENUE");
  const expenseItems  = items.filter(isBudgetExpense);

  const totalRevenue  = revenueItems.reduce((s, i) => s + i.amount, 0);
  const totalExpenses = expenseItems.reduce((s, i) => s + i.amount, 0);
  const paidRevenue   = revenueItems.filter((i) => i.status === "PAID").reduce((s, i) => s + i.amount, 0);
  const paidExpenses  = expenseItems.filter((i) => i.status === "PAID").reduce((s, i) => s + i.amount, 0);
  const netPnL        = paidRevenue - paidExpenses;
  const profitPct     = paidRevenue > 0 ? Math.round(((paidRevenue - paidExpenses) / paidRevenue) * 100) : 0;
  const target        = edition.profitabilityTarget ?? 0;

  function BudgetTable({ rows, type }: { rows: BudgetItem[]; type: BudgetType }) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800 text-sm">
            {type === "REVENUE" ? "💰 Revenue" : "📤 Expenses"}
          </h3>
          <Button
            size="sm"
            onClick={() => setModal({ open: true, type })}
            className={`text-xs ${type === "REVENUE" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}
          >
            + Add {type === "REVENUE" ? "Revenue" : "Expense"}
          </Button>
        </div>
        <div className="overflow-x-auto">
          {rows.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">No items yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((item, idx) => (
                  <tr key={item.id} className={`border-b border-gray-50 ${idx % 2 === 1 ? "bg-gray-50/50" : ""}`}>
                    <td className="px-4 py-2.5 text-xs text-gray-500 font-medium">{item.unit}</td>
                    <td className="px-4 py-2.5 text-gray-700 max-w-[200px] truncate">{item.description}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-800 tabular-nums">{fmt(item.amount, currency)}</td>
                    <td className="px-4 py-2.5">
                      <select
                        value={item.status}
                        onChange={(e) => onStatusChange(item.id, e.target.value as BudgetStatus)}
                        className={`text-xs font-semibold px-2 py-0.5 rounded border-0 cursor-pointer ${STATUS_BADGE[item.status]}`}
                      >
                        <option value="PENDING">Pending</option>
                        <option value="APPROVED">Approved</option>
                        <option value="PAID">Paid</option>
                        <option value="REJECTED">Rejected</option>
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => onDelete(item.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors text-xs"
                        title="Delete"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BudgetTable rows={revenueItems} type="REVENUE" />
        <BudgetTable rows={expenseItems} type="EXPENSE" />
      </div>

      {/* P&L Summary */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h3 className="font-semibold text-gray-800 mb-4">📊 P&L Summary</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div>
            <p className="text-xs text-gray-500 mb-1">Total Budgeted Revenue</p>
            <p className="font-bold text-gray-900">{fmt(totalRevenue, currency)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Total Budgeted Expenses</p>
            <p className="font-bold text-gray-900">{fmt(totalExpenses, currency)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Revenue Collected (Paid)</p>
            <p className="font-bold text-green-700">{fmt(paidRevenue, currency)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Net P&L (Paid items)</p>
            <p className={`font-bold text-lg ${netPnL >= 0 ? "text-green-600" : "text-red-600"}`}>
              {netPnL >= 0 ? "+" : ""}{fmt(netPnL, currency)}
            </p>
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Profitability: {profitPct}%</span>
            <span>Target: {target}%</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${profitPct >= target ? "bg-green-500" : "bg-orange-500"}`}
              style={{ width: `${Math.min(100, Math.max(0, profitPct))}%` }}
            />
          </div>
        </div>
      </div>

      <AddBudgetItemModal
        open={modal.open}
        onClose={() => setModal((s) => ({ ...s, open: false }))}
        editionId={edition.id}
        type={modal.type}
        onCreated={onAdd}
      />
    </div>
  );
}

// ─── Tab 2 — Inventory & Goodie Bags ─────────────────────────────────────────

interface InventoryProps {
  items: BudgetItem[];
  edition: Edition;
  onAdd: (item: BudgetItem) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: BudgetStatus) => void;
  goodieBag: GoodieBagItem[];
  onGoodieBagChange: (items: GoodieBagItem[]) => void;
  savingChecklist: boolean;
  onSaveChecklist: () => void;
}

function InventoryTab({
  items, edition, onAdd, onDelete, onStatusChange,
  goodieBag, onGoodieBagChange, savingChecklist, onSaveChecklist,
}: InventoryProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [gbForm, setGbForm]       = useState({ name: "", qtyPerBag: "1", category: "All", notes: "" });
  const currency = edition.currency;

  const inventoryItems = items.filter((i) => i.type === "EXPENSE" && i.unit === INVENTORY_UNIT);

  const invStatusLabel: Record<BudgetStatus, string> = {
    PENDING:  "Pending Order",
    APPROVED: "Ordered",
    PAID:     "Arrived",
    REJECTED: "Cancelled",
  };
  const invStatusBadge: Record<BudgetStatus, string> = {
    PENDING:  "bg-gray-100 text-gray-600",
    APPROVED: "bg-blue-100 text-blue-700",
    PAID:     "bg-green-100 text-green-700",
    REJECTED: "bg-red-100 text-red-600",
  };

  function addGoodieBagItem() {
    if (!gbForm.name.trim()) { toast.error("Item name is required"); return; }
    const newItem: GoodieBagItem = {
      id:       Date.now().toString(),
      name:     gbForm.name.trim(),
      qtyPerBag: Number(gbForm.qtyPerBag) || 1,
      category:  gbForm.category,
      packed:    false,
      notes:     gbForm.notes.trim(),
    };
    onGoodieBagChange([...goodieBag, newItem]);
    setGbForm({ name: "", qtyPerBag: "1", category: "All", notes: "" });
  }

  function togglePacked(id: string) {
    onGoodieBagChange(goodieBag.map((g) => g.id === id ? { ...g, packed: !g.packed } : g));
  }

  function removeGoodieBagItem(id: string) {
    onGoodieBagChange(goodieBag.filter((g) => g.id !== id));
  }

  const packedCount = goodieBag.filter((g) => g.packed).length;

  return (
    <div className="space-y-4">
      {/* Inventory Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800 text-sm">📦 Inventory Tracker</h3>
          <Button size="sm" onClick={() => setModalOpen(true)} className="bg-green-600 hover:bg-green-700 text-xs">
            + Add Item
          </Button>
        </div>
        <div className="overflow-x-auto">
          {inventoryItems.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">No inventory items yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Item Name</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Cost</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {inventoryItems.map((item, idx) => (
                  <tr key={item.id} className={`border-b border-gray-50 ${idx % 2 === 1 ? "bg-gray-50/50" : ""}`}>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{item.description}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{fmt(item.amount, currency)}</td>
                    <td className="px-4 py-2.5">
                      <select
                        value={item.status}
                        onChange={(e) => onStatusChange(item.id, e.target.value as BudgetStatus)}
                        className={`text-xs font-semibold px-2 py-0.5 rounded border-0 cursor-pointer ${invStatusBadge[item.status]}`}
                      >
                        {(Object.entries(invStatusLabel) as [BudgetStatus, string][]).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => onDelete(item.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors text-xs"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Goodie Bag Checklist */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-800 text-sm">🎁 Goodie Bag Contents</h3>
            {goodieBag.length > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">{packedCount} of {goodieBag.length} items packed</p>
            )}
          </div>
          <Button size="sm" onClick={onSaveChecklist} disabled={savingChecklist} className="bg-orange-600 hover:bg-orange-700 text-xs">
            {savingChecklist ? "Saving..." : "Save Checklist"}
          </Button>
        </div>

        {/* Add goodie bag item row */}
        <div className="px-5 py-3 border-b border-gray-50 bg-gray-50/50">
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs text-gray-500 mb-1">Item name</label>
              <Input
                value={gbForm.name}
                onChange={(e) => setGbForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Tote bag"
                className="h-8 text-sm"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addGoodieBagItem())}
              />
            </div>
            <div className="w-20">
              <label className="block text-xs text-gray-500 mb-1">Qty/bag</label>
              <Input
                type="number" min={1}
                value={gbForm.qtyPerBag}
                onChange={(e) => setGbForm((f) => ({ ...f, qtyPerBag: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
            <div className="w-28">
              <label className="block text-xs text-gray-500 mb-1">Category</label>
              <select
                value={gbForm.category}
                onChange={(e) => setGbForm((f) => ({ ...f, category: e.target.value }))}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {GOODIE_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[120px]">
              <label className="block text-xs text-gray-500 mb-1">Notes</label>
              <Input
                value={gbForm.notes}
                onChange={(e) => setGbForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional"
                className="h-8 text-sm"
              />
            </div>
            <Button size="sm" onClick={addGoodieBagItem} className="bg-orange-600 hover:bg-orange-700 h-8 text-xs shrink-0">
              + Add
            </Button>
          </div>
        </div>

        {goodieBag.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">No goodie bag items yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-2.5 w-10" />
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Item</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Qty/Bag</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {goodieBag.map((g, idx) => (
                  <tr key={g.id} className={`border-b border-gray-50 ${idx % 2 === 1 ? "bg-gray-50/50" : ""}`}>
                    <td className="px-4 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={g.packed}
                        onChange={() => togglePacked(g.id)}
                        className="w-4 h-4 accent-green-500 cursor-pointer"
                      />
                    </td>
                    <td className={`px-4 py-2.5 font-medium ${g.packed ? "line-through text-gray-400" : "text-gray-800"}`}>
                      {g.name}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{g.qtyPerBag}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full">{g.category}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{g.notes || "—"}</td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => removeGoodieBagItem(g.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors text-xs"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddInventoryItemModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editionId={edition.id}
        onCreated={onAdd}
      />
    </div>
  );
}

// ─── Tab 3 — Payment Requests ─────────────────────────────────────────────────

interface PaymentRequestsProps {
  items: BudgetItem[];
  edition: Edition;
  onAdd: (item: BudgetItem) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: BudgetStatus) => void;
}

function PaymentRequests({ items, edition, onAdd, onDelete, onStatusChange }: PaymentRequestsProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const currency = edition.currency;
  const requests = items.filter(isPaymentRequest);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-800 text-sm">🧾 Payment Requests</h3>
        <Button size="sm" onClick={() => setModalOpen(true)} className="bg-orange-600 hover:bg-orange-700 text-xs">
          + New Request
        </Button>
      </div>
      <div className="overflow-x-auto">
        {requests.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">No payment requests yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Request</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Unit</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((item, idx) => {
                const [title, notes] = item.description.includes(" — ")
                  ? item.description.split(" — ", 2)
                  : [item.description, ""];
                return (
                  <tr key={item.id} className={`border-b border-gray-50 ${idx % 2 === 1 ? "bg-gray-50/50" : ""}`}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-800">{title}</p>
                      {notes && <p className="text-xs text-gray-400 mt-0.5">{notes}</p>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{item.unit}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-800">{fmt(item.amount, currency)}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STATUS_BADGE[item.status]}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        {item.status === "PENDING" && (
                          <>
                            <button
                              onClick={() => onStatusChange(item.id, "APPROVED")}
                              className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => onStatusChange(item.id, "REJECTED")}
                              className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {item.status === "APPROVED" && (
                          <button
                            onClick={() => onStatusChange(item.id, "PAID")}
                            className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                          >
                            Mark Paid
                          </button>
                        )}
                        <button
                          onClick={() => onDelete(item.id)}
                          className="text-gray-300 hover:text-red-500 transition-colors text-xs ml-1"
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

      <PaymentRequestModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editionId={edition.id}
        onCreated={onAdd}
      />
    </div>
  );
}

// ─── Tab 4 — Expense Tracker ──────────────────────────────────────────────────

interface ExpenseTrackerProps {
  items: BudgetItem[];
  edition: Edition;
}

function ExpenseTracker({ items, edition }: ExpenseTrackerProps) {
  const currency = edition.currency;

  const allExpenses = items.filter((i) => i.type === "EXPENSE");
  const allRevenue  = items.filter((i) => i.type === "REVENUE");

  const categories = Array.from(new Set(allExpenses.map((i) => i.unit)));

  const chartData = categories.map((cat) => {
    const catItems = allExpenses.filter((i) => i.unit === cat);
    const budgeted = catItems.filter((i) => i.status !== "PAID").reduce((s, i) => s + i.amount, 0);
    const actual   = catItems.filter((i) => i.status === "PAID").reduce((s, i) => s + i.amount, 0);
    return { name: cat.length > 10 ? cat.slice(0, 10) + "…" : cat, fullName: cat, budgeted, actual };
  });

  const categoryRows = categories.map((cat) => {
    const catItems  = allExpenses.filter((i) => i.unit === cat);
    const budgeted  = catItems.filter((i) => i.status !== "PAID").reduce((s, i) => s + i.amount, 0);
    const actual    = catItems.filter((i) => i.status === "PAID").reduce((s, i) => s + i.amount, 0);
    const variance  = budgeted - actual;
    const totalAll  = allExpenses.reduce((s, i) => s + i.amount, 0);
    const pctOfTotal = totalAll > 0 ? Math.round((catItems.reduce((s, i) => s + i.amount, 0) / totalAll) * 100) : 0;
    return { cat, budgeted, actual, variance, pctOfTotal };
  });

  function exportCSV() {
    const header  = "Type,Category,Description,Amount,Status,Date";
    const rows    = items.map((i) =>
      [i.type, i.unit, `"${i.description.replace(/"/g, '""')}"`, i.amount.toFixed(2), i.status,
        new Date(i.createdAt).toLocaleDateString()].join(","),
    );
    const csv  = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `procurement-report-${edition.name.replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalExpBudgeted = allExpenses.filter((i) => i.status !== "PAID").reduce((s, i) => s + i.amount, 0);
  const totalExpActual   = allExpenses.filter((i) => i.status === "PAID").reduce((s, i) => s + i.amount, 0);
  const totalRevPaid     = allRevenue.filter((i) => i.status === "PAID").reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-500 mb-1">Revenue Collected</p>
          <p className="text-xl font-bold text-green-700">{fmt(totalRevPaid, currency)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-500 mb-1">Total Expenses (Paid)</p>
          <p className="text-xl font-bold text-red-600">{fmt(totalExpActual, currency)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-500 mb-1">Uncommitted Budget</p>
          <p className="text-xl font-bold text-gray-800">{fmt(totalExpBudgeted, currency)}</p>
        </div>
      </div>

      {/* Bar chart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 text-sm mb-4">Expense Breakdown by Category</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(value) => [fmt(Number(value ?? 0), currency)]}
                labelFormatter={(label) => {
                  const d = chartData.find((c) => c.name === label);
                  return d?.fullName ?? String(label ?? "");
                }}
              />
              <Legend formatter={(v: string) => v === "budgeted" ? "Budgeted (unpaid)" : "Paid"} />
              <Bar dataKey="budgeted" fill="#e5e7eb" name="budgeted" radius={[3, 3, 0, 0]} />
              <Bar dataKey="actual"   fill="#f97316" name="actual"   radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Category breakdown table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800 text-sm">Category Breakdown</h3>
          <Button size="sm" variant="outline" onClick={exportCSV} className="text-xs">
            ⬇ Export CSV
          </Button>
        </div>
        {categoryRows.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">No expense data yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Budgeted</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actual Spent</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Variance</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {categoryRows.map((r, idx) => (
                  <tr key={r.cat} className={`border-b border-gray-50 ${idx % 2 === 1 ? "bg-gray-50/50" : ""}`}>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{r.cat}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{fmt(r.budgeted, currency)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-800 font-medium">{fmt(r.actual, currency)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${r.variance >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {r.variance >= 0 ? "+" : ""}{fmt(r.variance, currency)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{r.pctOfTotal}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Participant Payments Tab ─────────────────────────────────────────────────

type PaymentStatus = "UNPAID" | "PENDING" | "CONFIRMED" | "PAID" | "OVERDUE" | "WAIVED" | "REFUNDED";

interface ParticipantPayment {
  id: string;
  fullName: string;
  parentEmail: string | null;
  paymentStatus: PaymentStatus;
  paymentLog: { status: string; note?: string; at: string }[] | null;
  feeWave: { id: string; name: string; amount: number } | null;
  registeredAt: string;
}

const PAYMENT_STATUS_BADGE: Record<PaymentStatus, string> = {
  UNPAID:    "bg-gray-100 text-gray-500",
  PENDING:   "bg-yellow-100 text-yellow-700",
  CONFIRMED: "bg-blue-100 text-blue-700",
  PAID:      "bg-green-100 text-green-700",
  OVERDUE:   "bg-red-100 text-red-700",
  WAIVED:    "bg-purple-100 text-purple-600",
  REFUNDED:  "bg-orange-100 text-orange-600",
};

const NEXT_STATUSES: Record<PaymentStatus, PaymentStatus[]> = {
  UNPAID:    ["PENDING", "WAIVED", "OVERDUE"],
  PENDING:   ["CONFIRMED", "WAIVED", "OVERDUE"],
  CONFIRMED: ["PAID", "OVERDUE"],
  PAID:      ["REFUNDED"],
  OVERDUE:   ["PENDING", "WAIVED"],
  WAIVED:    [],
  REFUNDED:  [],
};

function generateReceipt(p: ParticipantPayment, currency: string, editionName: string) {
  const rows: [string, string][] = [
    ["Edition",     editionName],
    ["Participant", p.fullName],
    ["Email",       p.parentEmail ?? "—"],
    ["Wave",        p.feeWave ? p.feeWave.name : "—"],
    ["Amount",      p.feeWave ? `${currency} ${p.feeWave.amount.toFixed(2)}` : "—"],
    ["Status",      p.paymentStatus],
    ["Registered",  new Date(p.registeredAt).toLocaleDateString()],
  ];

  const logRows = (p.paymentLog ?? []).map(e =>
    `<tr>
      <td style="padding:4px 8px;color:#555;white-space:nowrap">${new Date(e.at).toLocaleString()}</td>
      <td style="padding:4px 8px;font-weight:600">${e.status}</td>
      <td style="padding:4px 8px;color:#777">${e.note ?? ""}</td>
    </tr>`
  ).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt</title>
<style>
  body { font-family: sans-serif; padding: 40px; color: #111; max-width: 600px; margin: auto; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .sub { color: #888; font-size: 12px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 6px 10px; font-size: 13px; }
  .label { font-weight: 700; width: 140px; color: #444; }
  hr { border: none; border-top: 1px solid #eee; margin: 20px 0; }
  h2 { font-size: 14px; margin-bottom: 8px; }
  .log td { border-bottom: 1px solid #f0f0f0; }
  @media print { body { padding: 20px; } }
</style></head><body>
<h1>Payment Receipt</h1>
<div class="sub">Generated ${new Date().toLocaleString()}</div>
<table>${rows.map(([l, v]) => `<tr><td class="label">${l}</td><td>${v}</td></tr>`).join("")}</table>
${logRows ? `<hr><h2>Payment History</h2><table class="log">${logRows}</table>` : ""}
</body></html>`;

  const win = window.open("", "_blank", "width=700,height=900");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

function ParticipantPaymentsTab({ editionId, currency, editionName }: { editionId: string; currency: string; editionName: string }) {
  const [participants, setParticipants] = useState<ParticipantPayment[]>([]);
  const [loading,      setLoading     ] = useState(true);
  const [transitioning, setTransitioning] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    participantId: string;
    participantName: string;
    toStatus: PaymentStatus;
    note: string;
  } | null>(null);
  const [detailOpen, setDetailOpen]   = useState<ParticipantPayment | null>(null);

  const load = useCallback(async () => {
    try {
      let all: ParticipantPayment[] = [];
      let page = 1;
      while (true) {
        const res = await fetch(`/api/annual-showcase/editions/${editionId}/participants?limit=100&page=${page}`);
        if (!res.ok) break;
        const data = await res.json() as { participants: ParticipantPayment[]; total: number };
        all = [...all, ...data.participants];
        if (all.length >= data.total) break;
        page++;
      }
      setParticipants(all);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [editionId]);

  useEffect(() => { load(); }, [load]);

  async function confirmTransition() {
    if (!confirmDialog) return;
    const { participantId, toStatus, note } = confirmDialog;
    setTransitioning(participantId);
    setConfirmDialog(null);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}/participants/${participantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentStatus: toStatus, note: note || undefined }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json() as ParticipantPayment;
      setParticipants(prev => prev.map(p => p.id === participantId ? updated : p));
      if (detailOpen?.id === participantId) setDetailOpen(updated);
      toast.success(`Payment status → ${toStatus}`);
    } catch {
      toast.error("Failed to update payment status");
    } finally {
      setTransitioning(null);
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-2">
        {[1,2,3].map(i => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
      </div>
    );
  }

  const totals = participants.reduce((acc, p) => {
    acc[p.paymentStatus] = (acc[p.paymentStatus] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div>
      {/* Summary row */}
      <div className="flex flex-wrap gap-2 px-5 pt-4 pb-2">
        {(Object.entries(totals) as [PaymentStatus, number][]).map(([status, count]) => (
          <span key={status} className={`text-xs font-semibold px-2 py-0.5 rounded ${PAYMENT_STATUS_BADGE[status] ?? "bg-gray-100 text-gray-500"}`}>
            {status}: {count}
          </span>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Name</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Wave</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Amount</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {participants.map(p => {
              const nextStates = NEXT_STATUSES[p.paymentStatus] ?? [];
              const busy = transitioning === p.id;
              return (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/40">
                  <td className="px-5 py-3">
                    <button onClick={() => setDetailOpen(p)} className="font-medium text-gray-800 hover:text-blue-600 text-left">
                      {p.fullName}
                    </button>
                    {p.parentEmail && <div className="text-xs text-gray-400">{p.parentEmail}</div>}
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs">{p.feeWave?.name ?? "—"}</td>
                  <td className="px-5 py-3 text-gray-600 tabular-nums">
                    {p.feeWave ? `${currency} ${p.feeWave.amount.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${PAYMENT_STATUS_BADGE[p.paymentStatus] ?? "bg-gray-100 text-gray-500"}`}>
                      {p.paymentStatus}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1 flex-wrap">
                      {nextStates.map(s => (
                        <button
                          key={s}
                          disabled={busy}
                          onClick={() => setConfirmDialog({ participantId: p.id, participantName: p.fullName, toStatus: s, note: "" })}
                          className="text-xs text-blue-600 hover:bg-blue-50 px-2 py-0.5 rounded border border-blue-200 font-medium disabled:opacity-40"
                        >
                          → {s}
                        </button>
                      ))}
                      {p.paymentStatus === "PAID" && (
                        <button
                          onClick={() => generateReceipt(p, currency, editionName)}
                          className="text-xs text-green-600 hover:bg-green-50 px-2 py-0.5 rounded border border-green-200 font-medium"
                        >
                          🧾 Receipt
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

      {/* Confirm Transition Dialog */}
      {confirmDialog && (
        <Dialog open onOpenChange={o => !o && setConfirmDialog(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Confirm Payment Update</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-600">
              Change <strong>{confirmDialog.participantName}</strong> to{" "}
              <span className={`font-semibold px-1.5 py-0.5 rounded text-xs ${PAYMENT_STATUS_BADGE[confirmDialog.toStatus]}`}>
                {confirmDialog.toStatus}
              </span>?
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
              <input
                type="text"
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                placeholder="e.g. Bank transfer ref #1234"
                value={confirmDialog.note}
                onChange={e => setConfirmDialog(d => d ? { ...d, note: e.target.value } : null)}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={() => setConfirmDialog(null)} className="flex-1">Cancel</Button>
              <Button onClick={confirmTransition} className="flex-1 bg-blue-600 hover:bg-blue-700">Confirm</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Detail Drawer: Payment Log */}
      {detailOpen && (
        <Dialog open onOpenChange={o => !o && setDetailOpen(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Payment Log — {detailOpen.fullName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {(!detailOpen.paymentLog || detailOpen.paymentLog.length === 0) ? (
                <p className="text-sm text-gray-400 py-4 text-center">No payment history yet</p>
              ) : (
                detailOpen.paymentLog.map((entry, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm">
                    <span className={`mt-0.5 text-xs font-semibold px-1.5 py-0.5 rounded shrink-0 ${PAYMENT_STATUS_BADGE[entry.status as PaymentStatus] ?? "bg-gray-100 text-gray-500"}`}>
                      {entry.status}
                    </span>
                    <div>
                      <p className="text-xs text-gray-400">{new Date(entry.at).toLocaleString()}</p>
                      {entry.note && <p className="text-gray-600">{entry.note}</p>}
                    </div>
                  </div>
                ))
              )}
            </div>
            {detailOpen.paymentStatus === "PAID" && (
              <div className="pt-2 border-t border-gray-100">
                <Button
                  size="sm"
                  onClick={() => generateReceipt(detailOpen, currency, editionName)}
                  className="bg-green-600 hover:bg-green-700 w-full"
                >
                  🧾 Download Receipt PDF
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Waitlist Tab ─────────────────────────────────────────────────────────────

interface WaitlistEntry {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  createdAt: string;
}

function WaitlistTab({ editionId }: { editionId: string }) {
  const [entries,  setEntries ] = useState<WaitlistEntry[]>([]);
  const [loading,  setLoading ] = useState(true);

  useEffect(() => {
    fetch(`/api/annual-showcase/editions/${editionId}/waitlist`)
      .then(r => r.ok ? r.json() as Promise<WaitlistEntry[]> : Promise.reject())
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [editionId]);

  if (loading) {
    return (
      <div className="p-6 space-y-2">
        {[1,2,3].map(i => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 text-sm">
        <span className="text-3xl block mb-2">📋</span>
        No waitlist entries yet
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-100">
          <tr>
            <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">#</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Name</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Email</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Phone</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Joined</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, idx) => (
            <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50/50">
              <td className="px-5 py-3 text-gray-400">{idx + 1}</td>
              <td className="px-5 py-3 font-medium text-gray-800">{e.name}</td>
              <td className="px-5 py-3 text-gray-600">{e.email}</td>
              <td className="px-5 py-3 text-gray-500">{e.phone ?? "—"}</td>
              <td className="px-5 py-3 text-gray-400 text-xs whitespace-nowrap">
                {new Date(e.createdAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Procurement Page ────────────────────────────────────────────────────

export default function ProcurementPage() {
  const router = useRouter();
  const { allowed } = useDepartmentAccess("PROCUREMENT");
  const { edition: rawEdition, isLoading: loading } = useActiveEdition();
  const edition = rawEdition as unknown as Edition | null;

  const [budgetItems,     setBudgetItems     ] = useState<BudgetItem[]>([]);
  const [budgetLoading,   setBudgetLoading   ] = useState(false);
  const [activeTab,       setActiveTab       ] = useState<ActiveTab>("budget");
  const [goodieBag,       setGoodieBag       ] = useState<GoodieBagItem[]>([]);
  const [savingChecklist, setSavingChecklist ] = useState(false);
  const [manpowerCount,   setManpowerCount   ] = useState(0);

  // Sync goodie bag checklist from edition when edition changes
  useEffect(() => {
    if (rawEdition?.goodieBagChecklist) {
      setGoodieBag(rawEdition.goodieBagChecklist as GoodieBagItem[]);
    } else {
      setGoodieBag([]);
    }
  }, [rawEdition?.id, rawEdition?.goodieBagChecklist]);

  // Stat card totals
  const totalBudget   = budgetItems.reduce((s, i) => s + i.amount, 0);
  const revCollected  = budgetItems.filter((i) => i.type === "REVENUE" && i.status === "PAID").reduce((s, i) => s + i.amount, 0);
  const totalExpenses = budgetItems.filter((i) => i.type === "EXPENSE").reduce((s, i) => s + i.amount, 0);
  const netPnL        = revCollected - budgetItems.filter((i) => i.type === "EXPENSE" && i.status === "PAID").reduce((s, i) => s + i.amount, 0);
  const currency      = edition?.currency ?? "MYR";

  const fetchBudget = useCallback(async (editionId: string) => {
    setBudgetLoading(true);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}/budget`);
      if (res.ok) {
        const data = await res.json();
        setBudgetItems(data.items ?? []);
      }
    } catch {
      toast.error("Failed to load budget data");
    } finally {
      setBudgetLoading(false);
    }
  }, []);

  useEffect(() => { if (edition?.id) fetchBudget(edition.id); }, [edition?.id, fetchBudget]);

  async function handleStatusChange(itemId: string, status: BudgetStatus) {
    if (!edition) return;
    setBudgetItems((prev) => prev.map((i) => i.id === itemId ? { ...i, status } : i));
    try {
      const res = await fetch(
        `/api/annual-showcase/editions/${edition.id}/budget/${itemId}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) },
      );
      if (!res.ok) throw new Error("Failed to update");
      toast.success("Status updated");
    } catch {
      toast.error("Failed to update status");
      fetchBudget(edition.id);
    }
  }

  async function handleDelete(itemId: string) {
    if (!edition) return;
    setBudgetItems((prev) => prev.filter((i) => i.id !== itemId));
    try {
      const res = await fetch(
        `/api/annual-showcase/editions/${edition.id}/budget/${itemId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Item deleted");
    } catch {
      toast.error("Failed to delete item");
      fetchBudget(edition.id);
    }
  }

  async function handleSaveChecklist() {
    if (!edition) return;
    setSavingChecklist(true);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${edition.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goodieBagChecklist: goodieBag }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Goodie bag checklist saved");
    } catch {
      toast.error("Failed to save checklist");
    } finally {
      setSavingChecklist(false);
    }
  }

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (!allowed) return null;

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (!loading && !edition) {
    return (
      <div className="relative p-6 flex flex-col items-center justify-center min-h-[400px] gap-3">
        <button
          onClick={() => router.push('/annual-showcase/editions')}
          className="absolute top-4 left-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          ← Back to Editions
        </button>
        <span className="text-5xl">🛒</span>
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

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Budget"
          value={fmt(totalBudget, currency)}
          icon="📋"
          subtext="all budget items"
        />
        <StatCard
          label="Revenue Collected"
          value={fmt(revCollected, currency)}
          icon="💰"
          subtext="paid revenue items"
          accentColor="bg-green-500"
        />
        <StatCard
          label="Total Expenses"
          value={fmt(totalExpenses, currency)}
          icon="📤"
          subtext="all expense items"
          accentColor="bg-red-500"
        />
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-start justify-between mb-3">
            <p className="text-sm font-medium text-gray-500">Net P&L</p>
            <span className="text-2xl">📊</span>
          </div>
          <p className={`text-2xl font-bold ${netPnL >= 0 ? "text-green-600" : "text-red-600"}`}>
            {netPnL >= 0 ? "+" : ""}{fmt(netPnL, currency)}
          </p>
          <p className="text-xs text-gray-400 mt-1">revenue − paid expenses</p>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? "border-orange-500 text-orange-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.id === "manpower" && manpowerCount > 0
                ? `👥 Manpower (${manpowerCount})`
                : tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className={budgetLoading ? "p-6" : "p-5"}>
          {budgetLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : (
            <>
              {activeTab === "budget" && (
                <BudgetPnL
                  items={budgetItems}
                  edition={edition!}
                  onAdd={(item) => setBudgetItems((prev) => [...prev, item])}
                  onDelete={handleDelete}
                  onStatusChange={handleStatusChange}
                />
              )}
              {activeTab === "inventory" && (
                <InventoryTab
                  items={budgetItems}
                  edition={edition!}
                  onAdd={(item) => setBudgetItems((prev) => [...prev, item])}
                  onDelete={handleDelete}
                  onStatusChange={handleStatusChange}
                  goodieBag={goodieBag}
                  onGoodieBagChange={setGoodieBag}
                  savingChecklist={savingChecklist}
                  onSaveChecklist={handleSaveChecklist}
                />
              )}
              {activeTab === "payments" && (
                <PaymentRequests
                  items={budgetItems}
                  edition={edition!}
                  onAdd={(item) => setBudgetItems((prev) => [...prev, item])}
                  onDelete={handleDelete}
                  onStatusChange={handleStatusChange}
                />
              )}
              {activeTab === "tracker" && (
                <ExpenseTracker items={budgetItems} edition={edition!} />
              )}
              {activeTab === "manpower" && (
                <ManpowerPanel editionId={edition!.id} unit="PROCUREMENT" onCountChange={setManpowerCount} />
              )}
              {activeTab === "pax-pay" && (
                <ParticipantPaymentsTab
                  editionId={edition!.id}
                  currency={edition!.currency}
                  editionName={edition!.name}
                />
              )}
              {activeTab === "waitlist" && (
                <WaitlistTab editionId={edition!.id} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
