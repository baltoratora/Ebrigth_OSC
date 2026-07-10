"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { useActiveEdition } from "@/app/hooks/useActiveEdition";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Edition { id: string; name: string }

type CheckpointEntry = { num: number; at: string };
interface Participant {
  id:          string;
  fullName:    string;
  parentName:  string | null;
  parentPhone: string | null;
  checkpoints?: CheckpointEntry[];
}

type ScanMode    = "camera" | "search";
type ActionState = "idle" | "loading" | "success" | "already-done" | "skip-error" | "not-found" | "error";

const TOTAL_CP = 5;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function doneNums(p: Participant) {
  return (Array.isArray(p.checkpoints) ? p.checkpoints : []).map(c => c.num);
}
function cpTime(p: Participant, n: number) {
  const e = (Array.isArray(p.checkpoints) ? p.checkpoints : []).find(c => c.num === n);
  return e ? new Date(e.at).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" }) : null;
}

// ─── CP dots ──────────────────────────────────────────────────────────────────

function CpDots({ p, current }: { p: Participant; current: number }) {
  const done = doneNums(p);
  return (
    <div className="flex items-center justify-center gap-0">
      {Array.from({ length: TOTAL_CP }, (_, i) => {
        const n      = i + 1;
        const isDone = done.includes(n);
        const isCur  = n === current;
        return (
          <div key={n} className="flex items-center">
            <div className="flex flex-col items-center gap-0.5">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                isDone  ? "bg-green-500 border-green-500 text-white"
                : isCur ? "bg-indigo-600 border-indigo-600 text-white ring-2 ring-indigo-300"
                        : "bg-white border-gray-300 text-gray-400"
              }`}>
                {isDone ? "✓" : n}
              </div>
              <span className={`text-[9px] font-semibold ${isDone ? "text-green-600" : isCur ? "text-indigo-600" : "text-gray-400"}`}>
                {isDone && cpTime(p, n) ? cpTime(p, n) : `CP${n}`}
              </span>
            </div>
            {n < TOTAL_CP && (
              <div className={`w-5 h-0.5 mb-3.5 ${done.includes(n) && done.includes(n + 1) ? "bg-green-400" : "bg-gray-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function SmallDots({ checkpoints }: { checkpoints?: CheckpointEntry[] }) {
  const done = (Array.isArray(checkpoints) ? checkpoints : []).map(c => c.num);
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: TOTAL_CP }, (_, i) => {
        const n = i + 1;
        return (
          <div key={n} className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${
            done.includes(n) ? "bg-green-500 text-white" : "bg-gray-100 text-gray-300 border border-gray-200"
          }`}>{n}</div>
        );
      })}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function RegistrationAreaPage() {
  const { edition: rawEdition, isLoading } = useActiveEdition();
  const edition = rawEdition as unknown as Edition | null;

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [dataLoading,  setDataLoading]  = useState(false);

  // Staff card QR
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied,    setCopied]    = useState(false);
  const checkinUrl = typeof window !== "undefined"
    ? `${window.location.origin}/showcase-checkin`
    : "/showcase-checkin";

  // Scanner state
  const [checkpoint,   setCheckpoint]   = useState(1);
  const [mode,         setMode]         = useState<ScanMode>("camera");
  const [found,        setFound]        = useState<Participant | null>(null);
  const [actionState,  setActionState]  = useState<ActionState>("idle");
  const [skipRequired, setSkipRequired] = useState<number | null>(null);
  const [nameSearch,   setNameSearch]   = useState("");
  const [lastScan,     setLastScan]     = useState("");

  // Camera refs
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef    = useRef<number | null>(null);
  const [camActive, setCamActive] = useState(false);
  const [camError,  setCamError]  = useState("");

  // ─── Load participants ────────────────────────────────────────────────────────

  const loadParticipants = useCallback(async (editionId: string) => {
    setDataLoading(true);
    try {
      const res  = await fetch(`/api/annual-showcase/editions/${editionId}/participants?limit=500`);
      const data = await res.json();
      setParticipants(data.participants ?? []);
    } catch {
      toast.error("Failed to load participants");
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!edition) return;
    loadParticipants(edition.id);
  }, [edition?.id, loadParticipants]);

  // ─── Staff card QR ───────────────────────────────────────────────────────────

  useEffect(() => {
    import("qrcode").then(QRCode => {
      QRCode.default.toDataURL(checkinUrl, {
        width: 220, margin: 2,
        color: { dark: "#1f2937", light: "#ffffff" },
      }).then(setQrDataUrl);
    });
  }, [checkinUrl]);

  // ─── Camera / jsQR ───────────────────────────────────────────────────────────

  const handleQrResult = useCallback((raw: string) => {
    const id = raw.trim().replace(/.*\/showcase-register\//, "");
    if (id === lastScan) return;
    setLastScan(id);
    setTimeout(() => setLastScan(""), 3000);
    const match = participants.find(p => p.id === id);
    if (!match) { setFound(null); setActionState("not-found"); return; }
    setFound(match);
    setActionState("idle");
    setSkipRequired(null);
  }, [participants, lastScan]);

  const scanLoop = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !streamRef.current) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        import("jsqr").then(({ default: jsQR }) => {
          const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
          if (code?.data) { handleQrResult(code.data); return; }
          rafRef.current = requestAnimationFrame(scanLoop);
        });
        return;
      }
    }
    rafRef.current = requestAnimationFrame(scanLoop);
  }, [handleQrResult]);

  function startCamera() {
    setCamError("");
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } })
      .then(stream => {
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
        streamRef.current = stream;
        setCamActive(true);
        rafRef.current = requestAnimationFrame(scanLoop);
      })
      .catch(() => setCamError("Camera permission denied. Use Search Name instead."));
  }

  function stopCamera() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCamActive(false);
  }

  useEffect(() => () => { stopCamera(); }, []);

  useEffect(() => {
    if (mode === "camera" && !camActive) startCamera();
    if (mode !== "camera") stopCamera();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // ─── Check-in ────────────────────────────────────────────────────────────────

  async function checkIn(undo = false) {
    if (!found) return;
    setActionState("loading");
    try {
      const res  = await fetch(`/api/annual-showcase/public/checkin/${found.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkpoint, undo }),
      });
      const data = await res.json();
      if (res.status === 422) { setActionState("skip-error"); setSkipRequired(data.requiredCheckpoint); return; }
      if (res.status === 400)  { setActionState("already-done"); return; }
      if (!res.ok)             { setActionState("error"); return; }
      setParticipants(prev => prev.map(p => p.id === found.id ? { ...p, checkpoints: data.checkpoints } : p));
      setFound(prev  => prev ? { ...prev, checkpoints: data.checkpoints } : prev);
      setActionState("success");
      if (!undo) setTimeout(() => { setFound(null); setActionState("idle"); setLastScan(""); }, 2200);
    } catch { setActionState("error"); }
  }

  // ─── Search ──────────────────────────────────────────────────────────────────

  const searchResults = useMemo(() => {
    const q = nameSearch.trim().toLowerCase();
    if (q.length < 2) return [];
    return participants.filter(p =>
      p.fullName.toLowerCase().includes(q) || (p.parentName?.toLowerCase().includes(q) ?? false),
    ).slice(0, 8);
  }, [participants, nameSearch]);

  // ─── Derived stats ────────────────────────────────────────────────────────────

  const total   = participants.length;
  const cpStats = Array.from({ length: TOTAL_CP }, (_, i) => {
    const n     = i + 1;
    const count = participants.filter(p =>
      (Array.isArray(p.checkpoints) ? p.checkpoints : []).some(c => c.num === n),
    ).length;
    return { n, count };
  });

  const sorted = [...participants].sort((a, b) => {
    const aLen = (Array.isArray(a.checkpoints) ? a.checkpoints : []).length;
    const bLen = (Array.isArray(b.checkpoints) ? b.checkpoints : []).length;
    return bLen - aLen;
  });

  const isAlreadyDone = found ? doneNums(found).includes(checkpoint) : false;

  // ─── Guards ───────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!edition) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px] gap-3">
        <span className="text-5xl">🚪</span>
        <h2 className="text-xl font-semibold text-gray-800">No active edition</h2>
        <p className="text-sm text-gray-500 text-center max-w-sm">
          Select an active edition using the edition switcher in the header.
        </p>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <style>{`
        @keyframes scan {
          0%,100% { transform: translateY(-60px); opacity:0.6; }
          50%      { transform: translateY(60px);  opacity:1;   }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-3xl sm:text-4xl">🚪</span>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Registration Area</h1>
          <p className="text-sm text-gray-500">{edition.name}</p>
        </div>
      </div>

      {/* ── Main content: scanner + staff card side-by-side ── */}
      <div className="flex flex-col xl:flex-row gap-6 items-start">

        {/* ── QR Scanner panel ── */}
        <div className="w-full xl:w-80 shrink-0 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Panel header with CP selector */}
          <div className="bg-indigo-700 px-4 pt-4 pb-3">
            <p className="text-indigo-300 text-[10px] font-semibold uppercase tracking-widest mb-1">Student Check-In</p>
            {/* CP counts */}
            <div className="flex gap-1 mb-3">
              {cpStats.map(({ n, count }) => (
                <div key={n} className={`flex-1 rounded-lg py-1.5 text-center cursor-pointer transition-colors ${n === checkpoint ? "bg-indigo-500" : "bg-indigo-800 hover:bg-indigo-600"}`}
                  onClick={() => { setCheckpoint(n); setFound(null); setActionState("idle"); }}>
                  <p className="text-[9px] text-indigo-300 leading-none">CP{n}</p>
                  <p className="text-sm font-bold text-white leading-none mt-0.5">{count}</p>
                </div>
              ))}
            </div>
            {/* Checkpoint buttons */}
            <p className="text-[10px] font-semibold text-indigo-300 uppercase tracking-wide mb-1.5">Select checkpoint</p>
            <div className="flex gap-1">
              {Array.from({ length: TOTAL_CP }, (_, i) => {
                const n = i + 1;
                return (
                  <button key={n} onClick={() => { setCheckpoint(n); setFound(null); setActionState("idle"); }}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${n === checkpoint ? "bg-white text-indigo-700 shadow" : "bg-indigo-800 text-indigo-200 hover:bg-indigo-600"}`}>
                    {n}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mode tabs */}
          <div className="px-4 pt-3 pb-2 flex gap-2">
            <button onClick={() => { setMode("camera"); setFound(null); setActionState("idle"); setNameSearch(""); }}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${mode === "camera" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
              📷 Scan QR
            </button>
            <button onClick={() => { setMode("search"); setFound(null); setActionState("idle"); }}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${mode === "search" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
              🔍 Search Name
            </button>
          </div>

          {/* Camera scanner */}
          {mode === "camera" && (
            <div className="px-4 pb-4 space-y-3">
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-square">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                <canvas ref={canvasRef} className="hidden" />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="relative w-44 h-44">
                    <div className="absolute top-0 left-0 w-7 h-7 border-t-4 border-l-4 border-white rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-7 h-7 border-t-4 border-r-4 border-white rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-7 h-7 border-b-4 border-l-4 border-white rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-7 h-7 border-b-4 border-r-4 border-white rounded-br-lg" />
                    {camActive && (
                      <div className="absolute left-0 right-0 h-0.5 bg-indigo-400/80 animate-[scan_2s_ease-in-out_infinite]" style={{ top: "50%" }} />
                    )}
                  </div>
                </div>
                {!camActive && !camError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <div className="w-8 h-8 border-4 border-indigo-300 border-t-white rounded-full animate-spin" />
                  </div>
                )}
                {camActive && (
                  <p className="absolute bottom-2 left-0 right-0 text-center text-white text-xs font-medium drop-shadow">
                    Point at parent's QR code
                  </p>
                )}
              </div>
              {camError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                  <p className="text-sm text-red-600">{camError}</p>
                  <button onClick={startCamera} className="text-xs text-indigo-500 underline mt-1">Try again</button>
                </div>
              )}
              {actionState === "not-found" && (
                <p className="text-center text-sm text-red-500 font-medium bg-red-50 rounded-xl py-2">❌ QR not recognised — try again</p>
              )}
            </div>
          )}

          {/* Name search */}
          {mode === "search" && (
            <div className="px-4 pb-4 space-y-2">
              <input autoFocus value={nameSearch} onChange={e => setNameSearch(e.target.value)}
                placeholder="Type student or parent name…"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              {searchResults.map(p => (
                <button key={p.id} onClick={() => { setFound(p); setActionState("idle"); setSkipRequired(null); setNameSearch(""); }}
                  className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-indigo-50 border border-transparent hover:border-indigo-100 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0">
                    {p.fullName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{p.fullName}</p>
                    {p.parentName && <p className="text-xs text-gray-400 truncate">{p.parentName}</p>}
                  </div>
                  <div className="flex gap-0.5 shrink-0">
                    {Array.from({ length: TOTAL_CP }, (_, i) => (
                      <div key={i} className={`w-2 h-2 rounded-full ${doneNums(p).includes(i + 1) ? "bg-green-500" : "bg-gray-200"}`} />
                    ))}
                  </div>
                </button>
              ))}
              {nameSearch.length >= 2 && searchResults.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-3">No students match "{nameSearch}"</p>
              )}
              {!nameSearch && (
                <p className="text-sm text-gray-400 text-center py-3">Type 2+ characters to search</p>
              )}
            </div>
          )}

          {/* Student card */}
          {found && (
            <div className={`mx-4 mb-4 rounded-2xl border-2 p-4 space-y-3 transition-all ${
              actionState === "success"      ? "border-green-400 bg-green-50/40"
              : actionState === "skip-error"   ? "border-yellow-400 bg-yellow-50/30"
              : actionState === "already-done" ? "border-blue-300 bg-blue-50/20"
              : "border-indigo-200 bg-indigo-50/20"
            }`}>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-indigo-100 text-indigo-700 text-base font-bold flex items-center justify-center shrink-0">
                  {found.fullName.charAt(0)}
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-sm">{found.fullName}</p>
                  {found.parentName && <p className="text-xs text-gray-500">{found.parentName}{found.parentPhone ? ` · ${found.parentPhone}` : ""}</p>}
                </div>
              </div>

              <CpDots p={found} current={checkpoint} />

              {actionState === "loading" && (
                <div className="flex items-center justify-center gap-2 py-2">
                  <div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                  <span className="text-sm text-indigo-600">Checking in…</span>
                </div>
              )}
              {actionState === "success" && (
                <div className="text-center py-1 space-y-1">
                  <p className="text-2xl">✅</p>
                  <p className="font-bold text-green-700 text-sm">Checked in at CP{checkpoint}!</p>
                  <button onClick={() => checkIn(true)} className="text-xs text-gray-400 underline">Undo</button>
                </div>
              )}
              {actionState === "skip-error" && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center">
                  <p className="text-sm font-bold text-yellow-800">⚠ Checkpoint skipped!</p>
                  <p className="text-xs text-yellow-700 mt-0.5">Must complete <strong>CP{skipRequired}</strong> first.</p>
                </div>
              )}
              {actionState === "already-done" && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                  <p className="text-sm font-bold text-blue-800">Already checked in</p>
                  <p className="text-xs text-blue-500 mt-0.5">Done at {cpTime(found, checkpoint)}</p>
                  <button onClick={() => checkIn(true)} className="text-xs text-blue-400 underline mt-1">Undo</button>
                </div>
              )}
              {actionState === "error" && (
                <p className="text-center text-sm text-red-500 font-medium">Something went wrong — try again</p>
              )}
              {(actionState === "idle" || actionState === "error") && (
                <div className="space-y-2">
                  {isAlreadyDone ? (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                      <p className="text-sm font-bold text-green-700">✓ Already done CP{checkpoint}</p>
                      <button onClick={() => checkIn(true)} className="text-xs text-gray-400 underline mt-1">Undo</button>
                    </div>
                  ) : (
                    <button onClick={() => checkIn()}
                      className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-sm active:scale-95 transition-all">
                      ✓ Check In at CP{checkpoint}
                    </button>
                  )}
                  <button onClick={() => { setFound(null); setActionState("idle"); setLastScan(""); }}
                    className="w-full py-2 text-xs text-gray-400 hover:text-gray-600">
                    Cancel / scan next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right column: staff card + stats + table ── */}
        <div className="flex-1 space-y-6 min-w-0">

          {/* Staff card for sharing */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Share Check-In Link with Staff</p>
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Staff check-in QR" className="w-28 h-28 rounded-xl border-4 border-indigo-50 shrink-0" />
              ) : (
                <div className="w-28 h-28 rounded-xl bg-gray-50 border-4 border-indigo-50 flex items-center justify-center shrink-0">
                  <div className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                </div>
              )}
              <div className="flex-1 space-y-3">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-gray-400 mb-0.5">Staff scanner URL</p>
                  <p className="text-xs font-mono text-indigo-700 break-all">{checkinUrl}</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => { navigator.clipboard.writeText(checkinUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${copied ? "bg-green-600 text-white" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}>
                    {copied ? "✓ Copied!" : "📋 Copy URL"}
                  </button>
                  <a href={checkinUrl} target="_blank" rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">
                    Open ↗
                  </a>
                  <button onClick={() => window.print()}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors print:hidden">
                    🖨️ Print
                  </button>
                </div>
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <strong>Order rule:</strong> Students must go 1 → 2 → 3 → 4 → 5. Skipping is blocked.
                </p>
              </div>
            </div>
          </div>

          {/* Live checkpoint stats */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Live Checkpoint Progress</p>
            {dataLoading ? (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl min-w-[100px] flex-1" />)}
              </div>
            ) : (
              <div className="grid grid-cols-5 gap-3 overflow-x-auto">
                {cpStats.map(({ n, count }) => {
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                  return (
                    <div key={n} className="bg-white border border-gray-100 rounded-xl p-3 text-center shadow-sm space-y-2">
                      <p className="text-xs font-semibold text-gray-500">CP {n}</p>
                      <p className="text-2xl font-extrabold text-indigo-700">{count}</p>
                      <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-[10px] text-gray-400">{pct}%</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Student progress table */}
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Student Progress</h3>
              <span className="text-xs text-gray-400">{total} students</span>
            </div>
            {dataLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
              </div>
            ) : sorted.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">No students registered yet</div>
            ) : (
              <div className="overflow-x-auto"><table className="w-full text-sm min-w-[360px]">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">#</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Name</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Checkpoints</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((p, idx) => {
                    const done    = (Array.isArray(p.checkpoints) ? p.checkpoints : []).length;
                    const allDone = done === TOTAL_CP;
                    return (
                      <tr key={p.id} className={`border-b border-gray-50 ${allDone ? "bg-green-50/30" : ""}`}>
                        <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800">{p.fullName}</p>
                          {p.parentName && <p className="text-xs text-gray-400">{p.parentName}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <SmallDots checkpoints={p.checkpoints} />
                            <span className="text-[10px] text-gray-400">{done}/{TOTAL_CP}</span>
                            {allDone && <span className="text-[10px] bg-green-100 text-green-700 font-semibold px-1.5 py-0.5 rounded-full">Complete</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
