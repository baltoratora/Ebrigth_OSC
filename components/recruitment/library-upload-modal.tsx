"use client";

import { useState } from "react";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { uploadResume } from "@/app/recruitment/_resume-actions";
import { RecruitPicker, type RecruitOpt } from "@/components/recruitment/recruit-picker";

/**
 * Upload a resume directly from the Library page. Unlike the drag-to-RS flow,
 * this does NOT move the candidate's pipeline stage (noMove=1) — it just files
 * the document against the chosen candidate.
 */
export function LibraryUploadModal({
  recruits,
  onClose,
  onUploaded,
}: {
  recruits: RecruitOpt[];
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [recruitId, setRecruitId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!recruitId) { setErr("Pick a candidate."); return; }
    if (!file) { setErr("Attach a file."); return; }
    setBusy(true); setErr(null);
    const fd = new FormData();
    fd.set("recruitId", recruitId);
    fd.set("file", file);
    fd.set("noMove", "1");
    const res = await uploadResume(fd);
    setBusy(false);
    if (!res.ok) { setErr(res.error ?? "Upload failed"); return; }
    onUploaded();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
            <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Upload resume
          </h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Candidate</span>
            <RecruitPicker recruits={recruits} value={recruitId} onChange={setRecruitId} />
          </label>

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
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
          <button onClick={onClose} disabled={busy} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
          <button onClick={submit} disabled={busy || !recruitId || !file} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Upload
          </button>
        </div>
      </div>
    </div>
  );
}
