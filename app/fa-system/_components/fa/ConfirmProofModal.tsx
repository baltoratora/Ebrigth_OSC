"use client";

import { useState } from "react";
import { Video, ImageUp, Check, AlertCircle } from "lucide-react";
import { Modal } from "@fa/_components/shared/Modal";

/** Client-side compress to a JPEG base64 string (max 1280×720, 80%). Mirrors
 *  the PCM inventory proof upload so payloads stay small. */
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const MAX_W = 1280, MAX_H = 720;
        let width = img.width, height = img.height;
        if (width > height) { if (width > MAX_W) { height *= MAX_W / width; width = MAX_W; } }
        else { if (height > MAX_H) { width *= MAX_H / height; height = MAX_H; } }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d")?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = reject;
      img.src = event.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Editor for an invitation's testing video + proof, opened from the always-
 * visible "Video / Proof" column in SessionInvitesPanel (NOT a popup on confirm —
 * that was easy to skip and forget). Both fields are optional and can be edited
 * any time:
 *   - a link to the student's testing video, and
 *   - an image proving the student completed the testing BEFORE the event.
 * On save the parent uploads any new image to Google Drive and saves both.
 * Marketing then sees the video link + proof image.
 */
export function ConfirmProofModal({
  open, onClose, studentName, onSave, initialVideoLink = "", initialProofUrl = "",
}: {
  open: boolean;
  onClose: () => void;
  studentName: string;
  /** Pre-fill when editing an existing entry. */
  initialVideoLink?: string;
  initialProofUrl?: string;
  /** Saves whatever was provided (video link and/or proof image). Resolves on
   *  success; rejects with a message. */
  onSave: (args: { videoLink: string; base64Data: string | null }) => Promise<void>;
}) {
  const [videoLink, setVideoLink] = useState(initialVideoLink);
  const [preview, setPreview] = useState<string | null>(null);
  const [base64, setBase64] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setVideoLink(""); setPreview(null); setBase64(null); setFileName(null);
    setBusy(false); setError(null);
  }
  function handleClose() { if (!busy) { reset(); onClose(); } }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const data = await compressImage(file);
      setBase64(data);
      setPreview(data);
      setFileName(file.name);
    } catch {
      setError("Couldn't read that image — try another file.");
    }
  }

  async function handleSubmit() {
    const link = videoLink.trim();
    // Nothing to save → just close (adding proof is optional).
    if (!link && !base64) { reset(); onClose(); return; }
    setBusy(true); setError(null);
    try {
      await onSave({ videoLink: link, base64Data: base64 });
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed — please try again.");
      setBusy(false);
    }
  }

  const canSubmit = (videoLink.trim().length > 0 || !!base64) && !busy;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Testing video & proof"
      description={`Add or update the testing video and proof for ${studentName}.`}
      size="lg"
    >
      <div className="space-y-5">
        {error && (
          <div className="flex items-start gap-2 text-sm text-danger bg-danger-soft rounded-md px-3 py-2" role="alert">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Video link */}
        <div>
          <label className="flex items-center gap-1.5 text-sm font-semibold text-ink-800 mb-1.5">
            <Video className="w-4 h-4 text-ink-400" /> Testing video link
          </label>
          <input
            type="url"
            value={videoLink}
            onChange={(e) => setVideoLink(e.target.value)}
            placeholder="https://drive.google.com/…  or  https://youtu.be/…"
            disabled={busy}
            className="fa-input w-full"
          />
          <p className="text-xs text-ink-400 mt-1">Paste a link to the student&apos;s recorded testing/practice video.</p>
        </div>

        {/* Proof upload */}
        <div>
          <label className="flex items-center gap-1.5 text-sm font-semibold text-ink-800 mb-1.5">
            <ImageUp className="w-4 h-4 text-ink-400" /> Proof of testing before the event
          </label>
          {preview ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Proof preview" className="w-24 h-24 object-cover rounded-lg border border-ivory-300" />
              <div className="min-w-0">
                <div className="text-sm text-ink-800 truncate">{fileName}</div>
                <label className="text-xs text-brand-700 hover:underline cursor-pointer">
                  Replace image
                  <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={handleFile} />
                </label>
              </div>
            </div>
          ) : initialProofUrl ? (
            <div className="flex items-center gap-3">
              <a
                href={initialProofUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-brand-700 hover:underline"
              >
                <ImageUp className="w-4 h-4" /> View current proof
              </a>
              <label className="text-xs text-brand-700 hover:underline cursor-pointer">
                Replace image
                <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={handleFile} />
              </label>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-ivory-300 rounded-lg py-6 cursor-pointer hover:border-brand-400 hover:bg-ivory-100 transition-colors">
              <ImageUp className="w-6 h-6 text-ink-300" />
              <span className="text-sm text-ink-500">Click to upload a photo/screenshot</span>
              <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={handleFile} />
            </label>
          )}
          <p className="text-xs text-ink-400 mt-1">Image showing the student completed the testing before joining the event.</p>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-5 mt-5 border-t border-ivory-300">
        <button onClick={handleClose} disabled={busy} className="fa-btn-secondary disabled:opacity-50">Cancel</button>
        <button onClick={handleSubmit} disabled={!canSubmit} className="fa-btn-primary disabled:opacity-50">
          <Check className="w-4 h-4" /> {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}
