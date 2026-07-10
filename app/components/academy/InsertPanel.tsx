"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Bold, Italic, Underline as UnderlineIcon, Highlighter,
  Search, ChevronUp, CaseSensitive,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered,
  Undo2, Redo2,
  Save, Clock, Eye, EyeOff, History as HistoryIcon, ChevronDown, ChevronRight,
  X, CheckCircle2,
  Link2, Bookmark,
  Table as TableIcon,
  Sigma,
  type LucideIcon,
} from "lucide-react";
import type {
  ChapterEditorApi,
  PageBandConfig,
  PageNumberAlign,
  PageNumberStyle,
  StoredVersion,
} from "./useChapterEditor";
import { formatPageNumber } from "./useChapterEditor";

// ─────────────────────────────────────────────────────────────────────────────
// Insert sections (existing — preserved). Icons via lucide-react.
// ─────────────────────────────────────────────────────────────────────────────

type Item = { icon: LucideIcon; label: string };
interface Section { title: string; items: Item[] }

const SECTIONS: Section[] = [
  {
    title: "Links",
    items: [
      { icon: Link2,    label: "Hyperlink" },
      { icon: Bookmark, label: "Bookmark" },
    ],
  },
  // Header / Footer / Page Number have their own dedicated configurators
  // (BandSection / PageNumberSection) — not listed here.
  // Text Box has its own dedicated configurator (TextBoxSection).
];

// Shape library — each entry's `inner` is the SVG body, rendered both as a small
// thumbnail in the picker and at 80px when inserted into the editor.
const SHAPES: { name: string; inner: string }[] = [
  { name: "Circle",    inner: '<circle cx="40" cy="40" r="36" />' },
  { name: "Square",    inner: '<rect x="4" y="4" width="72" height="72" />' },
  { name: "Rectangle", inner: '<rect x="4" y="20" width="72" height="40" />' },
  { name: "Triangle",  inner: '<polygon points="40,4 76,76 4,76" />' },
  { name: "Diamond",   inner: '<polygon points="40,4 76,40 40,76 4,40" />' },
  { name: "Pentagon",  inner: '<polygon points="40,4 76,32 62,76 18,76 4,32" />' },
  { name: "Hexagon",   inner: '<polygon points="20,4 60,4 76,40 60,76 20,76 4,40" />' },
  { name: "Star",      inner: '<polygon points="40,4 49,30 76,30 54,46 63,72 40,56 17,72 26,46 4,30 31,30" />' },
  { name: "Heart",     inner: '<path d="M40 70 C 0 45 0 15 22 15 C 32 15 40 25 40 25 C 40 25 48 15 58 15 C 80 15 80 45 40 70 Z" />' },
  { name: "Arrow",     inner: '<path d="M4 30 H50 V18 L76 40 L50 62 V50 H4 Z" />' },
  { name: "Oval",      inner: '<ellipse cx="40" cy="40" rx="36" ry="22" />' },
  { name: "Cross",     inner: '<path d="M30 4 H50 V30 H76 V50 H50 V76 H30 V50 H4 V30 H30 Z" />' },
];

