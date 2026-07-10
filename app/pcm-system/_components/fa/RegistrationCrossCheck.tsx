"use client";

import { useMemo, useState } from "react";
import { ClipboardCheck, Search, Check, X, AlertCircle, Copy } from "lucide-react";
import { BRANCHES, BranchCode, Student } from "@pcm/_types";
import { downloadCSV } from "@pcm/_lib/csv";

interface Props {
  /** Full FA-system student list to match against. */
  students: Student[];
}

interface ParsedRow {
  raw: string;
  branchHint: BranchCode | null;
  name: string;
  faGrade: number | null;
}

interface MatchRow extends ParsedRow {
  /** Exact case-insensitive match against student name. */
  exact: Student | null;
  /** Up to 3 close matches when there's no exact one. */
  fuzzy: Student[];
}

/** Lowercase, collapse whitespace, strip diacritics, drop short connectors
 *  ("bin", "bt", "binti", "a/p", "a/l", "d/o", "s/o") so "Maryam Sharleez
 *  Binti Indera Shaiful" lines up with "MARYAM SHARLEEZ INDERA SHAIFUL"
 *  regardless of how Heidi stores it. */
const STOP_WORDS = new Set([
  "bin", "binti", "bt", "bte", "b", "binte",
  "a/p", "a/l", "d/o", "s/o", "ap", "al", "do", "so",
]);

function normalise(name: string): string {
  return name
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9\s/]/g, " ")
    .split(/\s+/)
    .filter(w => w && !STOP_WORDS.has(w))
    .join(" ")
    .trim();
}

/** Loose Jaccard-like similarity over normalised name tokens. 1.0 = identical
 *  token bag, 0 = nothing in common. Used to suggest near-matches when there
 *  isn't an exact hit. */
function similarity(a: string, b: string): number {
  const ta = new Set(normalise(a).split(" ").filter(Boolean));
  const tb = new Set(normalise(b).split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersect = 0;
  ta.forEach(t => { if (tb.has(t)) intersect++; });
  return intersect / Math.max(ta.size, tb.size);
}

/** Parse a single line from the pasted list. Tolerates the registration
 *  form shape "<branch>\t<name>\t...\tFA Grade" but also accepts loose
 *  formats like "ST: Muhammad Izz Idris" or just a bare name. */
const BRANCH_LOOKUP = new Map<string, BranchCode>(
  BRANCHES.map(b => [b.code.toUpperCase(), b.code])
);

function parseLine(raw: string): ParsedRow | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Skip section / header rows from the registration PDF.
  if (/^session\b|^no\b|^event date|^venue\b|^branch\b/i.test(trimmed)) {
    return null;
  }

  // Split on tabs (Excel/PDF paste) OR multiple spaces OR colon.
  const cells = trimmed.split(/\t|\s{2,}|\|/).map(c => c.trim()).filter(Boolean);

  let branchHint: BranchCode | null = null;
  let name = trimmed;
  let faGrade: number | null = null;

  if (cells.length >= 2) {
    // First cell often the branch code (e.g. "ST" or "SA to ST").
    const first = cells[0].toUpperCase();
    const branchMatch = first.match(/^([A-Z]{2,5})(?:\s+TO\s+([A-Z]{2,5}))?$/);
    if (branchMatch) {
      const to = branchMatch[2];
      const from = branchMatch[1];
      branchHint = BRANCH_LOOKUP.get(to ?? from) ?? null;
      if (branchHint) {
        // Drop the branch cell; the rest is name + extras
        name = cells.slice(1).join(" ");
      }
    }

    // Look for an FA Grade marker anywhere in the row ("G1", "G3", etc.).
    for (const c of cells) {
      const gm = c.match(/\bG(\d{1,2})\b/i);
      if (gm) {
        const g = Number(gm[1]);
        if (g >= 1 && g <= 12) { faGrade = g; break; }
      }
    }
  } else {
    // Single cell — maybe "ST: Name" or just "Name".
    const colon = trimmed.match(/^([A-Z]{2,5})\s*[:\-]\s*(.+)$/i);
    if (colon) {
      branchHint = BRANCH_LOOKUP.get(colon[1].toUpperCase()) ?? null;
      name = colon[2];
    }
  }

  // Strip any trailing FA grade text from the name itself.
  name = name.replace(/\b(?:JNR|JUNIOR|MDR|MIDDLER|SNR|SENIOR)?\s*G\d{1,2}\b.*$/i, "").trim();
  name = name.replace(/\b(?:yes|no)\b\.?$/i, "").trim();

  if (!name) return null;
  return { raw: trimmed, branchHint, name, faGrade };
}

