"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { toast } from "sonner";
import StatCard from "@/app/components/annual-showcase/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveEdition } from "@/app/hooks/useActiveEdition";
import { useDepartmentAccess } from "@/app/hooks/useDepartmentAccess";
import CreateEditionModal from "@/app/components/annual-showcase/CreateEditionModal";
import ManpowerPanel from "@/app/components/annual-showcase/ManpowerPanel";
import { useMyPermissions } from "@/lib/use-my-permissions";
import { normalizeRole, ROLES } from "@/lib/roles";

// ─── Types ───────────────────────────────────────────────────────────────────

type EditionStatus = "DRAFT" | "REGISTRATION_OPEN" | "TEST_RUN" | "EVENT_ACTIVE" | "POST_EVENT" | "ARCHIVED";
type TaskStatus = "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

interface DepartmentLeads {
  oc?: string;
  procurement?: string;
  sponsorship?: string;
  media?: string;
  showcase?: string;
  youthpreneur?: string;
  ceo?: string;
}

interface Edition {
  id: string;
  name: string;
  theme: string;
  status: EditionStatus;
  startDate: string | null;
  endDate: string | null;
  venueName: string | null;
  venueAddress: string | null;
  participantTarget: number;
  profitabilityTarget: number;
  registrationDeadline: string | null;
  testRunDate: string | null;
  currency: string;
  departmentLeads: DepartmentLeads | null;
  waitlistEnabled: boolean;
  waitlistCount:   number;
}

interface Member {
  id: number;
  name: string | null;
  email: string;
}

interface Task {
  id: string;
  editionId: string;
  unit: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: number | null;
  dueDate: string | null;
  assignee: { id: number; name: string | null; email: string } | null;
}

interface Announcement {
  id: string;
  title: string;
  body: string;
  targetUnits: string[];
  createdAt: string;
  author: { id: number; name: string | null } | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const UNITS = ["OC", "Procurement", "Sponsorship", "Media", "Showcase", "Youthpreneur", "CEO"];

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: "TODO",        label: "To Do" },
  { id: "IN_PROGRESS", label: "In Progress" },
  { id: "IN_REVIEW",   label: "In Review" },
  { id: "DONE",        label: "Done" },
];

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  LOW:    "bg-gray-100 text-gray-600",
  MEDIUM: "bg-blue-100 text-blue-700",
  HIGH:   "bg-orange-100 text-orange-700",
  URGENT: "bg-red-100 text-red-700",
};



// ─── Task Card ────────────────────────────────────────────────────────────────

