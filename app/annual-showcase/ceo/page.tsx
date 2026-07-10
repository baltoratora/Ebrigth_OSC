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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  unit: string;
  title: string;
  status: string;
  priority: string;
}

interface BudgetItem {
  id: string;
  unit: string;
  type: string;
  description: string;
  amount: number;
  status: string;
}

interface Participant {
  id: string;
  unit: string | null;
}

interface ManpowerEntry {
  id: string;
  unit: string;
  type: string;
  name: string;
}

interface PostMortemResponse {
  id: string;
  editionId: string;
  unit: string;
  wentWell: string | null;
  didNotGoWell: string | null;
  improvements: string | null;
  recommendations: string | null;
  rating: number | null;
  submittedAt: string;
}

type ActiveTab = "overview" | "report" | "postmortem" | "manpower";

// ─── Constants ─────────────────────────────────────────────────────────────────

const DEPARTMENT_UNITS = ["OC", "PROCUREMENT", "SPONSORSHIP", "MEDIA", "SHOWCASE", "YOUTHPRENEUR", "CEO", "LOGISTICS"] as const;

const UNIT_LABELS: Record<string, string> = {
  OC:            "Organising Committee",
  PROCUREMENT:   "Procurement",
  SPONSORSHIP:   "Sponsorship & VVIP",
  MEDIA:         "Media & Publicity",
  SHOWCASE:      "Showcase",
  YOUTHPRENEUR:  "Youthpreneur",
  CEO:           "CEO Unit",
  LOGISTICS:     "Logistics",
};

const UNIT_COLORS: Record<string, string> = {
  OC:           "#3b82f6",
  PROCUREMENT:  "#f97316",
  SPONSORSHIP:  "#eab308",
  MEDIA:        "#ec4899",
  SHOWCASE:     "#8b5cf6",
  YOUTHPRENEUR: "#06b6d4",
  CEO:          "#ef4444",
  LOGISTICS:    "#10b981",
};

const PIE_COLORS = Object.values(UNIT_COLORS);

const TABS: { id: ActiveTab; label: string }[] = [
  { id: "overview",   label: "📊 Edition Overview" },
  { id: "report",     label: "📈 Cross-unit Report" },
  { id: "postmortem", label: "🔍 Post-Mortem" },
  { id: "manpower",   label: "👥 Manpower" },
];

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function daysUntil(d: string | null) {
  if (!d) return null;
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  return diff;
}

// ─── Star Rating ───────────────────────────────────────────────────────────────

