"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMyPermissions } from "@/lib/use-my-permissions";
import { isSuperAdmin } from "@/lib/roles";

// ─── Types ──────────────────────────────────────────────────────────────────

type CtaValue = "" | "Extend" | "Archive" | "Renew" | "No Action";

interface BurnlistEntry {
  id: string;
  studentRecordId: string;
  studentName: string;
  branch: string;     // raw DB code, e.g. "ST"
  expiryDate: string; // YYYY-MM-DD
  cta: CtaValue;
  remarks: string;
  done: boolean;
  updatedAt: string;
}

interface ApiResponse {
  weekKey: string;
  currentWeek: string;
  availableWeeks: string[];
  entries: BurnlistEntry[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

// Canonical branch order — drives the visual sort regardless of insertion
// order. Format: "<DB code> <manager display name>".
const BRANCH_ORDER: string[] = [
  "ST QISTINA",
  "SA AIN",
  "SP JANANI",
  "KD SURAJ",
  "PJY RAFIQ",
  "AMP ZAHID",
  "CJY HANNAH",
  "KLG NIKI",
  "DA GUKEN",
  "BBB KISHA",
  "DK KIRTHIKA",
  "SHA IRFAN",
  "BTHO SELVARAJ",
  "ONL UMMU",
  "BSP IZZATI",
  "EGR ZIKRY",
  "RBY NUREEN",
  "TSG EZRY",
  "KW LAILA",
  "KTG ALIF",
];

const CTA_OPTIONS: { value: CtaValue; label: string; chip: string }[] = [
  { value: "Archive",   label: "Archive",   chip: "bg-slate-200 text-slate-700" },
  { value: "Renew",     label: "Renew",     chip: "bg-amber-100 text-amber-800" },
  { value: "Extend",    label: "Extend",    chip: "bg-emerald-100 text-emerald-800" },
  { value: "No Action", label: "No Action", chip: "bg-red-500 text-white" },
];

const PLACEHOLDER_PREFIX = "__placeholder__";

// ─── Helpers ────────────────────────────────────────────────────────────────

function branchLabelFromCode(code: string): string {
  const upper = code.toUpperCase();
  return BRANCH_ORDER.find((label) => label.startsWith(upper + " ")) ?? upper;
}

function ctaChipClass(value: CtaValue): string {
  return CTA_OPTIONS.find((o) => o.value === value)?.chip ?? "bg-white text-slate-400";
}

function formatExpiry(iso: string): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatHeaderDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${Number(m[2])}/${Number(m[3])}/${m[1]}`;
}

function makePlaceholderRow(branch: string): BurnlistEntry {
  return {
    id: `${PLACEHOLDER_PREFIX}${branch}`,
    studentRecordId: "",
    studentName: "",
    branch,
    expiryDate: "",
    cta: "",
    remarks: "",
    done: false,
    updatedAt: "",
  };
}
function isPlaceholder(e: BurnlistEntry): boolean {
  return e.id.startsWith(PLACEHOLDER_PREFIX);
}

/** Manual rows (added via "+ Add Row") have a synthetic studentRecordId. */
function isManualEntry(e: BurnlistEntry): boolean {
  return e.studentRecordId.startsWith("manual-");
}

// ─── Confirmation modal ────────────────────────────────────────────────────

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  tone: "danger" | "warning";
  onConfirm: () => void;
}

interface ConfirmDialogProps {
  state: ConfirmState | null;
  onCancel: () => void;
}

function ConfirmDialog({ state, onCancel }: ConfirmDialogProps) {
  useEffect(() => {
    if (!state) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") state.onConfirm();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [state, onCancel]);

  if (!state) return null;

  const isDanger = state.tone === "danger";
  const accent = isDanger
    ? { ring: "from-red-500 to-rose-600", btn: "from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 shadow-red-500/30", iconBg: "from-red-100 to-rose-100", iconColor: "text-red-600" }
    : { ring: "from-amber-500 to-orange-600", btn: "from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-amber-500/30", iconBg: "from-amber-100 to-orange-100", iconColor: "text-amber-600" };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]"
      onClick={onCancel}
    >
      <div
        className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl shadow-slate-900/30 ring-1 ring-slate-200 overflow-hidden animate-[scaleIn_0.18s_cubic-bezier(0.4,0,0.2,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${accent.ring}`} />

