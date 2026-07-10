"use client";

import { useState, useMemo } from "react";
import { Search, Users, Filter, Download, RefreshCw } from "lucide-react";
import { useFAStore } from "@pcm/_lib/store";
import { useCurrentUser } from "@pcm/_hooks/useCurrentUser";
import { AppShell } from "@pcm/_components/shared/AppShell";
import { BRANCHES, BranchCode, hasBacklog, invitableGradesFor, FA_CURRENT_GRADE_MIN_CHAPTER, gradeLabel } from "@pcm/_types";
import { downloadCSV } from "@pcm/_lib/csv";
import { RegistrationCrossCheck } from "@pcm/_components/fa/RegistrationCrossCheck";

/** Academy-side student list: every student across every branch, with
 *  per-grade FA-progress boxes that mirror the dashboard's checkbox column.
 *  Same data source as the BM-side invite picker (studentrecords), same box
 *  count per student (= current grade), so what shows here matches Heidi. */
export default function StudentListPage() {
  const user = useCurrentUser();
  const allStudents = useFAStore(s => s.students);
  const studentsLoaded = useFAStore(s => s.studentsLoaded);
  const studentsLoading = useFAStore(s => s.studentsLoading);
  const studentsError = useFAStore(s => s.studentsError);
  const studentsFetchedAt = useFAStore(s => s.studentsFetchedAt);
  const refreshStudents = useFAStore(s => s.refreshStudents);
  // Report is still loaded into the store (so the silently-dropped students
  // are detectable from devtools / future tooling), but we don't show the
  // banner here — it's noise once the user has already addressed it.

  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState<BranchCode | "all">("all");
  const [gradeFilter, setGradeFilter] = useState<number | "all">("all");
  const [progressFilter, setProgressFilter] = useState<"all" | "backlog" | "uptodate">("all");
  // Default: show every student (active + inactive). Academy wants the
  // total here to match the dashboard's "Total students" count, including
  // Inactive rows. The checkbox is kept so it can be narrowed if needed.
  const [activeOnly, setActiveOnly] = useState(false);
  // Archived students live in a separate table and carry archived:true.
  //   current  → live roster only (default)
  //   archived → only archived students
  //   all      → both, archived rows badged inline
  const [scope, setScope] = useState<"current" | "archived" | "all">("current");

  // Build derived counts BEFORE the early-return guards so hook order is stable.
  const filtered = useMemo(() => {
    return allStudents
      .filter(s => scope === "all" ? true : scope === "archived" ? s.archived : !s.archived)
      .filter(s => !activeOnly || s.active)
      .filter(s => branchFilter === "all" || s.branch === branchFilter)
      .filter(s => gradeFilter === "all" || s.grade === gradeFilter)
      .filter(s => {
        if (progressFilter === "all") return true;
        const back = hasBacklog(s);
        return progressFilter === "backlog" ? back : !back;
      })
      .filter(s => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          s.parentName.toLowerCase().includes(q)
        );
      })
      .sort((a, b) =>
        a.branch.localeCompare(b.branch) ||
        b.grade - a.grade ||
        a.name.localeCompare(b.name)
      );
  }, [allStudents, scope, activeOnly, branchFilter, gradeFilter, progressFilter, search]);

  const liveStudents = useMemo(() => allStudents.filter(s => !s.archived), [allStudents]);
  const archivedCount = useMemo(() => allStudents.filter(s => s.archived).length, [allStudents]);

  const branchNameByCode = useMemo(
    () => Object.fromEntries(BRANCHES.map(b => [b.code, b.name])) as Record<string, string>,
    []
  );

  if (!user || user.role !== "MKT") return null;

  function handleDownload() {
    const header = [
      "Student ID", "Name", "Branch code", "Branch name",
      "Grade", "Chapter", "Active",
      "PCM total expected", "PCM done", "PCM outstanding",
      "Per-grade PCM (G1..G<grade>)",
      "Guardian name", "Guardian phone", "Enrolment date",
    ];
    const rows = filtered.map(s => {
      const expected = s.grade;
      const grades = Array.from({ length: expected }, (_, i) => i + 1);
      const done = grades.filter(g => s.faHistory[g] === true).length;
      const perGrade = grades.map(g => `G${g}:${s.faHistory[g] === true ? "1" : "0"}`).join(" ");
      return [
        s.id,
        s.name,
        s.branch,
        branchNameByCode[s.branch] ?? "",
        s.grade,
        s.credit,
        s.active ? "yes" : "no",
        expected,
        done,
        expected - done,
        perGrade,
        s.parentName,
        s.parentPhone,
        s.enrolmentDate,
      ];
    });
    downloadCSV(`FA_students_${new Date().toISOString().slice(0,10)}.csv`, [header, ...rows]);
  }

  return (
    <AppShell>
      {/* Masthead */}
      <div className="mb-6 fa-enter">
        <div
          className="fa-mono text-[10px] uppercase text-gold-600 mb-2"
          style={{ letterSpacing: "0.12em" }}
        >
          PCM Academy
        </div>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="fa-display-italic text-6xl text-ink-900 leading-none">Student List</h1>
            <p className="text-sm text-ink-500 mt-2">
              Every student across all {BRANCHES.length} branches with their per-grade PCM progress —
              same data as the eBright dashboard.
            </p>
            <div className="fa-mono text-[11px] text-ink-400 mt-1.5 flex items-center gap-2">
              <span>
                {studentsFetchedAt
                  ? <>Synced {formatRelativeTime(studentsFetchedAt)} · {liveStudents.length} students from studentrecords{archivedCount > 0 && <> · {archivedCount} archived</>}</>
                  : <>Loading from studentrecords…</>}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => refreshStudents()}
              disabled={studentsLoading}
              className="fa-btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              title="Pull the latest snapshot from studentrecords in Heidi"
            >
              <RefreshCw className={`w-4 h-4 ${studentsLoading ? "animate-spin" : ""}`} />
              {studentsLoading ? "Refreshing…" : "Refresh from Heidi"}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={filtered.length === 0}
              className="fa-btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              title="Download the filtered list as CSV (opens in Excel)"
            >
              <Download className="w-4 h-4" /> Download CSV
            </button>
          </div>
        </div>
        <hr className="border-0 border-t border-gold-200 mt-6" />
      </div>

      {/* Registration cross-check tool — collapsed by default. */}
      <RegistrationCrossCheck students={liveStudents} />

      {/* Filters */}
      <div className="fa-card p-4 mb-4 fa-enter fa-delay-1">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px] max-w-md">
            <label className="fa-label">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Name, student ID, or guardian"
                className="fa-input fa-input-icon-left"
              />
            </div>
          </div>
          <div className="w-52">
            <label className="fa-label">Branch</label>
            <select
              value={branchFilter}
              onChange={e => setBranchFilter(e.target.value as BranchCode | "all")}
              className="fa-input"
            >
              <option value="all">All branches</option>
              {BRANCHES.map(b => (
                <option key={b.code} value={b.code}>{b.code} — {b.name}</option>
              ))}
            </select>
          </div>
          <div className="w-32">
            <label className="fa-label">Grade</label>
            <select
              value={gradeFilter}
              onChange={e => setGradeFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="fa-input"
            >
              <option value="all">All</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map(g => (
                <option key={g} value={g}>{gradeLabel(g)}</option>
              ))}
            </select>
          </div>
          <div className="w-40">
            <label className="fa-label">PCM progress</label>
            <select
              value={progressFilter}
              onChange={e => setProgressFilter(e.target.value as "all" | "backlog" | "uptodate")}
              className="fa-input"
            >
              <option value="all">All</option>
              <option value="backlog">Has backlog</option>
              <option value="uptodate">Up to date</option>
            </select>
          </div>
          <div className="w-44">
            <label className="fa-label">Records</label>
            <select
              value={scope}
              onChange={e => setScope(e.target.value as "current" | "archived" | "all")}
              className="fa-input"
            >
              <option value="current">Current students</option>
              <option value="archived">Archived only{archivedCount > 0 ? ` (${archivedCount})` : ""}</option>
              <option value="all">All incl. archived</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-700 cursor-pointer pb-2">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={e => setActiveOnly(e.target.checked)}
              className="w-4 h-4"
            />
            Active only
          </label>
        </div>
        <div className="text-xs text-ink-500 mt-3 flex items-center gap-2">
          <Filter className="w-3 h-3" />
          Showing <span className="font-mono font-semibold text-ink-900">{filtered.length}</span> of{" "}
          <span className="font-mono">{allStudents.length}</span> student{filtered.length !== 1 ? "s" : ""}.
        </div>
      </div>

      {/* List */}
      {studentsLoading && !studentsLoaded ? (
        <div className="fa-card p-12 text-center text-sm text-ink-400">Loading students…</div>
      ) : studentsError ? (
        <div className="fa-card p-12 text-center text-sm text-danger">
          Failed to load students: {studentsError}
        </div>
      ) : filtered.length === 0 ? (
        <div className="fa-card p-12 text-center">
          <Users className="w-8 h-8 text-ink-300 mx-auto mb-2" />
          <div className="text-sm text-ink-500">No students match the current filters.</div>
        </div>
      ) : (
        <div className="fa-card overflow-hidden">
          <table className="fa-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Branch</th>
                <th className="text-center">Grade</th>
                <th className="text-center">Chapter</th>
                <th>PCM Progress (G1 → current)</th>
                <th>Guardian</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                // C9 rule: a student is only eligible for their current-grade
                // FA once they reach chapter 9, so the current-grade box only
                // appears here when that threshold is hit. Past grades are
                // always shown — they're history.
                const grades = invitableGradesFor(s);
                const expected = grades.length;
                const doneCount = grades.filter(g => s.faHistory[g] === true).length;
                const branchName = branchNameByCode[s.branch] ?? "";
                const currentGradeLocked = s.credit < FA_CURRENT_GRADE_MIN_CHAPTER && grades.indexOf(s.grade) === -1;
                return (
                  <tr key={s.id}>
                    <td>
                      <div className="font-medium text-ink-900">
                        {s.name}
                        {s.archived ? (
                          <span className="ml-2 fa-mono text-[10px] uppercase text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                            archived
                          </span>
                        ) : !s.active && (
                          <span className="ml-2 fa-mono text-[10px] uppercase text-ink-400 bg-ivory-200 px-1.5 py-0.5 rounded">
                            inactive
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-ink-400 font-mono">#{s.id}</div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-ink-700 bg-ivory-200 px-2 py-0.5 rounded">
                          {s.branch}
                        </span>
                        <span className="text-xs text-ink-500 truncate">{branchName}</span>
                      </div>
                    </td>
                    <td className="text-center font-mono text-sm text-ink-900">{gradeLabel(s.grade)}</td>
                    <td className="text-center font-mono text-sm text-ink-700">C{s.credit}</td>
                    <td>
                      <div className="flex items-center gap-1 flex-wrap">
                        {grades.length === 0 ? (
                          <span
                            className="fa-mono text-[10px] text-ink-400 italic"
                            title={`Not yet at C${FA_CURRENT_GRADE_MIN_CHAPTER} of ${gradeLabel(s.grade)}`}
                          >
                            Locked — needs C{FA_CURRENT_GRADE_MIN_CHAPTER}
                          </span>
                        ) : (
                          <>
                            {grades.map(g => {
                              const done = s.faHistory[g] === true;
                              return (
                                <span
                                  key={g}
                                  className={`fa-mono text-[10px] px-1.5 py-0.5 rounded border ${
                                    done
                                      ? "bg-success-soft text-success border-success/30"
                                      : "bg-danger-soft text-danger border-danger/30"
                                  }`}
                                  title={`Grade ${gradeLabel(g)} PCM: ${done ? "completed" : "not yet"}`}
                                >
                                  {gradeLabel(g)} {done ? "✓" : "✗"}
                                </span>
                              );
                            })}
                            {currentGradeLocked && (
                              <span
                                className="fa-mono text-[10px] text-ink-400 italic"
                                title={`Current-grade PCM unlocks at C${FA_CURRENT_GRADE_MIN_CHAPTER} (now at C${s.credit})`}
                              >
                                {gradeLabel(s.grade)} 🔒
                              </span>
                            )}
                            <span className="fa-mono text-[10px] text-ink-500 ml-1">
                              {doneCount}/{expected}
                            </span>
                          </>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="text-sm text-ink-700">{s.parentName || "—"}</div>
                      <div className="text-[11px] font-mono text-ink-400">{s.parentPhone || ""}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}

/** "5 seconds ago", "2 min ago", "1 hr ago" — short relative time string
 *  for the "synced X ago" caption on the student list. */
function formatRelativeTime(epochMs: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - epochMs) / 1000));
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  return new Date(epochMs).toLocaleString();
}