const renderShape = (inner: string, size: number, color: string, filled: boolean) => {
  const paint = filled
    ? `fill="${color}"`
    : `fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="round"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" data-shape-svg="1" width="${size}" height="${size}" viewBox="0 0 80 80" ${paint} style="display:inline-block;vertical-align:middle;margin:4px;">${inner}</svg>`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Theming
// ─────────────────────────────────────────────────────────────────────────────

interface InsertPanelProps {
  /** Used purely as display label. */
  chapterLabel: string;
  accent: "teal" | "rose" | "amber" | "indigo" | "violet" | "cyan";
  editor: ChapterEditorApi;
  /** Controls panel visibility. Toggled by the chapter page's Edit button. */
  open: boolean;
  onClose: () => void;
  /** Caller-side hook for analytics / extras. The actual save still runs through `editor.save()`. */
  onSave?: () => void;
  /** Optional analytics hook when an insert item is clicked. */
  onInsert?: (sectionTitle: string, itemLabel: string) => void;
  /** Hover handlers — chapter page wires these to keep the panel open while
   *  the cursor is over either the Edit button or the panel itself. */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  /** Number of A4 pages currently rendered. Drives per-page header/footer
   *  override inputs in the BandSection. */
  pageCount?: number;
}

const ACCENT_BORDER: Record<InsertPanelProps["accent"], string> = {
  teal:   "border-teal-300",
  rose:   "border-rose-300",
  amber:  "border-amber-300",
  indigo: "border-indigo-300",
  violet: "border-violet-300",
  cyan:   "border-cyan-300",
};
const ACCENT_TEXT: Record<InsertPanelProps["accent"], string> = {
  teal:   "text-teal-800",
  rose:   "text-rose-800",
  amber:  "text-amber-700",
  indigo: "text-indigo-800",
  violet: "text-violet-800",
  cyan:   "text-cyan-800",
};

const relativeTime = (ts: number | null): string => {
  if (!ts) return "Never";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min${diff < 120 ? "" : "s"} ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr${diff < 7200 ? "" : "s"} ago`;
  return new Date(ts).toLocaleString();
};

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function InsertPanel({
  chapterLabel,
  accent,
  editor,
  open,
  onClose,
  onSave,
  onInsert,
  onMouseEnter,
  onMouseLeave,
  pageCount = 1,
}: InsertPanelProps) {
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set([SECTIONS[0].title]),
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [, setTick] = useState(0); // re-render every 30s so "Last saved …" stays fresh

  // Visibility is purely controlled by the parent via the `open` prop now.
  const visible = open;

  // Esc closes the panel
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Tick for relative time
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const toggleSection = (title: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title); else next.add(title);
      return next;
    });
  };

  // Handlers for special-cased Insert items that have real behaviour
  // rather than just dropping a placeholder chip.
  const handleHyperlink = () => {
    const url = window.prompt("Enter the URL:", "https://");
    if (!url) return;
    const trimmed = url.trim();
    if (!trimmed) return;
    const sel = window.getSelection();
    const hasSelection = sel && sel.toString().length > 0;
    if (hasSelection) {
      editor.exec("createLink", trimmed);
    } else {
      const text = window.prompt("Link text:", trimmed) || trimmed;
      const escUrl  = trimmed.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
      const escText = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      editor.exec(
        "insertHTML",
        `<a href="${escUrl}" target="_blank" rel="noopener noreferrer">${escText}</a>&nbsp;`,
      );
    }
  };

  const handleBookmark = () => {
    const name = window.prompt("Bookmark name:");
    if (!name) return;
    const safe = name.trim().replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase();
    if (!safe) return;
    editor.exec(
      "insertHTML",
      `<a id="${safe}" data-bookmark="${safe}" contenteditable="false" style="display:inline-block;background:#fef9c3;color:#854d0e;border:1px solid #fde047;border-radius:4px;padding:0 6px;font-size:11px;font-weight:bold;text-decoration:none;margin:0 2px;">🔖 ${safe}</a>&nbsp;`,
    );
  };

  const insert = (sectionTitle: string, itemLabel: string) => {
    // Real-behaviour items short-circuit the generic placeholder path.
    if (itemLabel === "Hyperlink")    { handleHyperlink();         onInsert?.(sectionTitle, itemLabel); return; }
    if (itemLabel === "Bookmark")     { handleBookmark();          onInsert?.(sectionTitle, itemLabel); return; }
    if (itemLabel === "Page Numbers") { editor.togglePageNumber(); onInsert?.(sectionTitle, itemLabel); return; }
    editor.insertPlaceholder(sectionTitle, itemLabel);
    onInsert?.(sectionTitle, itemLabel);
  };

  // ─────────────────────────────────────────────────────────────────────────
  const panelStyle: CSSProperties = {
    top: "16px",
    left: "16px",
    right: "16px",
    maxHeight: "calc(100vh - 32px)",
    transform: visible ? "translateY(0)" : "translateY(calc(-100% - 24px))",
    transition: "transform 250ms ease-out",
  };

  return (
    <>
      <div
        style={panelStyle}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        // Prevent default on mousedown so toolbar / insert clicks don't steal focus
        // from the page editor — except for form controls (select / input / textarea),
        // which need to receive mousedown to open their native UI.
        onMouseDown={(e) => {
          const tag = (e.target as HTMLElement).tagName;
          if (tag === "SELECT" || tag === "INPUT" || tag === "OPTION" || tag === "TEXTAREA") return;
          e.preventDefault();
        }}
        className={`fixed z-50 bg-white shadow-2xl border-2 rounded-2xl ${ACCENT_BORDER[accent]} flex flex-col overflow-hidden`}
      >
        {/* ── Sticky top: header + unsaved banner + toolbar ────────────── */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-base font-black uppercase tracking-wide text-slate-800 truncate">
                Edit · <span className={ACCENT_TEXT[accent]}>{chapterLabel}</span>
              </h2>
              <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${
                editor.publishState === "published"
                  ? "bg-green-100 text-green-800 border border-green-300"
                  : "bg-slate-200 text-slate-700 border border-slate-300"
              }`}>
                {editor.publishState}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setHistoryOpen((v) => !v)}
                title="Version history"
                className="p-1.5 rounded hover:bg-slate-100 text-slate-600 transition-colors"
              >
                <HistoryIcon className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => editor.setPreviewMode(!editor.previewMode)}
                title={editor.previewMode ? "Exit preview" : "Preview mode"}
                className={`p-1.5 rounded hover:bg-slate-100 transition-colors ${
                  editor.previewMode ? "text-blue-700 bg-blue-50" : "text-slate-600"
                }`}
              >
                {editor.previewMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="p-1.5 rounded hover:bg-slate-100 text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {editor.saveStatus === "unsaved" && (
            <div className="px-4 py-1.5 bg-orange-50 border-t border-orange-200 flex items-center gap-2 transition-all">
              <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
              <span className="text-xs font-semibold text-orange-800">You have unsaved changes</span>
            </div>
          )}

          {historyOpen && (
            <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 max-h-48 overflow-y-auto">
              <div className="text-[11px] uppercase font-bold text-slate-500 mb-1">
                Last {editor.versions.length} versions
              </div>
              {editor.versions.length === 0 && (
                <div className="text-xs text-slate-400 italic py-2">No saved versions yet</div>
              )}
              <ul className="space-y-1">
                {editor.versions.map((v: StoredVersion, i: number) => {
                  const preview = v.content.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").trim().slice(0, 50);
                  return (
                    <li key={`${v.at}-${i}`} className="flex items-center justify-between gap-2 p-2 bg-white rounded border border-slate-200 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-[10px] text-slate-500">{new Date(v.at).toLocaleString()}</div>
                        <div className="text-slate-700 truncate">{preview || <em className="text-slate-400">empty</em>}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          editor.restoreVersion(v);
                          setHistoryOpen(false);
                        }}
                        className="px-2 py-1 rounded bg-slate-700 text-white text-[10px] font-bold hover:bg-slate-900 transition-colors"
                      >
                        Restore
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <Toolbar
            accent={accent}
            previewMode={editor.previewMode}
            activeFormats={editor.activeFormats}
            canUndo={editor.canUndo}
            canRedo={editor.canRedo}
            onExec={editor.exec}
            onUndo={editor.undo}
            onRedo={editor.redo}
            editorRef={editor.editorRef}
          />
        </div>

        {/* ── Insert sections — Word-ribbon-style horizontal scroll ─────── */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-3 py-3">
            <div className="text-[11px] uppercase font-bold text-slate-500 mb-2">Insert</div>
            <div className="flex gap-2 overflow-x-auto pb-1 items-start">
              <div className="shrink-0 w-72">
                <TablesSection
                  isOpen={openSections.has("Tables")}
                  onToggle={() => toggleSection("Tables")}
                  disabled={editor.previewMode}
                  onPick={(rows, cols) => editor.insertTable(rows, cols)}
                />
              </div>
              <div className="shrink-0 w-72">
                <ShapesSection
                  isOpen={openSections.has("Shapes")}
                  onToggle={() => toggleSection("Shapes")}
                  disabled={editor.previewMode}
                  onPick={(html) => editor.insertShape(html)}
                />
              </div>
              <div className="shrink-0 w-72">
                <PageNumberSection
                  isOpen={openSections.has("Page Number")}
                  onToggle={() => toggleSection("Page Number")}
                  on={editor.pageNumberOn}
                  onTogglePN={editor.togglePageNumber}
                  config={editor.pageNumberConfig}
                  onChangeConfig={editor.setPageNumberConfig}
                />
              </div>
              <div className="shrink-0 w-72">
                <BandSection
                  label="Header"
                  isOpen={openSections.has("Header")}
                  onToggle={() => toggleSection("Header")}
                  on={editor.headerOn}
                  onToggleOn={editor.toggleHeader}
                  config={editor.headerConfig}
                  onChangeConfig={editor.setHeaderConfig}
                  pageCount={pageCount}
                  textsByPage={editor.headerTextsByPage}
                  onChangeTextForPage={editor.setHeaderTextForPage}
                  stylesByPage={editor.headerStylesByPage}
                  onChangeStyleForPage={editor.setHeaderStyleForPage}
                  onResetStyleForPage={editor.resetHeaderStyleForPage}
                />
              </div>
              <div className="shrink-0 w-72">
                <BandSection
                  label="Footer"
                  isOpen={openSections.has("Footer")}
                  onToggle={() => toggleSection("Footer")}
                  on={editor.footerOn}
                  onToggleOn={editor.toggleFooter}
                  config={editor.footerConfig}
                  onChangeConfig={editor.setFooterConfig}
                  pageCount={pageCount}
                  textsByPage={editor.footerTextsByPage}
                  onChangeTextForPage={editor.setFooterTextForPage}
                  stylesByPage={editor.footerStylesByPage}
                  onChangeStyleForPage={editor.setFooterStyleForPage}
                  onResetStyleForPage={editor.resetFooterStyleForPage}
                />
              </div>
              <div className="shrink-0 w-72">
                <TextBoxSection
                  isOpen={openSections.has("Text Box")}
                  onToggle={() => toggleSection("Text Box")}
                  disabled={editor.previewMode}
                  onInsert={(w, h) => editor.insertTextBox(w, h)}
                  editorEl={editor.editorRef.current}
                />
              </div>
              <div className="shrink-0 w-72">
                <MathSymbolsSection
                  isOpen={openSections.has("Math Symbols")}
                  onToggle={() => toggleSection("Math Symbols")}
                  disabled={editor.previewMode}
                  onInsert={(s) => {
                    editor.editorRef.current?.focus();
                    editor.exec("insertText", s);
                  }}
                />
              </div>
              {SECTIONS.map((section) => {
                const isOpen = openSections.has(section.title);
                return (
                  <div key={section.title} className="shrink-0 w-72">
                    <div className="border border-slate-200 rounded-lg">
                      <button
                        type="button"
                        onClick={() => toggleSection(section.title)}
                        aria-expanded={isOpen}
                        className="w-full flex items-center justify-between px-3 py-2 text-left font-bold text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <span>{section.title}</span>
                        {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                      </button>
                      {isOpen && (
                        <div className="grid grid-cols-2 gap-2 px-3 pb-3 pt-1">
                          {section.items.map((item) => {
                            const Icon = item.icon;
                            return (
                              <button
                                type="button"
                                key={item.label}
                                onClick={() => insert(section.title, item.label)}
                                disabled={editor.previewMode}
                                className="flex items-center gap-2 p-3 rounded-lg border border-slate-200 hover:border-slate-400 hover:bg-slate-50 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <Icon className="w-5 h-5 shrink-0 text-slate-700" />
                                <span className="text-xs font-semibold text-slate-700">{item.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Status bar ───────────────────────────────────────────────── */}
        <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-[11px] text-slate-600">
          <div className="flex items-center gap-3">
            <span><b>{editor.wordCount}</b> words · <b>{editor.charCount}</b> chars</span>
            <span className="flex items-center gap-1">
              {editor.saveStatus === "saving" ? (
                <><Save className="w-3 h-3 animate-pulse" /> Saving…</>
              ) : editor.saveStatus === "unsaved" ? (
                <><span className="w-1.5 h-1.5 rounded-full bg-orange-500" /> Unsaved changes</>
              ) : (
                <><CheckCircle2 className="w-3 h-3 text-green-600" /> All changes saved</>
              )}
            </span>
          </div>
          <div className="flex items-center gap-1 text-slate-500">
            <Clock className="w-3 h-3" />
            Last saved {relativeTime(editor.lastSavedAt)}
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <div className="px-4 py-3 border-t border-slate-200 bg-white flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100 text-sm font-semibold transition-colors"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => editor.save({ nextState: "draft" })}
              className="px-3 py-2 rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300 text-sm font-semibold transition-colors flex items-center gap-1"
            >
              <Save className="w-4 h-4" /> Save as Draft
            </button>
            <button
              type="button"
              onClick={() => editor.save({ nextState: "published" })}
              className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-semibold transition-colors flex items-center gap-1"
            >
              <CheckCircle2 className="w-4 h-4" /> Publish
            </button>
            <button
              type="button"
              onClick={() => { editor.save(); onSave?.(); }}
              className="px-3 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 text-sm font-semibold transition-colors flex items-center gap-1"
            >
              <Save className="w-4 h-4" /> Save Changes
            </button>
          </div>
        </div>
      </div>

      {/* ── Toast — viewport bottom-right ────────────────────────────── */}
      {editor.toast && (
        <div className="fixed bottom-6 right-6 z-[60]">
          <div className={`px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm font-semibold border ${
            editor.toast.tone === "success"
              ? "bg-green-50 text-green-800 border-green-300"
              : "bg-slate-800 text-white border-slate-700"
          }`}>
            {editor.toast.tone === "success" && <CheckCircle2 className="w-4 h-4" />}
            {editor.toast.msg}
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Toolbar
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Tables — collapsible section with 6×6 grid picker (Word-style)
// ─────────────────────────────────────────────────────────────────────────────

const TABLE_GRID = 6;

function TablesSection({
  isOpen, onToggle, disabled, onPick,
}: {
  isOpen: boolean;
  onToggle: () => void;
  disabled: boolean;
  onPick: (rows: number, cols: number) => void;
}) {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const rows = hover?.r ?? 0;
  const cols = hover?.c ?? 0;

  return (
    <div className="border border-slate-200 rounded-lg">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between px-3 py-2 text-left font-bold text-sm text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <TableIcon className="w-4 h-4 text-slate-500" />
          Tables
        </span>
        {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>

      {isOpen && (
        <div className="px-3 pb-3 pt-1">
          <div className="text-[11px] text-slate-500 mb-2">
            {hover ? `${rows} × ${cols} Table` : "Hover to pick size · click to insert"}
          </div>
          <div
            className="inline-block select-none"
            onMouseLeave={() => setHover(null)}
          >
            {Array.from({ length: TABLE_GRID }).map((_, r) => (
              <div key={r} className="flex">
                {Array.from({ length: TABLE_GRID }).map((_, c) => {
                  const active = r < rows && c < cols;
                  return (
                    <button
                      key={c}
                      type="button"
                      disabled={disabled}
                      onMouseEnter={() => setHover({ r: r + 1, c: c + 1 })}
                      onClick={() => onPick(r + 1, c + 1)}
                      className={`w-5 h-5 m-[2px] rounded-sm border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        active
                          ? "bg-blue-500 border-blue-700"
                          : "bg-white border-slate-300 hover:bg-slate-100"
                      }`}
                      aria-label={`Insert ${r + 1} by ${c + 1} table`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shapes — collapsible section with clickable shape thumbnails
// ─────────────────────────────────────────────────────────────────────────────

function ShapesSection({
  isOpen, onToggle, disabled, onPick,
}: {
  isOpen: boolean;
  onToggle: () => void;
  disabled: boolean;
  onPick: (svgHtml: string) => void;
}) {
  const [color, setColor] = useState("#3b82f6");
  const [filled, setFilled] = useState(true);

  return (
    <div className="border border-slate-200 rounded-lg">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between px-3 py-2 text-left font-bold text-sm text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <span>Shapes</span>
        {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>

      {isOpen && (
        <div className="px-3 pb-3 pt-1">
          {/* Colour + Fill controls */}
          <div className="flex items-center gap-2 mb-3">
            <label title="Shape colour" className="inline-flex items-center cursor-pointer">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                disabled={disabled}
                className="w-7 h-7 rounded border border-slate-200 bg-white p-0.5 cursor-pointer disabled:opacity-40"
              />
            </label>
            <div className="inline-flex rounded-md overflow-hidden border border-slate-200">
              <button
                type="button"
                disabled={disabled}
                onClick={() => setFilled(true)}
                aria-pressed={filled}
                className={`px-2 py-1 text-xs font-semibold transition-colors disabled:opacity-40 ${
                  filled ? "bg-slate-700 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Fill
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setFilled(false)}
                aria-pressed={!filled}
                className={`px-2 py-1 text-xs font-semibold border-l border-slate-200 transition-colors disabled:opacity-40 ${
                  !filled ? "bg-slate-700 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                No fill
              </button>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 mb-2">Click a shape to insert it</div>
          <div className="grid grid-cols-4 gap-2">
            {SHAPES.map((s) => (
              <button
                key={s.name}
                type="button"
                disabled={disabled}
                onClick={() => onPick(renderShape(s.inner, 80, color, filled))}
                title={s.name}
                aria-label={`Insert ${s.name}`}
                className="aspect-square flex items-center justify-center rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                // Thumbnails preview the current colour + fill setting.
                dangerouslySetInnerHTML={{ __html: renderShape(s.inner, 36, color, filled) }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page Number — toggle + alignment / colour / style / italic / bold
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_NUMBER_STYLES: { value: PageNumberStyle; label: string }[] = [
  { value: "plain",    label: "Just number  ·  1" },
  { value: "page",     label: "Page format  ·  Page 1" },
  { value: "dashes",   label: "Dashes  ·  — 1 —" },
  { value: "dots",     label: "Dots  ·  · 1 ·" },
  { value: "brackets", label: "Brackets  ·  [ 1 ]" },
  { value: "parens",   label: "Parens  ·  ( 1 )" },
];

function PageNumberSection({
  isOpen, onToggle, on, onTogglePN, config, onChangeConfig,
}: {
  isOpen: boolean;
  onToggle: () => void;
  on: boolean;
  onTogglePN: () => void;
  config: ChapterEditorApi["pageNumberConfig"];
  onChangeConfig: ChapterEditorApi["setPageNumberConfig"];
}) {
  const setAlign = (align: PageNumberAlign) => onChangeConfig({ align });

  return (
    <div className="border border-slate-200 rounded-lg">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between px-3 py-2 text-left font-bold text-sm text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <span>Page Number {on && <span className="ml-1 text-blue-600">✓</span>}</span>
        {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>

      {isOpen && (
        <div className="px-3 pb-3 pt-1 space-y-3">
          {/* Show / hide */}
          <button
            type="button"
            onClick={onTogglePN}
            aria-pressed={on}
            className={`w-full px-3 py-2 rounded-lg border text-sm font-semibold transition-colors flex items-center justify-between ${
              on
                ? "bg-blue-50 border-blue-300 text-blue-900"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            <span>Show page number</span>
            <span className={`px-2 py-0.5 text-[10px] uppercase rounded-full ${
              on ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600"
            }`}>{on ? "On" : "Off"}</span>
          </button>

          <fieldset disabled={!on} className="space-y-3 disabled:opacity-50">
            {/* Position */}
            <div>
              <div className="text-[11px] uppercase font-bold text-slate-500 mb-1">Position</div>
              <div className="inline-flex w-full rounded-md overflow-hidden border border-slate-200">
                {(["left", "center", "right"] as PageNumberAlign[]).map((a, i) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAlign(a)}
                    aria-pressed={config.align === a}
                    className={`flex-1 px-2 py-1.5 text-xs font-semibold transition-colors ${
                      i > 0 ? "border-l border-slate-200" : ""
                    } ${
                      config.align === a
                        ? "bg-slate-700 text-white"
                        : "bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {a[0].toUpperCase() + a.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Style */}
            <div>
              <div className="text-[11px] uppercase font-bold text-slate-500 mb-1">Style</div>
              <select
                value={config.style}
                onChange={(e) => onChangeConfig({ style: e.target.value as PageNumberStyle })}
                className="w-full text-xs px-2 py-1.5 rounded border border-slate-200 bg-white text-slate-700"
              >
                {PAGE_NUMBER_STYLES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            {/* Colour + Italic + Bold */}
            <div className="flex items-center gap-2">
              <label title="Page number colour" className="inline-flex items-center cursor-pointer">
                <input
                  type="color"
                  value={config.color}
                  onChange={(e) => onChangeConfig({ color: e.target.value })}
                  className="w-7 h-7 rounded border border-slate-200 bg-white p-0.5 cursor-pointer"
                />
              </label>
              <button
                type="button"
                onClick={() => onChangeConfig({ italic: !config.italic })}
                aria-pressed={config.italic}
                title="Italic"
                className={`px-2 py-1 text-xs font-bold italic rounded border transition-colors ${
                  config.italic ? "bg-slate-700 text-white border-slate-700" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                I
              </button>
              <button
                type="button"
                onClick={() => onChangeConfig({ bold: !config.bold })}
                aria-pressed={config.bold}
                title="Bold"
                className={`px-2 py-1 text-xs font-black rounded border transition-colors ${
                  config.bold ? "bg-slate-700 text-white border-slate-700" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                B
              </button>
            </div>

            {/* Live preview */}
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2">
              <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Preview</div>
              <div
                className={`text-sm ${
                  config.align === "left"  ? "text-left"  :
                  config.align === "right" ? "text-right" :
                  "text-center"
                } ${config.italic ? "italic" : ""} ${config.bold ? "font-bold" : ""}`}
                style={{ color: config.color }}
              >
                {formatPageNumber(config.style, 1)}
              </div>
            </div>
          </fieldset>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Header / Footer band — toggle + editable text + alignment / colour / italic / bold
// (Reused for both Header and Footer.)
// ─────────────────────────────────────────────────────────────────────────────

function BandSection({
  label, isOpen, onToggle, on, onToggleOn, config, onChangeConfig,
  pageCount, textsByPage, onChangeTextForPage,
  stylesByPage, onChangeStyleForPage, onResetStyleForPage,
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  on: boolean;
  onToggleOn: () => void;
  config: PageBandConfig;
  onChangeConfig: (partial: Partial<PageBandConfig>) => void;
  pageCount: number;
  textsByPage: Record<number, string>;
  onChangeTextForPage: (page: number, text: string) => void;
  stylesByPage: Record<number, Partial<PageBandConfig>>;
  onChangeStyleForPage: (page: number, partial: Partial<PageBandConfig>) => void;
  onResetStyleForPage: (page: number) => void;
}) {
  // 0 == "Default", any other number = that specific page's override.
  const [editingPage, setEditingPage] = useState<number>(0);
  // Effective config: default merged with override (if editing a specific page).
  const activeStyle: PageBandConfig =
    editingPage === 0
      ? config
      : { ...config, ...(stylesByPage[editingPage] ?? {}) };
  const applyStyle = (partial: Partial<PageBandConfig>) => {
    if (editingPage === 0) onChangeConfig(partial);
    else onChangeStyleForPage(editingPage, partial);
  };
  const setAlign = (align: PageNumberAlign) => applyStyle({ align });

  return (
    <div className="border border-slate-200 rounded-lg">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between px-3 py-2 text-left font-bold text-sm text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <span>{label} {on && <span className="ml-1 text-blue-600">✓</span>}</span>
        {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>

      {isOpen && (
        <div className="px-3 pb-3 pt-1 space-y-3">
          {/* Show / hide */}
          <button
            type="button"
            onClick={onToggleOn}
            aria-pressed={on}
            className={`w-full px-3 py-2 rounded-lg border text-sm font-semibold transition-colors flex items-center justify-between ${
              on
                ? "bg-blue-50 border-blue-300 text-blue-900"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            <span>Show {label.toLowerCase()}</span>
            <span className={`px-2 py-0.5 text-[10px] uppercase rounded-full ${
              on ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600"
            }`}>{on ? "On" : "Off"}</span>
          </button>

          <fieldset disabled={!on} className="space-y-3 disabled:opacity-50">
            {/* Default text — used for any page that doesn't have its own override */}
            <div>
              <div className="text-[11px] uppercase font-bold text-slate-500 mb-1">
                Default text {pageCount > 1 ? "(applies to pages without a per-page override)" : ""}
              </div>
              <input
                type="text"
                value={config.text}
                placeholder={`Enter ${label.toLowerCase()} text`}
                onChange={(e) => onChangeConfig({ text: e.target.value })}
                className="w-full text-sm px-2 py-1.5 rounded border border-slate-200 bg-white text-slate-800"
              />
            </div>

            {/* Per-page overrides — visible only when there's more than one page */}
            {pageCount > 1 && (
              <div>
                <div className="text-[11px] uppercase font-bold text-slate-500 mb-1">
                  Per-page text · leave blank to use default
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                  {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                    <div key={n} className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-500 w-12 shrink-0">Page {n}</span>
                      <input
                        type="text"
                        value={textsByPage[n] ?? ""}
                        placeholder={config.text}
                        onChange={(e) => onChangeTextForPage(n, e.target.value)}
                        className="flex-1 text-xs px-2 py-1 rounded border border-slate-200 bg-white text-slate-800"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Editing style for: selector — only shown when there are multiple pages */}
            {pageCount > 1 && (
              <div>
                <div className="text-[11px] uppercase font-bold text-slate-500 mb-1 flex items-center justify-between">
                  <span>Editing style for</span>
                  {editingPage !== 0 && stylesByPage[editingPage] && (
                    <button
                      type="button"
                      onClick={() => onResetStyleForPage(editingPage)}
                      className="text-[10px] text-slate-500 hover:text-rose-600 underline"
                    >
                      Reset to default
                    </button>
                  )}
                </div>
                <select
                  value={editingPage}
                  onChange={(e) => setEditingPage(Number(e.target.value))}
                  className="w-full text-xs px-2 py-1.5 rounded border border-slate-200 bg-white text-slate-700"
                >
                  <option value={0}>Default (applies to all pages without override)</option>
                  {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      Page {n}{stylesByPage[n] ? " ●" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Position */}
            <div>
              <div className="text-[11px] uppercase font-bold text-slate-500 mb-1">Position</div>
              <div className="inline-flex w-full rounded-md overflow-hidden border border-slate-200">
                {(["left", "center", "right"] as PageNumberAlign[]).map((a, i) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAlign(a)}
                    aria-pressed={activeStyle.align === a}
                    className={`flex-1 px-2 py-1.5 text-xs font-semibold transition-colors ${
                      i > 0 ? "border-l border-slate-200" : ""
                    } ${
                      activeStyle.align === a
                        ? "bg-slate-700 text-white"
                        : "bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {a[0].toUpperCase() + a.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Colour + Italic + Bold */}
            <div className="flex items-center gap-2">
              <label title={`${label} colour`} className="inline-flex items-center cursor-pointer">
                <input
                  type="color"
                  value={activeStyle.color}
                  onChange={(e) => applyStyle({ color: e.target.value })}
                  className="w-7 h-7 rounded border border-slate-200 bg-white p-0.5 cursor-pointer"
                />
              </label>
              <button
                type="button"
                onClick={() => applyStyle({ italic: !activeStyle.italic })}
                aria-pressed={activeStyle.italic}
                title="Italic"
                className={`px-2 py-1 text-xs font-bold italic rounded border transition-colors ${
                  activeStyle.italic ? "bg-slate-700 text-white border-slate-700" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                I
              </button>
              <button
                type="button"
                onClick={() => applyStyle({ bold: !activeStyle.bold })}
                aria-pressed={activeStyle.bold}
                title="Bold"
                className={`px-2 py-1 text-xs font-black rounded border transition-colors ${
                  activeStyle.bold ? "bg-slate-700 text-white border-slate-700" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                B
              </button>
            </div>

            {/* Live preview — reflects the active style + active page's text. */}
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2">
              <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">
                Preview {editingPage !== 0 ? `· Page ${editingPage}` : "· Default"}
              </div>
              <div
                className={`text-sm ${
                  activeStyle.align === "left"  ? "text-left"  :
                  activeStyle.align === "right" ? "text-right" :
                  "text-center"
                } ${activeStyle.italic ? "italic" : ""} ${activeStyle.bold ? "font-bold" : ""}`}
                style={{ color: activeStyle.color }}
              >
                {(editingPage !== 0 ? (textsByPage[editingPage] ?? config.text) : config.text) ||
                  <span className="text-slate-400 italic">(empty)</span>}
              </div>
            </div>
          </fieldset>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Text Box — preset / custom size picker. Inserted box auto-grows as user types.
// ─────────────────────────────────────────────────────────────────────────────

const TEXTBOX_PRESETS: { name: string; w: number; h: number }[] = [
  { name: "Small",  w: 200, h: 60  },
  { name: "Medium", w: 320, h: 100 },
  { name: "Large",  w: 480, h: 160 },
];

// Pencil icon for the Draw button
function PencilIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

// Place the cursor at a viewport (x, y) inside the editor — used by Draw mode.
function caretRangeAt(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  if (doc.caretRangeFromPoint) return doc.caretRangeFromPoint(x, y);
  if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x, y);
    if (!pos) return null;
    const r = document.createRange();
    r.setStart(pos.offsetNode, pos.offset);
    r.collapse(true);
    return r;
  }
  return null;
}

function TextBoxSection({
  isOpen, onToggle, disabled, onInsert, editorEl,
}: {
  isOpen: boolean;
  onToggle: () => void;
  disabled: boolean;
  onInsert: (width: number, height: number) => void;
  editorEl: HTMLElement | null;
}) {
  const [drawing, setDrawing] = useState(false);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  // Draw-mode handlers — attached only while `drawing` is true.
  useEffect(() => {
    if (!drawing) return;

    const onDown = (e: MouseEvent) => {
      dragStart.current = { x: e.clientX, y: e.clientY };
      setRect({ x: e.clientX, y: e.clientY, w: 0, h: 0 });
    };
    const onMove = (e: MouseEvent) => {
      if (!dragStart.current) return;
      const sx = dragStart.current.x, sy = dragStart.current.y;
      setRect({
        x: Math.min(e.clientX, sx),
        y: Math.min(e.clientY, sy),
        w: Math.abs(e.clientX - sx),
        h: Math.abs(e.clientY - sy),
      });
    };
    const onUp = (e: MouseEvent) => {
      if (!dragStart.current) { setDrawing(false); setRect(null); return; }
      const w = Math.abs(e.clientX - dragStart.current.x);
      const h = Math.abs(e.clientY - dragStart.current.y);
      const startX = dragStart.current.x;
      const startY = dragStart.current.y;
      dragStart.current = null;
      setRect(null);
      setDrawing(false);
      // Only insert if drag started inside the editor and the rectangle is large enough.
      if (!editorEl) return;
      const eRect = editorEl.getBoundingClientRect();
      const insideEditor =
        startX >= eRect.left && startX <= eRect.right &&
        startY >= eRect.top  && startY <= eRect.bottom;
      if (!insideEditor) return;
      if (w < 40 || h < 30) return;
      // Position the cursor at the drag start so the text box drops there.
      const range = caretRangeAt(startX, startY);
      if (range && editorEl.contains(range.commonAncestorContainer)) {
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      } else {
        editorEl.focus();
      }
      onInsert(w, h);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dragStart.current = null;
        setRect(null);
        setDrawing(false);
      }
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("keydown", onKey);
    };
  }, [drawing, onInsert, editorEl]);

  return (
    <>
      <div className="border border-slate-200 rounded-lg">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          className="w-full flex items-center justify-between px-3 py-2 text-left font-bold text-sm text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <span>Text Box</span>
          {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        </button>

        {isOpen && (
          <div className="px-3 pb-3 pt-1 space-y-3">
            {/* Presets */}
            <div>
              <div className="text-[11px] uppercase font-bold text-slate-500 mb-1">Preset sizes</div>
              <div className="grid grid-cols-3 gap-2">
                {TEXTBOX_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    disabled={disabled}
                    onClick={() => onInsert(p.w, p.h)}
                    className="px-2 py-2 rounded-lg border border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50 text-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <div className="text-xs font-bold text-slate-800">{p.name}</div>
                    <div className="text-[10px] text-slate-500">{p.w} × {p.h}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Draw — click and drag on the page to define size */}
            <button
              type="button"
              disabled={disabled}
              onClick={() => setDrawing(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <PencilIcon className="w-4 h-4" />
              Draw Text Box
            </button>

            <div className="text-[11px] text-slate-500 italic">
              Box auto-grows in height as you type. Hover the box to reveal a × delete button.
            </div>
          </div>
        )}
      </div>

      {/* Draw-mode overlay — full viewport, crosshair cursor, dashed preview rect. */}
      {drawing && (
        <div
          className="fixed inset-0 z-[70]"
          style={{ cursor: "crosshair" }}
        >
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[71] bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-semibold flex items-center gap-3">
            <span>Click and drag inside the editor to draw a text box</span>
            <button
              type="button"
              onClick={() => { dragStart.current = null; setRect(null); setDrawing(false); }}
              className="ml-2 text-white/90 hover:text-white border border-white/40 rounded px-2 py-0.5 text-xs"
            >
              Cancel (Esc)
            </button>
          </div>
          {rect && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: rect.x,
                top: rect.y,
                width: rect.w,
                height: rect.h,
                border: "2px dashed #3b82f6",
                background: "rgba(59,130,246,0.10)",
                borderRadius: 6,
              }}
            />
          )}
        </div>
      )}
    </>
  );
}

interface ToolbarProps {
  accent: InsertPanelProps["accent"];
  previewMode: boolean;
  activeFormats: Set<string>;
  canUndo: boolean;
  canRedo: boolean;
  onExec: (cmd: string, value?: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  editorRef: React.RefObject<HTMLDivElement | null>;
}

const ACCENT_ACTIVE: Record<InsertPanelProps["accent"], string> = {
  teal:   "bg-teal-700 text-white border-teal-700",
  rose:   "bg-rose-700 text-white border-rose-700",
  amber:  "bg-amber-600 text-white border-amber-600",
  indigo: "bg-indigo-700 text-white border-indigo-700",
  violet: "bg-violet-700 text-white border-violet-700",
  cyan:   "bg-cyan-700 text-white border-cyan-700",
};

// ─────────────────────────────────────────────────────────────────────────────
// Numbering Library — Word-style dropdown for picking an ordered-list style.
// ─────────────────────────────────────────────────────────────────────────────

interface NumberingStyle {
  id: string;
  format: string[]; // 3 sample labels rendered in the preview tile
}

const NUMBERING_STYLES: NumberingStyle[] = [
  { id: "1.", format: ["1.", "2.", "3."] },
  { id: "1)", format: ["1)", "2)", "3)"] },
  { id: "I.", format: ["I.",  "II.",  "III."] },
  { id: "A.", format: ["A.",  "B.",  "C."] },
  { id: "A)", format: ["A)",  "B)",  "C)"] },
  { id: "a.", format: ["a.",  "b.",  "c."] },
  { id: "a)", format: ["a)",  "b)",  "c)"] },
  { id: "i.", format: ["i.",  "ii.",  "iii."] },
];

function NumberingControl({
  previewMode, onExec, editorRef,
}: {
  previewMode: boolean;
  onExec: (cmd: string, value?: string) => void;
  editorRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-numbering-popover]")) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  // Find the <ol> containing the current selection, scoped to our editor.
  const findOl = (): HTMLOListElement | null => {
    const root = editorRef.current;
    const sel = window.getSelection();
    if (!root || !sel || sel.rangeCount === 0) return null;
    const node = sel.getRangeAt(0).commonAncestorContainer;
    const el = (node instanceof Element ? node : node.parentElement) as HTMLElement | null;
    if (!el || !root.contains(el)) return null;
    return el.closest("ol");
  };

  const applyStyle = (styleId: string) => {
    if (previewMode) return;
    let ol = findOl();
    if (!ol) {
      // No ordered list yet — create one around the selection
      onExec("insertOrderedList");
      ol = findOl();
    }
    if (ol) ol.setAttribute("data-num-style", styleId);
    setOpen(false);
  };

  const removeList = () => {
    if (previewMode) return;
    const ol = findOl();
    if (ol) onExec("insertOrderedList"); // toggle off
    setOpen(false);
  };

  return (
    <div className="relative inline-block" data-numbering-popover>
      <button
        type="button"
        title="Numbering library"
        disabled={previewMode}
        onClick={() => setOpen((o) => !o)}
        className="px-1.5 py-1 text-xs rounded border bg-white border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-0.5"
      >
        <ListOrdered className="w-4 h-4" />
        <ChevronDown className="w-3 h-3 text-slate-500" />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-20 bg-white border border-slate-200 rounded-lg shadow-lg p-3 w-72">
          <div className="text-[11px] uppercase font-bold text-slate-500 mb-2">Numbering library</div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={removeList}
              className="aspect-square rounded-md border border-slate-200 hover:border-slate-400 hover:bg-slate-50 transition-colors flex items-center justify-center"
              title="None — remove numbering"
            >
              <span className="text-xs font-bold text-slate-600">None</span>
            </button>
            {NUMBERING_STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => applyStyle(s.id)}
                title={s.id}
                className="aspect-square rounded-md border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-colors flex items-center justify-center p-1"
              >
                <div className="text-[9px] leading-tight w-full space-y-0.5">
                  {s.format.map((lbl, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <span className="text-slate-800 font-semibold w-5 text-right">{lbl}</span>
                      <span className="flex-1 border-b border-slate-300" />
                    </div>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Change Case — Word-style dropdown for case transformation of the selection.
// ─────────────────────────────────────────────────────────────────────────────

interface CaseOption {
  id: string;
  label: string;
  /** Returns the transformed text. */
  transform: (s: string) => string;
}

const CASE_OPTIONS: CaseOption[] = [
  {
    id: "sentence",
    label: "Sentence case.",
    transform: (s) =>
      s.toLowerCase().replace(/(^\s*|[.!?]\s+)([a-z])/g, (_m, sep, c: string) => sep + c.toUpperCase()),
  },
  {
    id: "lower",
    label: "lowercase",
    transform: (s) => s.toLowerCase(),
  },
  {
    id: "upper",
    label: "UPPERCASE",
    transform: (s) => s.toUpperCase(),
  },
  {
    id: "title",
    label: "Capitalize Each Word",
    transform: (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
  },
  {
    id: "toggle",
    label: "tOGGLE cASE",
    transform: (s) =>
      s
        .split("")
        .map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
        .join(""),
  },
];

function ChangeCaseControl({
  previewMode, onExec,
}: {
  previewMode: boolean;
  onExec: (cmd: string, value?: string) => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-case-popover]")) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const apply = (transform: (s: string) => string) => {
    if (previewMode) {
      setOpen(false);
      return;
    }
    // Read the selection text BEFORE exec restores the saved range — but the
    // saved range matches the user's selection anyway, so this is safe.
    const sel = window.getSelection();
    const text = sel?.toString() ?? "";
    if (!text) {
      setOpen(false);
      return;
    }
    onExec("insertText", transform(text));
    setOpen(false);
  };

  return (
    <div className="relative inline-block" data-case-popover>
      <button
        type="button"
        title="Change case"
        disabled={previewMode}
        onClick={() => setOpen((o) => !o)}
        className="px-1.5 py-1 text-xs rounded border bg-white border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-0.5"
      >
        <CaseSensitive className="w-4 h-4" />
        <ChevronDown className="w-3 h-3 text-slate-500" />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-20 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-52">
          {CASE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => apply(opt.transform)}
              className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bullet Library — Word-style dropdown for picking an unordered-list bullet.
// ─────────────────────────────────────────────────────────────────────────────

const BULLET_STYLES = ["●", "○", "■", "◆", "▶", "✓", "★", "→"];

function BulletControl({
  previewMode, onExec, editorRef,
}: {
  previewMode: boolean;
  onExec: (cmd: string, value?: string) => void;
  editorRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-bullet-popover]")) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const findUl = (): HTMLUListElement | null => {
    const root = editorRef.current;
    const sel = window.getSelection();
    if (!root || !sel || sel.rangeCount === 0) return null;
    const node = sel.getRangeAt(0).commonAncestorContainer;
    const el = (node instanceof Element ? node : node.parentElement) as HTMLElement | null;
    if (!el || !root.contains(el)) return null;
    return el.closest("ul");
  };

  const applyStyle = (styleId: string) => {
    if (previewMode) return;
    let ul = findUl();
    if (!ul) {
      onExec("insertUnorderedList");
      ul = findUl();
    }
    if (ul) ul.setAttribute("data-bullet-style", styleId);
    setOpen(false);
  };

  const removeList = () => {
    if (previewMode) return;
    const ul = findUl();
    if (ul) onExec("insertUnorderedList"); // toggle off
    setOpen(false);
  };

  return (
    <div className="relative inline-block" data-bullet-popover>
      <button
        type="button"
        title="Bullet library"
        disabled={previewMode}
        onClick={() => setOpen((o) => !o)}
        className="px-1.5 py-1 text-xs rounded border bg-white border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-0.5"
      >
        <List className="w-4 h-4" />
        <ChevronDown className="w-3 h-3 text-slate-500" />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-20 bg-white border border-slate-200 rounded-lg shadow-lg p-3 w-60">
          <div className="text-[11px] uppercase font-bold text-slate-500 mb-2">Bullet library</div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={removeList}
              className="aspect-square rounded-md border border-slate-200 hover:border-slate-400 hover:bg-slate-50 transition-colors flex items-center justify-center"
              title="None — remove bullets"
            >
              <span className="text-xs font-bold text-slate-600">None</span>
            </button>
            {BULLET_STYLES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => applyStyle(s)}
                title={s}
                className="aspect-square rounded-md border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-colors flex items-center justify-center text-xl text-slate-800"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Find — Word-style search popover. Walks text nodes in the editor, highlights
// the current hit via the Selection API, and Prev/Next steps through matches.
// ─────────────────────────────────────────────────────────────────────────────

interface FindMatch { node: Text; offset: number }

function findAllMatches(root: HTMLElement, term: string): FindMatch[] {
  const matches: FindMatch[] = [];
  if (!term) return matches;
  const lower = term.toLowerCase();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    const text = (node as Text).textContent ?? "";
    if (text) {
      const lowerText = text.toLowerCase();
      let idx = 0;
      while (true) {
        const found = lowerText.indexOf(lower, idx);
        if (found === -1) break;
        matches.push({ node: node as Text, offset: found });
        idx = found + lower.length;
      }
    }
    node = walker.nextNode();
  }
  return matches;
}

function FindControl({
  previewMode, editorRef,
}: {
  previewMode: boolean;
  editorRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<FindMatch[]>([]);
  const [current, setCurrent] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  // Outside-click / Esc closes the popover
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-find-popover]")) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  // Focus the input when the popover opens
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Recompute matches whenever the query (or open/editor) changes
  useEffect(() => {
    if (!open) return;
    const root = editorRef.current;
    if (!root || !query) {
      setMatches([]);
      setCurrent(-1);
      return;
    }
    const found = findAllMatches(root, query);
    setMatches(found);
    setCurrent(found.length > 0 ? 0 : -1);
  }, [query, open, editorRef]);

  // When `current` changes, select that match in the editor and scroll into view
  useEffect(() => {
    if (current < 0 || current >= matches.length) return;
    const m = matches[current];
    // Guard — the Text node may have been replaced if the document was edited.
    if (!editorRef.current?.contains(m.node)) return;
    const range = document.createRange();
    try {
      range.setStart(m.node, m.offset);
      range.setEnd(m.node, m.offset + query.length);
    } catch {
      return;
    }
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    (m.node.parentElement as HTMLElement | null)?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [current, matches, query, editorRef]);

  const next = () => {
    if (matches.length === 0) return;
    setCurrent((c) => (c + 1) % matches.length);
  };
  const prev = () => {
    if (matches.length === 0) return;
    setCurrent((c) => (c - 1 + matches.length) % matches.length);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.shiftKey ? prev() : next();
    }
  };

  return (
    <div className="relative inline-block" data-find-popover>
      <button
        type="button"
        title="Find (Ctrl+F)"
        disabled={previewMode}
        onClick={() => setOpen((o) => !o)}
        className="px-1.5 py-1 text-xs rounded border bg-white border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
      >
        <Search className="w-4 h-4" />
        <span className="hidden sm:inline">Find</span>
        <ChevronDown className="w-3 h-3 text-slate-500" />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-20 bg-white border border-slate-200 rounded-lg shadow-lg p-2 w-72">
          <div className="flex items-center gap-1 mb-1.5">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Find in page…"
              className="flex-1 text-sm border-none focus:outline-none bg-transparent text-slate-800"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              title="Close"
              className="p-1 text-slate-500 hover:text-slate-800 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600">
              {!query
                ? "Type to search"
                : matches.length === 0
                  ? "No matches"
                  : `${current + 1} of ${matches.length}`}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={prev}
                disabled={matches.length === 0}
                title="Previous (Shift+Enter)"
                className="p-1 rounded text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={next}
                disabled={matches.length === 0}
                title="Next (Enter)"
                className="p-1 rounded text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Highlighter — single-button dropdown: pick a preset/custom colour OR remove.
// ─────────────────────────────────────────────────────────────────────────────

const HIGHLIGHT_PRESETS = [
  "#fef08a", // yellow
  "#bbf7d0", // green
  "#fecdd3", // pink
  "#bfdbfe", // blue
  "#fde68a", // amber
  "#fed7aa", // orange
  "#e9d5ff", // purple
  "#cffafe", // cyan
];

function HighlighterControl({
  previewMode, onExec,
}: {
  previewMode: boolean;
  onExec: (cmd: string, value?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [lastColor, setLastColor] = useState("#fef08a");
  // Native colour-picker dialog interactions can fire mousedown events whose
  // target sits outside the popover. While the picker is focused, suppress
  // outside-click closing so the popover stays open.
  const pickerActiveRef = useRef(false);

  // Close on outside click / Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onClick = (e: MouseEvent) => {
      if (pickerActiveRef.current) return;
      const t = e.target as HTMLElement;
      if (!t.closest("[data-highlighter-popover]")) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const apply = (color: string, closeAfter = true) => {
    onExec("hiliteColor", color);
    if (color !== "transparent") setLastColor(color);
    if (closeAfter) setOpen(false);
  };

  return (
    <div className="relative inline-block" data-highlighter-popover>
      <button
        type="button"
        title="Highlight"
        disabled={previewMode}
        onClick={() => setOpen((o) => !o)}
        className="px-1.5 py-1 text-xs rounded border bg-white border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-0.5"
      >
        <span className="relative inline-block">
          <Highlighter className="w-4 h-4" />
          <span
            className="absolute -bottom-0.5 left-0 right-0 h-[3px] rounded-sm border border-slate-300"
            style={{ backgroundColor: lastColor }}
          />
        </span>
        <ChevronDown className="w-3 h-3 text-slate-500" />
      </button>

      {open && (
        <div
          className="absolute top-full mt-1 left-0 z-20 bg-white border border-slate-200 rounded-lg shadow-lg p-2 w-48"
        >
          <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Highlight colour</div>
          <div className="grid grid-cols-4 gap-1 mb-2">
            {HIGHLIGHT_PRESETS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => apply(color)}
                style={{ backgroundColor: color }}
                className="w-8 h-8 rounded border border-slate-300 hover:border-slate-600 transition-colors"
                title={color}
              />
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-700 mb-2 cursor-pointer">
            <span className="text-[10px] uppercase font-bold text-slate-500">Custom:</span>
            <input
              type="color"
              value={lastColor}
              onFocus={() => { pickerActiveRef.current = true; }}
              onBlur={() => { pickerActiveRef.current = false; }}
              onChange={(e) => apply(e.target.value, false)}
              className="w-7 h-7 rounded border border-slate-200 cursor-pointer p-0.5"
            />
          </label>
          <button
            type="button"
            onClick={() => apply("transparent")}
            className="w-full px-2 py-1.5 text-xs font-semibold rounded border border-slate-200 text-slate-700 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700 transition-colors flex items-center justify-center gap-1.5"
          >
            <span className="inline-block w-4 h-4 border border-slate-400 rounded-sm bg-white relative">
              <span className="absolute inset-0 flex items-center justify-center text-slate-500 text-xs leading-none">⌀</span>
            </span>
            Remove highlight
          </button>
        </div>
      )}
    </div>
  );
}

function Toolbar({
  accent, previewMode, activeFormats, canUndo, canRedo, onExec, onUndo, onRedo, editorRef,
}: ToolbarProps) {
  const active = ACCENT_ACTIVE[accent];

  const TBtn = ({
    cmd, icon: Icon, title, value,
  }: { cmd: string; icon: LucideIcon; title: string; value?: string }) => {
    const isActive = activeFormats.has(cmd);
    return (
      <button
        type="button"
        title={title}
        disabled={previewMode}
        onClick={() => onExec(cmd, value)}
        className={`p-1.5 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          isActive ? active : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
        }`}
      >
        <Icon className="w-4 h-4" />
      </button>
    );
  };

  const Divider = () => <span className="w-px self-stretch bg-slate-200 mx-0.5" />;

  return (
    <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-t border-slate-200 bg-slate-50">
      <select
        title="Block style"
        disabled={previewMode}
        defaultValue=""
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          onExec("formatBlock", v === "p" ? "<p>" : `<${v}>`);
          e.target.value = "";
        }}
        className="text-xs px-2 py-1 rounded border border-slate-200 bg-white text-slate-700 disabled:opacity-40"
      >
        <option value="">Normal</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
        <option value="p">Paragraph</option>
      </select>

      <select
        title="Font family"
        disabled={previewMode}
        defaultValue=""
        onChange={(e) => { if (e.target.value) { onExec("fontName", e.target.value); e.target.value = ""; } }}
        className="text-xs px-2 py-1 rounded border border-slate-200 bg-white text-slate-700 disabled:opacity-40"
      >
        <option value="">Font</option>
        <optgroup label="System">
          <option value="ui-sans-serif, system-ui, sans-serif">Sans-serif</option>
          <option value="ui-serif, Georgia, serif">Serif</option>
          <option value="ui-monospace, SFMono-Regular, Menlo, monospace">Monospace</option>
        </optgroup>
        <optgroup label="Sans-serif">
          <option value="Arial, sans-serif">Arial</option>
          <option value="Helvetica, Arial, sans-serif">Helvetica</option>
          <option value="Verdana, sans-serif">Verdana</option>
          <option value="Tahoma, sans-serif">Tahoma</option>
          <option value="'Trebuchet MS', sans-serif">Trebuchet MS</option>
          <option value="Calibri, sans-serif">Calibri</option>
          <option value="'Segoe UI', Tahoma, sans-serif">Segoe UI</option>
          <option value="Roboto, sans-serif">Roboto</option>
          <option value="Inter, sans-serif">Inter</option>
        </optgroup>
        <optgroup label="Serif">
          <option value="'Times New Roman', Times, serif">Times New Roman</option>
          <option value="Georgia, serif">Georgia</option>
          <option value="Garamond, serif">Garamond</option>
          <option value="Cambria, serif">Cambria</option>
          <option value="'Palatino Linotype', 'Book Antiqua', Palatino, serif">Palatino</option>
        </optgroup>
        <optgroup label="Monospace">
          <option value="'Courier New', Courier, monospace">Courier New</option>
          <option value="Consolas, 'Liberation Mono', monospace">Consolas</option>
          <option value="'Lucida Console', monospace">Lucida Console</option>
        </optgroup>
        <optgroup label="Display">
          <option value="Impact, sans-serif">Impact</option>
          <option value="'Comic Sans MS', cursive">Comic Sans MS</option>
          <option value="'Brush Script MT', cursive">Brush Script</option>
        </optgroup>
      </select>

      <select
        title="Font size"
        disabled={previewMode}
        defaultValue=""
        onChange={(e) => { if (e.target.value) { onExec("fontSize", e.target.value); e.target.value = ""; } }}
        className="text-xs px-2 py-1 rounded border border-slate-200 bg-white text-slate-700 disabled:opacity-40"
      >
        <option value="">Size</option>
        <option value="1">10px</option>
        <option value="2">13px</option>
        <option value="3">16px</option>
        <option value="4">18px</option>
        <option value="5">24px</option>
        <option value="6">32px</option>
        <option value="7">48px</option>
      </select>

      <label title="Text colour" className="relative inline-flex items-center cursor-pointer">
        <input
          type="color"
          disabled={previewMode}
          onChange={(e) => onExec("foreColor", e.target.value)}
          defaultValue="#1e293b"
          className="w-7 h-7 rounded border border-slate-200 bg-white p-0.5 cursor-pointer disabled:opacity-40"
        />
      </label>

      {/* Highlight — one button that applies a colour or removes the highlight. */}
      <HighlighterControl previewMode={previewMode} onExec={onExec} />

      {/* Find — Word-style search popover with prev/next navigation. */}
      <FindControl previewMode={previewMode} editorRef={editorRef} />

      <Divider />

      <TBtn cmd="bold"      icon={Bold}          title="Bold" />
      <TBtn cmd="italic"    icon={Italic}        title="Italic" />
      <TBtn cmd="underline" icon={UnderlineIcon} title="Underline" />
      <ChangeCaseControl previewMode={previewMode} onExec={onExec} />

      <Divider />

      <TBtn cmd="justifyLeft"   icon={AlignLeft}    title="Align left" />
      <TBtn cmd="justifyCenter" icon={AlignCenter}  title="Align center" />
      <TBtn cmd="justifyRight"  icon={AlignRight}   title="Align right" />
      <TBtn cmd="justifyFull"   icon={AlignJustify} title="Justify" />

      <Divider />

      <BulletControl    previewMode={previewMode} onExec={onExec} editorRef={editorRef} />
      <NumberingControl previewMode={previewMode} onExec={onExec} editorRef={editorRef} />

      <Divider />

      <button
        type="button"
        title="Undo"
        disabled={previewMode || !canUndo}
        onClick={onUndo}
        className="p-1.5 rounded border bg-white border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Undo2 className="w-4 h-4" />
      </button>
      <button
        type="button"
        title="Redo"
        disabled={previewMode || !canRedo}
        onClick={onRedo}
        className="p-1.5 rounded border bg-white border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Redo2 className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Math Symbols — categorised picker. Click a symbol to insert at the caret
// via the editor's existing exec("insertText", …) plumbing.
// ─────────────────────────────────────────────────────────────────────────────

const MATH_CATEGORIES: { label: string; symbols: string[] }[] = [
  {
    label: "Basic",
    symbols: ["+", "−", "×", "÷", "±", "∓", "·", "⋅", "%", "‰"],
  },
  {
    label: "Compare",
    symbols: ["=", "≠", "≈", "≡", "≜", "<", ">", "≤", "≥", "≪", "≫", "∝"],
  },
  {
    label: "Greek",
    symbols: [
      "α", "β", "γ", "δ", "ε", "ζ", "η", "θ", "ι", "κ", "λ", "μ",
      "ν", "ξ", "π", "ρ", "σ", "τ", "υ", "φ", "χ", "ψ", "ω",
      "Γ", "Δ", "Θ", "Λ", "Ξ", "Π", "Σ", "Φ", "Ψ", "Ω",
    ],
  },
  {
    label: "Set",
    symbols: ["∈", "∉", "⊂", "⊃", "⊆", "⊇", "⊄", "⊅", "∪", "∩", "∅", "ℕ", "ℤ", "ℚ", "ℝ", "ℂ"],
  },
  {
    label: "Logic",
    symbols: ["∧", "∨", "¬", "⊕", "⇒", "⇔", "∀", "∃", "∄", "⊢", "⊨", "∴", "∵"],
  },
  {
    label: "Calc",
    symbols: ["∫", "∬", "∭", "∮", "∂", "∇", "Σ", "Π", "∞", "√", "∛", "∜", "Δ", "ℏ", "ℓ"],
  },
  {
    label: "Arrows",
    symbols: ["→", "←", "↑", "↓", "↔", "↕", "⇒", "⇐", "⇑", "⇓", "⇔", "↦", "↪", "⟶", "⟵"],
  },
  {
    label: "Misc",
    symbols: ["∠", "∟", "°", "′", "″", "†", "‡", "※", "Å", "ℵ", "ℜ", "ℑ", "□", "■", "△", "▽"],
  },
];

function MathSymbolsSection({
  isOpen,
  onToggle,
  disabled,
  onInsert,
}: {
  isOpen: boolean;
  onToggle: () => void;
  disabled: boolean;
  onInsert: (symbol: string) => void;
}) {
  const [activeCategory, setActiveCategory] = useState(MATH_CATEGORIES[0].label);
  const current =
    MATH_CATEGORIES.find((c) => c.label === activeCategory) ?? MATH_CATEGORIES[0];

  return (
    <div className="border border-slate-200 rounded-lg">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 rounded-t-lg"
      >
        <span className="inline-flex items-center gap-2">
          <Sigma className="w-4 h-4" />
          Math Symbols
        </span>
        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {isOpen && (
        <div className="border-t border-slate-200 p-2">
          {/* Category pills */}
          <div className="flex flex-wrap gap-1 mb-2">
            {MATH_CATEGORIES.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => setActiveCategory(c.label)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold border transition-colors ${
                  activeCategory === c.label
                    ? "bg-slate-800 text-white border-slate-800"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Symbol grid */}
          <div className="grid grid-cols-6 gap-1 max-h-48 overflow-y-auto">
            {current.symbols.map((sym) => (
              <button
                key={sym}
                type="button"
                disabled={disabled}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsert(sym)}
                title={`Insert ${sym}`}
                aria-label={`Insert ${sym}`}
                className="aspect-square flex items-center justify-center text-base text-slate-800 bg-white border border-slate-200 rounded-md hover:bg-slate-100 hover:border-slate-400 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {sym}
              </button>
            ))}
          </div>

          {disabled && (
            <p className="mt-2 text-[10px] italic text-slate-400">
              Turn off preview to insert symbols.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
