"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { pushModal, popModal, modalZ } from "@fa/_lib/zIndex";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  kicker?: string;
  description?: string;
  children: React.ReactNode;
  /** sm | md | lg | xl — controls max width */
  size?: "sm" | "md" | "lg" | "xl";
  /** If true, clicking the backdrop won't close the modal. Use for dangerous actions. */
  disableBackdropClose?: boolean;
}

const SIZES = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
};

export function Modal({
  open,
  onClose,
  title,
  kicker,
  description,
  children,
  size = "md",
  disableBackdropClose = false,
}: ModalProps) {
  const [depth, setDepth] = useState<number | null>(null);

  // Register/unregister with the modal stack so nested modals layer correctly.
  useEffect(() => {
    if (!open) return;
    const myDepth = pushModal();
    setDepth(myDepth);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    // Lock scroll on body AND any element-level scroll container (e.g. AppShell <main>).
    // Each modal saves its own previous values; nested modals correctly stack the lock.
    const targets: HTMLElement[] = [document.body, ...Array.from(document.querySelectorAll<HTMLElement>("main"))];
    const previous = targets.map(el => el.style.overflow);
    targets.forEach(el => { el.style.overflow = "hidden"; });

    document.addEventListener("keydown", onKey);

    return () => {
      popModal();
      setDepth(null);
      document.removeEventListener("keydown", onKey);
      targets.forEach((el, i) => { el.style.overflow = previous[i]; });
    };
  }, [open, onClose]);

  if (!open || depth === null) return null;
  if (typeof document === "undefined") return null;

  const z = modalZ(depth);

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4 animate-in fade-in duration-150"
      style={{ zIndex: z }}
      onClick={() => { if (!disableBackdropClose) onClose(); }}
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-ink-900/45 backdrop-blur-sm" />
      <div
        className={`relative w-full ${SIZES[size]} fa-card p-6 max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1 min-w-0">
            {kicker && (
              <div
                className="fa-mono text-[10px] uppercase text-gold-600 mb-1"
                style={{ letterSpacing: "0.12em" }}
              >
                {kicker}
              </div>
            )}
            {title && <h2 className="fa-display text-2xl text-ink-900">{title}</h2>}
            {description && <p className="text-sm text-ink-600 mt-1">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="fa-btn-ghost p-1.5 -mt-1 -mr-1"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
