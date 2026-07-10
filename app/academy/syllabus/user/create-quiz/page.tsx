"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ROLES, hasAnyRole } from "@/lib/roles";
import { USER_TABLE_BRANCHES } from "../quiz-data";

// ─── Types & helpers ────────────────────────────────────────────────────────

type QuestionType =
  | "multiple-choice"
  | "checkbox"
  | "short-answer"
  | "paragraph";

type Option = { id: string; text: string };

type QuestionItem = {
  kind: "question";
  id: string;
  text: string;
  type: QuestionType;
  options: Option[];
};

type TitleBlockItem = {
  kind: "title-block";
  id: string;
  title: string;
  description: string;
};

type ImageItem = {
  kind: "image";
  id: string;
  src: string; // base64 data URL or external URL
  caption: string;
};

type SectionItem = {
  kind: "section";
  id: string;
  title: string;
  description: string;
};

type Item = QuestionItem | TitleBlockItem | ImageItem | SectionItem;

type QuizSettings = {
  confirmationMessage: string;
  /**
   * When true, the Answer Quiz page should shuffle the question order
   * per-branch using a seed derived from (publishedAt + branchName).
   * Consequence: every respondent from the same branch sees the same order,
   * but different branches see different orders. Implemented at render-time
   * in the Answer Quiz page — the stored definition is never mutated.
   */
  shuffleQuestionOrder: boolean;
  /**
   * When true, only the first submission per email is accepted. The Answer
   * Quiz page should check existing responses for the current user's email
   * and block re-submission (with a "you've already responded" message)
   * when this is on.
   */
  limitToOneResponse: boolean;
};

type QuizDefinition = {
  title: string;
  description: string;
  items: Item[];
  settings: QuizSettings;
};

// Shared so the Answer Quiz page can read the same definition later.
// Draft = work-in-progress; Published = the live version respondents see.
export const QUIZ_DEFINITION_KEY = "USER-quiz-definition";
export const QUIZ_PUBLISHED_KEY = "USER-quiz-published";

const uid = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const blankOption = (n: number): Option => ({ id: uid("o"), text: `Option ${n}` });

const blankQuestion = (): QuestionItem => ({
  kind: "question",
  id: uid("q"),
  text: "",
  type: "multiple-choice",
  options: [blankOption(1)],
});

const blankTitleBlock = (): TitleBlockItem => ({
  kind: "title-block",
  id: uid("tb"),
  title: "",
  description: "",
});

const blankImage = (): ImageItem => ({
  kind: "image",
  id: uid("img"),
  src: "",
  caption: "",
});

const blankSection = (): SectionItem => ({
  kind: "section",
  id: uid("sec"),
  title: "Untitled Section",
  description: "",
});

const DEFAULT_SETTINGS: QuizSettings = {
  confirmationMessage: "Your response has been recorded",
  shuffleQuestionOrder: false,
  limitToOneResponse: true,
};

const DEFAULT_QUIZ: QuizDefinition = {
  title: "",
  description: "",
  items: [blankQuestion()],
  settings: DEFAULT_SETTINGS,
};

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  "multiple-choice": "Multiple choice",
  checkbox: "Checkboxes",
  "short-answer": "Short answer",
  paragraph: "Paragraph",
};

// Renders the quiz as readable plain text for the "download a copy" feature.
// Numbered only for actual questions; title blocks, images, and sections show
// as headings/markers so the structure stays recognisable in a .txt file.
function quizToText(quiz: QuizDefinition): string {
  const lines: string[] = [];
  const title = quiz.title.trim() || "Untitled form";
  const bar = "=".repeat(Math.max(title.length, 20));
  lines.push(bar, title, bar);
  if (quiz.description.trim()) {
    lines.push("", quiz.description.trim());
  }

  let q = 0;
  for (const item of quiz.items) {
    lines.push("");
    if (item.kind === "section") {
      const t = item.title.trim() || "Untitled Section";
      lines.push(`--- Section: ${t} ---`);
      if (item.description.trim()) lines.push(item.description.trim());
    } else if (item.kind === "title-block") {
      const t = item.title.trim() || "Untitled Title";
      lines.push(t, "-".repeat(t.length));
      if (item.description.trim()) lines.push(item.description.trim());
    } else if (item.kind === "image") {
      const cap = item.caption.trim() || "(no caption)";
      lines.push(`[Image: ${cap}]`);
    } else {
      q += 1;
      const text = item.text.trim() || "Untitled Question";
      lines.push(`Q${q}. ${text}`);
      if (item.type === "multiple-choice") {
        for (const o of item.options) lines.push(`    ( ) ${o.text || "Option"}`);
      } else if (item.type === "checkbox") {
        for (const o of item.options) lines.push(`    [ ] ${o.text || "Option"}`);
      } else if (item.type === "short-answer") {
        lines.push("    (short answer)");
      } else {
        lines.push("    (long answer)");
      }
    }
  }

  return lines.join("\n");
}

