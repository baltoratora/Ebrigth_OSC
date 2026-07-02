"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { useActiveEdition } from "@/app/hooks/useActiveEdition";
import StatCard from "@/app/components/annual-showcase/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Edition {
  id:                   string;
  name:                 string;
  participantTarget:    number;
  registrationDeadline: string | null;
  startDate:            string | null;
  status:               string;
}

interface CheckpointEntry { num: number; at: string }

interface Participant {
  id:            string;
  fullName:      string;
  parentName:    string | null;
  parentEmail:   string | null;
  parentPhone:   string | null;
  faStudentId:   string | null;
  emailSentAt:   string | null;
  paymentStatus: string;
  checkpoints?:  CheckpointEntry[];
  registeredAt:  string;
}

const TOTAL_CP = 5;

function CheckpointDots({ checkpoints }: { checkpoints?: CheckpointEntry[] }) {
  const done = (Array.isArray(checkpoints) ? checkpoints : []).map(c => c.num);
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: TOTAL_CP }, (_, i) => {
        const n = i + 1;
        const isDone = done.includes(n);
        return (
          <div
            key={n}
            title={isDone ? `CP${n} done` : `CP${n} pending`}
            className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${
              isDone ? "bg-green-500 text-white" : "bg-gray-100 text-gray-300 border border-gray-200"
            }`}
          >
            {n}
          </div>
        );
      })}
    </div>
  );
}

type Tab = "register" | "list" | "confirm";
const CONFIRMED = "CONFIRMED";

// ─── Register Student Tab ──────────────────────────────────────────────────────

const EMPTY_FORM = { fullName: "", parentName: "", parentEmail: "", parentPhone: "" };

function RegisterTab({
  editionId,
  onRegistered,
}: {
  editionId: string;
  onRegistered: (p: Participant) => void;
}) {
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  function f(k: keyof typeof EMPTY_FORM) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, [k]: e.target.value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fullName.trim())    { toast.error("Student name is required"); return; }
    if (!form.parentEmail.trim()) { toast.error("Parent email is required"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}/participants/invite`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName:    form.fullName.trim(),
          parentName:  form.parentName.trim()  || undefined,
          parentEmail: form.parentEmail.trim().toLowerCase(),
          parentPhone: form.parentPhone.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Registration failed"); return; }
      toast.success(
        data.emailSent
          ? `✅ ${form.fullName} registered — QR email sent to parent`
          : `✅ ${form.fullName} registered (configure SMTP to enable email)`,
      );
      setForm(EMPTY_FORM);
      onRegistered(data.participant);
    } catch {
      toast.error("Failed to register student");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg">
      <form onSubmit={submit} className="space-y-5">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Student Info</p>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Student Name <span className="text-red-500">*</span></label>
            <Input placeholder="Full name" value={form.fullName} onChange={f("fullName")} />
          </div>
        </div>
        <div className="border-t border-gray-100" />
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Parent / Guardian</p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Parent Name</label>
              <Input placeholder="Parent / guardian name" value={form.parentName} onChange={f("parentName")} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Parent Email <span className="text-red-500">*</span></label>
              <Input type="email" placeholder="parent@example.com" value={form.parentEmail} onChange={f("parentEmail")} />
              <p className="text-[11px] text-gray-400 mt-1">QR code will be sent here once SMTP is configured.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Parent Phone</label>
              <Input placeholder="e.g. 012-3456789" value={form.parentPhone} onChange={f("parentPhone")} />
            </div>
          </div>
        </div>
        <Button type="submit" disabled={submitting} className="w-full bg-indigo-600 hover:bg-indigo-700">
          {submitting ? "Registering…" : "Register & Send QR to Parent"}
        </Button>
      </form>
    </div>
  );
}

// ─── Student List Tab ──────────────────────────────────────────────────────────

