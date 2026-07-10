"use client";

import Link from "next/link";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Eye, Pencil, Share2, Check, Copy } from "lucide-react";
import { Z } from "@pcm/_lib/zIndex";

interface QuickActionButtonsProps {
  eventId: string;
  /** If provided, View opens this callback instead of navigating. */
  onView?: () => void;
  /** If provided, Edit opens this callback instead of navigating. */
  onEdit?: () => void;
  /** If provided, an extra Duplicate button opens this callback. */
  onDuplicate?: () => void;
}

export function QuickActionButtons({ eventId, onView, onEdit, onDuplicate }: QuickActionButtonsProps) {
  const [showToast, setShowToast] = useState(false);

  function handleShare(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/marketing/events/${eventId}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        setShowToast(true);
        setTimeout(() => setShowToast(false), 2200);
      }).catch(() => {});
    }
  }

  function callbackHandler(fn: () => void) {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    };
  }

  const buttonClass =
    "w-10 h-10 rounded-full flex items-center justify-center " +
    "bg-ivory-50/90 backdrop-blur-sm border border-gold-200 " +
    "text-gold-500 hover:text-ink-900 hover:bg-gold-100 hover:border-gold-300 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300 " +
    "transition-colors";

  return (
    <>
      <div
        className={
          "absolute bottom-4 right-4 z-10 flex items-center gap-2 " +
          "opacity-0 pointer-events-none " +
          "group-hover:opacity-100 group-hover:pointer-events-auto " +
          "group-focus-within:opacity-100 group-focus-within:pointer-events-auto " +
          "transition-opacity duration-200 ease-out"
        }
      >
        {onView ? (
          <button
            type="button"
            onClick={callbackHandler(onView)}
            className={buttonClass}
            aria-label="View event details"
            title="View details"
          >
            <Eye className="w-4 h-4" />
          </button>
        ) : (
          <Link
            href={`/pcm-system/academy/events/${eventId}`}
            className={buttonClass}
            aria-label="View event details"
            title="View details"
          >
            <Eye className="w-4 h-4" />
          </Link>
        )}
        {onEdit ? (
          <button
            type="button"
            onClick={callbackHandler(onEdit)}
            className={buttonClass}
            aria-label="Edit event"
            title="Edit event"
          >
            <Pencil className="w-4 h-4" />
          </button>
        ) : (
          <Link
            href={`/pcm-system/academy/events/${eventId}`}
            className={buttonClass}
            aria-label="Edit event"
            title="Edit event"
          >
            <Pencil className="w-4 h-4" />
          </Link>
        )}
        {onDuplicate && (
          <button
            type="button"
            onClick={callbackHandler(onDuplicate)}
            className={buttonClass}
            aria-label="Duplicate this event"
            title="Duplicate event — clones sessions + quotas"
          >
            <Copy className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          onClick={handleShare}
          className={buttonClass}
          aria-label="Copy event link"
          title="Copy link"
        >
          <Share2 className="w-4 h-4" />
        </button>
      </div>

      {showToast && typeof document !== "undefined" && createPortal(
        <div
          className="fixed bottom-6 right-6 bg-ink-900 text-ivory-50 px-4 py-2.5 rounded-[10px] flex items-center gap-2.5 fa-toast-in"
          style={{
            zIndex: Z.toast,
            boxShadow: "0 12px 28px -10px rgba(12, 10, 9, 0.45), 0 4px 10px rgba(12, 10, 9, 0.18)",
          }}
          role="status"
          aria-live="polite"
        >
          <Check className="w-4 h-4 text-success" />
          <span
            className="fa-mono text-[11px] uppercase"
            style={{ letterSpacing: "0.1em" }}
          >
            Link copied
          </span>
        </div>,
        document.body
      )}
    </>
  );
}
