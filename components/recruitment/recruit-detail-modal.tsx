"use client";

import { useEffect, useState } from "react";
import {
  X, UserRoundCheck, Loader2, Clock, CalendarDays, FileText,
  Phone, Mail, MapPin, GraduationCap, Users, Briefcase, Globe, Download,
} from "lucide-react";
import { getRecruitDetail, moveRecruit, type RecruitDetail } from "@/app/recruitment/_actions";
import { formTypeLabel, sourceLabel } from "@/lib/recruitment/labels";

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Kuala_Lumpur",
  });
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
}

function Field({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
        <dd className="mt-0.5 break-words text-sm font-medium text-slate-800 dark:text-slate-200">{value || <span className="font-normal text-slate-400">—</span>}</dd>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">{children}</h3>;
}

// Shared recruit detail drawer. Pass a recruitId to open; null closes it.
export function RecruitDetailModal({
  recruitId,
  onClose,
  stages = [],
  onMoved,
  onMove,
}: {
  recruitId: string | null;
  onClose: () => void;
  /** Full ordered stage list — powers the "Move to stage" dropdown (drag-free). */
  stages?: { id: string; name: string; shortCode: string }[];
  /** Called after a successful stage move so the board can refresh. */
  onMoved?: () => void;
  /**
   * When provided, the "Move to stage" dropdown delegates the move to the board
   * instead of calling moveRecruit directly — so the board can intercept special
   * stages (Interview Date / Resume Submission) with their popups, exactly like
   * a drag would. The board is responsible for closing this modal.
   */
  onMove?: (toStageId: string) => void;
}) {
  const [detail, setDetail] = useState<RecruitDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  async function handleMove(toStageId: string) {
    if (!recruitId || !toStageId) return;
    setMoving(true);
    setErr(null);
    const res = await moveRecruit(recruitId, toStageId);
    setMoving(false);
    if (!res.ok) {
      setErr(res.error ?? "Move failed");
      return;
    }
    onMoved?.();
    onClose();
  }

  useEffect(() => {
    if (!recruitId) return;
    let active = true;
    setLoading(true);
    setErr(null);
    setDetail(null);
    // Race the action against a timeout so a rejected OR hung server action
    // surfaces an error instead of an endless "Loading recruit…" spinner.
    Promise.race([
      getRecruitDetail(recruitId),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timed out loading recruit — try again")), 20000),
      ),
    ])
      .then((res) => {
        if (!active) return;
        if (res.ok && res.detail) setDetail(res.detail);
        else setErr(res.error ?? "Failed to load");
        setLoading(false);
      })
      .catch((e) => {
        if (!active) return;
        setErr(e instanceof Error ? e.message : "Failed to load recruit");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [recruitId]);

  useEffect(() => {
    if (!recruitId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recruitId, onClose]);

  if (!recruitId) return null;

  const positions = detail?.positions?.length ? detail.positions : detail?.position ? [detail.position] : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative border-b border-slate-100 bg-linear-to-br from-emerald-50 to-teal-50 px-6 py-5 dark:border-slate-800 dark:from-emerald-950/30 dark:to-slate-900">
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 transition hover:bg-white/60 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-emerald-500 to-teal-600 text-lg font-bold text-white shadow-sm">
              {detail ? initials(detail.name) : "…"}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-bold text-slate-900 dark:text-white">
                  {detail?.name ?? (loading ? "Loading…" : "Recruit")}
                </h2>
                {detail?.hired && (
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                    <UserRoundCheck className="h-2.5 w-2.5" /> Hired
                  </span>
                )}
              </div>
              {detail && (
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {detail.stageName} · {detail.stageShort}
                  </span>
                  {detail.branch && <span className="uppercase">{detail.branch}</span>}
                </p>
              )}
            </div>
          </div>

          {/* Positions applied */}
          {positions.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              {positions.map((p) => (
                <span key={p} className="rounded-md bg-white/80 px-2 py-0.5 text-[11px] font-medium text-emerald-700 shadow-sm dark:bg-slate-800 dark:text-emerald-300">
                  {p}
                </span>
              ))}
            </div>
          )}

          {/* Move to stage — drag-free way to reassign across the ~28 stages */}
          {detail && stages.length > 0 && (
            <div className="mt-4 flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Move to</span>
              <select
                value={stages.find((s) => s.shortCode === detail.stageShort)?.id ?? ""}
                onChange={(e) => (onMove ? onMove(e.target.value) : handleMove(e.target.value))}
                disabled={moving}
                className="max-w-55 rounded-lg border border-slate-300 bg-white/90 px-2 py-1 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                title="Move this candidate to another stage"
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {moving && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="max-h-[65vh] overflow-y-auto px-6 py-5">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading recruit…
            </div>
          )}
          {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{err}</p>}

          {detail && (
            <div className="space-y-6">
              {/* Contact */}
              <section>
                <SectionTitle>Contact</SectionTitle>
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field icon={Phone} label="Phone" value={detail.phone} />
                  <Field icon={Mail} label="Email" value={detail.email} />
                  <Field icon={MapPin} label="City" value={detail.hrfs?.city} />
                  <Field icon={Globe} label="Source" value={sourceLabel(detail.source)} />
                </dl>
              </section>

              {/* Application */}
              <section className="border-t border-slate-100 pt-5 dark:border-slate-800">
                <SectionTitle>Application</SectionTitle>
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field icon={FileText} label="Type of form" value={formTypeLabel(detail.hrfs?.formType)} />
                  <Field icon={GraduationCap} label="Education level" value={detail.hrfs?.educationLevel} />
                  <Field icon={Users} label="Gender" value={detail.hrfs?.gender} />
                  <Field icon={UserRoundCheck} label="Matched staff" value={detail.branchStaffId ? `BranchStaff #${detail.branchStaffId}` : "Not matched"} />
                  <Field icon={Clock} label="Submitted" value={fmt(detail.hrfs?.createdAt ?? detail.ghlCreatedAt ?? detail.createdAt)} />
                  <Field icon={Clock} label="Last updated" value={fmt(detail.hrfs?.updatedAt ?? detail.updatedAt)} />
                </dl>
              </section>

              {/* Interview */}
              {detail.interview && (
                <div className="flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm dark:border-indigo-950/40 dark:bg-indigo-950/30">
                  <CalendarDays className="h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                  <div>
                    <p className="font-semibold text-indigo-800 dark:text-indigo-200">Interview scheduled</p>
                    <p className="text-xs text-indigo-600 dark:text-indigo-300">
                      {fmt(detail.interview.scheduledAt)}
                      {detail.interview.location ? ` · ${detail.interview.location}` : ""}
                    </p>
                  </div>
                </div>
              )}

              {/* Resumes */}
              {detail.resumes.length > 0 && (
                <section className="border-t border-slate-100 pt-5 dark:border-slate-800">
                  <SectionTitle>Resumes</SectionTitle>
                  <ul className="space-y-2">
                    {detail.resumes.map((rs) => (
                      <li key={rs.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                        <a
                          href={`/recruitment/api/resume/${rs.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex min-w-0 items-center gap-2 text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                        >
                          <FileText className="h-4 w-4 shrink-0" />
                          <span className="truncate">{rs.fileName}</span>
                        </a>
                        <div className="flex shrink-0 items-center gap-2 text-[11px] text-slate-400">
                          <span>{(rs.sizeBytes / 1024).toFixed(0)} KB</span>
                          <a href={`/recruitment/api/resume/${rs.id}?download=1`} title="Download" className="rounded p-1 hover:bg-slate-100 hover:text-emerald-600 dark:hover:bg-slate-800">
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Stage history */}
              <section className="border-t border-slate-100 pt-5 dark:border-slate-800">
                <SectionTitle>Stage history</SectionTitle>
                {detail.history.length === 0 ? (
                  <p className="text-xs text-slate-400">No transitions recorded.</p>
                ) : (
                  <ol className="relative space-y-3 border-l border-slate-200 pl-4 dark:border-slate-700">
                    {detail.history.map((h) => (
                      <li key={h.id} className="relative">
                        <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900" />
                        <p className="text-sm text-slate-700 dark:text-slate-200">
                          {h.from ? <span className="text-slate-400">{h.from} → </span> : ""}
                          <span className="font-semibold text-slate-900 dark:text-white">{h.to}</span>
                        </p>
                        <p className="text-[11px] text-slate-400">{fmt(h.changedAt)}{h.note ? ` · ${h.note}` : ""}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
