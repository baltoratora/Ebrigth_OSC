"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { UserRoundCheck, Search, X, Trash2, ArrowRightLeft, CheckSquare } from "lucide-react";
import { moveRecruit, bulkMoveRecruits, bulkDeleteRecruits, deleteRecruit } from "@/app/recruitment/_actions";
import { sourceLabel } from "@/lib/recruitment/labels";
import { RecruitDetailModal } from "@/components/recruitment/recruit-detail-modal";
import { InterviewScheduleModal } from "@/components/recruitment/interview-schedule-modal";
import { ResumeUploadModal } from "@/components/recruitment/resume-upload-modal";

// Stages that intercept a drop with a popup before the move is committed.
const INTERVIEW_CODE = "ID"; // Interview Date → date/time picker
const RESUME_CODE = "RS"; // Resume Submission → resume upload (cancel → Buffer Resume)
const BUFFER_RESUME_CODE = "BR"; // where a cancelled RS drop lands

// Stage colour token (rec_stage.color) → static Tailwind dot class.
const DOT: Record<string, string> = {
  slate: "bg-slate-400", zinc: "bg-zinc-400", sky: "bg-sky-400", cyan: "bg-cyan-400",
  indigo: "bg-indigo-400", violet: "bg-violet-400", amber: "bg-amber-400",
  emerald: "bg-emerald-500", teal: "bg-teal-400", rose: "bg-rose-400",
  green: "bg-green-500", lime: "bg-lime-500",
};

interface Card {
  id: string;
  name: string;
  source: string | null;
  position: string | null;
  positions: string[];
  branch: string | null;
  hired: boolean;
  createdAt: string;
  ghlCreatedAt: string | null;
}
interface Column {
  id: string;
  name: string;
  shortCode: string;
  color: string;
  recruits: Card[];
}

const SELECT_CLS =
  "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white";

function cardDate(c: Card) {
  return c.ghlCreatedAt ?? c.createdAt;
}

