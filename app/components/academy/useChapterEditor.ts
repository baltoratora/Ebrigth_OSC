"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type PublishState = "draft" | "published";
export type SaveStatus = "idle" | "unsaved" | "saving" | "saved";

export interface StoredVersion {
  at: number;
  content: string;
}

export type PageNumberAlign = "left" | "center" | "right";
export type PageNumberStyle = "plain" | "page" | "dashes" | "dots" | "brackets" | "parens";

export interface PageNumberConfig {
  align: PageNumberAlign;
  color: string;          // hex
  style: PageNumberStyle;
  italic: boolean;
  bold: boolean;
}

export const DEFAULT_PAGE_NUMBER_CONFIG: PageNumberConfig = {
  align: "center",
  color: "#64748b",       // slate-500
  style: "dashes",
  italic: true,
  bold: false,
};

// Header / Footer band: editable text strip shown above / below the editor.
export interface PageBandConfig {
  text: string;
  align: PageNumberAlign;
  color: string;
  italic: boolean;
  bold: boolean;
}

export const DEFAULT_HEADER_CONFIG: PageBandConfig = {
  text: "Header text",
  align: "center",
  color: "#475569",       // slate-600
  italic: false,
  bold: true,
};

export const DEFAULT_FOOTER_CONFIG: PageBandConfig = {
  text: "Footer text",
  align: "center",
  color: "#475569",
  italic: false,
  bold: false,
};

export const formatPageNumber = (style: PageNumberStyle, n: number): string => {
  switch (style) {
    case "plain":    return `${n}`;
    case "page":     return `Page ${n}`;
    case "dashes":   return `— ${n} —`;
    case "dots":     return `· ${n} ·`;
    case "brackets": return `[ ${n} ]`;
    case "parens":   return `( ${n} )`;
  }
};

interface StoredModule {
  content: string;
  state: PublishState;
  savedAt: number;
  versions: StoredVersion[];
  pageNumberOn?: boolean;
  pageNumberConfig?: PageNumberConfig;
  headerOn?: boolean;
  headerConfig?: PageBandConfig;
  footerOn?: boolean;
  footerConfig?: PageBandConfig;
  /** Per-page text overrides — index = page number (1-based). Empty/missing entries use the shared default text. */
  headerTextsByPage?: Record<number, string>;
  footerTextsByPage?: Record<number, string>;
  /** Per-page style overrides — only fields that differ from the default are stored. */
  headerStylesByPage?: Record<number, Partial<PageBandConfig>>;
  footerStylesByPage?: Record<number, Partial<PageBandConfig>>;
}

export interface ChapterEditorApi {
  // Editor wiring (consume on the page-level contentEditable div)
  editorRef: React.RefObject<HTMLDivElement | null>;
  onEditorInput: () => void;
  onEditorBlur: () => void;
  placeholder: string;

  // Render state
  currentContent: string;
  saveStatus: SaveStatus;
  publishState: PublishState;
  lastSavedAt: number | null;
  versions: StoredVersion[];
  activeFormats: Set<string>;
  canUndo: boolean;
  canRedo: boolean;
  previewMode: boolean;
  wordCount: number;
  charCount: number;
  pageNumberOn: boolean;
  toast: { msg: string; tone: "success" | "info" } | null;

