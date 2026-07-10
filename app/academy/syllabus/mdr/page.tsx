"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const GRADE_COUNT = 8;
const STORAGE_KEY = "MDR-grade-table";

type GradeRow = { enrol: string; finished: string; balance: string };
const emptyRows = (): GradeRow[] =>
  Array.from({ length: GRADE_COUNT }, () => ({ enrol: "", finished: "", balance: "" }));

export default function MdrPage() {
  const router = useRouter();
  const [rows, setRows] = useState<GradeRow[]>(emptyRows);
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const next = emptyRows();
          for (let i = 0; i < Math.min(parsed.length, GRADE_COUNT); i++) {
            const r = parsed[i] as Partial<GradeRow>;
            next[i] = {
              enrol: typeof r?.enrol === "string" ? r.enrol : "",
              finished: typeof r?.finished === "string" ? r.finished : "",
              balance: typeof r?.balance === "string" ? r.balance : "",
            };
          }
          setRows(next);
        }
      }
    } catch {
      /* ignore parse errors — fall back to empty rows */
    }
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  }, [rows]);

  const updateRow = (idx: number, patch: Partial<GradeRow>) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  return (
    <div className="w-full max-w-6xl mx-auto">
      {/* Header chip + back button */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4 mb-8">
        <button
          onClick={() => router.push("/academy/syllabus")}
          className="bg-slate-100 text-slate-700 hover:bg-rose-800 hover:text-white px-4 py-2 rounded-xl flex items-center justify-center shadow-md transition-colors"
          aria-label="Back to Ebright Class Syllabus"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-6 h-6"
          >
            <line x1="20" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <div className="bg-rose-800 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-md">
          <span className="text-xl">💼</span>
          <h1 className="text-lg font-black uppercase tracking-wide m-0 leading-none">
            MDR
          </h1>
        </div>
      </div>

      <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 min-h-[60vh]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-rose-800 text-white">
                <th className="text-left px-4 py-3 text-sm font-black uppercase tracking-wide border border-rose-900">Grade</th>
                <th className="text-left px-4 py-3 text-sm font-black uppercase tracking-wide border border-rose-900">Enrol</th>
                <th className="text-left px-4 py-3 text-sm font-black uppercase tracking-wide border border-rose-900">Finished</th>
                <th className="text-left px-4 py-3 text-sm font-black uppercase tracking-wide border border-rose-900">Balance</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: GRADE_COUNT }, (_, i) => i + 1).map((n) => {
                const row = rows[n - 1];
                return (
                  <tr
                    key={n}
                    className="hover:bg-rose-50 transition-colors"
                  >
                    {/* Grade column — clickable, navigates to the grade page. */}
                    <td
                      onClick={() => router.push(`/academy/syllabus/mdr/${n}`)}
                      className="px-4 py-3 border border-slate-200 text-sm font-semibold text-rose-800 underline-offset-2 hover:underline cursor-pointer"
                    >
                      Grade {n}
                    </td>
                    {(["enrol", "finished", "balance"] as const).map((field) => (
                      <td
                        key={field}
                        className="border border-slate-200 p-0"
                      >
                        <input
                          type="text"
                          value={row[field]}
                          onChange={(e) => updateRow(n - 1, { [field]: e.target.value })}
                          className="w-full px-4 py-3 text-sm text-slate-700 bg-transparent focus:outline-none focus:bg-rose-50"
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
