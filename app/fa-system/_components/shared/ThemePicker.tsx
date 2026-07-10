"use client";

import { useState, useRef, useEffect } from "react";
import { Palette, Check } from "lucide-react";
import { FA_THEMES, useFATheme } from "@fa/_lib/theme";

/** Compact theme switcher rendered in the AppShell footer. Opens a popover
 *  with the four palette options; the selection persists in localStorage. */
export function ThemePicker() {
  const { theme, setTheme } = useFATheme();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="p-1.5 text-ink-400 hover:text-gold-500 hover:bg-ivory-100 rounded-md transition-colors duration-200"
        title="Change theme"
        aria-label="Change theme"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Palette className="w-4 h-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 bottom-full mb-2 w-64 bg-ivory-50 border border-gold-200 rounded-[10px] shadow-lg p-2 z-50"
        >
          <div
            className="fa-mono text-[10px] uppercase text-gold-600 px-2 py-1.5"
            style={{ letterSpacing: "0.12em" }}
          >
            FA Theme
          </div>
          <div className="space-y-0.5">
            {FA_THEMES.map(opt => {
              const active = opt.id === theme;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => { setTheme(opt.id); setOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-left transition-colors ${
                    active
                      ? "bg-ivory-100 text-ink-900"
                      : "text-ink-700 hover:bg-ivory-100"
                  }`}
                >
                  <div className="flex flex-shrink-0 rounded overflow-hidden border border-ink-200" aria-hidden="true">
                    {opt.swatch.map((c, i) => (
                      <span
                        key={i}
                        className="block w-3 h-5"
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{opt.name}</div>
                    <div className="text-[11px] text-ink-400 truncate">{opt.description}</div>
                  </div>
                  {active && <Check className="w-3.5 h-3.5 text-gold-600 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
