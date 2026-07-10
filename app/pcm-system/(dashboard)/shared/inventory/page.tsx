"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { AppShell } from "@pcm/_components/shared/AppShell";
import { useCurrentUser } from "@pcm/_hooks/useCurrentUser";
import { BRANCHES, BranchCode, allowedBranchCodes } from "@pcm/_types";
import { Gift, Search, ExternalLink, Check, Upload } from "lucide-react";

interface InvItem {
  invitationId: string;
  studentId: string;
  studentName: string;
  branch: string;
  grade: number | null;
  coachName: string | null;
  eventId: string;
  eventName: string;
  sessionDate: string | null;
  paidAt: string | null;
  academyDistributed: boolean;
  giftGiven: boolean;
  proofLink: string | null;
}

const branchName = (code: string) => BRANCHES.find(b => b.code === code)?.name ?? code;

/** Client-side compress to a JPEG base64 string (max 1280×720, 80%). */
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const MAX_W = 1280, MAX_H = 720;
        let { width, height } = img;
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

export default function InventoryPage() {
  const user = useCurrentUser();
  const isAcademy = user?.role === "MKT";
  const isBM = user?.role === "BM";
  const isRM = user?.role === "RM";
  // Region boundary (null = all branches). RM sees only their region.
  const allowed = allowedBranchCodes(user);
  // RM has full control in their region: can both distribute (academy side) and
  // mark given + upload proof (branch side). Sees the branch column + filter.
  const showAllBranches = isAcademy || isRM;
  const canEditDistributed = isAcademy || isRM;
  const canEditGiven = isBM || isRM;

  const [items, setItems] = useState<InvItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchFilter, setBranchFilter] = useState<BranchCode | "all">("all");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  // BM is locked to their own branch; academy can pick any / all.
  const effectiveBranch: BranchCode | "all" = isBM ? (user?.branch ?? "all") : branchFilter;

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (effectiveBranch !== "all") p.set("branch", String(effectiveBranch));
    try {
      const res = await fetch(`/api/pcm/inventory?${p.toString()}`, { cache: "no-store" });
      const d = res.ok ? await res.json() : { items: [] };
      setItems(d.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [effectiveBranch]);

  useEffect(() => { if (user) void load(); }, [user, load]);

  async function patch(id: string, body: Partial<InvItem>) {
    setItems(prev => prev.map(it => (it.invitationId === id ? { ...it, ...body } : it)));
    try {
      await fetch(`/api/pcm/inventory/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch { /* optimistic; next load reconciles */ }
  }

  async function uploadProof(it: InvItem, file: File) {
    setUploadingId(it.invitationId);
    try {
      const base64Data = await compressImage(file);
      const res = await fetch(`/api/pcm/inventory/${encodeURIComponent(it.invitationId)}/proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64Data, studentId: it.studentId, branch: it.branch }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { alert(d.error || "Upload failed"); return; }
      setItems(prev => prev.map(x => (x.invitationId === it.invitationId ? { ...x, proofLink: d.proofLink } : x)));
    } catch {
      alert("Could not process the image.");
    } finally {
      setUploadingId(null);
    }
  }

  // Distinct events present in the loaded list, for the event dropdown.
  const eventOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of items) m.set(it.eventId, it.eventName);
    return Array.from(m, ([id, name]) => ({ id, name }));
  }, [items]);

  const visible = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(it =>
      (!allowed || allowed.includes(it.branch)) && // region boundary
      (eventFilter === "all" || it.eventId === eventFilter) &&
      (!q || it.studentName.toLowerCase().includes(q) || it.branch.toLowerCase().includes(q))
    );
  }, [items, search, eventFilter, allowed]);

  const given = visible.filter(i => i.giftGiven).length;

  if (!user) return null;

  return (
    <AppShell>
      <div className="flex items-end justify-between gap-6 mb-1">
        <div>
          <div className="fa-mono text-[10px] uppercase text-violet-600 mb-2" style={{ letterSpacing: "0.12em" }}>
            PCM {isBM ? `· ${branchName(String(effectiveBranch))}` : isRM ? `· Region ${user.region}` : "Academy"}
          </div>
          <h1 className="fa-display-italic text-6xl text-ink-900 flex items-center gap-3">
            <Gift className="w-10 h-10 text-violet-500" /> Renewal Gifts
          </h1>
        </div>
      </div>
      <p className="text-sm text-ink-500 mb-5">
        Renewal students who paid within 3 days of their session qualify for a gift.
        {isAcademy
          ? " Tick “Distributed” once you've handed a student's gift to the branch. The branch ticks “Given” with a Drive photo as proof."
          : " Tick “Given” once you hand the gift to the student, and paste a Google Drive photo link as proof for the academy."}
      </p>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
          <input
            className="fa-input pl-9"
            placeholder="Search student or branch…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {showAllBranches && (
          <select
            className="fa-input w-48"
            value={branchFilter}
            onChange={e => setBranchFilter(e.target.value as BranchCode | "all")}
          >
            <option value="all">{allowed ? "All my region" : "All branches"}</option>
            {BRANCHES.filter(b => !allowed || allowed.includes(b.code)).map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
          </select>
        )}
        <select
          className="fa-input w-56"
          value={eventFilter}
          onChange={e => setEventFilter(e.target.value)}
        >
          <option value="all">All events</option>
          {eventOptions.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
        </select>
        <span className="text-sm text-ink-500 ml-auto">
          <strong className="text-ink-900">{given}</strong> / {visible.length} gifts given
        </span>
      </div>

      <div className="rounded-2xl bg-white border border-ivory-300 shadow-sm overflow-hidden">
        <div className="max-h-[65vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-ivory-100 text-ink-500 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-2">Student</th>
                {showAllBranches && <th className="text-left px-3 py-2">Branch</th>}
                <th className="text-left px-3 py-2">Coach</th>
                <th className="text-left px-3 py-2">Event / session</th>
                <th className="text-left px-3 py-2">Paid</th>
                <th className="text-center px-3 py-2">Academy distributed</th>
                <th className="text-center px-3 py-2">Gift given</th>
                <th className="text-left px-3 py-2">Proof (Drive)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-ink-400">Loading…</td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-ink-400">No qualifying renewal students yet.</td></tr>
              ) : visible.map(it => (
                <tr key={it.invitationId} className="border-t border-ivory-200 align-middle">
                  <td className="px-3 py-2">
                    <div className="font-medium text-ink-900">{it.studentName}</div>
                    <div className="text-[11px] text-ink-400">#{it.studentId}{it.grade ? ` · G${it.grade}` : ""}</div>
                  </td>
                  {showAllBranches && <td className="px-3 py-2 font-mono text-xs text-ink-600">{it.branch}</td>}
                  <td className="px-3 py-2 text-ink-700">{it.coachName || <span className="text-ink-300">—</span>}</td>
                  <td className="px-3 py-2">
                    <div className="text-ink-700 truncate max-w-[200px]">{it.eventName}</div>
                    <div className="text-[11px] text-ink-400">session {it.sessionDate ?? "—"}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-500">{it.paidAt ? it.paidAt.slice(0, 10) : "—"}</td>

                  {/* Academy distributed — academy edits, branch sees read-only */}
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-violet-600 disabled:opacity-50"
                      checked={it.academyDistributed}
                      disabled={!canEditDistributed}
                      onChange={e => patch(it.invitationId, { academyDistributed: e.target.checked })}
                      title={canEditDistributed ? "Tick when handed to the branch" : "Set by academy"}
                    />
                  </td>

                  {/* Gift given — branch edits, academy sees read-only */}
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-emerald-600 disabled:opacity-50"
                      checked={it.giftGiven}
                      disabled={!canEditGiven}
                      onChange={e => patch(it.invitationId, { giftGiven: e.target.checked })}
                      title={canEditGiven ? "Tick when given to the student" : "Set by branch"}
                    />
                  </td>

                  {/* Proof photo — branch uploads (compressed → Google Drive), academy views */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {it.proofLink && (
                        <a
                          href={it.proofLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-violet-600 hover:underline text-xs"
                        >
                          <ExternalLink className="w-3 h-3" /> View
                        </a>
                      )}
                      {canEditGiven ? (
                        <label className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border cursor-pointer ${
                          uploadingId === it.invitationId
                            ? "opacity-60 cursor-wait border-ivory-300 text-ink-400"
                            : "border-violet-300 text-violet-700 hover:bg-violet-50"
                        }`}>
                          <Upload className="w-3 h-3" />
                          {uploadingId === it.invitationId ? "Uploading…" : it.proofLink ? "Replace" : "Upload photo"}
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            disabled={uploadingId === it.invitationId}
                            onChange={e => {
                              const f = e.target.files?.[0];
                              if (f) void uploadProof(it, f);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      ) : !it.proofLink ? (
                        <span className="text-ink-300 text-xs">No proof yet</span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isBM && (
        <p className="mt-3 text-[11px] text-ink-400 flex items-center gap-1">
          <Check className="w-3 h-3 text-emerald-500" />
          Your branch only. Academy can see your “Given” tick and the proof photo you attach.
        </p>
      )}
    </AppShell>
  );
}
