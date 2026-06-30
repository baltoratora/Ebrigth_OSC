"use client";

import { useEffect, useState } from "react";
import { X, UserRoundCheck, Loader2, Clock, CalendarDays, FileText } from "lucide-react";
import { getRecruitDetail, type RecruitDetail } from "@/app/recruitment/_actions";

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Kuala_Lumpur",
  });
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-800 dark:text-slate-200">{value || "—"}</dd>
    </div>
  );
}

// Shared recruit detail drawer. Pass a recruitId to open; null closes it.
// Fetches the full record (incl. stage history) on demand so the kanban /
// contacts payloads stay lean.
export function RecruitDetailModal({
  recruitId,
  onClose,
}: {
  recruitId: string | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<RecruitDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!recruitId) return;
    let active = true;
    setLoading(true);
    setErr(null);
    setDetail(null);
    getRecruitDetail(recruitId).then((res) => {
      if (!active) return;
      if (res.ok && res.detail) setDetail(res.detail);
      else setErr(res.error ?? "Failed to load");
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-semibold text-slate-900 dark:text-white">
                {detail?.name ?? (loading ? "Loading…" : "Recruit")}
              </h2>
              {detail?.hired && (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                  <UserRoundCheck className="h-2.5 w-2.5" /> Hired
                </span>
              )}
            </div>
            {detail && (
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {detail.stageName}
                {detail.branch ? ` · ${detail.branch.toUpperCase()}` : ""}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading recruit…
            </div>
          )}
          {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{err}</p>}

          {detail && (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="Phone" value={detail.phone} />
                <Field label="Email" value={detail.email} />
                <Field label="Position" value={detail.position} />
                <Field label="Source" value={detail.source} />
                <Field label="Branch" value={detail.branch ? detail.branch.toUpperCase() : null} />
                <Field label="Stage" value={`${detail.stageName} (${detail.stageShort})`} />
                {/* HRFS-sourced applicant detail (null until the ebright_hrfs
                    table is wired — shows "—" gracefully). */}
                <Field label="City" value={detail.hrfs?.city} />
                <Field label="Type of form" value={detail.hrfs?.formType} />
                <Field label="Education level" value={detail.hrfs?.educationLevel} />
                <Field label="Gender" value={detail.hrfs?.gender} />
                <Field label="Time created" value={fmt(detail.hrfs?.createdAt ?? detail.ghlCreatedAt ?? detail.createdAt)} />
                <Field label="Time updated" value={fmt(detail.hrfs?.updatedAt ?? detail.updatedAt)} />
                <Field
                  label="Matched staff"
                  value={detail.branchStaffId ? `BranchStaff #${detail.branchStaffId}` : "Not matched"}
                />
              </dl>

              {/* Interview */}
              {detail.interview && (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                  <CalendarDays className="h-4 w-4 shrink-0" />
                  <span className="font-medium">Interview:</span>
                  <span>{fmt(detail.interview.scheduledAt)}</span>
                  {detail.interview.location && <span className="text-indigo-500">· {detail.interview.location}</span>}
                </div>
              )}

              {/* Resumes */}
              {detail.resumes.length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    <FileText className="h-3 w-3" /> Resumes
                  </h3>
                  <ul className="space-y-1.5">
                    {detail.resumes.map((rs) => (
                      <li key={rs.id} className="flex items-center justify-between gap-2 text-xs">
                        <a
                          href={`/recruitment/api/resume/${rs.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                        >
                          {rs.fileName}
                        </a>
                        <span className="shrink-0 text-slate-400">
                          {(rs.sizeBytes / 1024).toFixed(0)} KB · {fmt(rs.uploadedAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Stage history */}
              <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
                <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <Clock className="h-3 w-3" /> Stage history
                </h3>
                {detail.history.length === 0 ? (
                  <p className="text-xs text-slate-400">No transitions recorded.</p>
                ) : (
                  <ul className="space-y-2">
                    {detail.history.map((h) => (
                      <li key={h.id} className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400">{fmt(h.changedAt)}</span>
                        <span className="text-slate-600 dark:text-slate-300">
                          {h.from ? `${h.from} → ` : ""}
                          <span className="font-medium text-slate-800 dark:text-white">{h.to}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
