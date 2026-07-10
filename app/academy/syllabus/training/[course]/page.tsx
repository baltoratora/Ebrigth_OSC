"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import InsertPanel from "@/app/components/academy/InsertPanel";
import TableContextMenu from "@/app/components/academy/TableContextMenu";
import PageNavigator from "@/app/components/academy/PageNavigator";
import {
  useChapterEditor,
  formatPageNumber,
} from "@/app/components/academy/useChapterEditor";

type Field = { id: string; label: string; value: string };

// Auto-expanding text input. The invisible mirror span sits in the same grid
// cell as the input; as the user types, the mirror's width determines the cell
// width, and the input fills it. Works for any future course automatically.
function ExpandingInput({
  value,
  onChange,
  placeholder,
  inputClassName = "px-2 py-1 text-sm bg-violet-50 border border-violet-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500",
  mirrorClassName = "px-2 py-1 text-sm",
  minCh = 8,
  onKeyDown,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputClassName?: string;
  mirrorClassName?: string;
  minCh?: number;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <span className="inline-grid align-middle" style={{ minWidth: `${minCh}ch` }}>
      <span
        aria-hidden
        className={`invisible whitespace-pre col-start-1 row-start-1 ${mirrorClassName}`}
      >
        {value || placeholder || " "}
      </span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={`col-start-1 row-start-1 w-full ${inputClassName}`}
      />
    </span>
  );
}

