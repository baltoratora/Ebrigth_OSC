"use client";

import { useMemo, useState } from "react";
import { Search, UserRoundCheck } from "lucide-react";
import { RecruitDetailModal } from "@/components/recruitment/recruit-detail-modal";

export interface ContactRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  branch: string | null;
  hired: boolean;
  stageName: string;
  stageShort: string;
}

export function ContactsTable({ rows }: { rows: ContactRow[] }) {
  const [q, setQ] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      [r.name, r.email, r.phone, r.position, r.branch, r.stageName]
        .some((v) => (v ?? "").toLowerCase().includes(s)),
    );
  }, [q, rows]);

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, phone, email, stage…"
          className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
        <table className="w-full min-w-max text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60">
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Stage</th>
              <th className="px-4 py-2.5">Phone</th>
              <th className="px-4 py-2.5">Email</th>
              <th className="px-4 py-2.5">Position</th>
              <th className="px-4 py-2.5">Branch</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((r) => (
              <tr
                key={r.id}
                onClick={() => setDetailId(r.id)}
                className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-slate-900 dark:text-white">{r.name}</span>
                    {r.hired && (
                      <span title="Hired" className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                        <UserRoundCheck className="h-2.5 w-2.5" /> Hired
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">{r.stageName}</span></td>
                <td className="px-4 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">{r.phone ?? "—"}</td>
                <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{r.email ?? "—"}</td>
                <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{r.position ?? "—"}</td>
                <td className="px-4 py-2.5 uppercase text-slate-500">{r.branch ?? "—"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">No recruits match “{q}”.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <RecruitDetailModal recruitId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}
