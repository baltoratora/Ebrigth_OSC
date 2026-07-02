"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface CheckpointEntry { num: number; at: string }

interface Registration {
  id:            string;
  fullName:      string;
  parentName:    string | null;
  parentPhone:   string | null;
  paymentStatus: string;
  checkpoints?:  CheckpointEntry[];
  registeredAt:  string;
  edition: {
    name:   string;
    theme:  string | null;
    status: string;
  };
}

const TOTAL = 5;

export default function ShowcaseRegisterPage() {
  const params = useParams<{ token: string }>();
  const [reg,     setReg]     = useState<Registration | null>(null);
  const [qr,      setQr]      = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    if (!params?.token) return;
    fetch(`/api/annual-showcase/register/${params.token}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => { setReg(data.participant); setQr(data.qrDataUrl); })
      .catch(() => setError("Registration not found. Please contact your organizer."))
      .finally(() => setLoading(false));
  }, [params?.token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-orange-50 flex items-center justify-center">
        <p className="text-orange-600 font-medium">Loading your registration…</p>
      </div>
    );
  }

  if (error || !reg) {
    return (
      <div className="min-h-screen bg-orange-50 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-gray-400 px-6 py-5 text-center">
            <p className="text-gray-200 text-xs font-medium uppercase tracking-widest mb-1">Ebright Annual Showcase</p>
            <h1 className="text-white font-bold text-lg">Registration Not Found</h1>
          </div>
          <div className="flex flex-col items-center px-6 py-8 gap-4 text-center">
            <div className="w-20 h-20 rounded-full bg-red-50 border-2 border-red-100 flex items-center justify-center text-4xl">
              ❌
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-gray-800">You are not registered yet</p>
              <p className="text-sm text-gray-500">
                This link is invalid or your registration has not been completed.
              </p>
            </div>
            <div className="w-full bg-orange-50 border border-orange-100 rounded-xl p-4 text-left space-y-2">
              <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">What to do</p>
              <ul className="text-sm text-gray-600 space-y-1.5 list-none">
                <li>📞 Contact the event organizer to register</li>
                <li>📧 Check your email for a registration link</li>
                <li>🔗 Make sure you opened the correct link</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const done = (Array.isArray(reg.checkpoints) ? reg.checkpoints : []) as CheckpointEntry[];
  const doneNums = done.map(c => c.num);
  const completedCount = doneNums.length;

  return (
    <div className="min-h-screen bg-orange-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg overflow-hidden print:shadow-none print:border print:border-gray-200">

        {/* Header */}
        <div className="bg-orange-500 px-6 py-5 text-center">
          <p className="text-orange-200 text-xs font-medium uppercase tracking-widest mb-1">Ebright Annual Showcase</p>
          <h1 className="text-white font-bold text-lg leading-tight">{reg.edition.name}</h1>
          {reg.edition.theme && (
            <p className="text-orange-100 text-xs mt-1 italic">"{reg.edition.theme}"</p>
          )}
        </div>

        {/* Registration confirmed banner */}
        <div className="mx-5 mt-4 flex items-center gap-2.5 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <span className="w-7 h-7 rounded-full bg-green-500 text-white flex items-center justify-center text-sm font-bold shrink-0">✓</span>
          <div>
            <p className="text-sm font-bold text-green-800">Registration Confirmed</p>
            <p className="text-xs text-green-600">Your child's spot is secured for this event.</p>
          </div>
        </div>

        {/* QR code */}
        <div className="flex flex-col items-center px-6 py-6 gap-2">
          {qr && (
            <img
              src={qr}
              alt="Registration QR Code"
              className="w-52 h-52 rounded-xl border-4 border-orange-100"
            />
          )}
          <p className="text-xs text-gray-400 mt-1">Show this QR at each checkpoint on event day</p>
        </div>

        {/* Student info */}
        <div className="px-6 pb-4 space-y-3">
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <Row label="Name"       value={reg.fullName} bold />
            {reg.parentName  && <Row label="Parent"    value={reg.parentName} />}
            {reg.parentPhone && <Row label="Contact"   value={reg.parentPhone} />}
            <Row
              label="Registered"
              value={new Date(reg.registeredAt).toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" })}
            />
          </div>

          {/* Checkpoint progress */}
          <div className="bg-orange-50 border border-orange-100 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">Checkpoints</p>
              <span className="text-xs font-bold text-orange-600">{completedCount} / {TOTAL}</span>
            </div>
            <div className="flex items-center justify-center gap-1">
              {Array.from({ length: TOTAL }, (_, i) => {
                const n      = i + 1;
                const isDone = doneNums.includes(n);
                const entry  = done.find(c => c.num === n);
                return (
                  <div key={n} className="flex items-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                        isDone ? "bg-green-500 text-white" : "bg-white border-2 border-gray-200 text-gray-300"
                      }`}>
                        {isDone ? "✓" : n}
                      </div>
                      {isDone && entry && (
                        <span className="text-[8px] text-green-600 leading-none">
                          {new Date(entry.at).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                    </div>
                    {n < TOTAL && (
                      <div className={`w-4 h-0.5 mb-3 ${isDone && doneNums.includes(n + 1) ? "bg-green-400" : "bg-gray-200"}`} />
                    )}
                  </div>
                );
              })}
            </div>
            {completedCount === TOTAL && (
              <p className="text-center text-xs text-green-600 font-semibold mt-2">🎉 All checkpoints completed!</p>
            )}
          </div>

          <button
            onClick={() => window.print()}
            className="w-full mt-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-xl transition-colors print:hidden"
          >
            🖨️ Print / Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-gray-400 shrink-0">{label}</span>
      <span className={`text-sm text-gray-800 text-right ${bold ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}
