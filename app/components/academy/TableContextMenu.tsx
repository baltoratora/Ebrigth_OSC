"use client";

import { useEffect } from "react";
import { Trash2, Columns3, Rows3, Eraser } from "lucide-react";

interface Props {
  x: number;
  y: number;
  onClose: () => void;
  onDeleteRow: () => void;
  onDeleteColumn: () => void;
  onClearCell: () => void;
}

export default function TableContextMenu({
  x, y, onClose, onDeleteRow, onDeleteColumn, onClearCell,
}: Props) {
  // Close on Esc, scroll, or outside click.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-table-ctx-menu]")) onClose();
    };
    const onScroll = () => onClose();
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  return (
    <div
      data-table-ctx-menu
      className="fixed z-[80] bg-white border border-slate-200 rounded-lg shadow-xl py-1 min-w-[200px]"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Item icon={<Rows3 className="w-4 h-4" />} onClick={onDeleteRow}>
        Delete row
      </Item>
      <Item icon={<Columns3 className="w-4 h-4" />} onClick={onDeleteColumn}>
        Delete column
      </Item>
      <Item icon={<Eraser className="w-4 h-4" />} onClick={onClearCell}>
        Clear cell text
      </Item>
      <div className="my-1 border-t border-slate-100" />
      <Item icon={<Trash2 className="w-4 h-4 text-rose-600" />} onClick={onClose} muted>
        Cancel
      </Item>
    </div>
  );
}

function Item({
  icon, onClick, children, muted,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
        muted ? "text-slate-500 hover:bg-slate-50" : "text-slate-800 hover:bg-slate-100"
      }`}
    >
      <span className="text-slate-500">{icon}</span>
      {children}
    </button>
  );
}