function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          type="button"
          onClick={() => onChange?.(i)}
          className={`text-lg leading-none transition-colors ${i <= value ? "text-yellow-400" : "text-gray-200"} ${onChange ? "cursor-pointer hover:text-yellow-300" : "cursor-default"}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

// ─── Overview Tab ──────────────────────────────────────────────────────────────

interface EditionFull {
  id: string;
  name: string;
  theme: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  venueName: string | null;
  venueAddress: string | null;
  participantTarget: number;
  profitabilityTarget: number;
  currency: string;
  registrationDeadline: string | null;
  testRunDate: string | null;
  departmentLeads: Record<string, string> | null;
  createdAt: string;
  _count?: { participants: number; tasks: number };
}

function OverviewTab({ edition, tasks, manpower }: { edition: EditionFull; tasks: Task[]; manpower: ManpowerEntry[] }) {
  const tasksDone = tasks.filter(t => t.status === "DONE").length;
  const daysToEvent = daysUntil(edition.startDate);

  const activityFeed = [
    ...(tasks.slice(-10).reverse().map(t => ({
      time: "task", label: `[${t.unit}] Task: ${t.title} (${t.status})`,
    }))),
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Left column — edition details + dept leads */}
      <div className="lg:col-span-2 space-y-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Edition Details</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {[
              { label: "Theme",           value: edition.theme },
              { label: "Status",          value: edition.status },
              { label: "Start Date",      value: fmtDate(edition.startDate) },
              { label: "End Date",        value: fmtDate(edition.endDate) },
              { label: "Venue",           value: edition.venueName ?? "TBD" },
              { label: "Venue Address",   value: edition.venueAddress ?? "TBD" },
              { label: "Participant Target", value: edition.participantTarget.toLocaleString() },
              { label: "Profitability Target", value: `${edition.currency} ${edition.profitabilityTarget.toLocaleString()}` },
              { label: "Reg. Deadline",   value: fmtDate(edition.registrationDeadline) },
              { label: "Test Run",        value: fmtDate(edition.testRunDate) },
              { label: "Days to Event",   value: daysToEvent !== null ? (daysToEvent > 0 ? `${daysToEvent} days` : daysToEvent === 0 ? "Today!" : `${Math.abs(daysToEvent)} days ago`) : "—" },
              { label: "Total Manpower",  value: manpower.length.toString() },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-gray-400">{label}</p>
                <p className="font-medium text-gray-800">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Dept leads */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Department Leads</h3>
          {!edition.departmentLeads || Object.keys(edition.departmentLeads).length === 0 ? (
            <p className="text-xs text-gray-400">No department leads configured yet. Set them in the edition settings.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DEPARTMENT_UNITS.map(unit => {
                const lead = edition.departmentLeads?.[unit];
                return (
                  <div key={unit} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: UNIT_COLORS[unit] ?? "#94a3b8" }} />
                    <div className="min-w-0">
                      <p className="text-[10px] text-gray-400 leading-none">{UNIT_LABELS[unit] ?? unit}</p>
                      <p className="text-xs font-medium text-gray-700 truncate">{lead ?? "TBD"}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Tasks summary per unit */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Tasks by Unit</h3>
          <div className="space-y-2">
            {DEPARTMENT_UNITS.map(unit => {
              const unitTasks = tasks.filter(t => t.unit === unit);
              const done = unitTasks.filter(t => t.status === "DONE").length;
              const pct = unitTasks.length > 0 ? Math.round((done / unitTasks.length) * 100) : 0;
              return (
                <div key={unit}>
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="text-gray-600">{UNIT_LABELS[unit] ?? unit}</span>
                    <span className="text-gray-400">{done}/{unitTasks.length}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: UNIT_COLORS[unit] ?? "#94a3b8" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right column — activity feed */}
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Activity Feed</h3>
          {activityFeed.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">No recent activity</p>
          ) : (
            <div className="space-y-1.5 max-h-[480px] overflow-y-auto">
              {activityFeed.map((item, idx) => (
                <div key={idx} className="flex gap-2 p-2 rounded-lg hover:bg-gray-50">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 mt-1.5" />
                  <p className="text-xs text-gray-600">{item.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick KPIs */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Key Metrics</h3>
          {[
            { label: "Tasks Done",      value: `${tasksDone}/${tasks.length}`, color: "text-green-600" },
            { label: "Total Manpower",  value: `${manpower.length} people`,    color: "text-blue-600" },
            { label: "Participants",    value: `${edition._count?.participants ?? 0} / ${edition.participantTarget}`, color: "text-purple-600" },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-xs text-gray-500">{label}</span>
              <span className={`text-sm font-semibold ${color}`}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Cross-unit Report Tab ─────────────────────────────────────────────────────

function ReportTab({ tasks, budget, participants, manpower, edition }: {
  tasks: Task[];
  budget: { items: BudgetItem[]; totalRevenue: number; totalExpense: number };
  participants: Participant[];
  manpower: ManpowerEntry[];
  edition: EditionFull;
}) {
  function exportCSV() {
    const rows = [
      ["Unit", "Tasks Total", "Tasks Done", "Budget Revenue (PAID)", "Budget Expense (PAID)", "Participants", "Manpower"],
      ...DEPARTMENT_UNITS.map(unit => {
        const ut = tasks.filter(t => t.unit === unit);
        const done = ut.filter(t => t.status === "DONE").length;
        const rev = budget.items.filter(b => b.unit === unit && b.type === "REVENUE" && b.status === "PAID").reduce((s, b) => s + b.amount, 0);
        const exp = budget.items.filter(b => b.unit === unit && b.type === "EXPENSE" && b.status === "PAID").reduce((s, b) => s + b.amount, 0);
        const pts = participants.filter(p => p.unit === unit).length;
        const mp  = manpower.filter(m => m.unit === unit).length;
        return [UNIT_LABELS[unit] ?? unit, ut.length, done, rev, exp, pts, mp];
      }),
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement("a"), { href: url, download: `${edition.name}-cross-unit-report.csv` });
    a.click();
    URL.revokeObjectURL(url);
  }

  const budgetChartData = DEPARTMENT_UNITS.map(unit => ({
    unit: unit.slice(0, 6),
    Revenue: budget.items.filter(b => b.unit === unit && b.type === "REVENUE" && b.status === "PAID").reduce((s, b) => s + b.amount, 0),
    Expense: budget.items.filter(b => b.unit === unit && b.type === "EXPENSE" && b.status === "PAID").reduce((s, b) => s + b.amount, 0),
  }));

  const participantPieData = DEPARTMENT_UNITS.map((unit, idx) => ({
    name: unit,
    value: participants.filter(p => p.unit === unit).length,
    color: PIE_COLORS[idx] ?? "#94a3b8",
  })).filter(d => d.value > 0);

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button size="sm" onClick={exportCSV} className="bg-red-600 hover:bg-red-700 text-white text-xs">
          ⬇ Export CSV
        </Button>
      </div>

      {/* Unit performance table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {["Department", "Tasks", "Done", "Revenue (MYR)", "Expense (MYR)", "Participants", "Manpower"].map(h => (
                <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DEPARTMENT_UNITS.map((unit, idx) => {
              const ut   = tasks.filter(t => t.unit === unit);
              const done = ut.filter(t => t.status === "DONE").length;
              const rev  = budget.items.filter(b => b.unit === unit && b.type === "REVENUE" && b.status === "PAID").reduce((s, b) => s + b.amount, 0);
              const exp  = budget.items.filter(b => b.unit === unit && b.type === "EXPENSE" && b.status === "PAID").reduce((s, b) => s + b.amount, 0);
              const pts  = participants.filter(p => p.unit === unit).length;
              const mp   = manpower.filter(m => m.unit === unit).length;
              const pct  = ut.length > 0 ? Math.round((done / ut.length) * 100) : 0;
              return (
                <tr key={unit} className={`border-b border-gray-50 hover:bg-gray-50/50 ${idx % 2 === 1 ? "bg-gray-50/30" : ""}`}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: UNIT_COLORS[unit] ?? "#94a3b8" }} />
                      <span className="font-medium text-gray-700 text-xs">{UNIT_LABELS[unit] ?? unit}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs">{ut.length}</td>
                  <td className="px-4 py-2.5 text-xs">
                    <span className={pct === 100 ? "text-green-600 font-semibold" : "text-gray-600"}>{done} ({pct}%)</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-green-600">{rev > 0 ? rev.toLocaleString() : "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-red-500">{exp > 0 ? exp.toLocaleString() : "—"}</td>
                  <td className="px-4 py-2.5 text-xs">{pts > 0 ? pts : "—"}</td>
                  <td className="px-4 py-2.5 text-xs">{mp > 0 ? mp : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Budget by Unit (Paid)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={budgetChartData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="unit" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={60} />
              <Tooltip formatter={(v) => `MYR ${Number(v).toLocaleString()}`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Revenue" fill="#10b981" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Expense" fill="#ef4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Participants by Unit</h3>
          {participantPieData.length === 0 ? (
            <div className="flex items-center justify-center h-[220px]">
              <p className="text-xs text-gray-400">No participant data</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={participantPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                  {participantPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Post-Mortem Tab ───────────────────────────────────────────────────────────

function PostMortemTab({ editionId, editionStatus, responses, onUpdate }: {
  editionId: string;
  editionStatus: string;
  responses: PostMortemResponse[];
  onUpdate: (r: PostMortemResponse) => void;
}) {
  const [submitOpen, setSubmitOpen] = useState(false);
  const [form, setForm] = useState({
    unit: "OC", wentWell: "", didNotGoWell: "", improvements: "", recommendations: "", rating: 5,
  });
  const [submitting, setSubmitting] = useState(false);

  const isUnlocked = editionStatus === "POST_EVENT" || editionStatus === "ARCHIVED";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}/postmortem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? "Failed");
      const saved = await res.json() as PostMortemResponse;
      toast.success("Post-mortem response saved");
      onUpdate(saved);
      setSubmitOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  const unitsWithResponse = new Set(responses.map(r => r.unit));

  if (!isUnlocked) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <span className="text-5xl">🔒</span>
        <p className="text-gray-700 font-semibold">Post-Mortem Not Yet Available</p>
        <p className="text-sm text-gray-400 text-center max-w-xs">
          Post-mortem submissions are unlocked when the edition status is set to{" "}
          <strong>POST_EVENT</strong> or <strong>ARCHIVED</strong>.<br />
          Current status: <span className="font-mono text-red-500">{editionStatus}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{responses.length} / {DEPARTMENT_UNITS.length} units submitted</p>
        <Button size="sm" onClick={() => setSubmitOpen(true)} className="bg-red-600 hover:bg-red-700 text-white text-xs">
          + Submit / Update Response
        </Button>
      </div>

      {/* Per-unit response cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {DEPARTMENT_UNITS.map(unit => {
          const response = responses.find(r => r.unit === unit);
          return (
            <div
              key={unit}
              className={`bg-white rounded-xl border shadow-sm p-4 ${unitsWithResponse.has(unit) ? "border-green-200" : "border-gray-100 border-dashed"}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: UNIT_COLORS[unit] ?? "#94a3b8" }} />
                  <span className="text-sm font-semibold text-gray-700">{UNIT_LABELS[unit] ?? unit}</span>
                </div>
                {response ? (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-700">Submitted</span>
                ) : (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">Pending</span>
                )}
              </div>

              {response ? (
                <div className="space-y-2">
                  {response.rating && <StarRating value={response.rating} />}
                  {[
                    { label: "✅ What went well",   value: response.wentWell },
                    { label: "❌ What didn't",       value: response.didNotGoWell },
                    { label: "💡 Improvements",      value: response.improvements },
                    { label: "📌 Recommendations",   value: response.recommendations },
                  ].map(({ label, value }) => value ? (
                    <div key={label}>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
                      <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{value}</p>
                    </div>
                  ) : null)}
                  <p className="text-[10px] text-gray-300">Submitted {fmtDate(response.submittedAt)}</p>
                  <button
                    onClick={() => {
                      setForm({
                        unit,
                        wentWell:       response.wentWell ?? "",
                        didNotGoWell:   response.didNotGoWell ?? "",
                        improvements:   response.improvements ?? "",
                        recommendations: response.recommendations ?? "",
                        rating:         response.rating ?? 5,
                      });
                      setSubmitOpen(true);
                    }}
                    className="text-xs text-blue-500 hover:text-blue-700"
                  >
                    Edit response
                  </button>
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">No response submitted yet.</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Submit modal */}
      <Dialog open={submitOpen} onOpenChange={o => !o && setSubmitOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Post-Mortem Response</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3 mt-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department / Unit</label>
              <Select value={form.unit} onValueChange={v => setForm(p => ({ ...p, unit: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEPARTMENT_UNITS.map(u => <SelectItem key={u} value={u}>{UNIT_LABELS[u] ?? u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Overall Rating</label>
              <div className="flex items-center gap-3">
                <StarRating value={form.rating} onChange={v => setForm(p => ({ ...p, rating: v }))} />
                <span className="text-sm text-gray-500">{form.rating}/5</span>
              </div>
            </div>
            {[
              { key: "wentWell",        label: "✅ What went well?" },
              { key: "didNotGoWell",    label: "❌ What didn't go well?" },
              { key: "improvements",    label: "💡 Suggested improvements" },
              { key: "recommendations", label: "📌 Recommendations for next year" },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <Textarea
                  value={form[key as keyof typeof form] as string}
                  onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  rows={3}
                  placeholder="Write your thoughts..."
                />
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setSubmitOpen(false)} className="flex-1" disabled={submitting}>Cancel</Button>
              <Button type="submit" disabled={submitting} className="flex-1 bg-red-600 hover:bg-red-700 text-white">
                {submitting ? "Saving..." : "Save Response"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Manpower Summary Tab ──────────────────────────────────────────────────────

function ManpowerSummaryTab({ manpower, editionId }: { manpower: ManpowerEntry[]; editionId: string }) {
  const [manpowerCount, setManpowerCount] = useState(0);

  return (
    <div className="space-y-5">
      {/* All-units summary table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Department</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Internal</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">External</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
            </tr>
          </thead>
          <tbody>
            {DEPARTMENT_UNITS.map((unit, idx) => {
              const all      = manpower.filter(m => m.unit === unit);
              const internal = all.filter(m => m.type === "INTERNAL").length;
              const external = all.filter(m => m.type === "EXTERNAL").length;
              return (
                <tr key={unit} className={`border-b border-gray-50 ${idx % 2 === 1 ? "bg-gray-50/30" : ""}`}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: UNIT_COLORS[unit] ?? "#94a3b8" }} />
                      <span className="text-xs font-medium text-gray-700">{UNIT_LABELS[unit] ?? unit}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-center text-xs text-blue-600">{internal || "—"}</td>
                  <td className="px-4 py-2.5 text-center text-xs text-orange-500">{external || "—"}</td>
                  <td className="px-4 py-2.5 text-center text-xs font-semibold text-gray-700">{all.length || "—"}</td>
                </tr>
              );
            })}
            <tr className="bg-gray-50 font-semibold">
              <td className="px-4 py-2.5 text-xs text-gray-700">TOTAL</td>
              <td className="px-4 py-2.5 text-center text-xs text-blue-600">{manpower.filter(m => m.type === "INTERNAL").length}</td>
              <td className="px-4 py-2.5 text-center text-xs text-orange-500">{manpower.filter(m => m.type === "EXTERNAL").length}</td>
              <td className="px-4 py-2.5 text-center text-xs text-gray-800">{manpower.length}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <ManpowerPanel editionId={editionId} unit="CEO" onCountChange={setManpowerCount} />
      {manpowerCount > 0 && <p className="text-xs text-gray-400 text-right">{manpowerCount} CEO unit entry/entries above</p>}
    </div>
  );
}

// ─── Main CEO Page ─────────────────────────────────────────────────────────────

export default function CEOPage() {
  const router = useRouter();
  const { allowed } = useDepartmentAccess("CEO");
  const { edition: rawEdition, isLoading } = useActiveEdition();
  const edition = rawEdition as unknown as (EditionFull | null);

  const [tasks,       setTasks     ] = useState<Task[]>([]);
  const [budget,      setBudget    ] = useState<{ items: BudgetItem[]; totalRevenue: number; totalExpense: number }>({ items: [], totalRevenue: 0, totalExpense: 0 });
  const [participants,setParticipants] = useState<Participant[]>([]);
  const [manpower,    setManpower  ] = useState<ManpowerEntry[]>([]);
  const [postMortem,  setPostMortem] = useState<PostMortemResponse[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [activeTab,   setActiveTab ] = useState<ActiveTab>("overview");

  const loadData = useCallback(async (editionId: string) => {
    setDataLoading(true);
    try {
      const [tasksRes, budgetRes, participantsRes, manpowerRes, pmRes] = await Promise.all([
        fetch(`/api/annual-showcase/editions/${editionId}/tasks`),
        fetch(`/api/annual-showcase/editions/${editionId}/budget`),
        fetch(`/api/annual-showcase/editions/${editionId}/participants`),
        fetch(`/api/annual-showcase/editions/${editionId}/manpower`),
        fetch(`/api/annual-showcase/editions/${editionId}/postmortem`),
      ]);
      if (tasksRes.ok)        setTasks(await tasksRes.json() as Task[]);
      if (budgetRes.ok)       setBudget(await budgetRes.json() as typeof budget);
      if (participantsRes.ok) {
        const raw = await participantsRes.json() as { participants?: Participant[] } | Participant[];
        setParticipants(Array.isArray(raw) ? raw : (raw.participants ?? []));
      }
      if (manpowerRes.ok)     setManpower(await manpowerRes.json() as ManpowerEntry[]);
      if (pmRes.ok)           setPostMortem(await pmRes.json() as PostMortemResponse[]);
    } catch {
      toast.error("Failed to load data");
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => { if (edition?.id) loadData(edition.id); }, [edition?.id, loadData]);

  // Stats
  const totalParticipants = participants.length;
  const tasksDone         = tasks.filter(t => t.status === "DONE").length;
  const daysToEvent       = daysUntil(edition?.startDate ?? null);
  const daysLabel         = daysToEvent === null ? "—" : daysToEvent > 0 ? String(daysToEvent) : daysToEvent === 0 ? "0" : `-${Math.abs(daysToEvent)}`;

  if (!allowed) return null;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
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
        <span className="text-5xl">👔</span>
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
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Total Participants" value={totalParticipants} icon="👥" subtext={`target: ${edition.participantTarget}`} />
        <StatCard label="Revenue (Paid)"     value={`${edition.currency} ${budget.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon="💰" subtext="paid revenue items" accentColor="bg-green-500" />
        <StatCard label="Total Expenses"     value={`${edition.currency} ${budget.totalExpense.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon="🧾" subtext="paid expense items"  accentColor="bg-red-500" />
        <StatCard label="Tasks Done"         value={`${tasksDone} / ${tasks.length}`} icon="✅" subtext="across all units" accentColor="bg-blue-500"
          progress={tasks.length > 0 ? Math.round((tasksDone / tasks.length) * 100) : 0} />
        <StatCard label="Total Manpower"     value={manpower.length} icon="🏃" subtext={`${manpower.filter(m => m.type === "INTERNAL").length} internal · ${manpower.filter(m => m.type === "EXTERNAL").length} external`} accentColor="bg-purple-500" />
        <StatCard label="Days to Event"      value={daysLabel} icon="📅"
          subtext={daysToEvent === null ? "date not set" : daysToEvent > 0 ? "days remaining" : daysToEvent === 0 ? "today!" : "days ago"}
          accentColor={daysToEvent !== null && daysToEvent <= 14 ? "bg-red-500" : "bg-gray-400"} />
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
                  ? "border-red-500 text-red-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
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
              {activeTab === "overview" && (
                <OverviewTab edition={edition} tasks={tasks} manpower={manpower} />
              )}
              {activeTab === "report" && (
                <ReportTab
                  tasks={tasks}
                  budget={budget}
                  participants={participants}
                  manpower={manpower}
                  edition={edition}
                />
              )}
              {activeTab === "postmortem" && (
                <PostMortemTab
                  editionId={edition.id}
                  editionStatus={edition.status}
                  responses={postMortem}
                  onUpdate={r => setPostMortem(prev => {
                    const existing = prev.find(x => x.unit === r.unit);
                    if (existing) return prev.map(x => x.unit === r.unit ? r : x);
                    return [...prev, r];
                  })}
                />
              )}
              {activeTab === "manpower" && (
                <ManpowerSummaryTab manpower={manpower} editionId={edition.id} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