export default function TrainingCoursePage() {
  const params = useParams<{ course: string }>();
  const router = useRouter();
  const courseNum = Number(params?.course);
  const label = `COURSE ${courseNum}`;
  const editor = useChapterEditor(`TRAINING-course-${courseNum}`);
  const [panelOpen, setPanelOpen] = useState(false);

  // Per-course metadata fields — fully dynamic list of {label, value} pairs.
  // Defaults to Course Name / Title / Date for any newly added course, but
  // the user can rename, delete, or add more fields via the "Add Course"
  // button below. Persisted per-course so each course keeps its own setup.
  const metaKey = `TRAINING-course-${courseNum}-meta`;
  const DEFAULT_FIELDS = (): Field[] => [
    { id: "course-name", label: "Course Name:", value: "" },
    { id: "title", label: "Title:", value: "" },
    { id: "date", label: "Date:", value: "" },
  ];
  const [fields, setFields] = useState<Field[]>(DEFAULT_FIELDS);
  // Snapshot of what's currently persisted in localStorage — used to detect
  // unsaved changes and to give the user a visual signal on the Save button.
  const [savedFields, setSavedFields] = useState<Field[]>(DEFAULT_FIELDS);
  useEffect(() => {
    if (!Number.isInteger(courseNum) || courseNum < 1) return;
    let loaded: Field[];
    try {
      const raw = window.localStorage.getItem(metaKey);
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data?.fields)) {
          loaded = data.fields as Field[];
        } else if (data && typeof data === "object") {
          // Migrate legacy { courseName, title, date } shape
          loaded = [
            { id: "course-name", label: "Course Name:", value: data.courseName ?? "" },
            { id: "title", label: "Title:", value: data.title ?? "" },
            { id: "date", label: "Date:", value: data.date ?? "" },
          ];
        } else {
          loaded = DEFAULT_FIELDS();
        }
      } else {
        loaded = DEFAULT_FIELDS();
      }
    } catch {
      loaded = DEFAULT_FIELDS();
    }
    setFields(loaded);
    setSavedFields(loaded);
  }, [metaKey, courseNum]);

  const isDirty = JSON.stringify(fields) !== JSON.stringify(savedFields);
  const saveFieldChanges = () => {
    if (!isDirty) {
      window.alert("No changes to save.");
      return;
    }
    if (!window.confirm("Save changes to this course's details? This cannot be undone.")) return;
    window.localStorage.setItem(metaKey, JSON.stringify({ fields }));
    setSavedFields(fields);
  };

  // Warn before navigating away with unsaved field changes.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const updateField = (id: string, patch: Partial<Field>) =>
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  // When a new field is added, remember its id so we can focus its label on
  // the next render. Lets the user keep typing without reaching for the mouse.
  const [focusFieldId, setFocusFieldId] = useState<string | null>(null);
  const addField = (afterId?: string) => {
    const newId = `field-${Date.now()}`;
    setFields((prev) => {
      const newField: Field = { id: newId, label: "New Field:", value: "" };
      if (!afterId) return [...prev, newField];
      const idx = prev.findIndex((f) => f.id === afterId);
      if (idx < 0) return [...prev, newField];
      return [...prev.slice(0, idx + 1), newField, ...prev.slice(idx + 1)];
    });
    setFocusFieldId(newId);
  };
  const deleteField = (id: string) => {
    if (!window.confirm("Delete this field?")) return;
    setFields((prev) => prev.filter((f) => f.id !== id));
  };

  // Hover-to-open panel + grace-period close
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

  // Pagination
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

  if (!Number.isInteger(courseNum) || courseNum < 1) {
    return (
      <div className="w-full max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
          <h1 className="text-2xl font-black text-slate-800 mb-2">Course not found</h1>
          <button
            onClick={() => router.push("/academy/syllabus/training")}
            className="px-5 py-2 rounded-lg bg-violet-700 text-white font-semibold hover:bg-violet-800"
          >
            ← Back to Training
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto">
      {/* Header chip + back button + Edit button */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4 mb-8">
        <button
          onClick={() => router.push("/academy/syllabus/training")}
          className="bg-slate-100 text-slate-700 hover:bg-violet-700 hover:text-white px-4 py-2 rounded-xl flex items-center justify-center shadow-md transition-colors"
          aria-label="Back to Training"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
            <line x1="20" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <div className="bg-violet-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-md">
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
          // Only force full-page heights when header/footer/page-number bands
          // are enabled — they need fixed page positions to render correctly.
          // Otherwise let the section size to its actual content so a course
          // with just a few fields doesn't sit on a sea of empty A4.
          ...(editor.headerOn || editor.footerOn || editor.pageNumberOn
            ? { minHeight: `${pageCount * 1123}px` }
            : {}),
          backgroundImage:
            "repeating-linear-gradient(to bottom, transparent 0, transparent 1113px, rgba(148,163,184,0.2) 1113px, rgba(148,163,184,0.2) 1123px)",
          backgroundSize: "100% 1123px",
        }}
      >
        {/* Per-course metadata fields — labels and values are both editable,
            and the user can add more rows or remove existing ones. */}
        <div className="flex flex-col gap-3 mb-6">
          {fields.map((f) => (
            <div key={f.id} className="flex items-center gap-3 flex-wrap group">
              <ExpandingInput
                value={f.label}
                onChange={(v) => updateField(f.id, { label: v })}
                placeholder="Label"
                minCh={6}
                inputClassName="text-sm font-bold text-slate-700 bg-transparent border border-transparent hover:border-slate-200 focus:border-violet-400 focus:bg-white rounded-md px-2 py-1 focus:outline-none"
                mirrorClassName="px-2 py-1 text-sm font-bold"
                inputRef={(el) => {
                  if (el && focusFieldId === f.id) {
                    el.focus();
                    el.select();
                    setFocusFieldId(null);
                  }
                }}
              />
              <ExpandingInput
                value={f.value}
                onChange={(v) => updateField(f.id, { value: v })}
                placeholder="Enter value"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addField(f.id);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => deleteField(f.id)}
                aria-label="Delete field"
                title="Delete field"
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-rose-600 hover:text-white hover:bg-rose-600 font-bold w-6 h-6 flex items-center justify-center rounded-full border border-rose-300 transition-all"
              >
                ×
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2 mt-1">
            <button
              type="button"
              onClick={() => addField()}
              className="px-3 py-1.5 rounded-lg bg-violet-100 hover:bg-violet-200 text-violet-800 font-bold text-sm border border-violet-300 flex items-center gap-2 transition-colors"
            >
              <span className="text-lg leading-none">+</span>
              Edit
            </button>
            <button
              type="button"
              onClick={saveFieldChanges}
              disabled={!isDirty}
              className={`px-3 py-1.5 rounded-lg font-bold text-sm border flex items-center gap-2 transition-colors ${
                isDirty
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700"
                  : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {isDirty ? "Save Changes" : "Saved"}
            </button>
          </div>
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
    </div>
  );
}