function StudentListTab({
  editionId,
  participants,
  setParticipants,
}: {
  editionId: string;
  participants: Participant[];
  setParticipants: React.Dispatch<React.SetStateAction<Participant[]>>;
}) {
  const [resending, setResending] = useState<string | null>(null);
  const [deleting,  setDeleting]  = useState<string | null>(null);
  const [search,    setSearch]    = useState("");

  const filtered = search.trim()
    ? participants.filter(p => p.fullName.toLowerCase().includes(search.toLowerCase()))
    : participants;

  async function resendEmail(p: Participant) {
    if (!p.parentEmail) { toast.error("No parent email on record"); return; }
    setResending(p.id);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}/participants/${p.id}/resend-email`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed to send email"); return; }
      toast.success("Email resent");
      setParticipants(prev => prev.map(x => x.id === p.id ? { ...x, emailSentAt: data.emailSentAt } : x));
    } catch {
      toast.error("Failed to send email");
    } finally { setResending(null); }
  }

  function downloadQr(p: Participant) {
    const a = document.createElement("a");
    a.href = `/api/annual-showcase/editions/${editionId}/participants/${p.id}/qr`;
    a.download = `qr-${p.fullName.replace(/\s+/g, "-")}.png`;
    a.click();
  }

  async function deleteParticipant(p: Participant) {
    if (!window.confirm(`Remove ${p.fullName} from the student list?`)) return;
    setDeleting(p.id);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}/participants/${p.id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Failed to delete"); return; }
      setParticipants(prev => prev.filter(x => x.id !== p.id));
      toast.success(`${p.fullName} removed`);
    } catch {
      toast.error("Failed to delete");
    } finally { setDeleting(null); }
  }

  return (
    <div className="space-y-4">
      <Input placeholder="Search by name…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Student List</h3>
          <span className="text-xs text-gray-400">{filtered.length} student{filtered.length !== 1 ? "s" : ""}</span>
        </div>
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">
            {participants.length === 0 ? "No students registered yet — use the Register tab to add one" : "No matches found"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">#</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Name</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Parent Email</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Email Sent</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">CP</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, idx) => (
                  <tr key={p.id} className={`border-b border-gray-50 ${idx % 2 === 1 ? "bg-gray-50/30" : ""}`}>
                    <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{p.fullName}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell">{p.parentEmail || "—"}</td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {p.emailSentAt ? (
                        <span className="text-[10px] bg-green-100 text-green-700 font-semibold px-1.5 py-0.5 rounded">
                          {new Date(p.emailSentAt).toLocaleDateString("en-MY")}
                        </span>
                      ) : (
                        <span className="text-[10px] bg-yellow-100 text-yellow-700 font-semibold px-1.5 py-0.5 rounded">Not sent</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <CheckpointDots checkpoints={p.checkpoints} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end whitespace-nowrap">
                        <button onClick={() => window.open(`/showcase-register/${p.id}`, "_blank")} className="text-xs text-indigo-500 hover:text-indigo-700">View</button>
                        <button onClick={() => downloadQr(p)} className="text-xs text-gray-500 hover:text-gray-700">QR↓</button>
                        {p.parentEmail && (
                          <button onClick={() => resendEmail(p)} disabled={resending === p.id} className="text-xs text-orange-500 hover:text-orange-700 disabled:opacity-40">
                            {resending === p.id ? "…" : "Resend"}
                          </button>
                        )}
                        <button onClick={() => deleteParticipant(p)} disabled={deleting === p.id} className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40">
                          {deleting === p.id ? "…" : "Del"}
                        </button>
                      </div>
                    </td>
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

// ─── Confirm Students Tab ──────────────────────────────────────────────────────

function ConfirmTab({
  editionId,
  participants,
  setParticipants,
}: {
  editionId: string;
  participants: Participant[];
  setParticipants: React.Dispatch<React.SetStateAction<Participant[]>>;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [resending,  setResending]  = useState<string | null>(null);
  const [search,     setSearch]     = useState("");

  const filtered = search.trim()
    ? participants.filter(p => p.fullName.toLowerCase().includes(search.toLowerCase()))
    : participants;

  const confirmedCount = participants.filter(p => p.paymentStatus === CONFIRMED).length;

  async function toggleConfirm(p: Participant) {
    const newStatus = p.paymentStatus === CONFIRMED ? "UNPAID" : CONFIRMED;
    setConfirming(p.id);
    try {
      const res = await fetch(
        `/api/annual-showcase/editions/${editionId}/participants/${p.id}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paymentStatus: newStatus }) },
      );
      if (!res.ok) { toast.error("Failed to update"); return; }
      setParticipants(prev => prev.map(x => x.id === p.id ? { ...x, paymentStatus: newStatus } : x));
      toast.success(newStatus === CONFIRMED ? `✅ ${p.fullName} confirmed` : `${p.fullName} unconfirmed`);
    } catch {
      toast.error("Failed to update");
    } finally { setConfirming(null); }
  }

  async function resendEmail(p: Participant) {
    if (!p.parentEmail) { toast.error("No parent email on record"); return; }
    setResending(p.id);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}/participants/${p.id}/resend-email`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed to send"); return; }
      toast.success("Email resent");
      setParticipants(prev => prev.map(x => x.id === p.id ? { ...x, emailSentAt: data.emailSentAt } : x));
    } catch { toast.error("Failed to send"); }
    finally { setResending(null); }
  }

  function downloadQr(p: Participant) {
    const a = document.createElement("a");
    a.href = `/api/annual-showcase/editions/${editionId}/participants/${p.id}/qr`;
    a.download = `qr-${p.fullName.replace(/\s+/g, "-")}.png`;
    a.click();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <Input placeholder="Search by name…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
        <div className="flex items-center gap-3 ml-auto">
          <span className="text-sm text-gray-500">
            <span className="font-semibold text-green-600">{confirmedCount}</span> / {participants.length} confirmed
          </span>
          {participants.length > 0 && (
            <div className="w-28 bg-gray-100 rounded-full h-2 overflow-hidden">
              <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${Math.round((confirmedCount / participants.length) * 100)}%` }} />
            </div>
          )}
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Confirm Attendance</h3>
        </div>
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">
            {participants.length === 0 ? "No students registered yet" : "No matches found"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">#</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Name</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Parent</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">CP</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, idx) => {
                  const isConfirmed = p.paymentStatus === CONFIRMED;
                  return (
                    <tr key={p.id} className={`border-b border-gray-50 ${isConfirmed ? "bg-green-50/40" : idx % 2 === 1 ? "bg-gray-50/30" : ""}`}>
                      <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{p.fullName}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell">{p.parentName || "—"}</td>
                      <td className="px-4 py-3">
                        {isConfirmed
                          ? <span className="text-[10px] bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">✓ Confirmed</span>
                          : <span className="text-[10px] bg-gray-100 text-gray-500 font-semibold px-2 py-0.5 rounded-full">Pending</span>}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <CheckpointDots checkpoints={p.checkpoints} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end whitespace-nowrap">
                          <button onClick={() => window.open(`/showcase-register/${p.id}`, "_blank")} className="text-xs text-indigo-500 hover:text-indigo-700">View</button>
                          <button onClick={() => downloadQr(p)} className="text-xs text-gray-500 hover:text-gray-700">QR↓</button>
                          {p.parentEmail && (
                            <button onClick={() => resendEmail(p)} disabled={resending === p.id} className="text-xs text-orange-500 hover:text-orange-700 disabled:opacity-40">
                              {resending === p.id ? "…" : "Resend"}
                            </button>
                          )}
                          <button
                            onClick={() => toggleConfirm(p)}
                            disabled={confirming === p.id}
                            className={`text-xs font-medium px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40 ${
                              isConfirmed ? "bg-gray-100 text-gray-600 hover:bg-gray-200" : "bg-green-600 text-white hover:bg-green-700"
                            }`}
                          >
                            {confirming === p.id ? "…" : isConfirmed ? "Undo" : "Confirm"}
                          </button>
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
    </div>
  );
}



// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function RegistrationPage() {
  const { edition: rawEdition, isLoading } = useActiveEdition();
  const edition = rawEdition as unknown as Edition | null;

  const [activeTab,    setActiveTab]    = useState<Tab>("register");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [listLoaded,   setListLoaded]   = useState(false);
  const [listLoading,  setListLoading]  = useState(false);

  // Load participants for stats as soon as edition is known
  const loadParticipants = useCallback(async (editionId: string) => {
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}/participants?limit=200`);
      const data = await res.json();
      setParticipants(data.participants ?? []);
      setListLoaded(true);
    } catch {
      toast.error("Failed to load participants");
    }
  }, []);

  useEffect(() => {
    if (!edition) return;
    setStatsLoading(true);
    loadParticipants(edition.id).finally(() => setStatsLoading(false));
  }, [edition?.id, loadParticipants]);

  // Also reload when switching to list/confirm tabs if not yet loaded
  useEffect(() => {
    if (!edition || listLoaded || activeTab === "register") return;
    setListLoading(true);
    loadParticipants(edition.id).finally(() => setListLoading(false));
  }, [activeTab, edition, listLoaded, loadParticipants]);

  function handleRegistered(p: Participant) {
    setParticipants(prev => [p, ...prev]);
    setListLoaded(true);
  }

  // ─── Derived stats ────────────────────────────────────────────────────────────

  const total       = participants.length;
  const confirmed   = participants.filter(p => p.paymentStatus === CONFIRMED).length;
  const pending     = total - confirmed;
  const emailSent   = participants.filter(p => p.emailSentAt).length;
  const target      = edition?.participantTarget ?? 0;
  const pct         = target > 0 ? Math.round((total / target) * 100) : 0;

  const daysToDeadline = edition?.registrationDeadline
    ? Math.ceil((new Date(edition.registrationDeadline).getTime() - Date.now()) / 86400000)
    : null;

  const recent = participants.slice(0, 5);

  // ─── Loading ───────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (!edition) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px] gap-3">
        <span className="text-5xl">📋</span>
        <h2 className="text-xl font-semibold text-gray-800">No active edition</h2>
        <p className="text-sm text-gray-500 text-center max-w-sm">Select an active edition using the edition switcher in the header.</p>
      </div>
    );
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "register", label: "➕ Register Student" },
    { id: "list",     label: "📋 Student List" },
    { id: "confirm",  label: "✅ Confirm Students" },
  ];

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-3xl sm:text-4xl">📋</span>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Registration</h1>
          <p className="text-sm text-gray-500">{edition.name}</p>
        </div>
      </div>

      {/* Stat cards */}
      {statsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Registered"
            value={target > 0 ? `${total} / ${target.toLocaleString()}` : String(total)}
            icon="🎓"
            accentColor="bg-indigo-500"
            progress={target > 0 ? pct : undefined}
            subtext={target > 0 ? `${pct}% of target` : "students registered"}
          />
          <StatCard
            label="Confirmed"
            value={confirmed}
            icon="✅"
            accentColor="bg-green-500"
            progress={total > 0 ? Math.round((confirmed / total) * 100) : undefined}
            subtext={`${pending} pending confirmation`}
          />
          <StatCard
            label="Email Sent"
            value={emailSent}
            icon="✉️"
            accentColor="bg-blue-500"
            progress={total > 0 ? Math.round((emailSent / total) * 100) : undefined}
            subtext={`${total - emailSent} not yet sent`}
          />
          <StatCard
            label={daysToDeadline !== null && daysToDeadline <= 0 ? "Deadline Passed" : "Days to Deadline"}
            value={
              daysToDeadline === null ? "—"
              : daysToDeadline <= 0   ? "Closed"
              : String(daysToDeadline)
            }
            icon="📅"
            subtext={
              edition.registrationDeadline
                ? new Date(edition.registrationDeadline).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })
                : "No deadline set"
            }
          />
        </div>
      )}

      {/* Recent registrations */}
      {!statsLoading && recent.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Recent Registrations</h3>
            <button onClick={() => setActiveTab("list")} className="text-xs text-indigo-500 hover:text-indigo-700">View all →</button>
          </div>
          <div className="divide-y divide-gray-50">
            {recent.map(p => (
              <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold shrink-0">
                  {p.fullName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{p.fullName}</p>
                  <p className="text-xs text-gray-400">{p.parentEmail || "No email"}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {p.paymentStatus === CONFIRMED && (
                    <span className="text-[10px] bg-green-100 text-green-700 font-semibold px-1.5 py-0.5 rounded-full">✓ Confirmed</span>
                  )}
                  {p.emailSentAt && (
                    <span className="text-[10px] bg-blue-100 text-blue-600 font-semibold px-1.5 py-0.5 rounded-full">Email ✓</span>
                  )}
                  <span className="text-[10px] text-gray-400">
                    {new Date(p.registeredAt).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab panel */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? "text-indigo-700 border-b-2 border-indigo-600 bg-indigo-50/30"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="p-3 sm:p-6">
          {activeTab === "register" && (
            <RegisterTab editionId={edition.id} onRegistered={handleRegistered} />
          )}
          {activeTab === "list" && (
            listLoading
              ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
              : <StudentListTab editionId={edition.id} participants={participants} setParticipants={setParticipants} />
          )}
          {activeTab === "confirm" && (
            listLoading
              ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
              : <ConfirmTab editionId={edition.id} participants={participants} setParticipants={setParticipants} />
          )}

        </div>
      </div>
    </div>
  );
}