// Tolerates the older { questions: [...] } shape that earlier saves produced,
// and backfills missing `settings` for quizzes saved before settings existed.
function migrateLoaded(raw: unknown): QuizDefinition | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const title = typeof obj.title === "string" ? obj.title : "";
  const description = typeof obj.description === "string" ? obj.description : "";
  const rawSettings = (obj.settings ?? {}) as Partial<QuizSettings>;
  const settings: QuizSettings = {
    confirmationMessage:
      typeof rawSettings.confirmationMessage === "string"
        ? rawSettings.confirmationMessage
        : DEFAULT_SETTINGS.confirmationMessage,
    shuffleQuestionOrder:
      typeof rawSettings.shuffleQuestionOrder === "boolean"
        ? rawSettings.shuffleQuestionOrder
        : DEFAULT_SETTINGS.shuffleQuestionOrder,
    limitToOneResponse:
      typeof rawSettings.limitToOneResponse === "boolean"
        ? rawSettings.limitToOneResponse
        : DEFAULT_SETTINGS.limitToOneResponse,
  };
  if (Array.isArray(obj.items)) {
    return { title, description, items: obj.items as Item[], settings };
  }
  if (Array.isArray(obj.questions)) {
    const items = (obj.questions as unknown[]).map((q) => {
      const qq = q as Partial<QuestionItem> & { kind?: undefined };
      return { ...qq, kind: "question" } as QuestionItem;
    });
    return { title, description, items, settings };
  }
  return null;
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function CreateQuizPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const role = (session?.user as { role?: unknown } | undefined)?.role;
  const canCreateQuiz = hasAnyRole(role, [ROLES.SUPER_ADMIN, ROLES.ACADEMY]);

  const [quiz, setQuizRaw] = useState<QuizDefinition>(DEFAULT_QUIZ);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [publishedAt, setPublishedAt] = useState<number | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  // Undo/redo history. `setQuiz` is wrapped so any new mutation pushes the
  // previous state onto the undo stack (capped at 50 entries) AND clears the
  // redo stack — once you make a new edit, the old redo trail is invalid.
  // `undo` moves the latest history entry → current → future; `redo` moves
  // the latest future entry → current → history. Both use setQuizRaw so they
  // bypass the wrapper's history recording.
  const [history, setHistory] = useState<QuizDefinition[]>([]);
  const [future, setFuture] = useState<QuizDefinition[]>([]);
  const setQuiz = useCallback(
    (updater: QuizDefinition | ((prev: QuizDefinition) => QuizDefinition)) => {
      setQuizRaw((prev) => {
        const next =
          typeof updater === "function"
            ? (updater as (p: QuizDefinition) => QuizDefinition)(prev)
            : updater;
        if (next !== prev) {
          setHistory((h) => [...h, prev].slice(-50));
          setFuture([]);
        }
        return next;
      });
    },
    [],
  );
  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const last = h[h.length - 1];
      setQuizRaw((cur) => {
        setFuture((f) => [...f, cur].slice(-50));
        return last;
      });
      return h.slice(0, -1);
    });
  }, []);
  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[f.length - 1];
      setQuizRaw((cur) => {
        setHistory((h) => [...h, cur].slice(-50));
        return next;
      });
      return f.slice(0, -1);
    });
  }, []);
  const canUndo = history.length > 0;
  const canRedo = future.length > 0;

  // Publish-target state. Modal pre-selects whatever branches were targeted
  // by the most recent publish, defaulting to "all" if there's no history.
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [selectedBranches, setSelectedBranches] = useState<Set<string>>(
    () => new Set(USER_TABLE_BRANCHES),
  );

  // Preview mode — opens a respondent-view modal so the author can sanity-check
  // the form before publishing.
  const [previewOpen, setPreviewOpen] = useState(false);

  // Quiz settings modal. Goes through setQuiz so changes are undoable and
  // get saved/published with the rest of the quiz state.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const updateSettings = (patch: Partial<QuizSettings>) =>
    setQuiz((q) => ({ ...q, settings: { ...q.settings, ...patch } }));

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(QUIZ_DEFINITION_KEY);
      if (raw) {
        const migrated = migrateLoaded(JSON.parse(raw));
        if (migrated && migrated.items.length > 0) {
          // Load directly so the initial hydration doesn't count as an undoable action.
          setQuizRaw(migrated);
          setActiveItemId(migrated.items[0].id);
        }
      }
      // Load any prior publish payload so the user sees when the live quiz
      // was last refreshed AND which branches were targeted last time.
      const pubRaw = window.localStorage.getItem(QUIZ_PUBLISHED_KEY);
      if (pubRaw) {
        const parsed = JSON.parse(pubRaw) as {
          publishedAt?: number;
          targetBranches?: string[];
        };
        if (typeof parsed?.publishedAt === "number") setPublishedAt(parsed.publishedAt);
        if (Array.isArray(parsed?.targetBranches) && parsed.targetBranches.length > 0) {
          setSelectedBranches(new Set(parsed.targetBranches));
        }
      }
    } catch {
      /* fall through to default */
    }
    if (!activeItemId) setActiveItemId(DEFAULT_QUIZ.items[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "authenticated" && !canCreateQuiz) {
    return (
      <div className="w-full max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
          <h1 className="text-2xl font-black text-slate-800 mb-2">Not authorised</h1>
          <p className="text-slate-600 mb-4">
            Only Superadmin and Academy roles can create quizzes.
          </p>
          <button
            onClick={() => router.push("/academy/syllabus/user")}
            className="px-5 py-2 rounded-lg bg-cyan-700 text-white font-semibold hover:bg-cyan-800"
          >
            ← Back to USER
          </button>
        </div>
      </div>
    );
  }

  // ── Mutations ───────────────────────────────────────────────────────────
  const updateQuiz = (patch: Partial<QuizDefinition>) =>
    setQuiz((q) => ({ ...q, ...patch }));

  // Inserts after the active item (or appends if no active item).
  const insertItem = (item: Item) => {
    setQuiz((q) => {
      const idx = activeItemId ? q.items.findIndex((i) => i.id === activeItemId) : -1;
      if (idx < 0) return { ...q, items: [...q.items, item] };
      return {
        ...q,
        items: [...q.items.slice(0, idx + 1), item, ...q.items.slice(idx + 1)],
      };
    });
    setActiveItemId(item.id);
  };

  const updateItem = <T extends Item>(id: string, patch: Partial<T>) =>
    setQuiz((q) => ({
      ...q,
      items: q.items.map((i) => (i.id === id ? ({ ...i, ...patch } as Item) : i)),
    }));

  const deleteItem = (id: string) => {
    setQuiz((q) => {
      // Keep at least one item so the canvas isn't empty.
      if (q.items.length <= 1) return q;
      const next = q.items.filter((i) => i.id !== id);
      return { ...q, items: next };
    });
  };

  const duplicateQuestion = (id: string) => {
    setQuiz((q) => {
      const idx = q.items.findIndex((i) => i.id === id);
      if (idx < 0) return q;
      const source = q.items[idx];
      if (source.kind !== "question") return q;
      const copy: QuestionItem = {
        ...source,
        id: uid("q"),
        options: source.options.map((o) => ({ ...o, id: uid("o") })),
      };
      return {
        ...q,
        items: [...q.items.slice(0, idx + 1), copy, ...q.items.slice(idx + 1)],
      };
    });
  };

  const addOption = (qId: string) =>
    setQuiz((q) => ({
      ...q,
      items: q.items.map((i) =>
        i.kind === "question" && i.id === qId
          ? { ...i, options: [...i.options, blankOption(i.options.length + 1)] }
          : i,
      ),
    }));

  const updateOption = (qId: string, oId: string, text: string) =>
    setQuiz((q) => ({
      ...q,
      items: q.items.map((i) =>
        i.kind === "question" && i.id === qId
          ? { ...i, options: i.options.map((o) => (o.id === oId ? { ...o, text } : o)) }
          : i,
      ),
    }));

  const deleteOption = (qId: string, oId: string) =>
    setQuiz((q) => ({
      ...q,
      items: q.items.map((i) =>
        i.kind === "question" && i.id === qId
          ? { ...i, options: i.options.filter((o) => o.id !== oId) }
          : i,
      ),
    }));

  const saveQuiz = () => {
    if (!window.confirm("Save this quiz? It will replace any previously saved quiz.")) return;
    try {
      window.localStorage.setItem(QUIZ_DEFINITION_KEY, JSON.stringify(quiz));
      setSavedAt(Date.now());
    } catch (err) {
      const isQuota = err instanceof DOMException && err.name === "QuotaExceededError";
      window.alert(
        isQuota
          ? "Couldn't save: localStorage is full. This usually means an image is too large."
          : "Save failed. Try removing recent images or clearing local data.",
      );
    }
  };

  // Step 1 — guard against empty quizzes, then open the branch picker.
  const openPublishModal = () => {
    const hasQuestions = quiz.items.some((i) => i.kind === "question");
    if (!hasQuestions) {
      window.alert("Add at least one question before publishing.");
      return;
    }
    setShowPublishModal(true);
  };

  // Step 2 — actually write the published payload, scoped to the picked branches.
  // Confirms one more time before doing it so an accidental click can't push
  // a quiz live without explicit acknowledgement.
  const confirmPublish = () => {
    const branches = Array.from(selectedBranches);
    if (branches.length === 0) {
      window.alert("Select at least one branch (or pick Select all).");
      return;
    }
    const isAll = branches.length === USER_TABLE_BRANCHES.length;
    const audience = isAll
      ? "ALL branches"
      : `${branches.length} branch${branches.length === 1 ? "" : "es"} (${branches.join(", ")})`;
    if (
      !window.confirm(
        `Publish this quiz to ${audience}? It will become the live version those respondents see, replacing any previously published quiz.`,
      )
    ) {
      return;
    }
    try {
      const payload = {
        quiz,
        publishedAt: Date.now(),
        targetBranches: branches,
      };
      window.localStorage.setItem(QUIZ_PUBLISHED_KEY, JSON.stringify(payload));
      // Save the draft too so they stay in sync at publish time.
      window.localStorage.setItem(QUIZ_DEFINITION_KEY, JSON.stringify(quiz));
      setPublishedAt(payload.publishedAt);
      setSavedAt(payload.publishedAt);
      setShowPublishModal(false);
    } catch (err) {
      const isQuota = err instanceof DOMException && err.name === "QuotaExceededError";
      window.alert(
        isQuota
          ? "Couldn't publish: localStorage is full. This usually means an image is too large."
          : "Publish failed. Try removing recent images or clearing local data.",
      );
    }
  };

  const toggleBranch = (branch: string) =>
    setSelectedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(branch)) next.delete(branch);
      else next.add(branch);
      return next;
    });
  const selectAllBranches = () => setSelectedBranches(new Set(USER_TABLE_BRANCHES));
  const clearBranches = () => setSelectedBranches(new Set());

  // Download the current quiz as a readable .txt file so the user can save
  // an offline copy they can paste into Word/email/etc.
  const downloadQuizCopy = () => {
    try {
      const text = quizToText(quiz);
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const slug =
        quiz.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
        "quiz";
      const date = new Date().toISOString().slice(0, 10);
      a.download = `${slug}-${date}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.alert("Couldn't generate the download. Try again.");
    }
  };

  const canDelete = quiz.items.length > 1;

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Header chip + back + save */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4 mb-6">
        <button
          onClick={() => router.push("/academy/syllabus/user")}
          className="bg-slate-100 text-slate-700 hover:bg-cyan-700 hover:text-white px-4 py-2 rounded-xl flex items-center justify-center shadow-md transition-colors"
          aria-label="Back to User"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
            <line x1="20" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <div className="bg-cyan-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-md">
          <span className="text-xl">➕</span>
          <h1 className="text-lg font-black uppercase tracking-wide m-0 leading-none">CREATE QUIZ</h1>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="flex flex-col items-end text-[11px] leading-tight">
            {savedAt && (
              <span className="text-emerald-700 font-semibold">
                Saved {new Date(savedAt).toLocaleTimeString()}
              </span>
            )}
            {publishedAt && (
              <span className="text-violet-700 font-semibold">
                Published {new Date(publishedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={saveQuiz}
            className="px-3 py-2 rounded-xl bg-cyan-700 hover:bg-cyan-800 text-white font-bold text-sm shadow-md flex items-center gap-2 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Save Quiz
          </button>
          <button
            type="button"
            onClick={openPublishModal}
            className="px-4 py-2 rounded-xl bg-cyan-700 hover:bg-cyan-800 text-white font-black text-sm uppercase tracking-wide shadow-md flex items-center gap-2 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            Publish
          </button>
        </div>
      </div>

      {/* Form canvas + floating right-side action bar */}
      <div className="relative">
        {/* Title + description card */}
        <div className="bg-white rounded-2xl shadow-sm border-t-8 border-t-cyan-700 border-x border-b border-slate-200 mb-4 overflow-hidden">
          <div className="p-6">
            <input
              type="text"
              value={quiz.title}
              onChange={(e) => updateQuiz({ title: e.target.value })}
              placeholder="Untitled form"
              className="w-full text-3xl font-light text-slate-800 placeholder:text-slate-400 border-b border-transparent hover:border-slate-300 focus:border-cyan-700 focus:outline-none pb-2 mb-3 bg-transparent"
            />
            <input
              type="text"
              value={quiz.description}
              onChange={(e) => updateQuiz({ description: e.target.value })}
              placeholder="Form description"
              className="w-full text-sm text-slate-600 placeholder:text-slate-400 border-b border-transparent hover:border-slate-300 focus:border-cyan-700 focus:outline-none pb-2 bg-transparent"
            />
          </div>
        </div>

        {/* Items */}
        {quiz.items.map((item) => {
          const common = {
            active: activeItemId === item.id,
            canDelete,
            onFocus: () => setActiveItemId(item.id),
            onDelete: () => deleteItem(item.id),
          };
          if (item.kind === "question") {
            return (
              <QuestionCard
                key={item.id}
                question={item}
                {...common}
                onChangeText={(text) => updateItem<QuestionItem>(item.id, { text })}
                onChangeType={(type) => updateItem<QuestionItem>(item.id, { type })}
                onAddOption={() => addOption(item.id)}
                onUpdateOption={(oId, text) => updateOption(item.id, oId, text)}
                onDeleteOption={(oId) => deleteOption(item.id, oId)}
                onDuplicate={() => duplicateQuestion(item.id)}
              />
            );
          }
          if (item.kind === "title-block") {
            return (
              <TitleBlockCard
                key={item.id}
                block={item}
                {...common}
                onChangeTitle={(title) => updateItem<TitleBlockItem>(item.id, { title })}
                onChangeDescription={(description) =>
                  updateItem<TitleBlockItem>(item.id, { description })
                }
              />
            );
          }
          if (item.kind === "image") {
            return (
              <ImageCard
                key={item.id}
                image={item}
                {...common}
                onChangeSrc={(src) => updateItem<ImageItem>(item.id, { src })}
                onChangeCaption={(caption) =>
                  updateItem<ImageItem>(item.id, { caption })
                }
              />
            );
          }
          // section
          return (
            <SectionCard
              key={item.id}
              section={item}
              {...common}
              onChangeTitle={(title) => updateItem<SectionItem>(item.id, { title })}
              onChangeDescription={(description) =>
                updateItem<SectionItem>(item.id, { description })
              }
            />
          );
        })}

        {/* Floating right-side action bar */}
        <div className="hidden lg:flex absolute top-32 -right-16 flex-col gap-1 bg-white rounded-xl shadow-md border border-slate-200 p-1">
          <ToolbarButton title="Preview quiz" onClick={() => setPreviewOpen(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </ToolbarButton>
          <ToolbarButton title="Quiz settings" onClick={() => setSettingsOpen(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </ToolbarButton>
          <div className="my-1 h-px bg-slate-200 mx-1" />
          <ToolbarButton title="Add question" onClick={() => insertItem(blankQuestion())}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </ToolbarButton>
          <ToolbarButton title="Add title and description" onClick={() => insertItem(blankTitleBlock())}>
            <span className="font-bold text-base leading-none px-1">T<sub className="text-[10px]">T</sub></span>
          </ToolbarButton>
          <ToolbarButton title="Add image" onClick={() => insertItem(blankImage())}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </ToolbarButton>
          <ToolbarButton title="Add section" onClick={() => insertItem(blankSection())}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="6" rx="1" />
              <rect x="3" y="14" width="18" height="6" rx="1" />
            </svg>
          </ToolbarButton>
          {/* Separator + Copy/Download + Undo + Redo */}
          <div className="my-1 h-px bg-slate-200 mx-1" />
          <ToolbarButton title="Download quiz as text file" onClick={downloadQuizCopy}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            title={canUndo ? "Undo" : "Nothing to undo"}
            disabled={!canUndo}
            onClick={undo}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 14 4 9 9 4" />
              <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            title={canRedo ? "Redo" : "Nothing to redo"}
            disabled={!canRedo}
            onClick={redo}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 14 20 9 15 4" />
              <path d="M4 20v-7a4 4 0 0 1 4-4h12" />
            </svg>
          </ToolbarButton>
        </div>
      </div>

      {/* Small-screen floating add button */}
      <button
        type="button"
        onClick={() => insertItem(blankQuestion())}
        className="lg:hidden fixed right-4 bottom-4 z-50 w-12 h-12 rounded-full bg-cyan-700 hover:bg-cyan-800 text-white shadow-lg flex items-center justify-center"
        aria-label="Add question"
        title="Add question"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* Settings modal — currently just the confirmation message shown to
          respondents after submitting. Changes flow through setQuiz so they're
          undoable and persisted alongside the rest of the quiz. */}
      {settingsOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-black text-slate-800">Quiz settings</h2>
              <p className="text-sm text-slate-500 mt-1">
                These apply to the published version of the quiz.
              </p>
            </div>

            <div className="px-6 py-4 space-y-4">
              <label className="block">
                <span className="block text-sm font-bold text-slate-700 mb-1">
                  Confirmation message
                </span>
                <span className="block text-xs text-slate-500 mb-2">
                  Shown to respondents after they submit the quiz.
                </span>
                <input
                  type="text"
                  value={quiz.settings.confirmationMessage}
                  onChange={(e) => updateSettings({ confirmationMessage: e.target.value })}
                  placeholder="Your response has been recorded"
                  className="w-full text-sm text-slate-800 placeholder:text-slate-400 border border-slate-300 rounded-lg px-3 py-2 focus:border-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-100"
                />
              </label>

              <ToggleRow
                checked={quiz.settings.shuffleQuestionOrder}
                onChange={(v) => updateSettings({ shuffleQuestionOrder: v })}
                label="Shuffle question order"
                description="Each branch sees the questions in a different order. Respondents from the same branch see the same order so results stay comparable."
              />

              <ToggleRow
                checked={quiz.settings.limitToOneResponse}
                onChange={(v) => updateSettings({ limitToOneResponse: v })}
                label="Limit to one response"
                description={`Each email can only submit the quiz once. Re-opening the Answer Quiz page after submitting will show "you've already responded".`}
              />
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="px-4 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-800 text-white font-bold text-sm shadow-md"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview modal — renders the quiz as a respondent would see it.
          Inputs work cosmetically but submit is a no-op alert. */}
      {previewOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-[70] overflow-y-auto"
          onClick={() => setPreviewOpen(false)}
        >
          <div
            className="min-h-full py-8 px-4 flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full max-w-3xl flex items-center justify-between mb-4">
              <span className="text-white font-bold text-sm uppercase tracking-wide flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Preview — what respondents will see
              </span>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="px-4 py-2 rounded-xl bg-white text-slate-800 font-bold text-sm shadow-md hover:bg-slate-100 flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                Close preview
              </button>
            </div>

            <div className="w-full max-w-3xl">
              <div className="bg-white rounded-2xl shadow-sm border-t-8 border-t-cyan-700 border-x border-b border-slate-200 mb-4 p-6">
                <h1 className="text-3xl font-light text-slate-800">
                  {quiz.title || (
                    <span className="text-slate-400">Untitled form</span>
                  )}
                </h1>
                {quiz.description && (
                  <p className="text-sm text-slate-600 mt-3">{quiz.description}</p>
                )}
              </div>

              {quiz.items.map((item) => {
                if (item.kind === "question") return <QuestionPreview key={item.id} question={item} />;
                if (item.kind === "title-block") return <TitleBlockPreview key={item.id} block={item} />;
                if (item.kind === "image") return <ImagePreview key={item.id} image={item} />;
                return <SectionPreview key={item.id} section={item} />;
              })}

              <div className="flex items-center justify-between mt-4 mb-8 text-xs text-white/80">
                <span className="italic">Preview mode — answers aren&apos;t saved.</span>
                <button
                  type="button"
                  onClick={() => window.alert("Preview only — submit will work once the quiz is published.")}
                  className="px-5 py-2 rounded-lg bg-cyan-700 text-white font-bold text-sm shadow-md hover:bg-cyan-800"
                >
                  Submit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Publish target picker — opens on PUBLISH click, asks for the branch
          audience, then for explicit confirmation before writing. */}
      {showPublishModal && (
        <div
          className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4"
          onClick={() => setShowPublishModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-black text-slate-800">
                Publish to branches
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Choose which branches will receive this quiz. You can pick all, some, or just one.
              </p>
            </div>

            <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between text-sm">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={selectAllBranches}
                  className="text-cyan-700 hover:text-cyan-900 font-semibold"
                >
                  Select all
                </button>
                <span className="text-slate-300">·</span>
                <button
                  type="button"
                  onClick={clearBranches}
                  className="text-slate-600 hover:text-slate-900 font-semibold"
                >
                  Clear
                </button>
              </div>
              <span className="text-slate-500 font-semibold">
                {selectedBranches.size} / {USER_TABLE_BRANCHES.length}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-2">
              {USER_TABLE_BRANCHES.map((branch) => (
                <label
                  key={branch}
                  className="flex items-center gap-3 py-2 px-3 cursor-pointer hover:bg-slate-50 rounded-md"
                >
                  <input
                    type="checkbox"
                    checked={selectedBranches.has(branch)}
                    onChange={() => toggleBranch(branch)}
                    className="w-4 h-4 accent-cyan-700"
                  />
                  <span className="text-sm text-slate-700">{branch}</span>
                </label>
              ))}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPublishModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmPublish}
                disabled={selectedBranches.size === 0}
                className={`px-4 py-2 rounded-lg font-bold text-sm shadow-md flex items-center gap-2 transition-colors ${
                  selectedBranches.size === 0
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                    : "bg-cyan-700 hover:bg-cyan-800 text-white"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                Publish to {selectedBranches.size === USER_TABLE_BRANCHES.length
                  ? "all branches"
                  : `${selectedBranches.size} branch${selectedBranches.size === 1 ? "" : "es"}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function ToggleRow({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full flex items-start gap-3 text-left"
    >
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors mt-0.5 ${
          checked ? "bg-cyan-700" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-[1.375rem]" : "translate-x-0.5"
          }`}
        />
      </span>
      <span className="flex-1">
        <span className="block text-sm font-bold text-slate-700">{label}</span>
        <span className="block text-xs text-slate-500 mt-0.5">{description}</span>
      </span>
    </button>
  );
}

function ToolbarButton({
  children,
  onClick,
  title,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
        disabled
          ? "text-slate-300 cursor-not-allowed"
          : "text-slate-600 hover:bg-cyan-50 hover:text-cyan-700"
      }`}
    >
      {children}
    </button>
  );
}

/** Shared chrome around every item: cyan left bar when active + delete in footer. */
function CardShell({
  active,
  canDelete,
  onFocus,
  onDelete,
  children,
  footer,
  accentColor = "cyan",
}: {
  active: boolean;
  canDelete: boolean;
  onFocus: () => void;
  onDelete: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  accentColor?: "cyan" | "violet";
}) {
  const activeBar = accentColor === "violet" ? "bg-violet-700" : "bg-cyan-700";
  return (
    <div
      onClick={onFocus}
      className={`bg-white rounded-2xl shadow-sm border border-slate-200 mb-4 overflow-hidden flex transition-shadow ${
        active ? "shadow-md" : ""
      }`}
    >
      <div className={`w-1.5 shrink-0 ${active ? activeBar : "bg-transparent"}`} />
      <div className="flex-1 p-6">
        {children}
        <div className="flex items-center justify-end gap-1 pt-3 mt-3 border-t border-slate-200">
          {footer}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (canDelete) onDelete();
            }}
            disabled={!canDelete}
            title={canDelete ? "Delete" : "At least one item is required"}
            aria-label="Delete"
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
              canDelete
                ? "text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                : "text-slate-300 cursor-not-allowed"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function QuestionCard({
  question,
  active,
  canDelete,
  onFocus,
  onChangeText,
  onChangeType,
  onAddOption,
  onUpdateOption,
  onDeleteOption,
  onDuplicate,
  onDelete,
}: {
  question: QuestionItem;
  active: boolean;
  canDelete: boolean;
  onFocus: () => void;
  onChangeText: (text: string) => void;
  onChangeType: (type: QuestionType) => void;
  onAddOption: () => void;
  onUpdateOption: (oId: string, text: string) => void;
  onDeleteOption: (oId: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const isChoice = question.type === "multiple-choice" || question.type === "checkbox";
  return (
    <CardShell
      active={active}
      canDelete={canDelete}
      onFocus={onFocus}
      onDelete={onDelete}
      footer={
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
          title="Duplicate question"
          aria-label="Duplicate question"
          className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-cyan-700 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
      }
    >
      <div className="flex items-start gap-4 mb-4">
        <input
          type="text"
          value={question.text}
          onChange={(e) => onChangeText(e.target.value)}
          placeholder="Untitled Question"
          className="flex-1 text-base font-medium text-slate-800 placeholder:text-slate-400 bg-slate-50 border border-transparent hover:border-slate-200 focus:bg-white focus:border-cyan-700 rounded-md px-3 py-2 focus:outline-none"
        />
        <select
          value={question.type}
          onChange={(e) => onChangeType(e.target.value as QuestionType)}
          className="text-sm text-slate-700 border border-slate-300 rounded-md px-2 py-2 bg-white hover:border-slate-400 focus:border-cyan-700 focus:outline-none cursor-pointer"
        >
          {Object.entries(QUESTION_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {isChoice && (
        <div className="space-y-2">
          {question.options.map((o) => (
            <div key={o.id} className="flex items-center gap-3 group">
              {question.type === "multiple-choice" ? (
                <span className="w-4 h-4 rounded-full border-2 border-slate-300 shrink-0" />
              ) : (
                <span className="w-4 h-4 rounded-sm border-2 border-slate-300 shrink-0" />
              )}
              <input
                type="text"
                value={o.text}
                onChange={(e) => onUpdateOption(o.id, e.target.value)}
                placeholder="Option"
                className="flex-1 text-sm text-slate-700 placeholder:text-slate-400 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-cyan-700 focus:outline-none py-1"
              />
              {question.options.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteOption(o.id);
                  }}
                  aria-label="Remove option"
                  title="Remove option"
                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 transition-opacity"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddOption();
            }}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-700 transition-colors mt-1"
          >
            {question.type === "multiple-choice" ? (
              <span className="w-4 h-4 rounded-full border-2 border-slate-300 shrink-0" />
            ) : (
              <span className="w-4 h-4 rounded-sm border-2 border-slate-300 shrink-0" />
            )}
            Add option
          </button>
        </div>
      )}

      {question.type === "short-answer" && (
        <div className="text-sm text-slate-400 border-b border-dashed border-slate-300 pb-1">
          Short-answer text
        </div>
      )}
      {question.type === "paragraph" && (
        <div className="text-sm text-slate-400 border-b border-dashed border-slate-300 pb-6">
          Long-answer text
        </div>
      )}
    </CardShell>
  );
}

function TitleBlockCard({
  block,
  active,
  canDelete,
  onFocus,
  onDelete,
  onChangeTitle,
  onChangeDescription,
}: {
  block: TitleBlockItem;
  active: boolean;
  canDelete: boolean;
  onFocus: () => void;
  onDelete: () => void;
  onChangeTitle: (v: string) => void;
  onChangeDescription: (v: string) => void;
}) {
  return (
    <CardShell active={active} canDelete={canDelete} onFocus={onFocus} onDelete={onDelete}>
      <input
        type="text"
        value={block.title}
        onChange={(e) => onChangeTitle(e.target.value)}
        placeholder="Untitled Title"
        className="w-full text-2xl font-light text-slate-800 placeholder:text-slate-400 border-b border-transparent hover:border-slate-300 focus:border-cyan-700 focus:outline-none pb-2 mb-2 bg-transparent"
      />
      <input
        type="text"
        value={block.description}
        onChange={(e) => onChangeDescription(e.target.value)}
        placeholder="Description (optional)"
        className="w-full text-sm text-slate-600 placeholder:text-slate-400 border-b border-transparent hover:border-slate-300 focus:border-cyan-700 focus:outline-none pb-2 bg-transparent"
      />
    </CardShell>
  );
}

function ImageCard({
  image,
  active,
  canDelete,
  onFocus,
  onDelete,
  onChangeSrc,
  onChangeCaption,
}: {
  image: ImageItem;
  active: boolean;
  canDelete: boolean;
  onFocus: () => void;
  onDelete: () => void;
  onChangeSrc: (src: string) => void;
  onChangeCaption: (caption: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const onPick = (file: File) => {
    // Warn for large files — localStorage quotas typically max at ~5 MB.
    if (file.size > 1_000_000) {
      const ok = window.confirm(
        `This image is ${(file.size / 1_000_000).toFixed(1)} MB. Large images can fill local storage and may fail to save. Continue?`,
      );
      if (!ok) return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") onChangeSrc(reader.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <CardShell active={active} canDelete={canDelete} onFocus={onFocus} onDelete={onDelete}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = ""; // allow re-uploading the same file
        }}
      />

      {image.src ? (
        <div className="mb-3 flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.src}
            alt={image.caption || "Quiz image"}
            className="max-w-full max-h-96 rounded-lg border border-slate-200"
          />
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileRef.current?.click();
              }}
              className="text-xs text-cyan-700 hover:text-cyan-900 font-semibold"
            >
              Replace image
            </button>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChangeSrc("");
              }}
              className="text-xs text-rose-600 hover:text-rose-800 font-semibold"
            >
              Remove image
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            fileRef.current?.click();
          }}
          className="w-full border-2 border-dashed border-slate-300 hover:border-cyan-500 hover:bg-cyan-50/50 rounded-lg py-12 text-slate-500 hover:text-cyan-700 transition-colors flex flex-col items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <span className="text-sm font-semibold">Click to upload image</span>
          <span className="text-xs text-slate-400">PNG, JPG, GIF — keep under ~1MB</span>
        </button>
      )}

      <input
        type="text"
        value={image.caption}
        onChange={(e) => onChangeCaption(e.target.value)}
        placeholder="Caption (optional)"
        className="w-full text-sm text-slate-600 placeholder:text-slate-400 border-b border-transparent hover:border-slate-300 focus:border-cyan-700 focus:outline-none pb-2 bg-transparent"
      />
    </CardShell>
  );
}

function SectionCard({
  section,
  active,
  canDelete,
  onFocus,
  onDelete,
  onChangeTitle,
  onChangeDescription,
}: {
  section: SectionItem;
  active: boolean;
  canDelete: boolean;
  onFocus: () => void;
  onDelete: () => void;
  onChangeTitle: (v: string) => void;
  onChangeDescription: (v: string) => void;
}) {
  return (
    <div
      onClick={onFocus}
      className={`bg-violet-50 rounded-2xl shadow-sm border border-violet-200 mb-4 overflow-hidden flex transition-shadow ${
        active ? "shadow-md" : ""
      }`}
    >
      <div className={`w-1.5 shrink-0 ${active ? "bg-violet-700" : "bg-transparent"}`} />
      <div className="flex-1 p-6">
        <div className="text-xs font-bold uppercase tracking-wide text-violet-700 mb-2">
          Section
        </div>
        <input
          type="text"
          value={section.title}
          onChange={(e) => onChangeTitle(e.target.value)}
          placeholder="Untitled Section"
          className="w-full text-2xl font-light text-slate-800 placeholder:text-slate-400 border-b border-transparent hover:border-violet-300 focus:border-violet-700 focus:outline-none pb-2 mb-2 bg-transparent"
        />
        <input
          type="text"
          value={section.description}
          onChange={(e) => onChangeDescription(e.target.value)}
          placeholder="Description (optional)"
          className="w-full text-sm text-slate-600 placeholder:text-slate-400 border-b border-transparent hover:border-violet-300 focus:border-violet-700 focus:outline-none pb-2 bg-transparent"
        />
        <div className="flex items-center justify-end gap-1 pt-3 mt-3 border-t border-violet-200">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (canDelete) onDelete();
            }}
            disabled={!canDelete}
            title={canDelete ? "Delete section" : "At least one item is required"}
            aria-label="Delete section"
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
              canDelete
                ? "text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                : "text-slate-300 cursor-not-allowed"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Preview subcomponents ──────────────────────────────────────────────────
// Read-only respondent view of each item kind. Inputs work cosmetically (the
// browser handles radio/checkbox toggling) but nothing is persisted.

function QuestionPreview({ question }: { question: QuestionItem }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 mb-4 p-6">
      <p className="text-base font-medium text-slate-800 mb-4">
        {question.text || <span className="text-slate-400">Untitled Question</span>}
      </p>
      {question.type === "multiple-choice" && (
        <div className="space-y-2">
          {question.options.map((o) => (
            <label key={o.id} className="flex items-center gap-3 cursor-pointer">
              <input type="radio" name={question.id} className="w-4 h-4 accent-cyan-700" />
              <span className="text-sm text-slate-700">{o.text || <em className="text-slate-400">Option</em>}</span>
            </label>
          ))}
        </div>
      )}
      {question.type === "checkbox" && (
        <div className="space-y-2">
          {question.options.map((o) => (
            <label key={o.id} className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-cyan-700" />
              <span className="text-sm text-slate-700">{o.text || <em className="text-slate-400">Option</em>}</span>
            </label>
          ))}
        </div>
      )}
      {question.type === "short-answer" && (
        <input
          type="text"
          placeholder="Short-answer text"
          className="w-full text-sm text-slate-700 border-b border-slate-300 focus:border-cyan-700 focus:outline-none pb-1 bg-transparent"
        />
      )}
      {question.type === "paragraph" && (
        <textarea
          placeholder="Long-answer text"
          rows={3}
          className="w-full text-sm text-slate-700 border-b border-slate-300 focus:border-cyan-700 focus:outline-none pb-1 bg-transparent resize-y"
        />
      )}
    </div>
  );
}

function TitleBlockPreview({ block }: { block: TitleBlockItem }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 mb-4 p-6">
      <h2 className="text-2xl font-light text-slate-800">
        {block.title || <span className="text-slate-400">Untitled Title</span>}
      </h2>
      {block.description && (
        <p className="text-sm text-slate-600 mt-2">{block.description}</p>
      )}
    </div>
  );
}

function ImagePreview({ image }: { image: ImageItem }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 mb-4 p-6">
      {image.src ? (
        <div className="flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.src}
            alt={image.caption || "Quiz image"}
            className="max-w-full max-h-96 rounded-lg"
          />
          {image.caption && (
            <p className="text-xs text-slate-600 italic text-center mt-2">{image.caption}</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-400 italic text-center">[no image uploaded]</p>
      )}
    </div>
  );
}

function SectionPreview({ section }: { section: SectionItem }) {
  return (
    <div className="bg-violet-50 rounded-2xl shadow-sm border border-violet-200 mb-4 p-6">
      <div className="text-xs font-bold uppercase tracking-wide text-violet-700 mb-2">Section</div>
      <h2 className="text-2xl font-light text-slate-800">
        {section.title || <span className="text-slate-400">Untitled Section</span>}
      </h2>
      {section.description && (
        <p className="text-sm text-slate-600 mt-2">{section.description}</p>
      )}
    </div>
  );
}