function TaskCard({ task }: { task: Task }) {
  const isOverdue = task.dueDate && task.status !== "DONE" && new Date(task.dueDate) < new Date();
  const initials = task.assignee?.name
    ?.trim().split(/\s+/).slice(0, 2).map((n) => n[0]).join("").toUpperCase() ?? "";

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm space-y-2">
      <p className="text-sm font-medium text-gray-800 leading-snug">{task.title}</p>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${PRIORITY_STYLES[task.priority]}`}>
          {task.priority}
        </span>
        {task.assignee && (
          <div
            className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0"
            title={task.assignee.name ?? task.assignee.email}
          >
            {initials || "?"}
          </div>
        )}
      </div>
      {task.dueDate && (
        <p className={`text-[10px] ${isOverdue ? "text-red-500 font-semibold" : "text-gray-400"}`}>
          Due {new Date(task.dueDate).toLocaleDateString()}
          {isOverdue && " (overdue)"}
        </p>
      )}
    </div>
  );
}

// ─── Add Task Modal ───────────────────────────────────────────────────────────

interface AddTaskModalProps {
  open: boolean;
  onClose: () => void;
  defaultStatus: TaskStatus;
  editionId: string;
  members: Member[];
  onCreated: (task: Task) => void;
}

function AddTaskModal({ open, onClose, defaultStatus, editionId, members, onCreated }: AddTaskModalProps) {
  const [form, setForm] = useState({
    title: "", description: "", assigneeId: "unassigned", dueDate: "", priority: "MEDIUM" as TaskPriority,
  });
  const [submitting, setSubmitting] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unit: "OC",
          title: form.title.trim(),
          description: form.description || undefined,
          status: defaultStatus,
          priority: form.priority,
          assigneeId: form.assigneeId && form.assigneeId !== "unassigned" ? Number(form.assigneeId) : undefined,
          dueDate: form.dueDate || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const task = await res.json();
      toast.success("Task created");
      onCreated(task);
      onClose();
      setForm({ title: "", description: "", assigneeId: "unassigned", dueDate: "", priority: "MEDIUM" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <Input value={form.title} onChange={set("title")} placeholder="Task title" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <Textarea value={form.description} onChange={set("description")} placeholder="Optional details" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v as TaskPriority }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <Input type="date" value={form.dueDate} onChange={set("dueDate")} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assignee</label>
            <Select value={form.assigneeId} onValueChange={(v) => setForm((f) => ({ ...f, assigneeId: v }))}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.name ?? m.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={submitting} className="flex-1 bg-orange-600 hover:bg-orange-700">
              {submitting ? "Creating..." : "Create Task"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Announcement Modal ───────────────────────────────────────────────────────

interface AnnouncementModalProps {
  open: boolean;
  onClose: () => void;
  editionId: string;
  onCreated: (a: Announcement) => void;
}

function AnnouncementModal({ open, onClose, editionId, onCreated }: AnnouncementModalProps) {
  const [form, setForm] = useState({ title: "", body: "" });
  const [targetUnits, setTargetUnits] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) {
      toast.error("Title and body are required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}/announcements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, targetUnits }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const a = await res.json();
      toast.success("Announcement posted");
      onCreated(a);
      onClose();
      setForm({ title: "", body: "" });
      setTargetUnits([]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to post announcement");
    } finally {
      setSubmitting(false);
    }
  }

  function toggleUnit(unit: string) {
    setTargetUnits((prev) =>
      prev.includes(unit) ? prev.filter((u) => u !== unit) : [...prev, unit],
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Announcement</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Announcement title"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Body *</label>
            <Textarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="Announcement content..."
              rows={3}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Target Units</label>
            <div className="flex flex-wrap gap-2">
              {UNITS.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => toggleUnit(u)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    targetUnits.includes(u)
                      ? "bg-orange-100 text-orange-700 border-orange-300"
                      : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {targetUnits.length === 0 ? "No units selected = All units" : `${targetUnits.length} unit(s) selected`}
            </p>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={submitting} className="flex-1 bg-orange-600 hover:bg-orange-700">
              {submitting ? "Posting..." : "Post"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Team Access (RBAC) ───────────────────────────────────────────────────────

interface ShowcaseMember {
  id: string;
  email: string;
  name: string | null;
  allowedUnits: string[];
  invitedAt: string;
}

const UNIT_OPTIONS: { value: string; label: string }[] = [
  { value: "OC",           label: "Organizing Committee" },
  { value: "PROCUREMENT",  label: "Procurement" },
  { value: "SPONSORSHIP",  label: "Sponsorship & VVIP" },
  { value: "MEDIA",        label: "Media & Publicity" },
  { value: "SHOWCASE",     label: "Showcase & Production" },
  { value: "LOGISTICS",    label: "Logistics" },
  { value: "YOUTHPRENEUR", label: "Youthpreneur" },
  { value: "CEO",          label: "CEO Unit" },
];

interface MemberModalProps {
  open: boolean;
  onClose: () => void;
  editionId: string;
  existing?: ShowcaseMember;
  onSaved: (m: ShowcaseMember) => void;
}

function MemberModal({ open, onClose, editionId, existing, onSaved }: MemberModalProps) {
  const [email, setEmail]   = useState("");
  const [name, setName]     = useState("");
  const [units, setUnits]   = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setEmail(existing?.email ?? "");
      setName(existing?.name ?? "");
      setUnits(existing?.allowedUnits ?? []);
    }
  }, [open, existing]);

  function toggleUnit(unit: string) {
    setUnits(prev => prev.includes(unit) ? prev.filter(u => u !== unit) : [...prev, unit]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!existing && !email.trim()) { toast.error("Email is required"); return; }
    setSubmitting(true);
    try {
      const url    = existing
        ? `/api/annual-showcase/editions/${editionId}/members/${existing.id}`
        : `/api/annual-showcase/editions/${editionId}/members`;
      const method = existing ? "PATCH" : "POST";
      const body   = existing
        ? { name: name.trim(), allowedUnits: units }
        : { email: email.trim(), name: name.trim() || undefined, allowedUnits: units };

      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? "Failed");
      const saved = await res.json() as ShowcaseMember;
      toast.success(existing ? "Member updated" : "Member added");
      onSaved(saved);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save member");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Member Access" : "Add Member"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="staff@ebright.com"
              disabled={!!existing}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Departments</label>
            <div className="grid grid-cols-2 gap-2">
              {UNIT_OPTIONS.map(u => (
                <label key={u.value} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={units.includes(u.value)}
                    onChange={() => toggleUnit(u.value)}
                    className="rounded border-gray-300"
                  />
                  {u.label}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting} className="flex-1 bg-orange-600 hover:bg-orange-700">
              {submitting ? "Saving..." : existing ? "Save Changes" : "Add Member"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TeamAccessTab({ editionId }: { editionId: string }) {
  const [members,  setMembers ] = useState<ShowcaseMember[]>([]);
  const [loading,   setLoading  ] = useState(true);
  const [addOpen,   setAddOpen  ] = useState(false);
  const [editMember,setEditMember] = useState<ShowcaseMember | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}/members`);
      if (res.ok) setMembers(await res.json() as ShowcaseMember[]);
    } catch { toast.error("Failed to load members"); }
    finally { setLoading(false); }
  }, [editionId]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(member: ShowcaseMember) {
    if (!window.confirm(`Remove "${member.email}" from this edition's team?`)) return;
    try {
      const res = await fetch(`/api/annual-showcase/editions/${editionId}/members/${member.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast.success("Member removed");
      setMembers(prev => prev.filter(m => m.id !== member.id));
    } catch { toast.error("Failed to remove member"); }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAddOpen(true)} className="bg-orange-600 hover:bg-orange-700 text-xs">
          + Add Member
        </Button>
      </div>

      {members.length === 0 ? (
        <div className="text-center py-12">
          <span className="text-4xl">👥</span>
          <p className="text-sm text-gray-400 mt-3">No team members assigned yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Departments Assigned</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {members.map((m, idx) => (
                <tr key={m.id} className={`border-b border-gray-50 ${idx % 2 === 1 ? "bg-gray-50/30" : ""}`}>
                  <td className="px-4 py-2.5 font-medium text-gray-800">{m.email}</td>
                  <td className="px-4 py-2.5 text-gray-500">{m.name ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    {m.allowedUnits.length === 0 ? (
                      <span className="text-xs text-gray-300 italic">None</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {m.allowedUnits.map(u => (
                          <span key={u} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-50 text-orange-700">
                            {UNIT_OPTIONS.find(o => o.value === u)?.label ?? u}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditMember(m)} className="text-xs text-blue-500 hover:text-blue-700">Edit</button>
                      <button onClick={() => handleDelete(m)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <MemberModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        editionId={editionId}
        onSaved={m => setMembers(prev => [m, ...prev])}
      />
      <MemberModal
        open={!!editMember}
        onClose={() => setEditMember(null)}
        editionId={editionId}
        existing={editMember ?? undefined}
        onSaved={m => setMembers(prev => prev.map(p => p.id === m.id ? m : p))}
      />
    </div>
  );
}

// ─── Main OC Page ─────────────────────────────────────────────────────────────

export default function OCPage() {
  const router = useRouter();
  const { allowed } = useDepartmentAccess("OC");
  const { edition: rawEdition, isLoading: loading, refresh } = useActiveEdition();
  const edition = rawEdition as unknown as Edition | null;

  const [tasks, setTasks]                   = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading]     = useState(false);
  const [members, setMembers]               = useState<Member[]>([]);
  const [announcements, setAnnouncements]   = useState<Announcement[]>([]);
  const [budgetRevenue, setBudgetRevenue]   = useState(0);
  const [participantCount, setParticipantCount] = useState(0);
  const [createModalOpen, setCreateModalOpen]   = useState(false);

  const [ocTab, setOcTab]                   = useState<"dashboard" | "manpower" | "team">("dashboard");
  const [manpowerCount, setManpowerCount]   = useState(0);

  const { role } = useMyPermissions();
  const normalizedRole = normalizeRole(role);
  const isAdminUser = normalizedRole === ROLES.SUPER_ADMIN || normalizedRole === ROLES.ADMIN;

  const [addTaskModal, setAddTaskModal] = useState<{ open: boolean; status: TaskStatus }>({
    open: false,
    status: "TODO",
  });
  const [announcementModal, setAnnouncementModal] = useState(false);
  const [togglingWaitlist, setTogglingWaitlist]   = useState(false);

  async function handleWaitlistToggle(enabled: boolean) {
    if (!edition) return;
    setTogglingWaitlist(true);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${edition.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waitlistEnabled: enabled }),
      });
      if (!res.ok) throw new Error();
      await refresh();
      toast.success(enabled ? "Waitlist enabled" : "Waitlist disabled");
    } catch {
      toast.error("Failed to update waitlist setting");
    } finally {
      setTogglingWaitlist(false);
    }
  }

  const fetchEditionData = useCallback(async (editionId: string) => {
    setTasksLoading(true);
    try {
      const [tasksRes, membersRes, announcementsRes, budgetRes, participantsRes] = await Promise.all([
        fetch(`/api/annual-showcase/editions/${editionId}/tasks`),
        fetch(`/api/annual-showcase/editions/${editionId}`),
        fetch(`/api/annual-showcase/editions/${editionId}/announcements`),
        fetch(`/api/annual-showcase/editions/${editionId}/budget`),
        fetch(`/api/annual-showcase/editions/${editionId}/participants?limit=1`),
      ]);

      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (membersRes.ok) {
        const d = await membersRes.json();
        setMembers((d.members ?? []).map((m: { user: Member }) => m.user));
      }
      if (announcementsRes.ok) setAnnouncements(await announcementsRes.json());
      if (budgetRes.ok) {
        const d = await budgetRes.json();
        setBudgetRevenue(d.totalRevenue ?? 0);
      }
      if (participantsRes.ok) {
        const d = await participantsRes.json();
        setParticipantCount(d.total ?? 0);
      }
    } catch {
      toast.error("Failed to load some data");
    } finally {
      setTasksLoading(false);
    }
  }, []);

  useEffect(() => {
    if (edition?.id) fetchEditionData(edition.id);
  }, [edition?.id, fetchEditionData]);

  async function handleDragEnd(result: DropResult) {
    if (!result.destination || !edition) return;
    const { draggableId, destination } = result;
    const newStatus = destination.droppableId as TaskStatus;
    const task = tasks.find((t) => t.id === draggableId);
    if (!task || task.status === newStatus) return;

    setTasks((prev) =>
      prev.map((t) => (t.id === draggableId ? { ...t, status: newStatus } : t)),
    );

    try {
      const res = await fetch(
        `/api/annual-showcase/editions/${edition.id}/tasks/${draggableId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        },
      );
      if (!res.ok) throw new Error("Failed to update");
      toast.success("Task moved");
    } catch {
      setTasks((prev) =>
        prev.map((t) => (t.id === draggableId ? { ...t, status: task.status } : t)),
      );
      toast.error("Failed to move task");
    }
  }

  // ─── Derived stats ─────────────────────────────────────────────────────────

  const tasksDone  = tasks.filter((t) => t.status === "DONE").length;
  const tasksTotal = tasks.length;

  const daysToEvent = edition?.startDate
    ? Math.ceil((new Date(edition.startDate).getTime() - Date.now()) / 86400000)
    : null;

  const unitStats = UNITS.map((unit) => {
    const unitTasks = tasks.filter((t) => t.unit === unit);
    const done    = unitTasks.filter((t) => t.status === "DONE").length;
    const overdue = unitTasks.filter(
      (t) => t.dueDate && t.status !== "DONE" && new Date(t.dueDate) < new Date(),
    ).length;
    return { unit, total: unitTasks.length, done, overdue };
  });

  const currency = edition?.currency ?? "MYR";

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (!allowed) return null;

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  // ─── No edition ────────────────────────────────────────────────────────────

  if (!edition) {
    return (
      <>
        <div className="relative p-6 flex flex-col items-center justify-center min-h-[400px] gap-4">
          <button
            onClick={() => router.push('/annual-showcase/editions')}
            className="absolute top-4 left-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            ← Back to Editions
          </button>
          <span className="text-5xl">🎪</span>
          <h2 className="text-xl font-semibold text-gray-800">No edition selected</h2>
          <p className="text-sm text-gray-500 text-center max-w-sm">
            Create a new edition or select an existing one using the edition switcher in the header.
          </p>
          <div className="flex items-center gap-3 mt-2">
            <Button onClick={() => setCreateModalOpen(true)} className="bg-orange-600 hover:bg-orange-700">
              + Create New Edition
            </Button>
            <Link href="/annual-showcase/editions" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              View All Editions →
            </Link>
          </div>
        </div>
        <CreateEditionModal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onCreated={() => setCreateModalOpen(false)}
        />
      </>
    );
  }

  // ─── Main dashboard ────────────────────────────────────────────────────────

  const ocTasks = tasks.filter((t) => t.unit === "OC");
  const tasksByStatus = COLUMNS.reduce(
    (acc, col) => ({ ...acc, [col.id]: ocTasks.filter((t) => t.status === col.id) }),
    {} as Record<TaskStatus, Task[]>,
  );

  return (
    <div className="p-6 space-y-6">
      <button
        onClick={() => router.push('/annual-showcase/editions')}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        ← Back to Editions
      </button>

      {/* Stats row — always visible */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Participants"
          value={`${participantCount.toLocaleString()} / ${(edition.participantTarget ?? 0).toLocaleString()}`}
          icon="🎓"
          progress={edition.participantTarget > 0 ? Math.round((participantCount / edition.participantTarget) * 100) : 0}
          subtext={edition.waitlistEnabled && edition.waitlistCount > 0 ? `+${edition.waitlistCount} on waitlist` : "registered / target"}
        />
        <StatCard
          label="Revenue"
          value={`${currency} ${budgetRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          icon="💰"
          subtext="paid revenue items"
        />
        <StatCard
          label="Tasks Done"
          value={`${tasksDone} / ${tasksTotal}`}
          icon="✅"
          progress={tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0}
          subtext="across all units"
        />
        <StatCard
          label={daysToEvent !== null && daysToEvent <= 0 ? "Event Day!" : "Days to Event"}
          value={daysToEvent !== null ? (daysToEvent <= 0 ? "Today!" : String(daysToEvent)) : "—"}
          icon="📅"
          subtext={edition.startDate ? new Date(edition.startDate).toLocaleDateString() : "Date not set"}
        />
        {/* Team card */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">👥</span>
            <span className="text-sm font-semibold text-gray-700">Department Leads</span>
          </div>
          <div className="space-y-1.5">
            {([
              { key: "oc",           label: "OC" },
              { key: "procurement",  label: "Procurement" },
              { key: "sponsorship",  label: "Sponsorship" },
              { key: "media",        label: "Media" },
              { key: "showcase",     label: "Showcase" },
              { key: "youthpreneur", label: "Youthpreneur" },
              { key: "ceo",          label: "CEO" },
            ] as const).map(({ key, label }) => {
              const lead = (edition.departmentLeads as DepartmentLeads | null)?.[key];
              return (
                <div key={key} className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-gray-500 shrink-0">{label}</span>
                  {lead ? (
                    <span className="text-[11px] font-medium text-gray-800 truncate">{lead}</span>
                  ) : (
                    <span className="text-[11px] text-gray-400 italic">Unassigned</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Registration Settings */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-3 flex items-center gap-6 flex-wrap">
        <span className="text-sm font-semibold text-gray-700">Registration Settings</span>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={edition.waitlistEnabled}
            disabled={togglingWaitlist}
            onChange={e => handleWaitlistToggle(e.target.checked)}
            className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
          />
          <span className="text-sm text-gray-600">Enable waitlist when target is reached</span>
          {edition.waitlistEnabled && edition.waitlistCount > 0 && (
            <span className="text-xs bg-yellow-100 text-yellow-700 font-semibold px-2 py-0.5 rounded-full">
              {edition.waitlistCount} waiting
            </span>
          )}
        </label>
      </div>

      {/* Tab switcher */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => setOcTab("dashboard")}
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              ocTab === "dashboard"
                ? "text-blue-700 border-b-2 border-blue-600 bg-blue-50/30"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            🏛️ Task Board
          </button>
          <button
            onClick={() => setOcTab("manpower")}
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              ocTab === "manpower"
                ? "text-blue-700 border-b-2 border-blue-600 bg-blue-50/30"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            👥 Manpower{manpowerCount > 0 ? ` (${manpowerCount})` : ""}
          </button>
          {isAdminUser && (
            <button
              onClick={() => setOcTab("team")}
              className={`px-4 py-3 text-sm font-medium transition-colors ${
                ocTab === "team"
                  ? "text-blue-700 border-b-2 border-blue-600 bg-blue-50/30"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              👥 Team Access
            </button>
          )}
        </div>

        {ocTab === "manpower" && (
          <div className="p-5">
            <ManpowerPanel editionId={edition.id} unit="OC" onCountChange={setManpowerCount} />
          </div>
        )}
        {ocTab === "team" && isAdminUser && (
          <div className="p-5">
            <TeamAccessTab editionId={edition.id} />
          </div>
        )}
      </div>

      {ocTab === "dashboard" && <>

      {/* Kanban Board */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">🏛️ OC Task Board</h3>
        </div>
        <div className="p-4 overflow-x-auto">
          {tasksLoading ? (
            <div className="grid grid-cols-4 gap-3">
              {COLUMNS.map((col) => (
                <Skeleton key={col.id} className="h-48 rounded-lg" />
              ))}
            </div>
          ) : (
            <DragDropContext onDragEnd={handleDragEnd}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 min-w-[700px]">
                {COLUMNS.map((col) => {
                  const colTasks = tasksByStatus[col.id] ?? [];
                  return (
                    <div key={col.id} className="flex flex-col">
                      <div className="flex items-center justify-between mb-2 px-1">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          {col.label}
                        </span>
                        <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">
                          {colTasks.length}
                        </span>
                      </div>
                      <Droppable droppableId={col.id}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={`flex-1 min-h-[200px] rounded-lg p-2 space-y-2 transition-colors ${
                              snapshot.isDraggingOver ? "bg-orange-50" : "bg-gray-50"
                            }`}
                          >
                            {colTasks.map((task, index) => (
                              <Draggable key={task.id} draggableId={task.id} index={index}>
                                {(prov, snap) => (
                                  <div
                                    ref={prov.innerRef}
                                    {...prov.draggableProps}
                                    {...prov.dragHandleProps}
                                    className={snap.isDragging ? "opacity-80" : ""}
                                  >
                                    <TaskCard task={task} />
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                      <button
                        onClick={() => setAddTaskModal({ open: true, status: col.id })}
                        className="mt-2 text-xs text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg px-2 py-1.5 transition-colors text-left w-full"
                      >
                        + Add Task
                      </button>
                    </div>
                  );
                })}
              </div>
            </DragDropContext>
          )}
        </div>
      </div>

      {/* Unit Progress Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">📊 Unit Progress</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Unit</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tasks Done</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-40">Progress</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Overdue</th>
              </tr>
            </thead>
            <tbody>
              {unitStats.map((u) => {
                const pct = u.total > 0 ? Math.round((u.done / u.total) * 100) : 0;
                return (
                  <tr key={u.unit} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-800">{u.unit}</td>
                    <td className="px-5 py-3 text-gray-600">{u.done} / {u.total}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-orange-500 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 w-8 shrink-0">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {u.overdue > 0 ? (
                        <span className="text-red-500 font-semibold">{u.overdue}</span>
                      ) : (
                        <span className="text-green-500">0</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Announcements Panel */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">📢 Announcements</h3>
          <Button
            size="sm"
            onClick={() => setAnnouncementModal(true)}
            className="bg-orange-600 hover:bg-orange-700 text-xs"
          >
            + New Announcement
          </Button>
        </div>
        <div className="p-5 space-y-3">
          {announcements.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No announcements yet</p>
          ) : (
            announcements.map((a) => (
              <div key={a.id} className="border border-gray-100 rounded-lg p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="font-medium text-gray-800 text-sm">{a.title}</p>
                  <span className="text-xs text-gray-400 shrink-0">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-xs text-gray-500 line-clamp-2">{a.body}</p>
                <div className="flex items-center gap-2 mt-2">
                  {a.targetUnits.length === 0 ? (
                    <span className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">All units</span>
                  ) : (
                    a.targetUnits.map((u) => (
                      <span key={u} className="text-[10px] bg-orange-50 text-orange-600 rounded-full px-2 py-0.5">
                        {u}
                      </span>
                    ))
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      </>}

      {/* Modals */}
      {addTaskModal.open && (
        <AddTaskModal
          open={addTaskModal.open}
          onClose={() => setAddTaskModal((s) => ({ ...s, open: false }))}
          defaultStatus={addTaskModal.status}
          editionId={edition.id}
          members={members}
          onCreated={(task) => setTasks((prev) => [...prev, task])}
        />
      )}
      <AnnouncementModal
        open={announcementModal}
        onClose={() => setAnnouncementModal(false)}
        editionId={edition.id}
        onCreated={(a) => setAnnouncements((prev) => [a, ...prev])}
      />
      <CreateEditionModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={() => setCreateModalOpen(false)}
      />
    </div>
  );
}
