"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import InsertPanel from "@/app/components/academy/InsertPanel";
import TableContextMenu from "@/app/components/academy/TableContextMenu";
import PageNavigator from "@/app/components/academy/PageNavigator";
import { useChapterEditor, formatPageNumber } from "@/app/components/academy/useChapterEditor";

export default function JnrChapterPage() {
  const params = useParams<{ module: string; chapter: string }>();
  const router = useRouter();
  const grade = Number(params?.module);
  const chapter = Number(params?.chapter);
  const label = `G${grade} C${chapter}`;
  const editor = useChapterEditor(`JNR-${label}`);
  const [panelOpen, setPanelOpen] = useState(false);

  // Hover-to-open: opens on Edit button hover, stays open while cursor is on
  // either the button or the panel; closes 300ms after the cursor leaves both.
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

  // Top-edge trigger: bring up the panel when cursor approaches the top 30 px
  // of the viewport (useful while scrolled down past the header bar).
  useEffect(() => {
    const TOP_PX = 30;
    const onMove = (e: MouseEvent) => {
      if (e.clientY <= TOP_PX) showPanel();
    };
    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, []);

  // Pagination: count how many A4 (1123px) pages the section currently spans
  // so we can stamp a page number at the bottom of each one.
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

  if (
    !Number.isInteger(grade) || grade < 1 || grade > 8 ||
    !Number.isInteger(chapter) || chapter < 1 || chapter > 12
  ) {
    return (
      <div className="w-full max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
          <h1 className="text-2xl font-black text-slate-800 mb-2">Chapter not found</h1>
          <button
            onClick={() => router.push(`/academy/syllabus/jnr/${grade || 1}`)}
            className="px-5 py-2 rounded-lg bg-teal-800 text-white font-semibold hover:bg-teal-900"
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto">
      {/* Header chip + back button */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4 mb-8">
        <button
          onClick={() => router.push(`/academy/syllabus/jnr/${grade}`)}
          className="bg-slate-100 text-slate-700 hover:bg-teal-800 hover:text-white px-4 py-2 rounded-xl flex items-center justify-center shadow-md transition-colors"
          aria-label={`Back to JNR Grade ${grade}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
            <line x1="20" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <div className="bg-teal-800 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-md">
          <span className="text-xl">📘</span>
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
              ? "bg-teal-800 text-white"
              : "bg-teal-100 text-teal-800 hover:bg-teal-800 hover:text-white"
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
          </svg>
          Edit
        </button>
      </div>

      {/* Editable content slot — A4-sized page with page-break lines every 1123px */}
      <section
        ref={sectionRef}
        className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 flex flex-col cursor-text mx-auto relative"
        style={{
          width: "794px",
          maxWidth: "100%",
          // Grow in whole-page increments so each page's number has room to render.
          minHeight: `${pageCount * 1123}px`,
          // 10-px lighter slate band at the end of every A4 cycle.
          backgroundImage:
            "repeating-linear-gradient(to bottom, transparent 0, transparent 1113px, rgba(148,163,184,0.2) 1113px, rgba(148,163,184,0.2) 1123px)",
          backgroundSize: "100% 1123px",
        }}
      >
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
            className="p-2 rounded-full bg-green-200 hover:bg-green-300 text-green-900 border border-green-300 hover:border-green-500 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
        </div>

        {/* Per-page headers — one per A4 page, each merging default + per-page style */}
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

        {/* Per-page footers — one per A4 page, each merging default + per-page style */}
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
              // 30 px above the 10-px gap band.
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
        accent="teal"
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