export function RegistrationCrossCheck({ students }: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [results, setResults] = useState<MatchRow[] | null>(null);

  // Pre-built name lookup keyed by normalised name → student. O(1) lookups
  // and we keep the original student for downstream display.
  const lookup = useMemo(() => {
    const m = new Map<string, Student>();
    for (const s of students) m.set(normalise(s.name), s);
    return m;
  }, [students]);

  function runCheck() {
    const lines = input.split(/\r?\n/);
    const rows: MatchRow[] = [];
    for (const line of lines) {
      const parsed = parseLine(line);
      if (!parsed) continue;
      const key = normalise(parsed.name);
      const exact = lookup.get(key) ?? null;
      let fuzzy: Student[] = [];
      if (!exact) {
        fuzzy = students
          .map(s => ({ s, score: similarity(s.name, parsed.name) }))
          .filter(x => x.score >= 0.5)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map(x => x.s);
      }
      rows.push({ ...parsed, exact, fuzzy });
    }
    setResults(rows);
  }

  const totals = useMemo(() => {
    if (!results) return null;
    const matched = results.filter(r => r.exact !== null).length;
    const fuzzyOnly = results.filter(r => !r.exact && r.fuzzy.length > 0).length;
    const missing = results.length - matched - fuzzyOnly;
    return { total: results.length, matched, fuzzyOnly, missing };
  }, [results]);

  function downloadReport() {
    if (!results) return;
    const header = ["Status", "Pasted line", "Branch hint", "FA Grade hint", "Match name", "Match ID", "Match branch", "Match grade"];
    const rows = results.map(r => {
      const status = r.exact ? "matched" : r.fuzzy.length > 0 ? "near-match" : "missing";
      const m = r.exact ?? r.fuzzy[0] ?? null;
      return [
        status,
        r.raw,
        r.branchHint ?? "",
        r.faGrade ? `G${r.faGrade}` : "",
        m?.name ?? "",
        m?.id ?? "",
        m?.branch ?? "",
        m ? `G${m.grade}·C${m.credit}` : "",
      ];
    });
    downloadCSV(`FA_registration_crosscheck_${new Date().toISOString().slice(0,10)}.csv`, [header, ...rows]);
  }

  return (
    <div className="fa-card mb-4">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-ivory-100/60 transition-colors"
        aria-expanded={open}
      >
        <ClipboardCheck className="w-4 h-4 text-gold-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-ink-900">Cross-check registration list</div>
          <div className="text-[11px] text-ink-500">
            Paste the branch&apos;s FA registration tracklist and see which students are missing in the FA system.
          </div>
        </div>
        <span className="fa-mono text-[10px] uppercase text-ink-400">
          {open ? "Hide" : "Open"}
        </span>
      </button>

      {open && (
        <div className="border-t border-ivory-300 p-4 space-y-3">
          <div>
            <label className="fa-label">Paste registration rows</label>
            <p className="text-[11px] text-ink-500 mb-2">
              Copy directly from the Excel/PDF tracklist. Each line should have at least a name —
              branch code and FA grade are picked up automatically when present. Header rows
              (&ldquo;Session 1&rdquo;, &ldquo;No / Branch / Student&apos;s Name&rdquo;) are ignored.
            </p>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              rows={8}
              className="fa-input font-mono text-xs"
              placeholder={`ST\tMuhammad Izz Idris\t...\tSNR G1\nSA\tNehaal Nithin\t...\tMDR G2\nKW: Awatif binti mohd firdaus`}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={runCheck}
              disabled={!input.trim()}
              className="fa-btn-primary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Search className="w-3.5 h-3.5" /> Check against FA students
            </button>
            <button
              type="button"
              onClick={() => { setInput(""); setResults(null); }}
              className="fa-btn-ghost text-xs"
            >
              Clear
            </button>
            {results && results.length > 0 && (
              <button
                type="button"
                onClick={downloadReport}
                className="fa-btn-ghost text-xs ml-auto"
              >
                <Copy className="w-3.5 h-3.5" /> Download CSV report
              </button>
            )}
          </div>

          {totals && (
            <div className="grid grid-cols-4 gap-2 pt-2">
              <Stat label="Total parsed" value={totals.total} tone="neutral" />
              <Stat label="Matched" value={totals.matched} tone="success" />
              <Stat label="Near-match" value={totals.fuzzyOnly} tone="warning" />
              <Stat label="Missing" value={totals.missing} tone="danger" />
            </div>
          )}

          {results && results.length > 0 && (
            <div className="border border-ivory-300 rounded-[10px] overflow-hidden">
              <table className="fa-table">
                <thead>
                  <tr>
                    <th className="w-24">Status</th>
                    <th>Pasted</th>
                    <th>FA system match</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i}>
                      <td>
                        {r.exact ? (
                          <span className="inline-flex items-center gap-1 fa-mono text-[10px] uppercase px-1.5 py-0.5 rounded bg-success-soft text-success">
                            <Check className="w-3 h-3" /> Matched
                          </span>
                        ) : r.fuzzy.length > 0 ? (
                          <span className="inline-flex items-center gap-1 fa-mono text-[10px] uppercase px-1.5 py-0.5 rounded bg-warning-soft text-warning">
                            <AlertCircle className="w-3 h-3" /> Near
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 fa-mono text-[10px] uppercase px-1.5 py-0.5 rounded bg-danger-soft text-danger">
                            <X className="w-3 h-3" /> Missing
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="text-sm text-ink-900">{r.name}</div>
                        <div className="text-[11px] text-ink-400 fa-mono">
                          {r.branchHint && <>branch: {r.branchHint} · </>}
                          {r.faGrade && <>FA: G{r.faGrade}</>}
                        </div>
                      </td>
                      <td>
                        {r.exact ? (
                          <div>
                            <div className="text-sm text-ink-900">{r.exact.name}</div>
                            <div className="text-[11px] text-ink-500 fa-mono">
                              #{r.exact.id} · {r.exact.branch} · G{r.exact.grade}·C{r.exact.credit}
                              {!r.exact.active && <span className="ml-1 text-danger">(inactive)</span>}
                              {r.branchHint && r.exact.branch !== r.branchHint && (
                                <span className="ml-1 text-warning">⚠ branch differs ({r.branchHint} on list)</span>
                              )}
                            </div>
                          </div>
                        ) : r.fuzzy.length > 0 ? (
                          <div className="space-y-0.5">
                            <div className="text-[11px] text-ink-500 italic">No exact match. Closest:</div>
                            {r.fuzzy.map(f => (
                              <div key={f.id} className="text-xs">
                                <span className="text-ink-900">{f.name}</span>
                                <span className="text-[11px] text-ink-400 ml-1 fa-mono">
                                  (#{f.id} · {f.branch} · G{f.grade}·C{f.credit})
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-ink-400 italic">No student in studentrecords matches this name.</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "neutral" | "success" | "warning" | "danger" }) {
  const colour =
    tone === "success" ? "text-success" :
    tone === "warning" ? "text-warning" :
    tone === "danger"  ? "text-danger"  :
                          "text-ink-900";
  return (
    <div className="bg-ivory-50 border border-ivory-300 rounded-md p-2 text-center">
      <div className={`fa-display text-2xl ${colour}`}>{value}</div>
      <div className="fa-mono text-[10px] uppercase text-ink-500" style={{ letterSpacing: "0.06em" }}>
        {label}
      </div>
    </div>
  );
}
