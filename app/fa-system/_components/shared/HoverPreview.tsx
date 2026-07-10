"use client";

import { useRef, useState, useEffect, ReactNode, CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Z } from "@fa/_lib/zIndex";

interface HoverPreviewProps {
  children: ReactNode;
  preview: ReactNode;
  /** Width of the popover in px. Defaults to 340. */
  width?: number;
  disabled?: boolean;
}

type Placement = "right" | "left" | "above" | "below";

export function HoverPreview({ children, preview, width = 340, disabled = false }: HoverPreviewProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [coords,  setCoords]  = useState<{ top: number; left: number; placement: Placement } | null>(null);
  const wrapRef    = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function openPreview() {
    if (disabled) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia && window.matchMedia("(hover: none)").matches) return;

    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 20;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isNarrow = vw < 768;

    const spaceRight = vw - rect.right;
    const spaceLeft  = rect.left;
    const spaceBelow = vh - rect.bottom;

    // Pick placement
    let placement: Placement;
    if (isNarrow) {
      placement = spaceBelow >= 240 ? "below" : "above";
    } else if (spaceRight >= width + gap) {
      placement = "right";
    } else if (spaceLeft >= width + gap) {
      placement = "left";
    } else if (spaceBelow >= 240) {
      placement = "below";
    } else {
      placement = "above";
    }

    let top: number;
    let left: number;
    if (placement === "right") {
      top  = rect.top + rect.height / 2;
      left = rect.right + gap;
    } else if (placement === "left") {
      top  = rect.top + rect.height / 2;
      left = rect.left - gap;
    } else if (placement === "below") {
      top  = rect.bottom + gap;
      left = rect.left + rect.width / 2;
    } else {
      top  = rect.top - gap;
      left = rect.left + rect.width / 2;
    }

    // Clamp horizontally for above/below so the centered popover doesn't go off-screen
    if (placement === "above" || placement === "below") {
      const halfW = width / 2;
      const minLeft = halfW + 16;
      const maxLeft = vw - halfW - 16;
      if (left < minLeft) left = minLeft;
      if (left > maxLeft) left = maxLeft;
    }

    setCoords({ top, left, placement });

    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setMounted(true);
    requestAnimationFrame(() => setVisible(true));
  }

  function closePreview() {
    setVisible(false);
    closeTimer.current = setTimeout(() => setMounted(false), 180);
  }

  useEffect(() => {
    if (!mounted) return;
    const handler = () => closePreview();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [mounted]);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const baseTranslate = !coords ? "" :
    coords.placement === "right" ? "translateY(-50%)"        :
    coords.placement === "left"  ? "translate(-100%, -50%)"  :
    coords.placement === "above" ? "translate(-50%, -100%)"  :
                                   "translate(-50%, 0)";

  const transformOrigin = !coords ? "center" :
    coords.placement === "right" ? "left center"   :
    coords.placement === "left"  ? "right center"  :
    coords.placement === "above" ? "center bottom" :
                                   "center top";

  // Arrow — 12px square, 2px gold borders, ivory fill matching popover
  const arrowStyle: CSSProperties | null = !coords ? null :
    coords.placement === "right" ? {
      left: 0, top: "50%",
      transform: "translate(-50%, -50%) rotate(45deg)",
      borderLeft:   "2px solid var(--color-gold-300)",
      borderBottom: "2px solid var(--color-gold-300)",
    } :
    coords.placement === "left" ? {
      right: 0, top: "50%",
      transform: "translate(50%, -50%) rotate(45deg)",
      borderTop:   "2px solid var(--color-gold-300)",
      borderRight: "2px solid var(--color-gold-300)",
    } :
    coords.placement === "above" ? {
      left: "50%", bottom: 0,
      transform: "translate(-50%, 50%) rotate(45deg)",
      borderRight:  "2px solid var(--color-gold-300)",
      borderBottom: "2px solid var(--color-gold-300)",
    } : {
      left: "50%", top: 0,
      transform: "translate(-50%, -50%) rotate(45deg)",
      borderTop:  "2px solid var(--color-gold-300)",
      borderLeft: "2px solid var(--color-gold-300)",
    };

  return (
    <>
      <div
        ref={wrapRef}
        onMouseEnter={openPreview}
        onMouseLeave={closePreview}
        onFocus={openPreview}
        onBlur={closePreview}
      >
        {children}
      </div>
      {mounted && coords && typeof document !== "undefined" && createPortal(
        <div
          className="fixed pointer-events-none"
          style={{
            zIndex: Z.popover,
            top: coords.top,
            left: coords.left,
            width,
            transform: `${baseTranslate} scale(${visible ? 1 : 0.95})`,
            transformOrigin,
            opacity: visible ? 1 : 0,
            transition: visible
              ? "opacity 180ms ease-out, transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)"
              : "opacity 150ms ease-in,  transform 150ms ease-in",
          }}
          role="tooltip"
        >
          {arrowStyle && (
            <div
              className="absolute bg-ivory-50"
              style={{
                width: "12px",
                height: "12px",
                ...arrowStyle,
              }}
            />
          )}
          {preview}
        </div>,
        document.body
      )}
    </>
  );
}