export function RecruitmentBoard({
  columns: initial,
  canDelete = false,
}: {
  columns: Column[];
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [columns, setColumns] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setColumns(initial), [initial]);

  // Stage-id ↔ shortCode maps (for the special-stage drop popups).
  const codeById = useMemo(() => new Map(columns.map((c) => [c.id, c.shortCode.toUpperCase()])), [columns]);
  const idByCode = useMemo(() => new Map(columns.map((c) => [c.shortCode.toUpperCase(), c.id])), [columns]);

  // ── Detail modal ───────────────────────────────────────────────────────────
  const [detailId, setDetailId] = useState<string | null>(null);

  // ── Special-stage drop popups (Interview / Resume) ──────────────────────────
  const [interviewFor, setInterviewFor] = useState<{ recruitId: string; name: string; fromStageId: string } | null>(null);
  const [resumeFor, setResumeFor] = useState<{ recruitId: string; name: string; fromStageId: string } | null>(null);

  // ── Selection (bulk actions) ────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStage, setBulkStage] = useState("");
  const [busy, setBusy] = useState(false);
  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function clearSelection() {
    setSelected(new Set());
    setBulkStage("");
  }

  // ── Filters ──────────────────────────────────────────────────────────────
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState("");
  const [source, setSource] = useState("");
  const [hiredOnly, setHiredOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { branchOpts, sourceOpts } = useMemo(() => {
    const b = new Set<string>(), s = new Set<string>();
    for (const c of columns) for (const r of c.recruits) {
      if (r.branch) b.add(r.branch);
      if (r.source) s.add(r.source);
    }
    return {
      branchOpts: Array.from(b).sort(),
      sourceOpts: Array.from(s).sort(),
    };
  }, [columns]);

  const filterActive = !!(q || branch || source || hiredOnly || dateFrom || dateTo);
  const match = (r: Card) => {
    if (hiredOnly && !r.hired) return false;
    if (branch && r.branch !== branch) return false;
    if (source && r.source !== source) return false;
    if (dateFrom || dateTo) {
      const d = new Date(cardDate(r)).getTime();
      if (dateFrom && d < new Date(dateFrom + "T00:00:00").getTime()) return false;
      if (dateTo && d > new Date(dateTo + "T23:59:59").getTime()) return false;
    }
    if (q) {
      const s = q.toLowerCase();
      const hay = [r.name, r.branch, r.source, sourceLabel(r.source), ...(r.positions ?? []), r.position];
      if (!hay.some((v) => (v ?? "").toLowerCase().includes(s))) return false;
    }
    return true;
  };
  const displayed = useMemo(
    () => columns.map((c) => ({ ...c, shown: c.recruits.filter(match) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns, q, branch, source, hiredOnly, dateFrom, dateTo],
  );
  const shownTotal = displayed.reduce((s, c) => s + c.shown.length, 0);

  function clearFilters() {
    setQ(""); setBranch(""); setSource(""); setHiredOnly(false); setDateFrom(""); setDateTo("");
  }

  function flash(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 4000);
  }

  // ── Drag → move (single) ─────────────────────────────────────────────────────
  async function onDragEnd(result: DropResult) {
    const { source: src, destination, draggableId } = result;
    if (!destination || src.droppableId === destination.droppableId) return;

    // Special stages intercept the drop with a popup BEFORE committing the move.
    // We don't optimistically move here — the card snaps back to its column and
    // only moves once the popup resolves (so Cancel leaves it where it was).
    const destCode = codeById.get(destination.droppableId);
    if (destCode === INTERVIEW_CODE || destCode === RESUME_CODE) {
      const card = columns.find((c) => c.id === src.droppableId)?.recruits.find((r) => r.id === draggableId);
      if (!card) return;
      const ctx = { recruitId: draggableId, name: card.name, fromStageId: src.droppableId };
      if (destCode === INTERVIEW_CODE) setInterviewFor(ctx);
      else setResumeFor(ctx);
      return;
    }

    const prev = columns;
    // Optimistic move (position within a column isn't persisted — recruits are
    // ordered by submission date on reload — so just lift to the top of dest).
    setColumns((cols) => {
      const card = cols.find((c) => c.id === src.droppableId)?.recruits.find((r) => r.id === draggableId);
      if (!card) return cols;
      return cols.map((c) => {
        if (c.id === src.droppableId) return { ...c, recruits: c.recruits.filter((r) => r.id !== draggableId) };
        if (c.id === destination.droppableId) return { ...c, recruits: [card, ...c.recruits] };
        return c;
      });
    });

    const res = await moveRecruit(draggableId, destination.droppableId);
    if (!res.ok) {
      setColumns(prev);
      flash(res.error ?? "Move failed");
    }
  }

  // ── Bulk actions ─────────────────────────────────────────────────────────────
  const ids = useMemo(() => Array.from(selected), [selected]);

  async function doBulkMove() {
    if (!bulkStage || ids.length === 0) return;
    setBusy(true);
    const prev = columns;
    // optimistic: pull selected cards out of their columns and prepend to target
    setColumns((cols) => {
      const moving: Card[] = [];
      const stripped = cols.map((c) => ({
        ...c,
        recruits: c.recruits.filter((r) => {
          if (selected.has(r.id)) { moving.push(r); return false; }
          return true;
        }),
      }));
      return stripped.map((c) => (c.id === bulkStage ? { ...c, recruits: [...moving, ...c.recruits] } : c));
    });
    const res = await bulkMoveRecruits(ids, bulkStage);
    setBusy(false);
    if (!res.ok) { setColumns(prev); flash(res.error ?? "Bulk move failed"); return; }
    clearSelection();
    router.refresh();
  }

  async function doBulkDelete() {
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} recruit${ids.length === 1 ? "" : "s"}? This can't be undone from here.`)) return;
    setBusy(true);
    const prev = columns;
    setColumns((cols) => cols.map((c) => ({ ...c, recruits: c.recruits.filter((r) => !selected.has(r.id)) })));
    const res = await bulkDeleteRecruits(ids);
    setBusy(false);
    if (!res.ok) { setColumns(prev); flash(res.error ?? "Delete failed"); return; }
    clearSelection();
    router.refresh();
  }

  // ── Special-stage resolution + per-card actions ─────────────────────────────
  function moveCardLocal(recruitId: string, fromStageId: string, toStageId: string) {
    setColumns((cols) => {
      const card = cols.find((c) => c.id === fromStageId)?.recruits.find((r) => r.id === recruitId);
      if (!card) return cols;
      return cols.map((c) => {
        if (c.id === fromStageId) return { ...c, recruits: c.recruits.filter((r) => r.id !== recruitId) };
        if (c.id === toStageId) return { ...c, recruits: [card, ...c.recruits] };
        return c;
      });
    });
  }

  // Interview popup confirmed → the action already moved the card to ID server-side.
  function onInterviewScheduled() {
    if (interviewFor) {
      const idStage = idByCode.get(INTERVIEW_CODE);
      if (idStage) moveCardLocal(interviewFor.recruitId, interviewFor.fromStageId, idStage);
    }
    setInterviewFor(null);
    router.refresh();
  }
  // Resume popup confirmed → upload action moved the card to RS server-side.
  function onResumeUploaded() {
    if (resumeFor) {
      const rsStage = idByCode.get(RESUME_CODE);
      if (rsStage) moveCardLocal(resumeFor.recruitId, resumeFor.fromStageId, rsStage);
    }
    setResumeFor(null);
    router.refresh();
  }
  // Resume popup cancelled → the card drops into Buffer Resume (BR) instead.
  async function onResumeCancel() {
    const ctx = resumeFor;
    setResumeFor(null);
    if (!ctx) return;
    const brStage = idByCode.get(BUFFER_RESUME_CODE);
    if (!brStage) return; // no BR stage configured → just abort the move
    const prev = columns;
    moveCardLocal(ctx.recruitId, ctx.fromStageId, brStage);
    const res = await moveRecruit(ctx.recruitId, brStage);
    if (!res.ok) { setColumns(prev); flash(res.error ?? "Move failed"); return; }
    router.refresh();
  }

  // Per-card delete (HR portal accounts). Soft-deletes the CARD only — never the
  // applicant/contact behind it.
  async function doDeleteCard(id: string) {
    if (!window.confirm("Delete this candidate card? The applicant record is not affected.")) return;
    const prev = columns;
    setColumns((cols) => cols.map((c) => ({ ...c, recruits: c.recruits.filter((r) => r.id !== id) })));
    setSelected((s) => { const n = new Set(s); n.delete(id); return n; });
    const res = await deleteRecruit(id);
    if (!res.ok) { setColumns(prev); flash(res.error ?? "Delete failed"); return; }
    router.refresh();
  }

  // Select-all / clear for one stage's currently-shown cards.
  function toggleSelectStage(stageId: string, shownIds: string[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = shownIds.length > 0 && shownIds.every((id) => next.has(id));
      if (allSelected) shownIds.forEach((id) => next.delete(id));
      else shownIds.forEach((id) => next.add(id));
      return next;
    });
  }

  return (
    <div className="flex h-full flex-col">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 px-6 pb-2 pt-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search recruits…"
            className={`${SELECT_CLS} w-52 pl-8`}
          />
        </div>
        <select value={branch} onChange={(e) => setBranch(e.target.value)} className={SELECT_CLS} title="Filter by branch">
          <option value="">All branches</option>
          {branchOpts.map((b) => <option key={b} value={b}>{b.toUpperCase()}</option>)}
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)} className={SELECT_CLS} title="Filter by source">
          <option value="">All sources</option>
          {sourceOpts.map((s) => <option key={s} value={s}>{sourceLabel(s)}</option>)}
        </select>
        <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <input type="checkbox" checked={hiredOnly} onChange={(e) => setHiredOnly(e.target.checked)} className="h-3.5 w-3.5 accent-emerald-600" />
          Hired only
        </label>
        {/* Date filter — by submission date */}
        <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <span className="text-xs text-slate-400">Submitted</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="From date"
            className="bg-transparent text-sm focus:outline-none scheme-light dark:scheme-dark" />
          <span className="text-slate-400">–</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="To date"
            className="bg-transparent text-sm focus:outline-none scheme-light dark:scheme-dark" />
        </div>
        {filterActive && (
          <button onClick={clearFilters} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-white">
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
        <span className="ml-auto text-xs text-slate-400">{shownTotal} shown</span>
      </div>

      {/* Bulk action bar — appears when ≥1 selected */}
      {selected.size > 0 && (
        <div className="mx-6 mb-1 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-900 dark:bg-emerald-950/30">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            <CheckSquare className="h-4 w-4" /> {selected.size} selected
          </span>
          <span className="mx-1 hidden h-4 w-px bg-emerald-300 sm:block dark:bg-emerald-800" />
          <select value={bulkStage} onChange={(e) => setBulkStage(e.target.value)} className={SELECT_CLS} title="Choose a stage to move to">
            <option value="">Move to…</option>
            {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button
            onClick={doBulkMove}
            disabled={!bulkStage || busy}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" /> Move
          </button>
          {canDelete && (
            <button
              onClick={doBulkDelete}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          )}
          <button onClick={clearSelection} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-white">
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        </div>
      )}

      {error && (
        <div className="mx-6 mt-1 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</div>
      )}

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex-1 overflow-x-auto p-6 pt-4">
          <div className="flex h-full items-stretch gap-3">
            {displayed.map((stage) => (
              <Droppable droppableId={stage.id} key={stage.id}>
                {(provided, snapshot) => (
                  <div className="flex w-72 shrink-0 flex-col rounded-xl border border-emerald-100 bg-emerald-50/40 dark:border-emerald-950/40 dark:bg-emerald-950/10">
                    <div className="flex items-center gap-2 border-b border-emerald-100 px-3 py-2.5 dark:border-emerald-950/40">
                      {/* Per-stage select-all — only while bulk selection is active. */}
                      {selected.size > 0 && stage.shown.length > 0 && (
                        <input
                          type="checkbox"
                          title="Select all in this stage"
                          aria-label={`Select all in ${stage.name}`}
                          checked={stage.shown.every((r) => selected.has(r.id))}
                          onChange={() => toggleSelectStage(stage.id, stage.shown.map((r) => r.id))}
                          className="h-3.5 w-3.5 shrink-0 accent-emerald-600"
                        />
                      )}
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[stage.color] ?? "bg-slate-400"}`} />
                      <span className="flex-1 truncate text-sm font-semibold text-slate-800 dark:text-white">{stage.name}</span>
                      <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-300">{stage.shortCode}</span>
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                        {filterActive ? `${stage.shown.length}/${stage.recruits.length}` : stage.recruits.length}
                      </span>
                    </div>
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex-1 space-y-2 overflow-y-auto p-2 transition-colors ${snapshot.isDraggingOver ? "bg-emerald-100/50 dark:bg-emerald-900/20" : ""}`}
                      style={{ minHeight: 80 }}
                    >
                      {stage.shown.map((r, i) => {
                        const isSel = selected.has(r.id);
                        return (
                          <Draggable draggableId={r.id} index={i} key={r.id}>
                            {(p, snap) => (
                              <div
                                ref={p.innerRef}
                                {...p.draggableProps}
                                {...p.dragHandleProps}
                                onClick={() => setDetailId(r.id)}
                                className={`cursor-pointer rounded-lg border bg-white p-2.5 shadow-sm dark:bg-slate-800 ${
                                  snap.isDragging
                                    ? "border-emerald-400 shadow-md"
                                    : isSel
                                      ? "border-emerald-500 ring-1 ring-emerald-400"
                                      : "border-slate-200 dark:border-slate-700"
                                }`}
                              >
                                <div className="flex items-start gap-2">
                                  <input
                                    type="checkbox"
                                    checked={isSel}
                                    onChange={() => toggleSelect(r.id)}
                                    onClick={(e) => e.stopPropagation()}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-emerald-600"
                                    aria-label={`Select ${r.name}`}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="text-sm font-medium leading-tight text-slate-900 dark:text-white">{r.name}</p>
                                      <div className="flex shrink-0 items-center gap-1">
                                        {r.hired && (
                                          <span title="Matched to a BranchStaff record (hired)" className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                                            <UserRoundCheck className="h-2.5 w-2.5" /> Hired
                                          </span>
                                        )}
                                        {canDelete && (
                                          <button
                                            type="button"
                                            title="Delete card (applicant record is not affected)"
                                            aria-label={`Delete ${r.name}`}
                                            onClick={(e) => { e.stopPropagation(); doDeleteCard(r.id); }}
                                            onMouseDown={(e) => e.stopPropagation()}
                                            className="rounded p-0.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600 dark:text-slate-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                    {/* Positions applied for — one chip each (a person who
                                        applied for several roles shows all of them). */}
                                    {(r.positions?.length ? r.positions : r.position ? [r.position] : []).length > 0 && (
                                      <div className="mt-1.5 flex flex-wrap gap-1">
                                        {(r.positions?.length ? r.positions : [r.position!]).map((p) => (
                                          <span key={p} className="inline-block max-w-full truncate rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" title={p}>
                                            {p}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                      {r.branch && (
                                        <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500 dark:bg-slate-700 dark:text-slate-300">{r.branch}</span>
                                      )}
                                      {r.source && (
                                        <span className="truncate text-[10px] text-slate-400" title={sourceLabel(r.source) ?? undefined}>{sourceLabel(r.source)}</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            ))}
          </div>
        </div>
      </DragDropContext>

      <RecruitDetailModal recruitId={detailId} onClose={() => setDetailId(null)} />

      {interviewFor && (
        <InterviewScheduleModal
          recruitId={interviewFor.recruitId}
          recruitName={interviewFor.name}
          onScheduled={onInterviewScheduled}
          onClose={() => setInterviewFor(null)}
        />
      )}
      {resumeFor && (
        <ResumeUploadModal
          recruitId={resumeFor.recruitId}
          recruitName={resumeFor.name}
          onUploaded={onResumeUploaded}
          onCancelToBuffer={onResumeCancel}
        />
      )}
    </div>
  );
}
