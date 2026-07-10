"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  sectionRef: React.RefObject<HTMLElement | null>;
  pageCount: number;
}

const PAGE_HEIGHT = 1123;

/**
 * Walk up the DOM until we hit the nearest ancestor with `overflow-y: auto/scroll/overlay`.
 * Falls back to `window` for plain document scrolling.
 */
function findScrollableParent(el: HTMLElement): HTMLElement | Window {
  let parent = el.parentElement;
  while (parent) {
    const style = window.getComputedStyle(parent);
    if (/auto|scroll|overlay/.test(style.overflowY)) return parent;
    parent = parent.parentElement;
  }
  return window;
}

export default function PageNavigator({ sectionRef, pageCount }: Props) {
  const [currentPage, setCurrentPage] = useState(1);

  // Track current page from scroll position.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const scroller = findScrollableParent(section);

    const update = () => {
      const rect = section.getBoundingClientRect();
      let viewportTop: number;
      let viewportHeight: number;
      if (scroller === window) {
        viewportTop = 0;
        viewportHeight = window.innerHeight;
      } else {
        const sc = scroller as HTMLElement;
        const scRect = sc.getBoundingClientRect();
        viewportTop = scRect.top;
        viewportHeight = sc.clientHeight;
      }
      const viewportCenter = viewportTop + viewportHeight / 2;
      const offset = viewportCenter - rect.top;
      const page = Math.max(
        1,
        Math.min(pageCount, Math.floor(offset / PAGE_HEIGHT) + 1),
      );
      setCurrentPage(page);
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true } as AddEventListenerOptions);
    window.addEventListener("resize", update);
    return () => {
      scroller.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [pageCount, sectionRef]);

  const scrollToPage = (n: number) => {
    const section = sectionRef.current;
    if (!section) return;
    setCurrentPage(n);

    const rect = section.getBoundingClientRect();

    // Brute-force approach: scroll EVERY scrollable ancestor we find, plus the
    // window. Whichever one is actually the real scroller will move; the others
    // will silently no-op. This dodges any ambiguity about which element owns
    // the page scroll.
    let scrolledAny = false;
    let el: HTMLElement | null = section.parentElement;
    while (el) {
      const style = window.getComputedStyle(el);
      if (/auto|scroll|overlay/.test(style.overflowY)) {
        const scRect = el.getBoundingClientRect();
        const sectionTopInContent = rect.top - scRect.top + el.scrollTop;
        const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
        const target = Math.max(
          0,
          Math.min(maxScroll, sectionTopInContent + (n - 1) * PAGE_HEIGHT - 20),
        );
        el.scrollTop = target;
        scrolledAny = true;
      }
      el = el.parentElement;
    }
    // Always try the window too as a safety net.
    const winTarget = Math.max(0, window.scrollY + rect.top + (n - 1) * PAGE_HEIGHT - 20);
    window.scrollTo(0, winTarget);
    void scrolledAny;
  };

  if (pageCount <= 1) return null;

  return (
    <div className="fixed right-4 bottom-4 z-[60] flex items-center gap-1 bg-white border border-slate-200 rounded-full shadow-lg px-2 py-1">
      <button
        type="button"
        onClick={() => scrollToPage(Math.max(1, currentPage - 1))}
        disabled={currentPage <= 1}
        title="Previous page"
        aria-label="Previous page"
        className="p-1.5 rounded-full text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-xs font-bold text-slate-700 px-2 min-w-[90px] text-center tabular-nums">
        Page {currentPage} / {pageCount}
      </span>
      <button
        type="button"
        onClick={() => scrollToPage(Math.min(pageCount, currentPage + 1))}
        disabled={currentPage >= pageCount}
        title="Next page"
        aria-label="Next page"
        className="p-1.5 rounded-full text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
