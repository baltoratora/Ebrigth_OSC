"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Edition { id: string; name: string; theme: string | null }
type CheckpointEntry = { num: number; at: string };
interface Participant {
  id: string; fullName: string;
  parentName: string | null; parentPhone: string | null;
  checkpoints: CheckpointEntry[];
}
type ScanMode   = "camera" | "search";
type ActionState = "idle" | "loading" | "success" | "already-done" | "skip-error" | "not-found" | "error";

const TOTAL = 5;

function doneNums(p: Participant) {
  return (Array.isArray(p.checkpoints) ? p.checkpoints : []).map(c => c.num);
}
function cpTime(p: Participant, n: number) {
  const e = (Array.isArray(p.checkpoints) ? p.checkpoints : []).find(c => c.num === n);
  return e ? new Date(e.at).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" }) : null;
}

// ─── Checkpoint dots ────────────────────────────────────────────────────────────

function CpDots({ p, current }: { p: Participant; current: number }) {
  const done = doneNums(p);
  return (
    <div className="flex items-center justify-center gap-0">
      {Array.from({ length: TOTAL }, (_, i) => {
        const n = i + 1;
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
            {n < TOTAL && <div className={`w-5 h-0.5 mb-3.5 ${done.includes(n) && done.includes(n+1) ? "bg-green-400" : "bg-gray-200"}`} />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function ShowcaseCheckinPage() {
  const [edition,      setEdition]      = useState<Edition | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState("");

  const [checkpoint,   setCheckpoint]   = useState(1);
  const [mode,         setMode]         = useState<ScanMode>("camera");
  const [found,        setFound]        = useState<Participant | null>(null);
  const [actionState,  setActionState]  = useState<ActionState>("idle");
  const [skipRequired, setSkipRequired] = useState<number | null>(null);
  const [nameSearch,   setNameSearch]   = useState("");

  // Camera
  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const rafRef     = useRef<number | null>(null);
  const [camActive,  setCamActive]  = useState(false);
  const [camError,   setCamError]   = useState("");
  const [lastScan,   setLastScan]   = useState(""); // debounce repeated scans

  // ─── Load ─────────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/annual-showcase/public/checkin")
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { setEdition(d.edition); setParticipants(d.participants); })
      .catch(() => setLoadError("Could not load. Check your connection."))
      .finally(() => setLoading(false));
  }, []);

  // ─── Camera / jsQR ────────────────────────────────────────────────────────────

  const handleQrResult = useCallback((raw: string) => {
    const id = raw.trim().replace(/.*\/showcase-register\//, "");
    if (id === lastScan) return; // debounce same QR
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

  async function startCamera() {
    setCamError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      streamRef.current = stream;
      setCamActive(true);
      rafRef.current = requestAnimationFrame(scanLoop);
    } catch {
      setCamError("Camera permission denied. Use name search below.");
    }
  }

  function stopCamera() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCamActive(false);
  }

  useEffect(() => () => { stopCamera(); }, []);

  // When switching to camera mode, auto-start camera
  useEffect(() => {
    if (mode === "camera" && !camActive) startCamera();
    if (mode !== "camera") stopCamera();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // ─── Check-in ─────────────────────────────────────────────────────────────────

  async function checkIn(undo = false) {
    if (!found) return;
    setActionState("loading");
    try {
      const res = await fetch(`/api/annual-showcase/public/checkin/${found.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkpoint, undo }),
      });
      const data = await res.json();
      if (res.status === 422) { setActionState("skip-error"); setSkipRequired(data.requiredCheckpoint); return; }
      if (res.status === 400)  { setActionState("already-done"); return; }
      if (!res.ok)             { setActionState("error"); return; }

      setParticipants(prev => prev.map(p => p.id === found.id ? { ...p, checkpoints: data.checkpoints } : p));
      setFound(prev => prev ? { ...prev, checkpoints: data.checkpoints } : prev);
      setActionState("success");
      if (!undo) {
        setTimeout(() => { setFound(null); setActionState("idle"); setLastScan(""); }, 2200);
      }
    } catch { setActionState("error"); }
  }

  // ─── Name search ──────────────────────────────────────────────────────────────

  const searchResults = useMemo(() => {
    const q = nameSearch.trim().toLowerCase();
    if (q.length < 2) return [];
    return participants.filter(p =>
      p.fullName.toLowerCase().includes(q) || (p.parentName?.toLowerCase().includes(q) ?? false),
    ).slice(0, 8);
  }, [participants, nameSearch]);

  // ─── CP stats for header ──────────────────────────────────────────────────────

  const cpCounts = Array.from({ length: TOTAL }, (_, i) => {
    const n = i + 1;
    return { n, count: participants.filter(p => doneNums(p).includes(n)).length };
  });

  // ─── Loading / error ──────────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen bg-indigo-50 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  );

  if (loadError || !edition) return (
    <div className="min-h-screen bg-red-50 flex flex-col items-center justify-center gap-4 p-6">
      <span className="text-5xl">❌</span>
      <p className="text-lg font-bold text-gray-800">Check-In Unavailable</p>
      <p className="text-sm text-gray-500">{loadError || "No active edition."}</p>
      <button onClick={() => window.location.reload()} className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold">Retry</button>
    </div>
  );

  const isAlreadyDone = found ? doneNums(found).includes(checkpoint) : false;

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center py-6 px-4">
      <div className="w-full max-w-sm">

        {/* ── Card ── */}
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden">

          {/* Header */}
          <div className="bg-indigo-700 px-5 pt-5 pb-4">
            <p className="text-indigo-300 text-[10px] font-semibold uppercase tracking-widest">Ebright Annual Showcase</p>
            <h1 className="text-white font-bold text-lg leading-tight mt-0.5">{edition.name}</h1>
            {edition.theme && <p className="text-indigo-200 text-xs italic mt-0.5">"{edition.theme}"</p>}

            {/* CP counter row */}
            <div className="flex gap-1.5 mt-3">
              {cpCounts.map(({ n, count }) => (
                <div key={n} className={`flex-1 rounded-lg py-1.5 text-center ${n === checkpoint ? "bg-indigo-500" : "bg-indigo-800"}`}>
                  <p className="text-[9px] text-indigo-300 leading-none">CP{n}</p>
                  <p className="text-sm font-bold text-white leading-none mt-0.5">{count}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Checkpoint selector */}
          <div className="px-4 pt-4 pb-2">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Select your checkpoint</p>
            <div className="flex gap-1.5">
              {Array.from({ length: TOTAL }, (_, i) => {
                const n = i + 1;
                return (
                  <button key={n} onClick={() => { setCheckpoint(n); setFound(null); setActionState("idle"); }}
                    className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${n === checkpoint ? "bg-indigo-600 text-white shadow-sm" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                    {n}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mode tabs */}
          <div className="px-4 pt-2 pb-3 flex gap-2">
            <button onClick={() => { setMode("camera"); setFound(null); setActionState("idle"); setNameSearch(""); }}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${mode === "camera" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-500"}`}>
              📷 Scan QR
            </button>
            <button onClick={() => { setMode("search"); setFound(null); setActionState("idle"); }}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${mode === "search" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-500"}`}>
              🔍 Search Name
            </button>
          </div>

          {/* ── Camera scanner ── */}
          {mode === "camera" && (
            <div className="px-4 pb-4 space-y-3">
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-square">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                {/* Canvas for jsQR processing (hidden) */}
                <canvas ref={canvasRef} className="hidden" />
                {/* Scan guide overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="relative w-52 h-52">
                    {/* Corner brackets */}
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg" />
                    {/* Scan line animation */}
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
                  <p className="absolute bottom-3 left-0 right-0 text-center text-white text-xs font-medium drop-shadow">
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

          {/* ── Name search ── */}
          {mode === "search" && (
            <div className="px-4 pb-4 space-y-2">
              <input autoFocus value={nameSearch} onChange={e => setNameSearch(e.target.value)}
                placeholder="Type student or parent name…"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              {searchResults.map(p => {
                const done = doneNums(p);
                return (
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
                      {Array.from({ length: TOTAL }, (_, i) => (
                        <div key={i} className={`w-2 h-2 rounded-full ${done.includes(i+1) ? "bg-green-500" : "bg-gray-200"}`} />
                      ))}
                    </div>
                  </button>
                );
              })}
              {nameSearch.length >= 2 && searchResults.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-3">No students match "{nameSearch}"</p>
              )}
            </div>
          )}

          {/* ── Student card ── */}
          {found && (
            <div className={`mx-4 mb-4 rounded-2xl border-2 p-4 space-y-3 transition-all ${
              actionState === "success"     ? "border-green-400 bg-green-50/40"
              : actionState === "skip-error"  ? "border-yellow-400 bg-yellow-50/30"
              : actionState === "already-done"? "border-blue-300 bg-blue-50/20"
              : "border-indigo-200 bg-indigo-50/20"
            }`}>
              {/* Info */}
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-indigo-100 text-indigo-700 text-base font-bold flex items-center justify-center shrink-0">
                  {found.fullName.charAt(0)}
                </div>
                <div>
                  <p className="font-bold text-gray-900">{found.fullName}</p>
                  {found.parentName && <p className="text-xs text-gray-500">{found.parentName}{found.parentPhone ? ` · ${found.parentPhone}` : ""}</p>}
                </div>
              </div>

              {/* CP progress */}
              <CpDots p={found} current={checkpoint} />

              {/* Actions */}
              {actionState === "loading" && (
                <div className="flex items-center justify-center gap-2 py-2">
                  <div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                  <span className="text-sm text-indigo-600">Checking in…</span>
                </div>
              )}

              {actionState === "success" && (
                <div className="text-center py-1 space-y-1">
                  <p className="text-2xl">✅</p>
                  <p className="font-bold text-green-700 text-sm">Checked in at Checkpoint {checkpoint}!</p>
                  <button onClick={() => checkIn(true)} className="text-xs text-gray-400 underline">Undo</button>
                </div>
              )}

              {actionState === "skip-error" && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center">
                  <p className="text-sm font-bold text-yellow-800">⚠ Checkpoint skipped!</p>
                  <p className="text-xs text-yellow-700 mt-0.5">Must complete <strong>Checkpoint {skipRequired}</strong> first.</p>
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
                      className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white text-base font-bold rounded-xl shadow-sm active:scale-95 transition-all">
                      ✓ Check In at Checkpoint {checkpoint}
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

          {/* Empty state */}
          {!found && actionState === "idle" && mode === "search" && (
            <div className="px-4 pb-6 text-center text-gray-300 space-y-1">
              <p className="text-sm text-gray-400">Search a student name above</p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          {participants.length} student{participants.length !== 1 ? "s" : ""} registered · Checkpoint {checkpoint} of {TOTAL}
        </p>
      </div>

      {/* Hidden scan animation keyframe */}
      <style>{`
        @keyframes scan {
          0%,100% { transform: translateY(-60px); opacity:0.6; }
          50%      { transform: translateY(60px);  opacity:1;   }
        }
      `}</style>
    </div>
  );
}
