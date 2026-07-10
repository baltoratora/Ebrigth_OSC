"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useActiveEdition } from "@/app/hooks/useActiveEdition";
import { useDepartmentAccess } from "@/app/hooks/useDepartmentAccess";
import ManpowerPanel from "@/app/components/annual-showcase/ManpowerPanel";
import StatCard from "@/app/components/annual-showcase/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface MediaPost {
  id: string;
  editionId: string;
  platform: string;
  caption: string | null;
  mediaType: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  status: string;
  link: string | null;
  notes: string | null;
  createdAt: string;
}

interface GuidelineSection {
  title: string;
  items: string[];
}

interface PhotographerGuidelines {
  shotList: GuidelineSection[];
  coverageZones: { zone: string; description: string; priority: string }[];
  accreditation: { name: string; organisation: string; role: string }[];
  briefingNotes: string;
}

interface PressEntry {
  outlet: string;
  reporter: string | null;
  contact: string | null;
  type: string;
  status: string;
}

interface PhotoEntry {
  album: string;
  url: string | null;
  sharedWith: string;
  date: string | null;
}

type ActiveTab = "calendar" | "guidelines" | "tracker" | "manpower";

// ─── Constants ─────────────────────────────────────────────────────────────────

const PLATFORMS = ["Instagram", "Facebook", "TikTok", "Twitter/X", "LinkedIn", "YouTube", "WhatsApp", "Email"];
const MEDIA_TYPES = ["Photo", "Video", "Reel", "Story", "Carousel", "Text", "Live"];
const POST_STATUSES = ["DRAFT", "SCHEDULED", "PUBLISHED", "CANCELLED"];

const PLATFORM_ICONS: Record<string, string> = {
  Instagram: "📸",
  Facebook:  "📘",
  TikTok:    "🎵",
  "Twitter/X": "🐦",
  LinkedIn:  "💼",
  YouTube:   "▶️",
  WhatsApp:  "💬",
  Email:     "📧",
};

const STATUS_BADGE: Record<string, string> = {
  DRAFT:     "bg-gray-100 text-gray-600",
  SCHEDULED: "bg-blue-100 text-blue-700",
  PUBLISHED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-600",
};

const TABS: { id: ActiveTab; label: string }[] = [
  { id: "calendar",   label: "📅 Content Calendar" },
  { id: "guidelines", label: "📷 Photographer Guidelines" },
  { id: "tracker",    label: "📊 Social Media Tracker" },
  { id: "manpower",   label: "👥 Manpower" },
];

const DEFAULT_GUIDELINES: PhotographerGuidelines = {
  shotList: [
    { title: "Arrival & Registration", items: ["Guests arriving", "Registration counter", "Lanyard hand-off"] },
    { title: "Opening Ceremony",       items: ["VIP arrival", "Flag-raising / opening", "Full audience shot"] },
    { title: "Main Event",             items: ["Stage presentations", "Award moments", "Audience reactions"] },
    { title: "Closing",                items: ["Group photo", "Networking session", "Pack-up"] },
  ],
  coverageZones: [
    { zone: "Main Stage",     description: "Front-of-house and wings", priority: "High" },
    { zone: "Registration",   description: "Main entrance area",       priority: "High" },
    { zone: "Sponsor Booths", description: "Exhibition hall",          priority: "Medium" },
    { zone: "Green Room",     description: "Backstage VIP area",       priority: "Low" },
  ],
  accreditation: [],
  briefingNotes: "",
};

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Post Modal ────────────────────────────────────────────────────────────────

interface PostModalProps {
  open: boolean;
  onClose: () => void;
  editionId: string;
  existing?: MediaPost;
  onSaved: (p: MediaPost) => void;
}

