"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Image } from "@tiptap/extension-image";
import { Link } from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TextAlign } from "@tiptap/extension-text-align";
// Tiptap v3 ships Table + Row + Cell + Header from one package; TableKit bundles all four.
import { TableKit } from "@tiptap/extension-table";
import { useCallback, useEffect, useRef, useState } from "react";

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface ChapterEditorProps {
  level: "jnr" | "mdr" | "snr";
  grade: number;
  chapter: number;
  /** Hex/Tailwind accent used for active toolbar buttons (e.g. "teal" | "rose" | "amber"). */
  accent: "teal" | "rose" | "amber";
}

const ACCENT: Record<
  ChapterEditorProps["accent"],
  { active: string; ring: string }
> = {
  teal:  { active: "bg-teal-800 text-white border-teal-800",  ring: "focus-within:ring-teal-300" },
  rose:  { active: "bg-rose-800 text-white border-rose-800",  ring: "focus-within:ring-rose-300" },
  amber: { active: "bg-amber-700 text-white border-amber-700", ring: "focus-within:ring-amber-300" },
};

export default function ChapterEditor({ level, grade, chapter, accent }: ChapterEditorProps) {
  const apiUrl = `/api/academy/chapter-content/${level}/${grade}/${chapter}`;
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Image.configure({ inline: false, allowBase64: true }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-blue-600 underline cursor-pointer" },
      }),
      Placeholder.configure({
        placeholder: "Start writing — use the toolbar above to format, add images, links, lists, tables…",
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TableKit.configure({ table: { resizable: true } }),
    ],
    editorProps: {
      attributes: {
        class: "prose prose-slate max-w-none min-h-[55vh] focus:outline-none px-4 py-3",
      },
    },
    immediatelyRender: false,
    content: "",
  });

  // Load saved content once on mount
  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiUrl, { cache: "no-store" });
        if (!res.ok) throw new Error("load failed");
        const data = await res.json();
        if (cancelled) return;
        if (data.content) editor.commands.setContent(data.content);
        setLoaded(true);
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editor, apiUrl]);

  // Debounced auto-save on every change
  const scheduleSave = useCallback(() => {
    if (!editor) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setStatus("saving");
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(apiUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: editor.getJSON() }),
        });
        if (!res.ok) throw new Error(String(res.status));
        setStatus("saved");
      } catch {
        setStatus("error");
      }
    }, 800);
  }, [editor, apiUrl]);

  useEffect(() => {
    if (!editor || !loaded) return;
    editor.on("update", scheduleSave);
    return () => {
      editor.off("update", scheduleSave);
    };
  }, [editor, loaded, scheduleSave]);

  if (!editor) {
    return (
      <div className="text-slate-500 text-sm py-8 text-center">Loading editor…</div>
    );
  }

  return (
    <div className={`rounded-xl border border-slate-200 ${ACCENT[accent].ring} focus-within:ring-2`}>
      <Toolbar editor={editor} accent={accent} />
      <EditorContent editor={editor} />
      <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 text-xs text-slate-500 flex justify-between rounded-b-xl">
        <span>
          {!loaded ? "Loading…" :
           status === "saving" ? "Saving…" :
           status === "saved"  ? "✓ Saved" :
           status === "error"  ? "Save failed — your edits are still in the editor" :
           "Edits auto-save"}
        </span>
        <span>{level.toUpperCase()} · Grade {grade} · Chapter {chapter}</span>
      </div>
    </div>
  );
}

// ─── Toolbar ─────────────────────────────────────────────────────────────

function Toolbar({ editor, accent }: { editor: Editor; accent: ChapterEditorProps["accent"] }) {
  const activeCls = ACCENT[accent].active;

  const Btn = ({
    onClick,
    isActive,
    title,
    children,
    disabled,
  }: {
    onClick: () => void;
    isActive?: boolean;
    title: string;
    children: React.ReactNode;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`px-2 py-1 text-sm rounded border transition-colors ${
        isActive ? activeCls : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );

  const Divider = () => <span className="w-px self-stretch bg-slate-200 mx-1" />;

  const handleImage = () => {
    const url = window.prompt("Image URL");
    if (url) editor.chain().focus().setImage({ src: url }).run();
  };

  const handleLink = () => {
    const prev = editor.getAttributes("link").href;
    const url = window.prompt("Link URL", prev || "https://");
    if (url === null) return;
    if (url === "") editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const handleTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 border-b border-slate-200 bg-slate-50 rounded-t-xl">
      <Btn title="Heading 1" isActive={editor.isActive("heading", { level: 1 })}
           onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</Btn>
      <Btn title="Heading 2" isActive={editor.isActive("heading", { level: 2 })}
           onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</Btn>
      <Btn title="Heading 3" isActive={editor.isActive("heading", { level: 3 })}
           onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</Btn>
      <Btn title="Paragraph" isActive={editor.isActive("paragraph")}
           onClick={() => editor.chain().focus().setParagraph().run()}>¶</Btn>

      <Divider />

      <Btn title="Bold" isActive={editor.isActive("bold")}
           onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></Btn>
      <Btn title="Italic" isActive={editor.isActive("italic")}
           onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></Btn>
      <Btn title="Strike" isActive={editor.isActive("strike")}
           onClick={() => editor.chain().focus().toggleStrike().run()}><s>S</s></Btn>
      <Btn title="Inline code" isActive={editor.isActive("code")}
           onClick={() => editor.chain().focus().toggleCode().run()}>&lt;/&gt;</Btn>

      <Divider />

      <Btn title="Bulleted list" isActive={editor.isActive("bulletList")}
           onClick={() => editor.chain().focus().toggleBulletList().run()}>• List</Btn>
      <Btn title="Numbered list" isActive={editor.isActive("orderedList")}
           onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. List</Btn>
      <Btn title="Blockquote" isActive={editor.isActive("blockquote")}
           onClick={() => editor.chain().focus().toggleBlockquote().run()}>❝</Btn>
      <Btn title="Code block" isActive={editor.isActive("codeBlock")}
           onClick={() => editor.chain().focus().toggleCodeBlock().run()}>{ "{ }" }</Btn>

      <Divider />

      <Btn title="Align left"   isActive={editor.isActive({ textAlign: "left" })}
           onClick={() => editor.chain().focus().setTextAlign("left").run()}>⇤</Btn>
      <Btn title="Align center" isActive={editor.isActive({ textAlign: "center" })}
           onClick={() => editor.chain().focus().setTextAlign("center").run()}>≡</Btn>
      <Btn title="Align right"  isActive={editor.isActive({ textAlign: "right" })}
           onClick={() => editor.chain().focus().setTextAlign("right").run()}>⇥</Btn>

      <Divider />

      <Btn title="Insert link"  isActive={editor.isActive("link")} onClick={handleLink}>🔗</Btn>
      <Btn title="Insert image" onClick={handleImage}>🖼</Btn>
      <Btn title="Insert table" onClick={handleTable}>▦</Btn>
      <Btn title="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}>―</Btn>

      <Divider />

      <Btn title="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>↶</Btn>
      <Btn title="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>↷</Btn>

      <Divider />

      <Btn title="Clear all formatting" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>⨯ fmt</Btn>
    </div>
  );
}
