"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import InsertPanel from "@/app/components/academy/InsertPanel";
import TableContextMenu from "@/app/components/academy/TableContextMenu";
import PageNavigator from "@/app/components/academy/PageNavigator";
import {
  useChapterEditor,
  formatPageNumber,
} from "@/app/components/academy/useChapterEditor";

export default function TrainingPage() {
  const router = useRouter();
  const label = "TRAINING";
  const editor = useChapterEditor("TRAINING-main");
  const [panelOpen, setPanelOpen] = useState(false);

  // Course count — starts at 32, can grow via the "Add Course" button.
  // Persisted in localStorage so the user's additions survive a reload.
  const [courseCount, setCourseCount] = useState<number>(() => {
    if (typeof window === "undefined") return 32;
    const raw = window.localStorage.getItem("training.courseCount");
    const n = raw ? parseInt(raw, 10) : 32;
    return Number.isFinite(n) && n > 0 ? n : 32;
  });
  useEffect(() => {
    window.localStorage.setItem("training.courseCount", String(courseCount));
  }, [courseCount]);

  // Deleted course numbers — these stay in `courseCount` but are filtered out
  // of the grid so the remaining cards keep their identity (Course 5 stays
  // "Course 5" even if Course 3 was removed).
  const [deletedCourses, setDeletedCourses] = useState<Set<number>>(() => {
    if (typeof window === "undefined") return new Set();
    const raw = window.localStorage.getItem("training.deletedCourses");
    if (!raw) return new Set();
    try {
      return new Set(JSON.parse(raw) as number[]);
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    window.localStorage.setItem(
      "training.deletedCourses",
      JSON.stringify([...deletedCourses]),
    );
  }, [deletedCourses]);

  const handleDeleteCourse = () => {
    const input = window.prompt(
      `Enter the course number or name to delete (e.g. "36" or "Course 36"):`,
    );
    if (input === null) return; // user cancelled
    // Pull the first number out of whatever the user typed — accepts "36",
    // "Course 36", "course #36", etc.
    const match = input.trim().match(/(\d+)/);
    if (!match) {
      window.alert(
        `Could not find a course number in "${input}". Try a number like 36 or a name like "Course 36".`,
      );
      return;
    }
    const n = parseInt(match[1], 10);
    if (!Number.isFinite(n) || n < 1 || n > courseCount) {
      window.alert(`Invalid course number. Enter a number between 1 and ${courseCount}.`);
      return;
    }
    if (deletedCourses.has(n)) {
      window.alert(`Course ${n} has already been deleted.`);
      return;
    }
    if (!window.confirm(`Are you sure you want to delete Course ${n}? This cannot be undone.`)) {
      return;
    }
    setDeletedCourses((prev) => {
      const next = new Set(prev);
      next.add(n);
      return next;
    });
  };

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
          className="bg-slate-100 text-slate-700 hover:bg-violet-700 hover:text-white px-4 py-2 rounded-xl flex items-center justify-center shadow-md transition-colors"
          aria-label="Back to Ebright Class Syllabus"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
            <line x1="20" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <div className="bg-violet-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-md">
          <span className="text-xl">📝</span>
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
              ? "bg-violet-700 text-white"
              : "bg-violet-100 text-violet-800 hover:bg-violet-700 hover:text-white"
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
        <h2 className="text-2xl font-black uppercase tracking-wide text-slate-800 mb-4">
          Courses
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {Array.from({ length: courseCount }, (_, i) => i + 1)
            .filter((n) => !deletedCourses.has(n))
            .map((n) => (
            <div
              key={n}
              onClick={() => router.push(`/academy/syllabus/training/${n}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  router.push(`/academy/syllabus/training/${n}`);
                }
              }}
              className="bg-violet-200 text-violet-900 rounded-2xl shadow-md p-4 h-full flex flex-col items-center justify-center text-center transition-transform hover:scale-105 cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <span className="text-4xl mb-2">📘</span>
              <h3 className="text-sm font-black uppercase tracking-tight">Course {n}</h3>
            </div>
          ))}
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
            className="p-2 rounded-full bg-violet-200 hover:bg-violet-300 text-violet-900 border border-violet-300 hover:border-violet-500 transition-colors"
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
        accent="violet"
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

      {/* Delete Course button — floats above Add Course */}
      <button
        type="button"
        onClick={handleDeleteCourse}
        className="fixed right-4 bottom-28 z-[60] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-lg transition-colors flex items-center gap-2"
      >
        <span className="text-lg leading-none">−</span>
        Delete Course
      </button>

      {/* Add Course button — floats above the page-navigator pill */}
      <button
        type="button"
        onClick={() => setCourseCount((c) => c + 1)}
        className="fixed right-4 bottom-16 z-[60] px-4 py-2 rounded-xl bg-violet-700 hover:bg-violet-800 text-white font-bold text-sm shadow-lg transition-colors flex items-center gap-2"
      >
        <span className="text-lg leading-none">+</span>
        Add Course
      </button>
    </div>
  );
}