        <div className="p-6 pt-7">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${accent.iconBg} ${accent.iconColor} flex items-center justify-center flex-shrink-0 shadow-sm`}>
              {isDanger ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-black text-slate-900 tracking-tight">{state.title}</h3>
              <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{state.message}</p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 mt-6">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all active:scale-95"
            >
              Cancel
            </button>
            <button
              onClick={state.onConfirm}
              className={`px-5 py-2 rounded-xl text-sm font-bold text-white bg-gradient-to-r ${accent.btn} shadow-md transition-all active:scale-95`}
              autoFocus
            >
              {state.confirmLabel}
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.94) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}

const WED_INDEX = 3;
function currentWeekWednesday(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysBack = (d.getDay() - WED_INDEX + 7) % 7;
  d.setDate(d.getDate() - daysBack);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// ─── CTA dropdown ──────────────────────────────────────────────────────────

interface CtaCellProps {
  value: CtaValue;
  onChange: (next: CtaValue) => void;
}

function CtaCell({ value, onChange }: CtaCellProps) {
  const [open, setOpen] = useState(false);
  const chip = ctaChipClass(value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className={`w-full min-w-[140px] flex items-center justify-between gap-2 px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide border border-slate-200 shadow-sm ${chip}`}
      >
        <span className="flex-1 text-center">{value || " "}</span>
        <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg p-1 space-y-1">
          {CTA_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(opt.value);
                setOpen(false);
              }}
              className={`w-full text-center px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide ${opt.chip}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Inline-editable date cell ──────────────────────────────────────────────

interface EditableDateProps {
  value: string; // YYYY-MM-DD or ""
  onCommit: (next: string) => void;
}

function EditableDate({ value, onCommit }: EditableDateProps) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        defaultValue={value}
        onBlur={(e) => {
          if (e.target.value !== value) onCommit(e.target.value);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-full bg-white border-2 border-orange-300 rounded-lg px-2 py-1 text-center text-slate-700 font-medium focus:outline-none focus:ring-4 focus:ring-orange-100"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="w-full text-center px-2 py-1 rounded-md hover:bg-orange-50 transition-all text-slate-700 font-medium"
      title="Click to set expiry date"
    >
      {value ? formatExpiry(value) : <span className="text-slate-300">— set —</span>}
    </button>
  );
}

// ─── Inline-editable text cell ──────────────────────────────────────────────

interface EditableTextProps {
  value: string;
  onCommit: (next: string) => void;
  className?: string;
  placeholder?: string;
}

function EditableText({ value, onCommit, className, placeholder }: EditableTextProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <input
      type="text"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={`w-full bg-transparent border border-transparent rounded px-2 py-1 hover:bg-slate-50 focus:bg-white focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all ${className ?? ""}`}
    />
  );
}

// ─── Branch shortcode badge cell ────────────────────────────────────────────

function BranchCell({ code }: { code: string }) {
  const label = branchLabelFromCode(code);
  // BRANCH_ORDER entries are "<DB code> <manager name>" — show only the
  // shortcode portion (before the first space) per user request.
  const firstSpace = label.indexOf(" ");
  const shortcode = firstSpace === -1 ? label : label.slice(0, firstSpace);

  return (
    <div className="w-full flex flex-col items-center px-1 py-1">
      <span className="inline-flex items-center justify-center min-w-[44px] px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-sm">
        {shortcode || "—"}
      </span>
    </div>
  );
}

// ─── Week picker ───────────────────────────────────────────────────────────

interface WeekPickerProps {
  weekKey: string;
  availableWeeks: string[];
  currentWeek: string;
  onSelect: (next: string) => void;
}

