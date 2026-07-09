"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { MapPin, ChevronDown, X, Check } from "lucide-react";
import {
  BRANCHES,
  BRANCH_REGIONS,
  BRANCHES_BY_REGION,
  BranchCode,
  BranchRegion,
} from "@pcm/_types";

interface Props {
  /** Empty Set ≡ "all branches" (no filter active). */
  selected: Set<BranchCode>;
  onChange: (next: Set<BranchCode>) => void;
}

/**
 * Region-grouped, multi-select branch picker.
 *
 * Used on the Invitations page for Academy users — lets them compare
 * any combination of branches at once. Empty selection means "all
 * branches" (no filter), which matches the existing single-select
 * "All branches" sentinel and keeps callers simple.
 *
 * Layout:
 *   • Button shows current selection summary ("All branches" / "5 branches" /
 *     "3 branches · Region A")
 *   • Click → popover with three columns (Region A / B / C)
 *   • Each region has a "Select all" checkbox + per-branch checkboxes
 *   • Top of popover has "Clear all" / "Select all" shortcuts
 */
const POPOVER_WIDTH = 540;
const VIEWPORT_MARGIN = 16;

export function BranchMultiSelect({ selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Which edge the 540px popover anchors from. Whichever page embeds this
  // button can sit anywhere in the row — right-anchoring clips off the left
  // edge of the screen when the button is near the left (Reports page),
  // left-anchoring clips off the right edge when the button is near the
  // right (Invitations page). Measured against the viewport on open instead
  // of hardcoded, so both placements stay fully visible.
  const [align, setAlign] = useState<"left" | "right">("right");

  // Close the popover when the user clicks outside.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const fitsRight = rect.right - POPOVER_WIDTH >= VIEWPORT_MARGIN;
    const fitsLeft = rect.left + POPOVER_WIDTH <= window.innerWidth - VIEWPORT_MARGIN;
    // Prefer right-anchor (the original default) whenever it actually fits;
    // only fall back to left-anchor when right-anchoring would run off-screen.
    setAlign(fitsRight ? "right" : fitsLeft ? "left" : "right");
  }, [open]);

  // Summarise current selection for the button label.
  const summary = useMemo(() => {
    if (selected.size === 0 || selected.size === BRANCHES.length) {
      return "All branches";
    }
    // If every selected branch sits in the same region, show that.
    const regions = new Set<BranchRegion>();
    for (const code of selected) regions.add(BRANCH_REGIONS[code]);
    if (regions.size === 1) {
      const [r] = Array.from(regions);
      const total = BRANCHES_BY_REGION[r].length;
      if (selected.size === total) return `All Region ${r}`;
      return `${selected.size} · Region ${r}`;
    }
    return `${selected.size} branches`;
  }, [selected]);

  function toggleBranch(code: BranchCode) {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onChange(next);
  }
  function selectRegion(r: BranchRegion) {
    const next = new Set(selected);
    for (const code of BRANCHES_BY_REGION[r]) next.add(code);
    onChange(next);
  }
  function clearRegion(r: BranchRegion) {
    const next = new Set(selected);
    for (const code of BRANCHES_BY_REGION[r]) next.delete(code);
    onChange(next);
  }
  function selectAll() {
    onChange(new Set(BRANCHES.map(b => b.code as BranchCode)));
  }
  function clearAll() { onChange(new Set()); }

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-2 fa-input text-xs"
        style={{
          minWidth: "200px",
          height: "30px",
          paddingTop: "0.15rem",
          paddingBottom: "0.15rem",
          paddingLeft: "0.75rem",
          paddingRight: "0.5rem",
        }}
      >
        <MapPin className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
        <span className="flex-1 text-left text-ink-900 truncate">{summary}</span>
        {selected.size > 0 && selected.size < BRANCHES.length && (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); clearAll(); }}
            className="text-ink-400 hover:text-rose-600"
            title="Clear all branch filters"
          >
            <X className="w-3 h-3" />
          </span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          className={`absolute z-20 mt-1 ${align === "right" ? "right-0" : "left-0"} rounded-xl bg-white border border-ivory-300 shadow-xl`}
          style={{ width: POPOVER_WIDTH, padding: 12 }}
        >
          {/* Header bar */}
          <div className="flex items-center justify-between gap-3 pb-2 mb-2 border-b border-ivory-300">
            <div className="fa-mono text-[10px] uppercase text-ink-500" style={{ letterSpacing: "0.12em" }}>
              Branches · {selected.size === 0 ? "All" : `${selected.size} selected`}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="text-[11px] font-semibold text-violet-700 hover:text-violet-900"
              >
                Select all
              </button>
              <span className="text-ink-300">·</span>
              <button
                type="button"
                onClick={clearAll}
                className="text-[11px] font-semibold text-ink-500 hover:text-rose-600"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Three columns — one per region */}
          <div className="grid grid-cols-3 gap-3">
            {(["A", "B", "C"] as BranchRegion[]).map(region => {
              const inRegion = BRANCHES_BY_REGION[region];
              const allPicked = inRegion.every(c => selected.has(c));
              const anyPicked = inRegion.some(c => selected.has(c));
              return (
                <div key={region} className="rounded-lg border border-violet-100 bg-violet-50/40 p-2.5">
                  <div className="flex items-center justify-between mb-2">
                    <div
                      className="fa-mono text-[11px] font-bold text-violet-700"
                      style={{ letterSpacing: "0.08em" }}
                    >
                      REGION {region}
                    </div>
                    <button
                      type="button"
                      onClick={() => allPicked ? clearRegion(region) : selectRegion(region)}
                      className="text-[10px] font-semibold text-violet-700 hover:text-violet-900"
                    >
                      {allPicked ? "Clear" : "All"}
                    </button>
                  </div>
                  <div className="space-y-1">
                    {inRegion.map(code => {
                      const checked = selected.has(code);
                      const branchName = BRANCHES.find(b => b.code === code)?.name ?? code;
                      return (
                        <label
                          key={code}
                          className={`flex items-center gap-2 px-2 py-1 rounded text-[12px] cursor-pointer transition-colors ${
                            checked ? "bg-violet-100 text-violet-900" : "hover:bg-white"
                          }`}
                        >
                          <span
                            className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                              checked ? "bg-violet-600 border-violet-600" : "border-ink-300 bg-white"
                            }`}
                            aria-hidden="true"
                          >
                            {checked && <Check className="w-2.5 h-2.5 text-white" />}
                          </span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleBranch(code)}
                            className="sr-only"
                          />
                          <span className="font-mono text-[10px] font-bold w-9">{code}</span>
                          <span className="truncate">{branchName}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="mt-2 pt-1.5 border-t border-violet-100 text-[10px] text-ink-500 flex justify-between">
                    <span>{anyPicked ? `${inRegion.filter(c => selected.has(c)).length} / ${inRegion.length}` : `0 / ${inRegion.length}`}</span>
                    {allPicked && <span className="text-violet-700 font-bold">all selected</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
