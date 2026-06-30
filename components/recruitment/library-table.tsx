"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Download, Search, Trash2, Loader2 } from "lucide-react";
import { deleteResume } from "@/app/recruitment/_resume-actions";

interface ResumeItem {
  id: string;
  recruitId: string;
  recruitName: string;
  stageName: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string | null;
  uploadedAt: string;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur",
  });
}

export function LibraryTable({ resumes, canDelete }: { resumes: ResumeItem[]; canDelete: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return resumes;
    return resumes.filter((r) => [r.recruitName, r.fileName, r.stageName].some((v) => v.toLowerCase().includes(s)));
  }, [resumes, q]);

  async function remove(id: string) {
    if (!window.confirm("Delete this resume file?")) return;
    setBusyId(id);
    const res = await deleteResume(id);
    setBusyId(null);
    if (res.ok) router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="relative w-64">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search resumes…"
          className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
        />
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400 dark:border-slate-700">
          No resumes uploaded yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-2.5">Candidate</th>
                <th className="px-4 py-2.5">File</th>
                <th className="px-4 py-2.5">Stage</th>
                <th className="px-4 py-2.5">Uploaded</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {shown.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-white">{r.recruitName}</td>
                  <td className="px-4 py-2.5">
                    <a href={`/recruitment/api/resume/${r.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-emerald-700 hover:underline dark:text-emerald-400">
                      <FileText className="h-3.5 w-3.5" /> <span className="max-w-48 truncate">{r.fileName}</span>
                    </a>
                    <span className="ml-1 text-[11px] text-slate-400">{(r.sizeBytes / 1024).toFixed(0)} KB</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{r.stageName}</td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{fmt(r.uploadedAt)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <a href={`/recruitment/api/resume/${r.id}?download=1`} title="Download" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-emerald-600 dark:hover:bg-slate-800">
                        <Download className="h-4 w-4" />
                      </a>
                      {canDelete && (
                        <button onClick={() => remove(r.id)} disabled={busyId === r.id} title="Delete resume" className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-950/40">
                          {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