  // Actions
  exec: (cmd: string, value?: string) => void;
  insertPlaceholder: (sectionTitle: string, itemLabel: string) => void;
  insertTable: (rows: number, cols: number) => void;
  insertTextBox: (width: number, height: number) => void;
  insertShape: (svgHtml: string) => void;
  // Table cell context menu (right-click) state + actions
  tableMenu: { x: number; y: number } | null;
  closeTableMenu: () => void;
  deleteTableRow: () => void;
  deleteTableColumn: () => void;
  clearTableCell: () => void;
  togglePageNumber: () => void;
  pageNumberConfig: PageNumberConfig;
  setPageNumberConfig: (partial: Partial<PageNumberConfig>) => void;
  headerOn: boolean;
  headerConfig: PageBandConfig;
  toggleHeader: () => void;
  setHeaderConfig: (partial: Partial<PageBandConfig>) => void;
  footerOn: boolean;
  footerConfig: PageBandConfig;
  toggleFooter: () => void;
  setFooterConfig: (partial: Partial<PageBandConfig>) => void;
  /** Per-page header/footer text overrides (1-based). Empty/missing → falls back to config.text. */
  headerTextsByPage: Record<number, string>;
  footerTextsByPage: Record<number, string>;
  setHeaderTextForPage: (page: number, text: string) => void;
  setFooterTextForPage: (page: number, text: string) => void;
  /** Per-page style overrides (1-based). Empty/missing → falls back to default config style. */
  headerStylesByPage: Record<number, Partial<PageBandConfig>>;
  footerStylesByPage: Record<number, Partial<PageBandConfig>>;
  setHeaderStyleForPage: (page: number, partial: Partial<PageBandConfig>) => void;
  setFooterStyleForPage: (page: number, partial: Partial<PageBandConfig>) => void;
  /** Clear all per-page style overrides for a given page (reverts to default). */
  resetHeaderStyleForPage: (page: number) => void;
  resetFooterStyleForPage: (page: number) => void;
  undo: () => void;
  redo: () => void;
  save: (opts?: { silent?: boolean; nextState?: PublishState }) => void;
  restoreVersion: (v: StoredVersion) => void;
  setPreviewMode: (v: boolean) => void;
  setToast: (t: { msg: string; tone: "success" | "info" } | null) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Editor history reducer — bounded undo/redo (20 steps).
// ─────────────────────────────────────────────────────────────────────────────

const HISTORY_CAP = 20;

type EditorState = { history: string[]; pointer: number };
type EditorAction =
  | { type: "push"; value: string }
  | { type: "reset"; value: string }
  | { type: "undo" }
  | { type: "redo" };

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "push": {
      const current = state.history[state.pointer] ?? "";
      if (current === action.value) return state;
      const truncated = state.history.slice(0, state.pointer + 1);
      truncated.push(action.value);
      const overflow = Math.max(0, truncated.length - HISTORY_CAP);
      const trimmed = overflow ? truncated.slice(overflow) : truncated;
      return { history: trimmed, pointer: trimmed.length - 1 };
    }
    case "reset":
      return { history: [action.value], pointer: 0 };
    case "undo":
      return { ...state, pointer: Math.max(0, state.pointer - 1) };
    case "redo":
      return { ...state, pointer: Math.min(state.history.length - 1, state.pointer + 1) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// localStorage helpers
// ─────────────────────────────────────────────────────────────────────────────

// Reusable × delete button injected into wrappers around tables / shapes / text boxes.
const DELETE_BTN_HTML =
  `<button type="button" data-tb-delete="1" title="Delete" aria-label="Delete" ` +
  `style="position:absolute;top:-9px;right:-9px;width:20px;height:20px;` +
  `border-radius:9999px;background:#ef4444;color:#fff;border:2px solid #fff;` +
  `font-size:12px;font-weight:700;line-height:1;cursor:pointer;` +
  `display:flex;align-items:center;justify-content:center;` +
  `box-shadow:0 1px 2px rgba(0,0,0,.2);z-index:2;">×</button>`;

// Resize handle injected into shape wrappers (bottom-right corner).
const RESIZE_HANDLE_HTML =
  `<span data-tb-resize="1" title="Drag to resize" aria-label="Drag to resize" ` +
  `style="position:absolute;bottom:-7px;right:-7px;width:14px;height:14px;` +
  `border-radius:3px;background:#fff;border:2px solid #3b82f6;` +
  `cursor:nwse-resize;display:block;` +
  `box-shadow:0 1px 2px rgba(0,0,0,.2);z-index:2;"></span>`;

// Reusable ✥ drag-handle button. Click + drag the wrapper translates via CSS,
// keeping the element inside the document flow without breaking other content.
const MOVE_BTN_HTML =
  `<button type="button" data-tb-move="1" title="Drag to move" aria-label="Drag to move" ` +
  `style="position:absolute;top:-9px;left:-9px;width:20px;height:20px;` +
  `border-radius:9999px;background:#3b82f6;color:#fff;border:2px solid #fff;` +
  `cursor:move;line-height:1;` +
  `display:flex;align-items:center;justify-content:center;` +
  `box-shadow:0 1px 2px rgba(0,0,0,.2);z-index:2;">` +
    `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">` +
      `<polyline points="5 9 2 12 5 15"/>` +
      `<polyline points="9 5 12 2 15 5"/>` +
      `<polyline points="15 19 12 22 9 19"/>` +
      `<polyline points="19 9 22 12 19 15"/>` +
      `<line x1="2" y1="12" x2="22" y2="12"/>` +
      `<line x1="12" y1="2" x2="12" y2="22"/>` +
    `</svg>` +
  `</button>`;

const lsKey = (moduleId: string) => `syllabus.module.${moduleId}`;
const readStored = (moduleId: string): StoredModule | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(lsKey(moduleId));
  if (!raw) return null;
  try { return JSON.parse(raw) as StoredModule; } catch { return null; }
};
const writeStored = (moduleId: string, data: StoredModule) => {
  window.localStorage.setItem(lsKey(moduleId), JSON.stringify(data));
};

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useChapterEditor(moduleId: string): ChapterEditorApi {
  const [editorState, dispatch] = useReducer(editorReducer, { history: [""], pointer: 0 });
  const currentContent = editorState.history[editorState.pointer] ?? "";
  const canUndo = editorState.pointer > 0;
  const canRedo = editorState.pointer < editorState.history.length - 1;

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [publishState, setPublishState] = useState<PublishState>("draft");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [versions, setVersions] = useState<StoredVersion[]>([]);
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());
  const [previewMode, setPreviewMode] = useState(false);
  const [pageNumberOn, setPageNumberOn] = useState(false);
  const [pageNumberConfig, setPageNumberConfigState] =
    useState<PageNumberConfig>(DEFAULT_PAGE_NUMBER_CONFIG);
  const [headerOn, setHeaderOn] = useState(false);
  const [headerConfig, setHeaderConfigState] =
    useState<PageBandConfig>(DEFAULT_HEADER_CONFIG);
  const [footerOn, setFooterOn] = useState(false);
  const [footerConfig, setFooterConfigState] =
    useState<PageBandConfig>(DEFAULT_FOOTER_CONFIG);
  const [headerTextsByPage, setHeaderTextsByPage] = useState<Record<number, string>>({});
  const [footerTextsByPage, setFooterTextsByPage] = useState<Record<number, string>>({});
  const [headerStylesByPage, setHeaderStylesByPage] = useState<Record<number, Partial<PageBandConfig>>>({});
  const [footerStylesByPage, setFooterStylesByPage] = useState<Record<number, Partial<PageBandConfig>>>({});
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "info" } | null>(null);

  const editorRef = useRef<HTMLDivElement | null>(null);
  // Last selection range that lived inside the editor. Persisted so toolbar
  // dropdowns / colour pickers (which steal focus when opened) can re-apply
  // formatting against the original text.
  const savedRangeRef = useRef<Range | null>(null);
  const placeholder = "Start typing or insert elements below…";

  // Keep savedRangeRef up to date whenever the user changes selection
  // inside the editor.
  useEffect(() => {
    const onSelChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const editorEl = editorRef.current;
      if (editorEl && editorEl.contains(range.commonAncestorContainer)) {
        savedRangeRef.current = range.cloneRange();
      }
    };
    document.addEventListener("selectionchange", onSelChange);
    return () => document.removeEventListener("selectionchange", onSelChange);
  }, []);

  // ── Load on mount / when moduleId changes ────────────────────────────────
  useEffect(() => {
    const stored = readStored(moduleId);
    if (!stored) {
      dispatch({ type: "reset", value: "" });
      setPublishState("draft");
      setLastSavedAt(null);
      setVersions([]);
      setPageNumberOn(false);
      setPageNumberConfigState(DEFAULT_PAGE_NUMBER_CONFIG);
      setHeaderOn(false);
      setHeaderConfigState(DEFAULT_HEADER_CONFIG);
      setFooterOn(false);
      setFooterConfigState(DEFAULT_FOOTER_CONFIG);
      setHeaderTextsByPage({});
      setFooterTextsByPage({});
      setHeaderStylesByPage({});
      setFooterStylesByPage({});
      setSaveStatus("idle");
      return;
    }
    dispatch({ type: "reset", value: stored.content });
    setPublishState(stored.state);
    setLastSavedAt(stored.savedAt);
    setVersions(stored.versions);
    setPageNumberOn(stored.pageNumberOn ?? false);
    setPageNumberConfigState(stored.pageNumberConfig ?? DEFAULT_PAGE_NUMBER_CONFIG);
    setHeaderOn(stored.headerOn ?? false);
    setHeaderConfigState(stored.headerConfig ?? DEFAULT_HEADER_CONFIG);
    setFooterOn(stored.footerOn ?? false);
    setFooterConfigState(stored.footerConfig ?? DEFAULT_FOOTER_CONFIG);
    setHeaderTextsByPage(stored.headerTextsByPage ?? {});
    setFooterTextsByPage(stored.footerTextsByPage ?? {});
    setHeaderStylesByPage(stored.headerStylesByPage ?? {});
    setFooterStylesByPage(stored.footerStylesByPage ?? {});
    setSaveStatus("idle");
  }, [moduleId]);

  // ── Keep editor DOM in sync when content changes via undo/redo/load ──────
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (el.innerHTML !== currentContent) el.innerHTML = currentContent;
  }, [currentContent]);

  // ── Selection → highlight active formatting buttons ──────────────────────
  useEffect(() => {
    const refresh = () => {
      const f = new Set<string>();
      const cmds = [
        "bold", "italic", "underline", "strikeThrough",
        "justifyLeft", "justifyCenter", "justifyRight", "justifyFull",
        "insertUnorderedList", "insertOrderedList",
      ];
      for (const c of cmds) {
        try { if (document.queryCommandState(c)) f.add(c); } catch { /* unsupported */ }
      }
      setActiveFormats(f);
    };
    document.addEventListener("selectionchange", refresh);
    return () => document.removeEventListener("selectionchange", refresh);
  }, []);

  // ── Toast auto-dismiss ───────────────────────────────────────────────────
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Capture editor changes ───────────────────────────────────────────────
  const captureEditorChange = useCallback(() => {
    const html = editorRef.current?.innerHTML ?? "";
    dispatch({ type: "push", value: html });
    setSaveStatus("unsaved");
  }, []);

  const onEditorInput = captureEditorChange;
  const onEditorBlur = captureEditorChange;

  // ── Save (manual / silent / publish toggle) ──────────────────────────────
  const save = useCallback(
    (opts: { silent?: boolean; nextState?: PublishState } = {}) => {
      setSaveStatus("saving");
      const html = editorRef.current?.innerHTML ?? currentContent;
      const next: StoredModule = {
        content: html,
        state: opts.nextState ?? publishState,
        savedAt: Date.now(),
        versions: [{ at: Date.now(), content: html }, ...versions].slice(0, 5),
        pageNumberOn,
        pageNumberConfig,
        headerOn,
        headerConfig,
        footerOn,
        footerConfig,
        headerTextsByPage,
        footerTextsByPage,
        headerStylesByPage,
        footerStylesByPage,
      };
      try {
        writeStored(moduleId, next);
        setLastSavedAt(next.savedAt);
        setVersions(next.versions);
        if (opts.nextState) setPublishState(opts.nextState);
        setSaveStatus("saved");
        if (!opts.silent) {
          setToast({
            msg: opts.nextState === "published" ? "Published ✓"
               : opts.nextState === "draft"     ? "Saved as draft ✓"
               : "Saved ✓",
            tone: "success",
          });
        }
        setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 1500);
      } catch {
        setSaveStatus("unsaved");
        setToast({ msg: "Save failed", tone: "info" });
      }
    },
    [
      currentContent, publishState, versions, moduleId,
      pageNumberOn, pageNumberConfig,
      headerOn, headerConfig,
      footerOn, footerConfig,
      headerTextsByPage, footerTextsByPage,
      headerStylesByPage, footerStylesByPage,
    ],
  );

  const togglePageNumber = useCallback(() => {
    setPageNumberOn((v) => !v);
    setSaveStatus("unsaved");
  }, []);

  const setPageNumberConfig = useCallback((partial: Partial<PageNumberConfig>) => {
    setPageNumberConfigState((prev) => ({ ...prev, ...partial }));
    setSaveStatus("unsaved");
  }, []);

  const toggleHeader = useCallback(() => {
    setHeaderOn((v) => !v);
    setSaveStatus("unsaved");
  }, []);

  const setHeaderConfig = useCallback((partial: Partial<PageBandConfig>) => {
    setHeaderConfigState((prev) => ({ ...prev, ...partial }));
    setSaveStatus("unsaved");
  }, []);

  const toggleFooter = useCallback(() => {
    setFooterOn((v) => !v);
    setSaveStatus("unsaved");
  }, []);

  const setFooterConfig = useCallback((partial: Partial<PageBandConfig>) => {
    setFooterConfigState((prev) => ({ ...prev, ...partial }));
    setSaveStatus("unsaved");
  }, []);

  // Per-page header/footer text overrides. Empty string ⇒ clear the override.
  const setHeaderTextForPage = useCallback((page: number, text: string) => {
    setHeaderTextsByPage((prev) => {
      const next = { ...prev };
      if (text === "") delete next[page];
      else next[page] = text;
      return next;
    });
    setSaveStatus("unsaved");
  }, []);

  const setFooterTextForPage = useCallback((page: number, text: string) => {
    setFooterTextsByPage((prev) => {
      const next = { ...prev };
      if (text === "") delete next[page];
      else next[page] = text;
      return next;
    });
    setSaveStatus("unsaved");
  }, []);

  // Per-page header/footer style overrides — merged with the default config at render time.
  const setHeaderStyleForPage = useCallback((page: number, partial: Partial<PageBandConfig>) => {
    setHeaderStylesByPage((prev) => ({
      ...prev,
      [page]: { ...(prev[page] ?? {}), ...partial },
    }));
    setSaveStatus("unsaved");
  }, []);

  const setFooterStyleForPage = useCallback((page: number, partial: Partial<PageBandConfig>) => {
    setFooterStylesByPage((prev) => ({
      ...prev,
      [page]: { ...(prev[page] ?? {}), ...partial },
    }));
    setSaveStatus("unsaved");
  }, []);

  const resetHeaderStyleForPage = useCallback((page: number) => {
    setHeaderStylesByPage((prev) => {
      const next = { ...prev };
      delete next[page];
      return next;
    });
    setSaveStatus("unsaved");
  }, []);

  const resetFooterStyleForPage = useCallback((page: number) => {
    setFooterStylesByPage((prev) => {
      const next = { ...prev };
      delete next[page];
      return next;
    });
    setSaveStatus("unsaved");
  }, []);

  // ── Auto-save every 30s when dirty ───────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      if (saveStatus === "unsaved") save({ silent: true });
    }, 30_000);
    return () => clearInterval(t);
  }, [saveStatus, save]);

  // ── execCommand helpers — work on whatever is focused (i.e. the page editor)
  const exec = useCallback((cmd: string, value?: string) => {
    if (previewMode) return;
    editorRef.current?.focus();
    // Restore the editor's last known selection — toolbar selects / colour pickers
    // typically move focus away, which would otherwise leave the cursor at the
    // start of the editor and apply formatting to the wrong text.
    const saved = savedRangeRef.current;
    const editorEl = editorRef.current;
    if (saved && editorEl && editorEl.contains(saved.commonAncestorContainer)) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(saved);
    }
    try {
      document.execCommand("styleWithCSS", false, "true");
      document.execCommand(cmd, false, value);
    } catch { /* ignore */ }
    // Read latest HTML directly from the DOM (execCommand mutates it)
    captureEditorChange();
  }, [previewMode, captureEditorChange]);

  const insertPlaceholder = useCallback((sectionTitle: string, itemLabel: string) => {
    if (previewMode) return;
    const safe = itemLabel.replace(/</g, "&lt;");
    void sectionTitle;
    exec(
      "insertHTML",
      `<span class="inline-block bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-sm border border-blue-200 mx-0.5" contenteditable="false">${safe}</span>&nbsp;`,
    );
  }, [exec, previewMode]);

  const insertTextBox = useCallback((width: number, height: number) => {
    if (previewMode) return;
    const w = Math.max(60, Math.min(2000, Math.floor(width)));
    const h = Math.max(40, Math.min(2000, Math.floor(height)));
    // Fixed width so text wraps at the chosen boundary; min-height lets the
    // box grow downward as the user types past the initial height.
    const boxStyle =
      `display:block;box-sizing:border-box;` +
      `width:${w}px;max-width:100%;min-height:${h}px;` +
      `padding:10px;` +
      `border:1px dashed #94a3b8;border-radius:6px;` +
      `background:#fafafa;outline:none;` +
      `word-wrap:break-word;overflow-wrap:break-word;white-space:normal;`;
    // Container holds the editable box plus an always-visible × delete button.
    const containerStyle =
      `position:relative;display:inline-block;width:${w}px;max-width:100%;margin:6px 0;`;
    const html =
      `<span class="tb-wrap" data-tb-container="1" contenteditable="false" style="${containerStyle}">` +
        DELETE_BTN_HTML +
        MOVE_BTN_HTML +
        `<span contenteditable="true" data-textbox="1" style="${boxStyle}">Type here…</span>` +
      `</span><p><br></p>`;
    exec("insertHTML", html);
  }, [exec, previewMode]);

  // Event delegation: clicks on an inserted-element × button remove the element.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;
      if (target.closest('[data-tb-delete="1"]')) {
        e.preventDefault();
        e.stopPropagation();
        const container = target.closest('[data-tb-container="1"]');
        container?.remove();
        captureEditorChange();
      }
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [captureEditorChange]);

  // ── Drag-to-resize a shape — grab the bottom-right [data-tb-resize] handle
  // and scale the shape's SVG. Proportional (square) resize via the larger axis.
  useEffect(() => {
    type ShapeDrag = {
      svg: SVGElement;
      startX: number;
      startY: number;
      initialSize: number;
    };
    let drag: ShapeDrag | null = null;

    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const handle = target.closest('[data-tb-resize="1"]');
      if (!handle) return;
      const wrapper = handle.closest('[data-tb-container="1"]') as HTMLElement | null;
      if (!wrapper) return;
      const svg = wrapper.querySelector('[data-shape-svg="1"]') as SVGElement | null;
      if (!svg) return;
      e.preventDefault();
      e.stopPropagation();
      const inlineW = (svg as unknown as HTMLElement).style.width;
      const attrW = svg.getAttribute("width");
      const initialSize = inlineW
        ? parseFloat(inlineW)
        : attrW
          ? parseFloat(attrW)
          : svg.getBoundingClientRect().width;
      drag = { svg, startX: e.clientX, startY: e.clientY, initialSize };
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    };

    const onMove = (e: MouseEvent) => {
      if (!drag) return;
      e.preventDefault();
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      const next = Math.max(20, drag.initialSize + delta);
      const svgEl = drag.svg as unknown as HTMLElement;
      svgEl.style.width = `${next}px`;
      svgEl.style.height = `${next}px`;
      // Keep the width/height attributes in sync so reloaded HTML stays consistent.
      drag.svg.setAttribute("width", String(next));
      drag.svg.setAttribute("height", String(next));
    };

    const onUp = () => {
      if (!drag) return;
      drag = null;
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      captureEditorChange();
    };

    document.addEventListener("mousedown", onDown, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
    };
  }, [captureEditorChange]);

  // ── Drag-to-move: pick up [data-tb-move] handle and translate its wrapper.
  // The position is encoded as inline CSS transform on the wrapper, so it
  // persists through save / load / version history.
  useEffect(() => {
    type MoveDrag = {
      wrapper: HTMLElement;
      startX: number;
      startY: number;
      initialTx: number;
      initialTy: number;
    };
    let drag: MoveDrag | null = null;

    const parseTranslate = (transform: string): { tx: number; ty: number } => {
      const m = /translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/.exec(transform || "");
      return m ? { tx: parseFloat(m[1]), ty: parseFloat(m[2]) } : { tx: 0, ty: 0 };
    };

    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const moveBtn = target.closest('[data-tb-move="1"]');
      if (!moveBtn) return;
      const wrapper = moveBtn.closest('[data-tb-container="1"]') as HTMLElement | null;
      if (!wrapper) return;
      e.preventDefault();
      e.stopPropagation();
      const { tx, ty } = parseTranslate(wrapper.style.transform);
      drag = {
        wrapper,
        startX: e.clientX,
        startY: e.clientY,
        initialTx: tx,
        initialTy: ty,
      };
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    };

    const onMove = (e: MouseEvent) => {
      if (!drag) return;
      e.preventDefault();
      const nx = drag.initialTx + (e.clientX - drag.startX);
      const ny = drag.initialTy + (e.clientY - drag.startY);
      drag.wrapper.style.transform = `translate(${nx}px, ${ny}px)`;
    };

    const onUp = () => {
      if (!drag) return;
      drag = null;
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      captureEditorChange();
    };

    // Capture-phase so we beat the contentEditable selection/focus behaviour.
    document.addEventListener("mousedown", onDown, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
    };
  }, [captureEditorChange]);

  // ── Table column / row resize — drag near a cell's right or bottom border.
  // Listeners live on `document` (not editorRef) so they survive Preview-mode
  // toggles that unmount/remount the editor div.
  useEffect(() => {
    const THRESHOLD = 8; // px hover sensitivity

    type Hover =
      | { kind: "col"; col: HTMLElement }
      | { kind: "row"; row: HTMLTableRowElement };
    type Drag = {
      kind: "col" | "row";
      target: HTMLElement;
      startCoord: number;
      initialSize: number;
    };

    let hover: Hover | null = null;
    let drag: Drag | null = null;

    const getEditor = () => editorRef.current;
    const setCursor = (c: string) => {
      const el = getEditor();
      if (el) el.style.cursor = c;
    };
    const isInEditor = (target: EventTarget | null) => {
      const el = getEditor();
      return !!(el && target instanceof Node && el.contains(target));
    };

    const onMove = (e: MouseEvent) => {
      // Live drag — update target size
      if (drag) {
        e.preventDefault();
        if (drag.kind === "col") {
          const next = Math.max(30, drag.initialSize + (e.clientX - drag.startCoord));
          drag.target.style.width = `${next}px`;
        } else {
          const next = Math.max(20, drag.initialSize + (e.clientY - drag.startCoord));
          drag.target.style.height = `${next}px`;
        }
        return;
      }
      // Hover detection (only inside the editor)
      if (!isInEditor(e.target)) {
        if (hover) { hover = null; setCursor(""); }
        return;
      }
      const target = e.target as HTMLElement;
      const cell = target.closest("td, th") as HTMLTableCellElement | null;
      if (!cell) {
        if (hover) { hover = null; setCursor(""); }
        return;
      }
      const rect = cell.getBoundingClientRect();
      const nearRight  = e.clientX >= rect.right  - THRESHOLD && e.clientX <= rect.right  + 2;
      const nearLeft   = e.clientX >= rect.left   - 2         && e.clientX <= rect.left   + THRESHOLD;
      const nearBottom = e.clientY >= rect.bottom - THRESHOLD && e.clientY <= rect.bottom + 2;
      const nearTop    = e.clientY >= rect.top    - 2         && e.clientY <= rect.top    + THRESHOLD;

      const table = cell.closest("table");
      const cols  = table?.querySelectorAll("colgroup > col");
      const colIdx = cell.parentElement
        ? Array.from(cell.parentElement.children).indexOf(cell)
        : -1;

      // Column dividers — right edge of THIS col, OR left edge of cell = right edge of PREVIOUS col.
      if (nearRight && cols && colIdx >= 0) {
        const colEl = cols[colIdx] as HTMLElement | undefined;
        if (colEl) {
          hover = { kind: "col", col: colEl };
          setCursor("col-resize");
          return;
        }
      }
      if (nearLeft && cols && colIdx > 0) {
        const colEl = cols[colIdx - 1] as HTMLElement | undefined;
        if (colEl) {
          hover = { kind: "col", col: colEl };
          setCursor("col-resize");
          return;
        }
      }

      // Row dividers — bottom edge of THIS row, OR top edge of cell = bottom edge of PREVIOUS row.
      if (nearBottom) {
        const row = cell.parentElement as HTMLTableRowElement;
        hover = { kind: "row", row };
        setCursor("row-resize");
        return;
      }
      if (nearTop) {
        const row    = cell.parentElement as HTMLTableRowElement;
        const tbody  = row?.parentElement;
        const rowIdx = tbody ? Array.from(tbody.children).indexOf(row) : -1;
        if (rowIdx > 0) {
          const prevRow = tbody!.children[rowIdx - 1] as HTMLTableRowElement;
          hover = { kind: "row", row: prevRow };
          setCursor("row-resize");
          return;
        }
      }

      if (hover) { hover = null; setCursor(""); }
    };

    const onDown = (e: MouseEvent) => {
      if (!hover) return;
      if (!isInEditor(e.target)) { hover = null; setCursor(""); return; }
      e.preventDefault();
      e.stopPropagation();
      if (hover.kind === "col") {
        const w = hover.col.style.width
          ? parseFloat(hover.col.style.width)
          : hover.col.getBoundingClientRect().width;
        drag = { kind: "col", target: hover.col, startCoord: e.clientX, initialSize: w };
      } else {
        const h = hover.row.style.height
          ? parseFloat(hover.row.style.height)
          : hover.row.getBoundingClientRect().height;
        drag = { kind: "row", target: hover.row, startCoord: e.clientY, initialSize: h };
      }
      setCursor(hover.kind === "col" ? "col-resize" : "row-resize");
    };

    const onUp = () => {
      if (!drag) return;
      drag = null;
      hover = null;
      setCursor("");
      captureEditorChange();
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mousedown", onDown, true); // capture so we beat contentEditable
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("mouseup", onUp);
      setCursor("");
    };
  }, [captureEditorChange]);

  // ── Table cell context menu — right-click inside a <td>/<th> ─────────────
  const [tableMenu, setTableMenu] = useState<{ x: number; y: number } | null>(null);
  const activeCellRef = useRef<HTMLTableCellElement | null>(null);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const onCtx = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const cell = target.closest("td, th") as HTMLTableCellElement | null;
      if (!cell || !el.contains(cell)) return;
      e.preventDefault();
      activeCellRef.current = cell;
      setTableMenu({ x: e.clientX, y: e.clientY });
    };
    el.addEventListener("contextmenu", onCtx);
    return () => el.removeEventListener("contextmenu", onCtx);
  }, []);

  const closeTableMenu = useCallback(() => setTableMenu(null), []);

  const deleteTableRow = useCallback(() => {
    const cell = activeCellRef.current;
    if (!cell) { setTableMenu(null); return; }
    const row = cell.parentElement as HTMLTableRowElement | null;
    if (!row) { setTableMenu(null); return; }
    const table = row.closest("table");
    row.remove();
    // If the table has no rows left, remove its wrapping delete-container too.
    if (table && table.querySelectorAll("tr").length === 0) {
      const wrapper = table.closest('[data-tb-container="1"]');
      (wrapper ?? table).remove();
    }
    activeCellRef.current = null;
    setTableMenu(null);
    captureEditorChange();
  }, [captureEditorChange]);

  const deleteTableColumn = useCallback(() => {
    const cell = activeCellRef.current;
    if (!cell) { setTableMenu(null); return; }
    const row = cell.parentElement as HTMLTableRowElement | null;
    if (!row) { setTableMenu(null); return; }
    const table = cell.closest("table");
    if (!table) { setTableMenu(null); return; }
    const colIdx = Array.from(row.children).indexOf(cell);
    if (colIdx < 0) { setTableMenu(null); return; }
    table.querySelectorAll("tr").forEach((tr) => {
      const c = tr.children[colIdx];
      c?.remove();
    });
    // If no columns left, remove the whole table (wrapper).
    const firstRow = table.querySelector("tr");
    if (!firstRow || firstRow.children.length === 0) {
      const wrapper = table.closest('[data-tb-container="1"]');
      (wrapper ?? table).remove();
    }
    activeCellRef.current = null;
    setTableMenu(null);
    captureEditorChange();
  }, [captureEditorChange]);

  const clearTableCell = useCallback(() => {
    const cell = activeCellRef.current;
    if (!cell) { setTableMenu(null); return; }
    cell.innerHTML = "&nbsp;";
    activeCellRef.current = null;
    setTableMenu(null);
    captureEditorChange();
  }, [captureEditorChange]);

  const insertTable = useCallback((rows: number, cols: number) => {
    if (previewMode) return;
    const r = Math.max(1, Math.min(20, Math.floor(rows)));
    const c = Math.max(1, Math.min(20, Math.floor(cols)));
    // colgroup gives each column its own width element, easy to drag-resize.
    const colsHtml = Array.from({ length: c }).map(() =>
      `<col style="width:120px;" />`).join("");
    const cell = `<td style="border:1px solid #cbd5e1;padding:8px;vertical-align:top;">&nbsp;</td>`;
    const row = `<tr style="height:40px;">${cell.repeat(c)}</tr>`;
    // width:max-content lets the table auto-grow as user drags individual
    // col widths; table-layout:fixed makes colgroup widths authoritative.
    const tableHtml =
      `<table contenteditable="true" style="border-collapse:collapse;table-layout:fixed;width:max-content;max-width:100%;">` +
        `<colgroup>${colsHtml}</colgroup>` +
        `<tbody>${row.repeat(r)}</tbody>` +
      `</table>`;
    const html =
      `<div data-tb-container="1" contenteditable="false" style="position:relative;display:inline-block;margin:8px 0;max-width:100%;">` +
        DELETE_BTN_HTML +
        MOVE_BTN_HTML +
        tableHtml +
      `</div><p><br></p>`;
    exec("insertHTML", html);
  }, [exec, previewMode]);

  const insertShape = useCallback((svgHtml: string) => {
    if (previewMode) return;
    const html =
      `<span data-tb-container="1" contenteditable="false" style="position:relative;display:inline-block;vertical-align:middle;margin:4px;">` +
        DELETE_BTN_HTML +
        MOVE_BTN_HTML +
        RESIZE_HANDLE_HTML +
        svgHtml +
      `</span>&nbsp;`;
    exec("insertHTML", html);
  }, [exec, previewMode]);

  const undo = useCallback(() => {
    dispatch({ type: "undo" });
    setSaveStatus("unsaved");
  }, []);
  const redo = useCallback(() => {
    dispatch({ type: "redo" });
    setSaveStatus("unsaved");
  }, []);

  const restoreVersion = useCallback((v: StoredVersion) => {
    dispatch({ type: "reset", value: v.content });
    setSaveStatus("unsaved");
    setToast({ msg: `Restored version from ${new Date(v.at).toLocaleString()}`, tone: "info" });
  }, []);

  // ── Counts ───────────────────────────────────────────────────────────────
  const plainText = currentContent.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").trim();
  const wordCount = plainText ? plainText.split(/\s+/).length : 0;
  const charCount = plainText.length;

  return {
    editorRef,
    onEditorInput,
    onEditorBlur,
    placeholder,
    currentContent,
    saveStatus,
    publishState,
    lastSavedAt,
    versions,
    activeFormats,
    canUndo,
    canRedo,
    previewMode,
    setPreviewMode,
    wordCount,
    charCount,
    toast,
    setToast,
    exec,
    insertPlaceholder,
    insertTable,
    insertTextBox,
    insertShape,
    tableMenu,
    closeTableMenu,
    deleteTableRow,
    deleteTableColumn,
    clearTableCell,
    togglePageNumber,
    pageNumberOn,
    pageNumberConfig,
    setPageNumberConfig,
    headerOn,
    headerConfig,
    toggleHeader,
    setHeaderConfig,
    footerOn,
    footerConfig,
    toggleFooter,
    setFooterConfig,
    headerTextsByPage,
    footerTextsByPage,
    setHeaderTextForPage,
    setFooterTextForPage,
    headerStylesByPage,
    footerStylesByPage,
    setHeaderStyleForPage,
    setFooterStyleForPage,
    resetHeaderStyleForPage,
    resetFooterStyleForPage,
    undo,
    redo,
    save,
    restoreVersion,
  };
}
