"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import InsertPanel from "@/app/components/academy/InsertPanel";
import TableContextMenu from "@/app/components/academy/TableContextMenu";
import PageNavigator from "@/app/components/academy/PageNavigator";
import {
  useChapterEditor,
  formatPageNumber,
} from "@/app/components/academy/useChapterEditor";
import { ROLES, hasAnyRole } from "@/lib/roles";
import {
  loadResponses,
  countAnsweredForBranch,
  QUIZ_RESPONSES_KEY,
  USER_TABLE_BRANCHES,
} from "./quiz-data";

// TODO(auth): Gate this page behind an email + password check. Planned
// approach — NextAuth credentials provider (or middleware on /academy/syllabus/user)
// validating against the User row in Prisma, then bcrypt-comparing the password.
// Until that's wired up, the page renders openly.

const USER_TABLE_COLUMNS = ["NO", "BRANCH", "QUIZ ANSWERED", "PERCENTAGE %"] as const;
// Expected staff headcount per branch — denominator for the PERCENTAGE %
// column. Zero means "not yet configured" → table renders "—" instead of a
// misleading 0% or NaN. Fill in real numbers as they're known.
// TODO: move to a settings table once branch metadata lives in the DB.
const USER_TABLE_BRANCH_EXPECTED: Record<string, number> = {
  "Subang Taipan (ST)": 0,
  "Setia Alam (SA)": 0,
  "Shah Alam (SHA)": 0,
  "Klang (KLG)": 0,
  "Rimbayu (RBY)": 0,
  "Denai Alam (DA)": 0,
  "Eco Grandeur (EGR)": 0,
  "Ampang (AMP)": 0,
  "Kajang TTDI Grove (KTG)": 0,
  "Bandar Tun Hussein Onn (BTHO)": 0,
  "Danau Kota (DK)": 0,
  "Kota Damansara (KD)": 0,
  "Sri Petaling (SP)": 0,
  "Taman Sri Gombak (TSG)": 0,
  "Bandar Baru Bangi (BBB)": 0,
  "Bandar Seri Putra (BSP)": 0,
  "Cyberjaya (CJY)": 0,
  "Putrajaya (PJY)": 0,
  "Kota Warisan (KW)": 0,
  "Online (ONL)": 0,
  "Tropicana Sungai Buloh (TSB)": 0,
  "Puchong Utama (PU)": 0,
  "Puncak Jalil (PJL)": 0,
};
export default function UserPage() {
  const router = useRouter();
  const label = "USER";
  const editor = useChapterEditor("USER-main");
  const [panelOpen, setPanelOpen] = useState(false);

  // Role-gated visibility for "Create Quiz". The user's role is derived from
  // their email via the NextAuth session — Superadmin and Academy emails get
  // the role at login, so checking the role IS effectively checking the email.
  const { data: session } = useSession();
  const canCreateQuiz = hasAnyRole(
    (session?.user as { role?: unknown } | undefined)?.role,
    [ROLES.SUPER_ADMIN, ROLES.ACADEMY],
  );

  // QUIZ ANSWERED and PERCENTAGE columns are computed from recorded quiz
  // responses, not free-text. We re-read responses on mount and whenever
  // another tab writes to localStorage so the table stays current.
  const [responses, setResponses] = useState(loadResponses);
  useEffect(() => {
    const refresh = () => setResponses(loadResponses());
    refresh();
    const onStorage = (e: StorageEvent) => {
      if (e.key === QUIZ_RESPONSES_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    // Also refresh when the tab regains focus — covers the "submitted quiz
    // in this same tab then navigated back" case.
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showPanel = () => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    setPanelOpen(true);
  };
  const schedulePanelHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setPanelOpen(false), 300);
  };
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  useEffect(() => {
    const TOP_PX = 30;
    const onMove = (e: MouseEvent) => {
      if (e.clientY <= TOP_PX) showPanel();
    };
    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, []);

  const sectionRef = useRef<HTMLElement>(null);
  const [pageCount, setPageCount] = useState(1);
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const update = () => setPageCount(Math.max(1, Math.ceil(el.offsetHeight / 1123)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="w-full max-w-6xl mx-auto">
      {/* Header chip + back button + Edit button */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4 mb-8">
        <button
          onClick={() => router.push(`/academy/syllabus`)}
          className="bg-slate-100 text-slate-700 hover:bg-cyan-700 hover:text-white px-4 py-2 rounded-xl flex items-center justify-center shadow-md transition-colors"
          aria-label="Back to Ebright Class Syllabus"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
            <line x1="20" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <div className="bg-cyan-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-md">
          <span className="text-xl">👤</span>
          <h1 className="text-lg font-black uppercase tracking-wide m-0 leading-none">{label}</h1>
        </div>

        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          onMouseEnter={showPanel}
          onMouseLeave={schedulePanelHide}
          aria-pressed={panelOpen}
          className={`ml-auto px-4 py-2 rounded-xl flex items-center gap-2 shadow-md font-bold text-sm transition-colors ${
            panelOpen
              ? "bg-cyan-700 text-white"
              : "bg-cyan-100 text-cyan-800 hover:bg-cyan-700 hover:text-white"
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
          </svg>
          Edit
        </button>
      </div>

      <section
        ref={sectionRef}
        className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 flex flex-col cursor-text mx-auto relative"
        style={{
          width: "794px",
          maxWidth: "100%",
          minHeight: `${pageCount * 1123}px`,
          backgroundImage:
            "repeating-linear-gradient(to bottom, transparent 0, transparent 1113px, rgba(148,163,184,0.2) 1113px, rgba(148,163,184,0.2) 1123px)",
          backgroundSize: "100% 1123px",
        }}
      >
        {/* Fixed 21-row × 4-column grid with labelled headers. Cell values
            persist in localStorage. */}
        <div className="overflow-x-auto mb-3">
          <table className="border-collapse text-xs w-full">
            <thead>
              <tr>
                {USER_TABLE_COLUMNS.map((col) => (
                  <th
                    key={col}
                    className="border border-slate-300 px-3 py-2 bg-cyan-700 text-white font-black uppercase tracking-wide text-left whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {USER_TABLE_BRANCHES.map((branch, r) => {
                const answered = countAnsweredForBranch(responses, branch);
                const expected = USER_TABLE_BRANCH_EXPECTED[branch] ?? 0;
                const percent =
                  expected > 0
                    ? Math.min(100, Math.round((answered / expected) * 100))
                    : null;
                return (
                  <tr key={branch}>
                    {/* Auto-numbered NO column — not editable, always 1..N. */}
                    <td className="border border-slate-300 px-2 py-1 bg-slate-50 text-slate-700 font-bold text-center w-12">
                      {r + 1}
                    </td>
                    {/* Pre-filled BRANCH column — fixed list, not editable. */}
                    <td className="border border-slate-300 px-2 py-1 bg-slate-50 text-slate-800 font-semibold whitespace-nowrap">
                      {branch}
                    </td>
                    {/* QUIZ ANSWERED — count of unique respondents from this
                        branch, derived from recorded quiz submissions. */}
                    <td className="border border-slate-300 px-2 py-1 bg-white text-center font-semibold text-slate-800">
                      {answered}
                    </td>
                    {/* PERCENTAGE % — answered / expected. "—" when the
                        expected headcount hasn't been set yet. */}
                    <td className="border border-slate-300 px-2 py-1 bg-white text-center font-semibold text-slate-800">
                      {percent === null ? (
                        <span className="text-slate-400" title="Set expected headcount in USER_TABLE_BRANCH_EXPECTED">—</span>
                      ) : (
                        `${percent}%`
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Quiz action buttons — bottom-right of the table.
            TODO: wire up to actual Answer / Create Quiz flows. */}
        <div className="flex justify-end gap-2 mb-6">
          <button
            type="button"
            onClick={() => router.push("/academy/syllabus/user/quiz")}
            className="px-4 py-2 rounded-lg bg-cyan-100 hover:bg-cyan-200 text-cyan-800 font-bold text-sm border border-cyan-300 flex items-center gap-2 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            Answer Quiz
          </button>
          {canCreateQuiz && (
            <button
              type="button"
              onClick={() => router.push("/academy/syllabus/user/create-quiz")}
              className="px-4 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-800 text-white font-bold text-sm border border-cyan-800 flex items-center gap-2 shadow-md transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Create Quiz
            </button>
          )}
        </div>

        {editor.previewMode ? (
          <div
            className="prose prose-slate max-w-none flex-1"
            dangerouslySetInnerHTML={{ __html: editor.currentContent || "<em class='text-slate-400'>Nothing to preview yet.</em>" }}
          />
        ) : (
          <div
            ref={editor.editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={editor.onEditorInput}
            onBlur={editor.onEditorBlur}
            className="prose prose-slate max-w-none flex-1 focus:outline-none"
          />
        )}

        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            type="button"
            aria-label="Save"
            title="Save"
            onClick={() => editor.save()}
            className="p-2 rounded-full bg-cyan-200 hover:bg-cyan-300 text-cyan-900 border border-cyan-300 hover:border-cyan-500 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
        </div>

        {/* Per-page headers */}
        {editor.headerOn && Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => {
          const s = { ...editor.headerConfig, ...(editor.headerStylesByPage[n] ?? {}) };
          return (
            <div
              key={`hdr-${n}`}
              className={`absolute left-0 right-0 px-8 py-1 border-b border-slate-200 text-sm bg-white/95 pointer-events-none ${
                s.align === "left" ? "text-left" : s.align === "right" ? "text-right" : "text-center"
              } ${s.italic ? "italic" : ""} ${s.bold ? "font-bold" : ""}`}
              style={{
                top: `${(n - 1) * 1123 + 8}px`,
                color: s.color,
                zIndex: 1,
              }}
            >
              {editor.headerTextsByPage[n] ?? editor.headerConfig.text}
            </div>
          );
        })}

        {/* Per-page footers */}
        {editor.footerOn && Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => {
          const s = { ...editor.footerConfig, ...(editor.footerStylesByPage[n] ?? {}) };
          return (
            <div
              key={`ftr-${n}`}
              className={`absolute left-0 right-0 px-8 py-1 border-t border-slate-200 text-sm bg-white/95 pointer-events-none ${
                s.align === "left" ? "text-left" : s.align === "right" ? "text-right" : "text-center"
              } ${s.italic ? "italic" : ""} ${s.bold ? "font-bold" : ""}`}
              style={{
                top: `${n * 1123 - 78}px`,
                color: s.color,
                zIndex: 1,
              }}
            >
              {editor.footerTextsByPage[n] ?? editor.footerConfig.text}
            </div>
          );
        })}

        {/* Per-page page numbers */}
        {editor.pageNumberOn && Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
          <div
            key={n}
            className={`absolute left-0 right-0 px-8 text-sm font-serif pointer-events-none ${
              editor.pageNumberConfig.align === "left"  ? "text-left"  :
              editor.pageNumberConfig.align === "right" ? "text-right" :
              "text-center"
            } ${editor.pageNumberConfig.italic ? "italic" : ""} ${
              editor.pageNumberConfig.bold ? "font-bold" : ""
            }`}
            style={{
              top: `${n * 1123 - 40}px`,
              color: editor.pageNumberConfig.color,
            }}
          >
            {formatPageNumber(editor.pageNumberConfig.style, n)}
          </div>
        ))}
      </section>

      <InsertPanel
        chapterLabel={label}
        accent="cyan"
        editor={editor}
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        onMouseEnter={showPanel}
        onMouseLeave={schedulePanelHide}
        pageCount={pageCount}
      />

      {editor.tableMenu && (
        <TableContextMenu
          x={editor.tableMenu.x}
          y={editor.tableMenu.y}
          onClose={editor.closeTableMenu}
          onDeleteRow={editor.deleteTableRow}
          onDeleteColumn={editor.deleteTableColumn}
          onClearCell={editor.clearTableCell}
        />
      )}

      <PageNavigator sectionRef={sectionRef} pageCount={pageCount} />
    </div>
  );
}