function PostModal({ open, onClose, editionId, existing, onSaved }: PostModalProps) {
  const [form, setForm] = useState({
    platform: "Instagram", caption: "", mediaType: "Photo",
    scheduledAt: "", status: "DRAFT", link: "", notes: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(existing
        ? {
            platform:    existing.platform,
            caption:     existing.caption ?? "",
            mediaType:   existing.mediaType,
            scheduledAt: existing.scheduledAt ? existing.scheduledAt.slice(0, 16) : "",
            status:      existing.status,
            link:        existing.link ?? "",
            notes:       existing.notes ?? "",
          }
        : { platform: "Instagram", caption: "", mediaType: "Photo", scheduledAt: "", status: "DRAFT", link: "", notes: "" },
      );
    }
  }, [open, existing]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const url    = existing ? `/api/annual-showcase/editions/${editionId}/media/${existing.id}` : `/api/annual-showcase/editions/${editionId}/media`;
      const method = existing ? "PATCH" : "POST";
      const body   = { ...form, scheduledAt: form.scheduledAt || undefined, link: form.link || undefined, notes: form.notes || undefined };
      const res    = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? "Failed");
      toast.success(existing ? "Post updated" : "Post added");
      onSaved(await res.json() as MediaPost);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Post" : "Add Content"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Platform *</label>
              <Select value={form.platform} onValueChange={v => setForm(p => ({ ...p, platform: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map(pl => <SelectItem key={pl} value={pl}>{PLATFORM_ICONS[pl] ?? "•"} {pl}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Media Type *</label>
              <Select value={form.mediaType} onValueChange={v => setForm(p => ({ ...p, mediaType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MEDIA_TYPES.map(mt => <SelectItem key={mt} value={mt}>{mt}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Caption</label>
            <Textarea value={form.caption} onChange={f("caption")} rows={3} placeholder="Post caption or copy..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled Date/Time</label>
              <Input type="datetime-local" value={form.scheduledAt} onChange={f("scheduledAt")} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {POST_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Link (optional)</label>
            <Input type="url" value={form.link} onChange={f("link")} placeholder="https://..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <Textarea value={form.notes} onChange={f("notes")} rows={2} placeholder="Internal notes..." />
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting} className="flex-1 bg-pink-500 hover:bg-pink-600 text-white">
              {submitting ? "Saving..." : existing ? "Save Changes" : "Add Post"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Content Calendar Tab ──────────────────────────────────────────────────────

function CalendarTab({ posts, editionId, onAdd, onUpdate, onDelete }: {
  posts: MediaPost[];
  editionId: string;
  onAdd: (p: MediaPost) => void;
  onUpdate: (p: MediaPost) => void;
  onDelete: (id: string) => void;
}) {
  const [viewMode,  setViewMode ] = useState<"list" | "grid">("list");
  const [addOpen,   setAddOpen  ] = useState(false);
  const [editPost,  setEditPost ] = useState<MediaPost | null>(null);
  const [selected,  setSelected ] = useState<Set<string>>(new Set());
  const [filterPl,  setFilterPl ] = useState("all");
  const [filterSt,  setFilterSt ] = useState("all");

  const filtered = posts.filter(p => {
    if (filterPl !== "all" && p.platform !== filterPl) return false;
    if (filterSt !== "all" && p.status !== filterSt) return false;
    return true;
  });

  async function handleDelete(id: string) {
    if (!window.confirm("Remove this post?")) return;
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}/media/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast.success("Post removed");
      onDelete(id);
    } catch {
      toast.error("Failed to remove post");
    }
  }

  async function handleBulkDelete() {
    if (!window.confirm(`Delete ${selected.size} posts?`)) return;
    const ids = Array.from(selected);
    await Promise.all(ids.map(id => fetch(`/api/annual-showcase/editions/${editionId}/media/${id}`, { method: "DELETE" })));
    ids.forEach(onDelete);
    setSelected(new Set());
    toast.success(`${ids.length} posts deleted`);
  }

  async function handleBulkPublish() {
    const ids = Array.from(selected);
    for (const id of ids) {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}/media/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PUBLISHED", publishedAt: new Date().toISOString() }),
      });
      if (res.ok) onUpdate(await res.json() as MediaPost);
    }
    setSelected(new Set());
    toast.success(`${ids.length} posts marked published`);
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(p => p.id)));
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filterPl} onValueChange={setFilterPl}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="All platforms" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            {PLATFORMS.map(pl => <SelectItem key={pl} value={pl}>{pl}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterSt} onValueChange={setFilterSt}>
          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {POST_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <Button size="sm" variant="outline" onClick={handleBulkPublish} className="h-8 text-xs">✅ Publish ({selected.size})</Button>
              <Button size="sm" variant="outline" onClick={handleBulkDelete} className="h-8 text-xs text-red-500 hover:text-red-700">🗑 Delete ({selected.size})</Button>
            </>
          )}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button onClick={() => setViewMode("list")} className={`px-2.5 py-1.5 text-xs transition-colors ${viewMode === "list" ? "bg-pink-500 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>≡</button>
            <button onClick={() => setViewMode("grid")} className={`px-2.5 py-1.5 text-xs transition-colors ${viewMode === "grid" ? "bg-pink-500 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>⊞</button>
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)} className="h-8 bg-pink-500 hover:bg-pink-600 text-white text-xs">+ Add Post</Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-14">
          <span className="text-4xl">📅</span>
          <p className="text-sm text-gray-400 mt-3">No posts found</p>
        </div>
      ) : viewMode === "list" ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2.5">
                  <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} className="rounded" />
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Platform</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Caption</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Scheduled</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((post, idx) => (
                <tr key={post.id} className={`border-b border-gray-50 hover:bg-gray-50/70 ${idx % 2 === 1 ? "bg-gray-50/30" : ""}`}>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(post.id)} onChange={() => toggleSelect(post.id)} className="rounded" />
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-800">
                      {PLATFORM_ICONS[post.platform] ?? "•"} {post.platform}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-[220px]">
                    <p className="truncate text-gray-600 text-xs">{post.caption ?? "—"}</p>
                    {post.link && <a href={post.link} target="_blank" rel="noopener noreferrer" className="text-[10px] text-pink-500 hover:underline">View link</a>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{post.mediaType}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {post.status === "PUBLISHED" && post.publishedAt
                      ? `✅ ${fmtDate(post.publishedAt)}`
                      : fmtDate(post.scheduledAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_BADGE[post.status] ?? "bg-gray-100 text-gray-500"}`}>
                      {post.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditPost(post)} className="text-xs text-blue-500 hover:text-blue-700">Edit</button>
                      <button onClick={() => handleDelete(post.id)} className="text-xs text-red-400 hover:text-red-600">Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(post => (
            <div
              key={post.id}
              className={`bg-white rounded-xl border shadow-sm p-4 space-y-2 cursor-pointer hover:shadow-md transition-shadow ${selected.has(post.id) ? "border-pink-300 ring-1 ring-pink-200" : "border-gray-100"}`}
              onClick={() => toggleSelect(post.id)}
            >
              <div className="flex items-start justify-between">
                <span className="text-xl">{PLATFORM_ICONS[post.platform] ?? "•"}</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_BADGE[post.status] ?? "bg-gray-100 text-gray-500"}`}>
                  {post.status}
                </span>
              </div>
              <p className="text-xs font-medium text-gray-700">{post.platform} · {post.mediaType}</p>
              {post.caption && <p className="text-xs text-gray-500 line-clamp-3">{post.caption}</p>}
              <p className="text-[10px] text-gray-400">{fmtDate(post.scheduledAt ?? post.createdAt)}</p>
              <div className="flex items-center gap-2 pt-1" onClick={e => e.stopPropagation()}>
                <button onClick={() => setEditPost(post)} className="text-xs text-blue-500 hover:text-blue-700">Edit</button>
                <button onClick={() => handleDelete(post.id)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <PostModal open={addOpen} onClose={() => setAddOpen(false)} editionId={editionId} onSaved={p => { onAdd(p); setAddOpen(false); }} />
      {editPost && (
        <PostModal
          open={!!editPost}
          onClose={() => setEditPost(null)}
          editionId={editionId}
          existing={editPost}
          onSaved={p => { onUpdate(p); setEditPost(null); }}
        />
      )}
    </div>
  );
}

// ─── Photographer Guidelines Tab ───────────────────────────────────────────────

function GuidelinesTab({ editionId, initial }: { editionId: string; initial: PhotographerGuidelines }) {
  const [data,   setData  ] = useState<PhotographerGuidelines>(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setData(initial); }, [initial]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photographerGuidelines: data }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Guidelines saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function updateShotItem(sIdx: number, iIdx: number, value: string) {
    setData(prev => ({
      ...prev,
      shotList: prev.shotList.map((s, si) =>
        si === sIdx ? { ...s, items: s.items.map((it, ii) => ii === iIdx ? value : it) } : s,
      ),
    }));
  }

  function removeShotItem(sIdx: number, iIdx: number) {
    setData(prev => ({
      ...prev,
      shotList: prev.shotList.map((s, si) =>
        si === sIdx ? { ...s, items: s.items.filter((_, ii) => ii !== iIdx) } : s,
      ),
    }));
  }

  function addShotItem(sIdx: number) {
    setData(prev => ({
      ...prev,
      shotList: prev.shotList.map((s, si) => si === sIdx ? { ...s, items: [...s.items, ""] } : s),
    }));
  }

  function updateZone(idx: number, key: string, value: string) {
    setData(prev => ({
      ...prev,
      coverageZones: prev.coverageZones.map((z, i) => i === idx ? { ...z, [key]: value } : z),
    }));
  }

  function addZone() {
    setData(prev => ({ ...prev, coverageZones: [...prev.coverageZones, { zone: "", description: "", priority: "Medium" }] }));
  }

  function removeZone(idx: number) {
    setData(prev => ({ ...prev, coverageZones: prev.coverageZones.filter((_, i) => i !== idx) }));
  }

  function updateAccred(idx: number, key: string, value: string) {
    setData(prev => ({
      ...prev,
      accreditation: prev.accreditation.map((a, i) => i === idx ? { ...a, [key]: value } : a),
    }));
  }

  function addAccred() {
    setData(prev => ({ ...prev, accreditation: [...prev.accreditation, { name: "", organisation: "", role: "Photographer" }] }));
  }

  function removeAccred(idx: number) {
    setData(prev => ({ ...prev, accreditation: prev.accreditation.filter((_, i) => i !== idx) }));
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={saving} className="bg-pink-500 hover:bg-pink-600 text-white text-xs">
          {saving ? "Saving..." : "Save Guidelines"}
        </Button>
      </div>

      {/* Shot List */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">📋 Shot List</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.shotList.map((section, sIdx) => (
            <div key={sIdx} className="border border-gray-100 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-600 mb-2">{section.title}</p>
              <div className="space-y-1.5">
                {section.items.map((item, iIdx) => (
                  <div key={iIdx} className="flex items-center gap-2">
                    <span className="text-pink-400 text-sm">☐</span>
                    <Input value={item} onChange={e => updateShotItem(sIdx, iIdx, e.target.value)} className="h-7 text-xs flex-1" />
                    <button onClick={() => removeShotItem(sIdx, iIdx)} className="text-gray-300 hover:text-red-500 text-sm">×</button>
                  </div>
                ))}
              </div>
              <button onClick={() => addShotItem(sIdx)} className="mt-2 text-[10px] text-pink-500 hover:text-pink-700 font-medium">+ Add shot</button>
            </div>
          ))}
        </div>
      </div>

      {/* Coverage Zones */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">🗺 Coverage Zones</h3>
          <button onClick={addZone} className="text-xs text-pink-500 hover:text-pink-700 font-medium">+ Add Zone</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2 text-gray-500 font-semibold">Zone</th>
                <th className="text-left px-3 py-2 text-gray-500 font-semibold">Description</th>
                <th className="text-left px-3 py-2 text-gray-500 font-semibold">Priority</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.coverageZones.map((zone, idx) => (
                <tr key={idx} className="border-t border-gray-50">
                  <td className="px-3 py-1.5">
                    <Input value={zone.zone} onChange={e => updateZone(idx, "zone", e.target.value)} className="h-7 text-xs w-32" />
                  </td>
                  <td className="px-3 py-1.5">
                    <Input value={zone.description} onChange={e => updateZone(idx, "description", e.target.value)} className="h-7 text-xs w-48" />
                  </td>
                  <td className="px-3 py-1.5">
                    <Select value={zone.priority} onValueChange={v => updateZone(idx, "priority", v)}>
                      <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["High", "Medium", "Low"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-1.5">
                    <button onClick={() => removeZone(idx)} className="text-gray-300 hover:text-red-500">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Accreditation */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">🪪 Accreditation List</h3>
          <button onClick={addAccred} className="text-xs text-pink-500 hover:text-pink-700 font-medium">+ Add Person</button>
        </div>
        {data.accreditation.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-3">No accreditation entries yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 text-gray-500 font-semibold">Name</th>
                  <th className="text-left px-3 py-2 text-gray-500 font-semibold">Organisation</th>
                  <th className="text-left px-3 py-2 text-gray-500 font-semibold">Role</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {data.accreditation.map((acc, idx) => (
                  <tr key={idx} className="border-t border-gray-50">
                    <td className="px-3 py-1.5"><Input value={acc.name} onChange={e => updateAccred(idx, "name", e.target.value)} className="h-7 text-xs w-32" /></td>
                    <td className="px-3 py-1.5"><Input value={acc.organisation} onChange={e => updateAccred(idx, "organisation", e.target.value)} className="h-7 text-xs w-40" /></td>
                    <td className="px-3 py-1.5"><Input value={acc.role} onChange={e => updateAccred(idx, "role", e.target.value)} className="h-7 text-xs w-28" /></td>
                    <td className="px-3 py-1.5"><button onClick={() => removeAccred(idx)} className="text-gray-300 hover:text-red-500">×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Briefing Notes */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">📝 Briefing Notes</h3>
        <Textarea
          value={data.briefingNotes}
          onChange={e => setData(prev => ({ ...prev, briefingNotes: e.target.value }))}
          rows={5}
          placeholder="General instructions, dos and don'ts, dress code, equipment requirements..."
          className="text-sm"
        />
      </div>
    </div>
  );
}

// ─── Social Media Tracker Tab ──────────────────────────────────────────────────

function TrackerTab({ posts, editionId, initialPressCoverage, initialPhotoDistribution }: {
  posts: MediaPost[];
  editionId: string;
  initialPressCoverage: PressEntry[];
  initialPhotoDistribution: PhotoEntry[];
}) {
  const [press,  setPress ] = useState<PressEntry[]>(initialPressCoverage);
  const [photos, setPhotos] = useState<PhotoEntry[]>(initialPhotoDistribution);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setPress(initialPressCoverage); }, [initialPressCoverage]);
  useEffect(() => { setPhotos(initialPhotoDistribution); }, [initialPhotoDistribution]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pressCoverage: press, photoDistribution: photos }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Tracker data saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const byPlatform = PLATFORMS.reduce<Record<string, { total: number; published: number; scheduled: number; draft: number }>>((acc, pl) => {
    const pts = posts.filter(p => p.platform === pl);
    if (pts.length > 0) acc[pl] = {
      total:     pts.length,
      published: pts.filter(p => p.status === "PUBLISHED").length,
      scheduled: pts.filter(p => p.status === "SCHEDULED").length,
      draft:     pts.filter(p => p.status === "DRAFT").length,
    };
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={saving} className="bg-pink-500 hover:bg-pink-600 text-white text-xs">
          {saving ? "Saving..." : "Save Tracker Data"}
        </Button>
      </div>

      {/* Platform Breakdown */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">📊 Platform Breakdown</h3>
        {Object.keys(byPlatform).length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-3">No posts yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Platform</th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Published</th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Scheduled</th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Draft</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(byPlatform).map(([pl, counts]) => (
                  <tr key={pl} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 font-medium text-gray-700">{PLATFORM_ICONS[pl] ?? "•"} {pl}</td>
                    <td className="px-4 py-2.5 text-center">{counts.total}</td>
                    <td className="px-4 py-2.5 text-center text-green-600 font-medium">{counts.published}</td>
                    <td className="px-4 py-2.5 text-center text-blue-600 font-medium">{counts.scheduled}</td>
                    <td className="px-4 py-2.5 text-center text-gray-400">{counts.draft}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Press Coverage */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">📰 Press Coverage</h3>
          <button
            onClick={() => setPress(prev => [...prev, { outlet: "", reporter: null, contact: null, type: "Print", status: "Invited" }])}
            className="text-xs text-pink-500 hover:text-pink-700 font-medium"
          >
            + Add Outlet
          </button>
        </div>
        {press.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-3">No press coverage entries yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  {["Outlet", "Reporter", "Contact", "Type", "Status", ""].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-gray-500 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {press.map((p, idx) => (
                  <tr key={idx} className="border-t border-gray-50">
                    <td className="px-3 py-1.5">
                      <Input value={p.outlet} onChange={e => setPress(prev => prev.map((x, i) => i === idx ? { ...x, outlet: e.target.value } : x))} className="h-7 text-xs w-32" />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input value={p.reporter ?? ""} onChange={e => setPress(prev => prev.map((x, i) => i === idx ? { ...x, reporter: e.target.value || null } : x))} className="h-7 text-xs w-28" />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input value={p.contact ?? ""} onChange={e => setPress(prev => prev.map((x, i) => i === idx ? { ...x, contact: e.target.value || null } : x))} className="h-7 text-xs w-32" />
                    </td>
                    <td className="px-3 py-1.5">
                      <Select value={p.type} onValueChange={v => setPress(prev => prev.map((x, i) => i === idx ? { ...x, type: v } : x))}>
                        <SelectTrigger className="h-7 w-20 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["Print", "Online", "Broadcast", "Podcast"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-1.5">
                      <Select value={p.status} onValueChange={v => setPress(prev => prev.map((x, i) => i === idx ? { ...x, status: v } : x))}>
                        <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["Invited", "Confirmed", "Attended", "Published", "Declined"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-1.5">
                      <button onClick={() => setPress(prev => prev.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-red-500">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Photo Distribution */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">🖼 Photo Distribution</h3>
          <button
            onClick={() => setPhotos(prev => [...prev, { album: "", url: null, sharedWith: "", date: null }])}
            className="text-xs text-pink-500 hover:text-pink-700 font-medium"
          >
            + Add Album
          </button>
        </div>
        {photos.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-3">No photo distribution entries yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  {["Album", "Drive / URL", "Shared With", "Date", ""].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-gray-500 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {photos.map((ph, idx) => (
                  <tr key={idx} className="border-t border-gray-50">
                    <td className="px-3 py-1.5">
                      <Input value={ph.album} onChange={e => setPhotos(prev => prev.map((x, i) => i === idx ? { ...x, album: e.target.value } : x))} className="h-7 text-xs w-36" />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input value={ph.url ?? ""} onChange={e => setPhotos(prev => prev.map((x, i) => i === idx ? { ...x, url: e.target.value || null } : x))} className="h-7 text-xs w-40" placeholder="https://..." />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input value={ph.sharedWith} onChange={e => setPhotos(prev => prev.map((x, i) => i === idx ? { ...x, sharedWith: e.target.value } : x))} className="h-7 text-xs w-32" />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input type="date" value={ph.date ?? ""} onChange={e => setPhotos(prev => prev.map((x, i) => i === idx ? { ...x, date: e.target.value || null } : x))} className="h-7 text-xs w-32" />
                    </td>
                    <td className="px-3 py-1.5">
                      <button onClick={() => setPhotos(prev => prev.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-red-500">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Media Page ───────────────────────────────────────────────────────────

export default function MediaPage() {
  const router = useRouter();
  const { allowed } = useDepartmentAccess("MEDIA");
  const { edition: rawEdition, isLoading } = useActiveEdition();
  const edition = rawEdition as unknown as ({
    id: string;
    name: string;
    photographerGuidelines?: unknown;
    pressCoverage?: unknown;
    photoDistribution?: unknown;
  } | null);

  const [posts,         setPosts        ] = useState<MediaPost[]>([]);
  const [dataLoading,   setDataLoading  ] = useState(false);
  const [activeTab,     setActiveTab    ] = useState<ActiveTab>("calendar");
  const [manpowerCount, setManpowerCount] = useState(0);

  const guidelines: PhotographerGuidelines = edition?.photographerGuidelines
    ? (edition.photographerGuidelines as PhotographerGuidelines)
    : DEFAULT_GUIDELINES;

  const pressCoverage: PressEntry[]     = Array.isArray(edition?.pressCoverage)     ? (edition!.pressCoverage as PressEntry[])     : [];
  const photoDistribution: PhotoEntry[] = Array.isArray(edition?.photoDistribution) ? (edition!.photoDistribution as PhotoEntry[]) : [];

  const loadPosts = useCallback(async (editionId: string) => {
    setDataLoading(true);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}/media`);
      if (res.ok) setPosts(await res.json() as MediaPost[]);
    } catch {
      toast.error("Failed to load posts");
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => { if (edition?.id) loadPosts(edition.id); }, [edition?.id, loadPosts]);

  const totalPosts = posts.length;
  const published  = posts.filter(p => p.status === "PUBLISHED").length;
  const scheduled  = posts.filter(p => p.status === "SCHEDULED").length;
  const drafts     = posts.filter(p => p.status === "DRAFT").length;

  if (!allowed) return null;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (!edition) {
    return (
      <div className="relative p-6 flex flex-col items-center justify-center min-h-[400px] gap-3">
        <button
          onClick={() => router.push('/annual-showcase/editions')}
          className="absolute top-4 left-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          ← Back to Editions
        </button>
        <span className="text-5xl">📸</span>
        <p className="text-gray-600 font-medium">No active edition selected</p>
        <p className="text-sm text-gray-400">Select an edition from the switcher in the header.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <button
        onClick={() => router.push('/annual-showcase/editions')}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        ← Back to Editions
      </button>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Posts"  value={totalPosts} icon="📅" subtext="all content" />
        <StatCard label="Published"    value={published}  icon="✅" subtext="live posts"      accentColor="bg-green-500"
          progress={totalPosts > 0 ? Math.round((published / totalPosts) * 100) : 0} />
        <StatCard label="Scheduled"    value={scheduled}  icon="🕐" subtext="queued for publish" accentColor="bg-blue-500" />
        <StatCard label="Drafts"       value={drafts}     icon="📝" subtext="in draft"           accentColor="bg-gray-400" />
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? "border-pink-500 text-pink-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.id === "manpower" && manpowerCount > 0 ? `👥 Manpower (${manpowerCount})` : tab.label}
            </button>
          ))}
        </div>

        <div className={dataLoading ? "p-6" : "p-5"}>
          {dataLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : (
            <>
              {activeTab === "calendar" && (
                <CalendarTab
                  posts={posts}
                  editionId={edition.id}
                  onAdd={p  => setPosts(prev => [p, ...prev])}
                  onUpdate={p => setPosts(prev => prev.map(x => x.id === p.id ? p : x))}
                  onDelete={id => setPosts(prev => prev.filter(x => x.id !== id))}
                />
              )}
              {activeTab === "guidelines" && (
                <GuidelinesTab editionId={edition.id} initial={guidelines} />
              )}
              {activeTab === "tracker" && (
                <TrackerTab
                  posts={posts}
                  editionId={edition.id}
                  initialPressCoverage={pressCoverage}
                  initialPhotoDistribution={photoDistribution}
                />
              )}
              {activeTab === "manpower" && (
                <ManpowerPanel editionId={edition.id} unit="MEDIA" onCountChange={setManpowerCount} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
