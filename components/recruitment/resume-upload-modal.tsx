"use client";

import { useEffect, useState } from "react";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { uploadResume } from "@/app/recruitment/_resume-actions";
import { getRecruitDetail, type RecruitDetail } from "@/app/recruitment/_actions";

/**
 * Drag-to-"Resume Submission (RS)" popup: shows the candidate's details and
 * REQUIRES HR to attach a resume. Upload moves the card into RS. Cancel sends
 * the card to "Buffer Resume (BR)" instead (handled by the parent).
 */
export function ResumeUploadModal({
  recruitId,
  recruitName,
  onUploaded,
  onCancelToBuffer,
}: {
  recruitId: string;
  recruitName: string;
  onUploaded: () => void;
  onCancelToBuffer: () => void;
}) {
  const [detail, setDetail] = useState<RecruitDetail | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getRecruitDetail(recruitId).then((res) => {
      if (active && res.ok && res.detail) setDetail(res.detail);
    });
    return () => { active = false; };
  }, [recruitId]);

  async function submit() {
    if (!file) { setErr("Attach a resume file to continue."); return; }
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.set("recruitId", recruitId);
    fd.set("file", file);
    const res = await uploadResume(fd);
    setBusy(false);
    if (!res.ok) { setErr(res.error ?? "Upload failed"); return; }
    onUploaded();
  }

  const hrfs = detail?.hrfs;
  const rows: [string, React.ReactNode][] = [
    ["Name", detail?.name ?? recruitName],
    ["Email", hrfs?.email ?? detail?.email],
    ["Phone", hrfs?.phone ?? detail?.phone],
    ["City", hrfs?.city],
    ["Type of form", hrfs?.formType],
    ["Education level", hrfs?.educationLevel],
    ["Gender", hrfs?.gender],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
            <FileText className="h-4 w-4 text-sky-600 dark:text-sky-400" /> Resume submission
          </h2>
          <button onClick={onCancelToBuffer} aria-label="Cancel to Buffer Resume" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          {/* Candidate details */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
                <dd className="mt-0.5 break-words text-sm text-slate-800 dark:text-slate-200">{value || "—"}</dd>
              </div>
            ))}
          </dl>

          {/* Upload */}
          <div className="rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-600">
            <label className="flex cursor-pointer flex-col items-center gap-2 text-center">
              <Upload className="h-6 w-6 text-slate-400" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {file ? file.name : "Click to attach resume"}
              </span>
              <span className="text-[11px] text-slate-400">PDF, Word, PNG or JPG · max 15 MB</span>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
          </div>
          {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{err}</p>}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
          <button onClick={onCancelToBuffer} disabled={busy} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">
            Cancel → Buffer Resume
          </button>
          <button onClick={submit} disabled={busy || !file} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Upload & submit
          </button>
        </div>
      </div>
    </div>
  );
}
