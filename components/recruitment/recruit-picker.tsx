"use client";

import { useMemo, useRef, useState } from "react";
import { Search, Check, ChevronDown } from "lucide-react";

export interface RecruitOpt {
  id: string;
  name: string;
  stageShort: string;
  position: string | null;
}

/** Searchable single-select for picking a candidate. Used by the calendar
 *  (schedule interview) and library (upload resume) modals. */
export function RecruitPicker({
  recruits,
  value,
  onChange,
  placeholder = "Search candidate…",
}: {
  recruits: RecruitOpt[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => recruits.find((r) => r.id === value) ?? null, [recruits, value]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = s
      ? recruits.filter((r) => [r.name, r.position, r.stageShort].some((v) => (v ?? "").toLowerCase().includes(s)))
      : recruits;
    return base.slice(0, 50);
  }, [recruits, q]);

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-left text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
      >
        <span className={selected ? "" : "text-slate-400"}>
          {selected ? selected.name : "Select a candidate"}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
            <div className="relative border-b border-slate-100 p-2 dark:border-slate-700">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-7 pr-2 text-sm text-slate-900 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <ul className="max-h-56 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-3 text-center text-xs text-slate-400">No candidates found</li>
              ) : (
                filtered.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => { onChange(r.id); setOpen(false); setQ(""); }}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-800 dark:text-slate-100">{r.name}</span>
                        {r.position && <span className="block truncate text-[11px] text-slate-400">{r.position}</span>}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-300">{r.stageShort}</span>
                        {r.id === value && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