function WeekPicker({ weekKey, availableWeeks, currentWeek, onSelect }: WeekPickerProps) {
  const [open, setOpen] = useState(false);
  // Always include the current week as a top option, even before it's been
  // created in DB (the GET endpoint will create it on first hit).
  const merged = useMemo(() => {
    const set = new Set(availableWeeks);
    set.add(currentWeek);
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [availableWeeks, currentWeek]);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-slate-700 bg-white border border-slate-200 hover:border-orange-300 hover:bg-orange-50/40 shadow-sm transition-all"
        title="Switch to a different week"
      >
        <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span>Week of {formatHeaderDate(weekKey)}</span>
        {weekKey === currentWeek && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">Current</span>
        )}
        <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 w-[300px] bg-white border border-slate-200 rounded-xl shadow-xl p-1 max-h-72 overflow-y-auto">
          {merged.map((wk) => {
            const isSelected = wk === weekKey;
            const isCurrent = wk === currentWeek;
            return (
              <button
                key={wk}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(wk);
                  setOpen(false);
                }}
                className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-between gap-3 transition-all whitespace-nowrap ${
                  isSelected
                    ? "bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-sm"
                    : "text-slate-700 hover:bg-orange-50"
                }`}
              >
                <span className="flex-1 min-w-0 truncate">{formatExpiry(wk)}</span>
                {isCurrent && (
                  <span className={`shrink-0 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${isSelected ? "bg-white text-orange-700" : "text-emerald-700 bg-emerald-100"}`}>
                    Current
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────

// Operation history for client-side undo/redo. We store the inverse so
// undo just calls the appropriate API again with the "before" snapshot.
type Op =
  | { kind: "patch"; id: string; before: Partial<BurnlistEntry>; after: Partial<BurnlistEntry> }
  | { kind: "add"; entry: BurnlistEntry }
  | { kind: "delete"; entry: BurnlistEntry };

const HISTORY_LIMIT = 50;

export default function BurnlistPage() {
  const { role } = useMyPermissions();
  const superAdmin = isSuperAdmin(role);

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [weekKey, setWeekKey] = useState<string>(() => currentWeekWednesday());
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const requestSeq = useRef(0); // guards against stale responses

  // Undo/redo stacks — client-only, lost on reload.
  const [past, setPast] = useState<Op[]>([]);
  const [future, setFuture] = useState<Op[]>([]);
  const canUndo = superAdmin && past.length > 0;
  const canRedo = superAdmin && future.length > 0;

  const entries = data?.entries ?? [];

  // ── Fetch ─────────────────────────────────────────────────────────────
  const loadWeek = useCallback(async (wk: string) => {
    const mySeq = ++requestSeq.current;
    setLoading(true);
    setFetchError(null);
    try {
      const url = wk ? `/api/burnlist?week=${encodeURIComponent(wk)}` : "/api/burnlist";
      const res = await fetch(url, { cache: "no-store" });
      const body = await res.json();
      if (mySeq !== requestSeq.current) return;
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      setData(body as ApiResponse);
      setWeekKey((body as ApiResponse).weekKey);
    } catch (e) {
      if (mySeq !== requestSeq.current) return;
      setFetchError(e instanceof Error ? e.message : "Failed to fetch");
    } finally {
      if (mySeq === requestSeq.current) setLoading(false);
    }
  }, []);

  // Initial load + when week changes
  useEffect(() => { loadWeek(weekKey); }, [loadWeek, weekKey]);

  // Wednesday rollover: every 60s, check if the calendar Wednesday has
  // changed since the page was opened. If yes, jump to that new week (which
  // will be auto-created by the API on first hit, with clean entries).
  useEffect(() => {
    const interval = setInterval(() => {
      const live = currentWeekWednesday();
      // Only auto-jump if the user is currently viewing the previous "current"
      // week — don't yank them out of a past-week view they chose explicitly.
      if (data && weekKey === data.currentWeek && live !== data.currentWeek) {
        setWeekKey(live);
      }
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, [data, weekKey]);

  // ── Optimistic PATCH ──────────────────────────────────────────────────
  // pushHistory=false skips recording (used by undo/redo themselves).
  const patchEntry = useCallback(
    async (
      id: string,
      patch: Partial<Pick<BurnlistEntry, "cta" | "remarks" | "done" | "studentName" | "expiryDate" | "branch">>,
      opts?: { pushHistory?: boolean },
    ) => {
      const pushHistory = opts?.pushHistory !== false;

      // Snapshot the BEFORE values for undo, while optimistically applying patch.
      const before: Partial<BurnlistEntry> = {};
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          entries: prev.entries.map((e) => {
            if (e.id !== id) return e;
            const entryAsRec = e as unknown as Record<string, unknown>;
            const beforeAsRec = before as Record<string, unknown>;
            for (const k of Object.keys(patch)) {
              beforeAsRec[k] = entryAsRec[k];
            }
            return { ...e, ...patch };
          }),
        };
      });

      try {
        const res = await fetch(`/api/burnlist/entry/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `HTTP ${res.status}`);
        }
        if (pushHistory) {
          const op: Op = { kind: "patch", id, before, after: patch };
          setPast((p) => [...p, op].slice(-HISTORY_LIMIT));
          setFuture([]);
        }
      } catch (e) {
        setFetchError(e instanceof Error ? e.message : "Save failed — reverting");
        loadWeek(weekKey);
      }
    },
    [loadWeek, weekKey],
  );

  // Add a manual row to the current week. Returns the created entry.
  const addEntry = useCallback(
    async (branch: string, opts?: { pushHistory?: boolean }) => {
      const pushHistory = opts?.pushHistory !== false;
      try {
        const res = await fetch("/api/burnlist/entry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weekKey, branch }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `HTTP ${res.status}`);
        }
        const { entry } = (await res.json()) as { entry: BurnlistEntry };
        setData((prev) => (prev ? { ...prev, entries: [...prev.entries, entry] } : prev));
        if (pushHistory) {
          const op: Op = { kind: "add", entry };
          setPast((p) => [...p, op].slice(-HISTORY_LIMIT));
          setFuture([]);
        }
        return entry;
      } catch (e) {
        setFetchError(e instanceof Error ? e.message : "Add failed");
        return null;
      }
    },
    [weekKey],
  );

  // Delete a row. Returns true on success.
  const deleteEntry = useCallback(
    async (id: string, opts?: { pushHistory?: boolean }) => {
      const pushHistory = opts?.pushHistory !== false;
      let snapshot: BurnlistEntry | undefined;
      setData((prev) => {
        if (!prev) return prev;
        snapshot = prev.entries.find((e) => e.id === id);
        return { ...prev, entries: prev.entries.filter((e) => e.id !== id) };
      });
      try {
        const res = await fetch(`/api/burnlist/entry/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `HTTP ${res.status}`);
        }
        if (pushHistory && snapshot) {
          const op: Op = { kind: "delete", entry: snapshot };
          setPast((p) => [...p, op].slice(-HISTORY_LIMIT));
          setFuture([]);
        }
        return true;
      } catch (e) {
        setFetchError(e instanceof Error ? e.message : "Delete failed — reverting");
        loadWeek(weekKey);
        return false;
      }
    },
    [loadWeek, weekKey],
  );

  // Undo: pop from past, apply inverse, push to future.
  const undo = useCallback(async () => {
    if (past.length === 0) return;
    const op = past[past.length - 1];
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [...f, op]);

    if (op.kind === "patch") {
      await patchEntry(op.id, op.before as Partial<Pick<BurnlistEntry, "cta" | "remarks" | "done" | "studentName" | "expiryDate" | "branch">>, { pushHistory: false });
    } else if (op.kind === "add") {
      // Inverse of add is delete
      await deleteEntry(op.entry.id, { pushHistory: false });
    } else if (op.kind === "delete") {
      // Inverse of delete is re-add. The new entry will get a fresh id, so we
      // also need to immediately re-apply its cta/remarks/done snapshot.
      const deletedEntry = op.entry;
      const re = await addEntry(deletedEntry.branch, { pushHistory: false });
      if (re) {
        await patchEntry(re.id, { studentName: deletedEntry.studentName, cta: deletedEntry.cta, remarks: deletedEntry.remarks, done: deletedEntry.done }, { pushHistory: false });
        // Update the future stack to reference the new id so a subsequent redo works
        setFuture((f) =>
          f.map((x): Op =>
            x.kind === "delete" && x.entry.id === deletedEntry.id
              ? { kind: "delete", entry: { ...deletedEntry, id: re.id } }
              : x,
          ),
        );
      }
    }
  }, [past, patchEntry, addEntry, deleteEntry]);

  const redo = useCallback(async () => {
    if (future.length === 0) return;
    const op = future[future.length - 1];
    setFuture((f) => f.slice(0, -1));
    setPast((p) => [...p, op]);

    if (op.kind === "patch") {
      await patchEntry(op.id, op.after as Partial<Pick<BurnlistEntry, "cta" | "remarks" | "done" | "studentName" | "expiryDate" | "branch">>, { pushHistory: false });
    } else if (op.kind === "add") {
      const addedEntry = op.entry;
      const re = await addEntry(addedEntry.branch, { pushHistory: false });
      if (re) {
        setPast((p) =>
          p.map((x): Op =>
            x.kind === "add" && x.entry.id === addedEntry.id
              ? { kind: "add", entry: { ...addedEntry, id: re.id } }
              : x,
          ),
        );
      }
    } else if (op.kind === "delete") {
      await deleteEntry(op.entry.id, { pushHistory: false });
    }
  }, [future, patchEntry, addEntry, deleteEntry]);

  // Ctrl+Z / Ctrl+Shift+Z keyboard shortcuts (super-admin only).
  useEffect(() => {
    if (!superAdmin) return;
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [superAdmin, undo, redo]);

  // ── Grouping ─────────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, BurnlistEntry[]>();
    entries.forEach((e) => {
      const arr = map.get(e.branch);
      if (arr) arr.push(e);
      else map.set(e.branch, [e]);
    });

    const dateScore = (iso: string) => {
      const t = new Date(iso).getTime();
      return Number.isNaN(t) ? -Infinity : t;
    };

    const out: { branch: string; rows: BurnlistEntry[] }[] = [];

    BRANCH_ORDER.forEach((label) => {
      const code = label.split(" ")[0];
      const realRows = map.get(code);
      const groupRows =
        realRows && realRows.length > 0
          ? [...realRows].sort((a, b) => dateScore(b.expiryDate) - dateScore(a.expiryDate))
          : [makePlaceholderRow(code)];
      out.push({ branch: code, rows: groupRows });
    });

    // Append any unknown branches (a typo in the DB) at the bottom.
    const knownCodes = new Set(BRANCH_ORDER.map((b) => b.split(" ")[0]));
    for (const [branch, branchRows] of map.entries()) {
      if (knownCodes.has(branch)) continue;
      out.push({
        branch,
        rows: [...branchRows].sort((a, b) => dateScore(b.expiryDate) - dateScore(a.expiryDate)),
      });
    }

    return out;
  }, [entries]);

  // ── Stats ─────────────────────────────────────────────────────────────
  // "Branches" shows the TOTAL canonical branches (always 20). Use the size
  // of the grouped derived view so it also includes any unknown branches
  // (rare edge case — branch code in DB not in BRANCH_ORDER).
  const stats = useMemo(() => {
    const counts = { total: 0, extend: 0, archive: 0, renew: 0, noAction: 0, done: 0 };
    entries.forEach((e) => {
      counts.total++;
      if (e.done) counts.done++;
      switch (e.cta) {
        case "Extend":    counts.extend++;   break;
        case "Archive":   counts.archive++;  break;
        case "Renew":     counts.renew++;    break;
        case "No Action": counts.noAction++; break;
      }
    });
    return counts;
  }, [entries]);

  const isViewingCurrentWeek = data ? weekKey === data.currentWeek : true;

  // ── Export helpers ───────────────────────────────────────────────────
  const downloadFile = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportCsv = useCallback(() => {
    const escape = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const header = ["Branch", "Student Name", "Status", "Expiry Date", "Remarks", "Action", "Done"];
    const rows: string[][] = [header];
    grouped.forEach((group) => {
      group.rows.forEach((row) => {
        if (isPlaceholder(row)) {
          rows.push([branchLabelFromCode(row.branch), "None", "—", "—", "—", "—", "—"]);
        } else {
          rows.push([
            branchLabelFromCode(row.branch),
            row.studentName,
            "EXPIRED",
            row.expiryDate ? formatExpiry(row.expiryDate) : "",
            row.remarks,
            row.cta,
            row.done ? "Yes" : "No",
          ]);
        }
      });
    });
    const csv = rows.map((r) => r.map(escape).join(",")).join("\r\n");
    downloadFile(new Blob([csv], { type: "text/csv;charset=utf-8" }), `burnlist-${weekKey}.csv`);
  }, [grouped, weekKey]);

  const exportPdf = useCallback(async () => {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text(`Burnlist — Week of ${formatHeaderDate(weekKey)}`, 40, 40);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Generated ${new Date().toLocaleString("en-GB")} · ${entries.length} expired students`, 40, 58);

    const body: string[][] = [];
    grouped.forEach((group) => {
      group.rows.forEach((row) => {
        if (isPlaceholder(row)) {
          body.push([branchLabelFromCode(row.branch), "None", "—", "—", "—", "—", "—"]);
        } else {
          body.push([
            branchLabelFromCode(row.branch),
            row.studentName,
            "EXPIRED",
            row.expiryDate ? formatExpiry(row.expiryDate) : "",
            row.remarks,
            row.cta,
            row.done ? "✓" : "",
          ]);
        }
      });
    });

    autoTable(doc, {
      startY: 80,
      head: [["Branch", "Student Name", "Status", "Expiry", "Remarks", "Action", "Done"]],
      body,
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [255, 247, 237] },
      columnStyles: {
        0: { cellWidth: 70, fontStyle: "bold" },
        1: { cellWidth: 180 },
        2: { cellWidth: 55, halign: "center" },
        3: { cellWidth: 70, halign: "center" },
        4: { cellWidth: 200 },
        5: { cellWidth: 70, halign: "center" },
        6: { cellWidth: 35, halign: "center" },
      },
      didParseCell: (data) => {
        // Highlight rows whose Done column is ✓ (data is already in 'body').
        if (data.section === "body" && body[data.row.index]?.[6] === "✓") {
          data.cell.styles.fillColor = [254, 240, 138];
        }
      },
    });

    doc.save(`burnlist-${weekKey}.pdf`);
  }, [grouped, entries.length, weekKey]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-slate-50 to-red-50">
      {/* Page Header */}
      <div className="relative bg-gradient-to-r from-white via-orange-50/40 to-white backdrop-blur-md border-b border-orange-100 px-6 py-5 shadow-lg shadow-orange-100/40 z-30">
        {/* Decorative ambient orbs — clipped inside their own wrapper so they
            don't bleed outside the header, but the WeekPicker dropdown can
            still extend below it. */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-16 left-1/4 w-48 h-48 bg-orange-200/20 rounded-full blur-3xl" />
          <div className="absolute -top-12 right-1/4 w-48 h-48 bg-red-200/20 rounded-full blur-3xl" />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-orange-500 via-red-500 to-orange-500" />

        <div className="relative flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl blur-xl opacity-50 animate-pulse" />
              <div className="relative w-14 h-14 bg-gradient-to-br from-orange-400 via-red-500 to-red-700 rounded-2xl flex items-center justify-center shadow-xl ring-2 ring-white">
                <span className="text-white text-3xl drop-shadow-md">🔥</span>
              </div>
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-r from-orange-600 via-red-600 to-red-700 bg-clip-text text-transparent tracking-tighter leading-none">
                Burnlist
              </h1>
              <p className="mt-1.5 text-[10px] text-slate-600 uppercase tracking-[0.3em] font-bold flex items-center gap-1.5">
                <span className="relative flex w-2 h-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex w-2 h-2 rounded-full bg-orange-500" />
                </span>
                Expired Student Credits
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {superAdmin && (
              <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded-xl shadow-sm p-0.5">
                <button
                  onClick={undo}
                  disabled={!canUndo}
                  title="Undo (Ctrl+Z)"
                  aria-label="Undo"
                  className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-slate-600 hover:text-orange-600 hover:bg-orange-50 disabled:text-slate-300 disabled:hover:bg-transparent disabled:hover:text-slate-300 disabled:cursor-not-allowed transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M3 10h11a5 5 0 015 5v0a5 5 0 01-5 5H8m-5-10l4-4m-4 4l4 4" />
                  </svg>
                </button>
                <div className="w-px h-5 bg-slate-200" />
                <button
                  onClick={redo}
                  disabled={!canRedo}
                  title="Redo (Ctrl+Shift+Z)"
                  aria-label="Redo"
                  className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-slate-600 hover:text-orange-600 hover:bg-orange-50 disabled:text-slate-300 disabled:hover:bg-transparent disabled:hover:text-slate-300 disabled:cursor-not-allowed transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 10H10a5 5 0 00-5 5v0a5 5 0 005 5h6m5-10l-4-4m4 4l-4 4" />
                  </svg>
                </button>
              </div>
            )}

            <WeekPicker
              weekKey={weekKey}
              availableWeeks={data?.availableWeeks ?? []}
              currentWeek={data?.currentWeek ?? currentWeekWednesday()}
              onSelect={setWeekKey}
            />
            <button
              onClick={() => loadWeek(weekKey)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 disabled:from-slate-400 disabled:to-slate-500 disabled:cursor-wait px-4 py-2 rounded-xl transition-all shadow-md shadow-emerald-500/30 hover:shadow-lg hover:shadow-emerald-500/40 active:scale-95 ring-1 ring-white/40"
              title="Re-fetch this week's data from the database"
            >
              <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {loading ? "Loading…" : "Refresh"}
            </button>
            <ExportMenu onPdf={exportPdf} onCsv={exportCsv} disabled={loading || entries.length === 0} />
            {superAdmin && (
              <SyncButton
                disabled={loading || !isViewingCurrentWeek}
                onSynced={() => loadWeek(weekKey)}
                onError={(msg) => setFetchError(msg)}
                askConfirm={(state) => setConfirmState(state)}
              />
            )}
            {superAdmin && (
              <button
                onClick={() => addEntry("NEW BRANCH")}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-gradient-to-r from-orange-500 via-red-500 to-red-600 hover:from-orange-600 hover:via-red-600 hover:to-red-700 px-4 py-2 rounded-xl transition-all shadow-md shadow-red-500/30 hover:shadow-lg hover:shadow-red-500/40 active:scale-95 ring-1 ring-white/40"
                title="Add a manual row"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                </svg>
                Add Row
              </button>
            )}
            <Link
              href="/dashboards/hrms"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl transition-all shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back
            </Link>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {fetchError && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-800 rounded-2xl px-4 py-3 shadow-sm">
            <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1 text-sm">
              <p className="font-bold">Something went wrong</p>
              <p className="text-red-700 mt-0.5 text-xs">{fetchError}</p>
            </div>
            <button
              onClick={() => loadWeek(weekKey)}
              className="text-xs font-bold text-red-700 hover:text-red-900 underline underline-offset-4"
            >
              Retry
            </button>
          </div>
        )}

        {!isViewingCurrentWeek && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl px-4 py-2.5 shadow-sm text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-semibold">Viewing past week.</span>
            <span className="text-amber-800">Edits still save — switch to “Current” to go back to today's list.</span>
          </div>
        )}

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
          <StatCard label="Total Expired"      value={stats.total}     accent="from-orange-500 to-red-600"     icon="🔥" />
          <StatCard label="Total Branches"     value={20}              accent="from-slate-600 to-slate-800"    icon="🏢" />
          <StatCard label="Extend"             value={stats.extend}    accent="from-emerald-500 to-emerald-700" icon="✓" />
          <StatCard label="Archive"            value={stats.archive}   accent="from-slate-400 to-slate-600"    icon="📦" />
          <StatCard label="Renew"              value={stats.renew}     accent="from-amber-400 to-amber-600"    icon="↻" />
          <StatCard label="No Action"          value={stats.noAction}  accent="from-red-500 to-red-700"        icon="✕" />
          <StatCard label="Done"               value={stats.done}      accent="from-blue-500 to-blue-700"      icon="✅" />
        </div>

        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-200">
          {/* Title row */}
          <div className="relative px-6 py-8 border-b border-slate-200 text-center bg-gradient-to-br from-white via-orange-50/40 to-red-50/60 overflow-hidden">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-gradient-to-br from-orange-200/40 to-red-300/30 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-gradient-to-br from-red-200/30 to-orange-200/30 rounded-full blur-3xl pointer-events-none" />

            <div className="relative inline-flex items-baseline gap-3 flex-wrap justify-center">
              <span className="text-3xl md:text-5xl font-black text-slate-900 tracking-tighter">Up to</span>
              <span className="text-3xl md:text-5xl font-black tracking-tighter px-4 py-1 rounded-xl bg-gradient-to-r from-orange-600 via-red-600 to-red-700 text-transparent bg-clip-text">
                {formatHeaderDate(weekKey)}
              </span>
            </div>
            <p className="relative text-[11px] text-slate-500 mt-3 uppercase tracking-[0.3em] font-semibold">
              Auto-refreshes every Wednesday · changes save automatically
            </p>
          </div>

          <div>
            <table className="w-full text-sm border-collapse">
              <thead className="bg-gradient-to-b from-slate-900 to-slate-800 sticky top-0 z-30 shadow-lg shadow-slate-900/40">
                <tr>
                  <th className="w-[140px] text-center py-4 px-3 text-white text-[11px] font-black uppercase tracking-[0.25em]">
                    <span className="inline-flex items-center gap-1.5">🏢 Branch</span>
                  </th>
                  <th className="text-left   py-4 px-3 text-white text-[11px] font-black uppercase tracking-[0.25em]">
                    <span className="inline-flex items-center gap-1.5">👤 Student Name</span>
                  </th>
                  <th className="w-[120px] text-center py-4 px-3 text-white text-[11px] font-black uppercase tracking-[0.25em]">Status</th>
                  <th className="w-[160px] text-center py-4 px-3 text-white text-[11px] font-black uppercase tracking-[0.25em]">
                    <span className="inline-flex items-center gap-1.5">📅 Expiry</span>
                  </th>
                  <th className="text-left   py-4 px-3 text-white text-[11px] font-black uppercase tracking-[0.25em]">
                    <span className="inline-flex items-center gap-1.5">📝 Remarks</span>
                  </th>
                  <th className="w-[180px] text-center py-4 px-3 text-white text-[11px] font-black uppercase tracking-[0.25em]">Action</th>
                  <th className="w-[90px]  text-center py-4 px-3 text-white text-[11px] font-black uppercase tracking-[0.25em]">Done</th>
                </tr>
                <tr>
                  <th colSpan={7} className="h-1 p-0 bg-gradient-to-r from-orange-500 via-red-500 to-orange-500"></th>
                </tr>
              </thead>
              <tbody>
                {loading && entries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-slate-400">
                      <div className="inline-flex items-center gap-3">
                        <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Loading expired students…
                      </div>
                    </td>
                  </tr>
                ) : (
                  grouped.map((group, groupIndex) =>
                    group.rows.map((row, localIndex) => {
                      const isLastInGroup = localIndex === group.rows.length - 1;
                      const isLastGroup = groupIndex === grouped.length - 1;
                      const placeholder = isPlaceholder(row);
                      return (
                        <tr
                          key={row.id}
                          className={`group transition-colors ${
                            placeholder
                              ? "bg-slate-50/40"
                              : row.done
                                ? "bg-amber-100/70 hover:bg-amber-100"
                                : "hover:bg-amber-50/40"
                          } ${!isLastInGroup ? "border-b border-slate-100" : ""} ${
                            isLastInGroup && !isLastGroup ? "border-b-2 border-orange-100" : ""
                          }`}
                        >
                          {localIndex === 0 && (
                            <td
                              rowSpan={group.rows.length}
                              className="align-middle py-4 px-3 bg-slate-50/40 border-r border-slate-200/80"
                            >
                              <BranchCell code={row.branch} />
                              {superAdmin && (
                                <button
                                  onClick={() => addEntry(row.branch)}
                                  className="mt-2 inline-flex items-center justify-center gap-1 w-full text-[10px] font-bold text-orange-700 hover:text-white bg-orange-50 hover:bg-gradient-to-r hover:from-orange-500 hover:to-red-500 border border-orange-200 hover:border-transparent py-1 rounded-md transition-all uppercase tracking-wider shadow-sm hover:shadow-md"
                                  title={`Add a new row under ${row.branch}`}
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                                  </svg>
                                  Add
                                </button>
                              )}
                            </td>
                          )}
                          <td className="py-2.5 px-3 text-slate-800 font-medium">
                            {placeholder ? (
                              <span className="inline-block px-2 py-1 text-slate-400 italic font-medium select-none">None</span>
                            ) : superAdmin ? (
                              <EditableText
                                value={row.studentName}
                                placeholder="Student name"
                                onCommit={(next) => patchEntry(row.id, { studentName: next })}
                              />
                            ) : (
                              <span className="px-2 py-1 select-text">{row.studentName || <span className="text-slate-400 italic">—</span>}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {placeholder ? (
                              <span className="text-slate-300 font-medium select-none">—</span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-red-50 text-red-700 ring-1 ring-red-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                Expired
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center text-slate-700 font-medium">
                            {placeholder ? (
                              <span className="text-slate-300 select-none">—</span>
                            ) : superAdmin && isManualEntry(row) ? (
                              <EditableDate
                                value={row.expiryDate}
                                onCommit={(next) => patchEntry(row.id, { expiryDate: next })}
                              />
                            ) : (
                              <span>{row.expiryDate ? formatExpiry(row.expiryDate) : <span className="text-slate-300">—</span>}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            {placeholder ? (
                              <div className="text-slate-300 font-medium select-none">—</div>
                            ) : (
                              <EditableText
                                value={row.remarks}
                                placeholder="Add remark…"
                                className="text-slate-800 font-medium placeholder:text-red-500 placeholder:italic placeholder:font-medium placeholder:opacity-100"
                                onCommit={(next) => patchEntry(row.id, { remarks: next })}
                              />
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            {placeholder ? (
                              <div className="text-center text-slate-300 font-medium select-none">—</div>
                            ) : (
                              <CtaCell value={row.cta} onChange={(next) => patchEntry(row.id, { cta: next })} />
                            )}
                          </td>
                          <td className="py-2 px-2 text-center">
                            {placeholder ? (
                              <span className="text-slate-300 font-medium select-none">—</span>
                            ) : (
                              <div className="inline-flex items-center justify-center gap-1.5">
                                <button
                                  onClick={superAdmin ? () => patchEntry(row.id, { done: !row.done }) : undefined}
                                  disabled={!superAdmin}
                                  className={`w-7 h-7 inline-flex items-center justify-center rounded-full transition-all shadow-sm ring-1 ${
                                    row.done
                                      ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white ring-emerald-500/30 shadow-emerald-500/30"
                                      : "bg-white text-slate-300 ring-slate-200"
                                  } ${
                                    superAdmin
                                      ? "active:scale-90 " + (row.done ? "" : "hover:text-emerald-500 hover:ring-emerald-200 hover:bg-emerald-50")
                                      : "cursor-not-allowed opacity-90"
                                  }`}
                                  title={
                                    !superAdmin
                                      ? row.done
                                        ? "Marked done by an admin"
                                        : "Only SUPER_ADMIN can mark done"
                                      : row.done
                                        ? "Mark as not done"
                                        : "Mark as done"
                                  }
                                  aria-label={row.done ? "Done" : "Not done"}
                                  aria-pressed={row.done}
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                  </svg>
                                </button>
                                {superAdmin && (
                                  <button
                                    onClick={() => {
                                      const label = row.studentName.trim();
                                      setConfirmState({
                                        title: "Delete row?",
                                        message: label
                                          ? `Remove "${label}" from this week's burnlist? This can be undone with Ctrl+Z.`
                                          : "Remove this unnamed row? This can be undone with Ctrl+Z.",
                                        confirmLabel: "Delete",
                                        tone: "danger",
                                        onConfirm: () => {
                                          deleteEntry(row.id);
                                          setConfirmState(null);
                                        },
                                      });
                                    }}
                                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-7 h-7 inline-flex items-center justify-center rounded-full text-red-500 hover:text-white hover:bg-red-500 transition-all"
                                    title="Delete row"
                                    aria-label="Delete row"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    }),
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ConfirmDialog state={confirmState} onCancel={() => setConfirmState(null)} />
    </div>
  );
}

// ─── Sync with AONE button ─────────────────────────────────────────────────

interface SyncButtonProps {
  disabled?: boolean;
  onSynced: () => void;
  onError: (msg: string) => void;
  askConfirm: (state: ConfirmState) => void;
}

/** Today is Wednesday in Asia/Kuala_Lumpur. Mirrors the server-side check. */
function isMalaysiaWednesday(): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kuala_Lumpur",
    weekday: "long",
  }).format(new Date());
  return weekday === "Wednesday";
}

function SyncButton({ disabled, onSynced, onError, askConfirm }: SyncButtonProps) {
  const [busy, setBusy] = useState(false);
  const isWed = isMalaysiaWednesday();
  const locked = disabled || busy || !isWed;

  const doSync = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/burnlist/sync", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      onSynced();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  const handleClick = () => {
    askConfirm({
      title: "Sync with AONE?",
      message:
        "This mirrors the current week against the live AONE student records. New expired students get added; students no longer in AONE get REMOVED — including any CTA, remarks, or done marks they had. The burnlist will look exactly like AONE after sync.",
      confirmLabel: "Sync now",
      tone: "warning",
      onConfirm: () => {
        doSync();
      },
    });
  };

  return (
    <button
      onClick={handleClick}
      disabled={locked}
      className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-gradient-to-r from-purple-500 to-purple-700 hover:from-purple-600 hover:to-purple-800 disabled:from-slate-400 disabled:to-slate-500 disabled:cursor-not-allowed px-4 py-2 rounded-xl transition-all shadow-md shadow-purple-500/30 hover:shadow-lg hover:shadow-purple-500/40 active:scale-95 ring-1 ring-white/40"
      title={
        !isWed
          ? "Sync is only available on Wednesdays (Malaysia time)"
          : disabled
            ? "Sync only runs on the current week"
            : busy
              ? "Syncing…"
              : "Refresh this week from the latest student records (AONE)"
      }
    >
      <svg className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M8 16H3v5M16 8h5V3m-1 5A8 8 0 005.6 6.2M4 16a8 8 0 0014.4 1.8" />
      </svg>
      {busy ? "Syncing…" : "Sync AONE"}
      {!isWed && <span className="ml-1 text-[9px] font-bold opacity-90">🔒 WED ONLY</span>}
    </button>
  );
}

// ─── Export menu ───────────────────────────────────────────────────────────

interface ExportMenuProps {
  onPdf: () => void;
  onCsv: () => void;
  disabled?: boolean;
}

function ExportMenu({ onPdf, onCsv, disabled }: ExportMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 disabled:from-slate-400 disabled:to-slate-500 disabled:cursor-not-allowed px-4 py-2 rounded-xl transition-all shadow-md shadow-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/40 active:scale-95 ring-1 ring-white/40"
        title="Export this week's burnlist"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Export
        <svg className="w-3 h-3 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 w-[200px] bg-white border border-slate-200 rounded-xl shadow-xl p-1">
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onPdf(); setOpen(false); }}
            className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-slate-700 hover:bg-indigo-50 flex items-center gap-2 transition-all"
          >
            <span className="text-base">📄</span> Download PDF
          </button>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onCsv(); setOpen(false); }}
            className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-slate-700 hover:bg-indigo-50 flex items-center gap-2 transition-all"
          >
            <span className="text-base">📊</span> Download CSV (Excel)
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Stat card ─────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number;
  accent: string;
  icon: string;
}
function StatCard({ label, value, accent, icon }: StatCardProps) {
  return (
    <div className="relative bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent}`} />
      <div className="p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${accent} text-white flex items-center justify-center shadow-md text-lg flex-shrink-0`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 leading-tight break-words">{label}</p>
          <p className="text-2xl font-black text-slate-900 leading-none mt-1">{value}</p>
        </div>
      </div>
    </div>
  );
}
