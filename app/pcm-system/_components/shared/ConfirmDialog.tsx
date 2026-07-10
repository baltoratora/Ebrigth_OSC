"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  /** If provided, user must type this exact string (case-sensitive) to enable the confirm button. */
  confirmText?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Tone of the primary action button */
  danger?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmText,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const canConfirm = confirmText ? typed === confirmText : true;

  function handleConfirm() {
    if (!canConfirm) return;
    onConfirm();
    setTyped("");
  }

  function handleClose() {
    setTyped("");
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} size="sm" disableBackdropClose={!!confirmText}>
      <div className="flex gap-4 mb-4">
        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center border ${danger ? "bg-danger-soft text-danger border-danger/20" : "bg-ivory-100 text-gold-500 border-gold-200"}`}>
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="fa-display text-xl text-ink-900">{title}</h3>
          <p className="text-sm text-ink-600 mt-1">{description}</p>
        </div>
      </div>

      {confirmText && (
        <div className="mb-4">
          <label className="fa-label">
            Type <span className="fa-mono text-ink-900">{confirmText}</span> to confirm
          </label>
          <input
            className="fa-input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={confirmText}
            autoFocus
          />
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button onClick={handleClose} className="fa-btn-secondary">{cancelLabel}</button>
        <button
          onClick={handleConfirm}
          disabled={!canConfirm}
          className={danger ? "fa-btn-danger" : "fa-btn-primary"}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
