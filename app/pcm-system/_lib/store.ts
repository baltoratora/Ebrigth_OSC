// ============================================================================
// PCM System — Zustand Store
//
// Events, sessions, quotas, and invitations are server-backed (DB on
// ebrightleads_db). Mutators call API routes; local state mirrors what the
// server returns so all logged-in users see the same data.
//
// Sessions display order, inventory packing checklist, and walk-in buffer
// remain local-only (UI preferences) and persist to localStorage.
// ============================================================================

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  EventBranchOverride,
  ArrivalWindow,
  FAEvent,
  Invitation,
  InvitationStatus,
  InviteType,
  PackageOption,
  PcmReport,
  Session,
  SessionQuota,
  Student,
  StudentLoadReport,
  User,
  BranchCode,
  DayPolicy,
} from "@pcm/_types";
import { MOCK_USERS } from "./mockData";

interface FAStore {
  // ------- Data -------
  users: User[];
  students: Student[];
  events: FAEvent[];
  sessions: Session[];
  quotas: SessionQuota[];
  invitations: Invitation[];
  /** Per-event per-branch toggles allowing multi-grade invitations of the
   *  same student (one row per granted branch per event). Academy/Admin
   *  only — see /api/pcm/event-overrides. */
  eventBranchOverrides: EventBranchOverride[];

  /** Assessment reports — one per invitation (filled by coach after the
   *  session). Doubles as the printable certificate. Refreshed via
   *  loadReports(); saved via saveReport(). */
  reports: PcmReport[];
  reportsLoaded: boolean;
  reportsLoading: boolean;
  loadReports: () => Promise<void>;
  saveReport: (report: Omit<PcmReport, "id" | "createdAt" | "updatedAt">) => Promise<PcmReport>;

  // ------- Auth -------
  currentUserId: string | null;
  login: (userId: string) => void;
  logout: () => void;

  // ------- Student data loading (real DB) -------
  studentsLoaded: boolean;
  studentsLoading: boolean;
  studentsError: string | null;
  /** Stats about which studentrecords rows were skipped during the last
   *  load (e.g. unknown branch, missing grade). Surfaced in the UI so
   *  Academy can see exactly which records need fixing in Heidi. */
  studentsReport: StudentLoadReport | null;
  /** Epoch ms of the last successful student fetch. Lets the UI show
   *  "synced 2 min ago" and decide whether a refresh is overdue. */
  studentsFetchedAt: number | null;
  /** First-load lazy fetch — no-op if students are already in the store. */
  loadStudents: () => Promise<void>;
  /** Always re-fetch from /api/pcm/students. Use this whenever the user has
   *  (or might have) edited studentrecords in Heidi and we want the FA UI
   *  to reflect it without a full page reload. */
  refreshStudents: () => Promise<void>;

  // ------- Event data loading (real DB) -------
  eventsLoaded: boolean;
  eventsLoading: boolean;
  eventsError: string | null;
  loadEvents: () => Promise<void>;

  // ------- Event CRUD -------
  createEvent: (ev: Omit<FAEvent, "id" | "createdAt">) => Promise<FAEvent>;
  updateEvent: (id: string, patch: Partial<FAEvent>) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  /** Duplicate a source event's session + quota layout into a new draft.
   *  Only name/dates/invitation-window change; sessions and quotas are
   *  cloned 1:1. Invitations are NOT copied. After the server returns,
   *  the new event + its sessions + its quotas are added to local state
   *  via a follow-up `loadEvents()` to keep mirroring trivial. */
  duplicateEvent: (sourceId: string, args: {
    name: string;
    startDate: string;
    endDate: string;
    invitationOpenDate: string;
    invitationCloseDate: string;
    notes?: string;
  }) => Promise<FAEvent>;

  // ------- Session CRUD -------
  createSession: (s: Omit<Session, "id">) => Promise<Session>;
  updateSession: (id: string, patch: Partial<Session>) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;

  // ------- Quota CRUD -------
  setQuota: (sessionId: string, branch: BranchCode, quota: number) => Promise<void>;
  removeQuota: (sessionId: string, branch: BranchCode) => Promise<void>;

  // ------- Invitation CRUD -------
  /** Create an invitation. Returns null if rejected (already invited / quota
   *  full / event closed). The server enforces all three rules; the result
   *  shape mirrors the original local-only behaviour. */
  inviteStudent: (args: {
    eventId: string;
    sessionId: string;
    studentId: string;
    branch: BranchCode;
    /** Grade the student is being appraised for (BM picks this when inviting). */
    targetGrade: number;
    invitedBy: string;
    initialStatus?: InvitationStatus;
    allowOverQuota?: boolean;
    /** "progress" (default) or "renewal" — picked by the BM. */
    inviteType?: InviteType;
  }) => Promise<Invitation | null>;
  updateInvitationStatus: (id: string, status: InvitationStatus, by?: string) => Promise<void>;
  removeInvitation: (id: string) => Promise<void>;
  moveInvitationToSession: (invitationId: string, targetSessionId: string) => Promise<void>;
  /** Assign or clear the coach (branchstaff) on an existing invitation. Pass
   *  `null` to clear. coachName is cached so the UI doesn't have to round-trip
   *  to the main OSC DB every render. */
  assignCoachToInvitation: (
    invitationId: string,
    coachId: string | null,
    coachName: string | null,
  ) => Promise<void>;
  /** Flip an existing invitation between Progress and Renewal. */
  updateInviteType: (invitationId: string, inviteType: InviteType) => Promise<void>;
  /** Mark an invitation as paid or unpaid. Independent of attendance.
   *  `pkg` is the renewal package (required when marking paid; pass null/omit
   *  when marking unpaid — the server clears it automatically either way). */
  setInvitationPaid: (invitationId: string, paid: boolean, pkg?: PackageOption | null) => Promise<void>;
  /** Mark whether the absence make-up video was sent to the parent (no_show). */
  setInvitationVideoSent: (invitationId: string, videoSentToParent: boolean) => Promise<void>;
  /** Save (or clear with null) the absence make-up video link for an invitation. */
  setInvitationVideoLink: (invitationId: string, videoLink: string | null) => Promise<void>;
  /** Set the parent's expected arrival window/time (null clears either). */
  setInvitationArrival: (invitationId: string, arrivalWindow: ArrivalWindow | null, arrivalTime: string | null) => Promise<void>;
  /** Move an invitation to a (possibly different) event + session. The
   *  server writes both event_id and session_id in one PATCH. Use this
   *  for the "Reschedule with target picker" flow; `moveInvitationToSession`
   *  remains for the simple same-event move used by Academy's panel. */
  rescheduleInvitation: (
    invitationId: string,
    targetEventId: string,
    targetSessionId: string,
  ) => Promise<void>;

  // ------- Multi-grade override toggles (Academy/Admin only) -------
  grantEventBranchOverride: (args: {
    eventId: string;
    branchCode: BranchCode;
    dayPolicy?: DayPolicy;
    reason?: string;
  }) => Promise<EventBranchOverride>;
  revokeEventBranchOverride: (eventId: string, branchCode: BranchCode) => Promise<void>;

  // ------- Display order (per session) — local-only -------
  sessionOrder: Record<string, string[]>;
  setSessionOrder: (sessionId: string, invitationIds: string[]) => void;

  // ------- Inventory packing checklist — local-only -------
  packedItems: Record<string, string[]>;
  togglePackedItem: (eventId: string, itemKey: string) => void;
  walkInBuffer: Record<string, Record<number, number>>;
  setWalkInBufferForGrade: (eventId: string, grade: number, n: number) => void;

  // ------- Utilities -------
  resetToSeed: () => void;
}

// ----------------------------------------------------------------------------
// API helpers
// ----------------------------------------------------------------------------

/** Shared student-fetch implementation used by both loadStudents (first-load)
 *  and refreshStudents (force re-fetch). Hits /api/pcm/students with cache:
 *  no-store so we always get the latest snapshot from studentrecords.
 *  Defined outside the store so both methods can share it without a closure
 *  over the store factory. */
async function fetchAndStoreStudents(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set: (partial: any) => void,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _get: () => any,
): Promise<void> {
  set({ studentsLoading: true, studentsError: null });
  try {
    const res = await fetch("/api/pcm/students", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { students: Student[]; report?: StudentLoadReport };
    set({
      students: data.students,
      studentsReport: data.report ?? null,
      studentsLoaded: true,
      studentsLoading: false,
      studentsFetchedAt: Date.now(),
    });
  } catch (err) {
    set({
      studentsError: err instanceof Error ? err.message : "Unknown error",
      studentsLoading: false,
    });
  }
}

async function apiJson<T>(
  url: string,
  init: RequestInit = {}
): Promise<{ ok: true; data: T } | { ok: false; status: number; body: unknown }> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {}
    return { ok: false, status: res.status, body };
  }
  const data = (await res.json()) as T;
  return { ok: true, data };
}

export const useFAStore = create<FAStore>()(
  persist(
    (set, get) => ({
      users: MOCK_USERS,
      students: [],
      events: [],
      sessions: [],
      quotas: [],
      invitations: [],
      eventBranchOverrides: [],
      reports: [],
      reportsLoaded: false,
      reportsLoading: false,
      sessionOrder: {},
      packedItems: {},
      walkInBuffer: {},
      currentUserId: null,
      studentsLoaded: false,
      studentsLoading: false,
      studentsError: null,
      studentsReport: null,
      studentsFetchedAt: null,
      eventsLoaded: false,
      eventsLoading: false,
      eventsError: null,

      login: (userId) => set({ currentUserId: userId }),
      logout: () => set({ currentUserId: null }),

      // ------- Student data loading -------
      // Internal helper: actually hits the API. Both loadStudents and
      // refreshStudents go through this so the in-flight guard and result
      // handling stay identical.
      loadStudents: async () => {
        if (get().studentsLoaded || get().studentsLoading) return;
        await fetchAndStoreStudents(set, get);
      },
      refreshStudents: async () => {
        if (get().studentsLoading) return;
        await fetchAndStoreStudents(set, get);
      },

      // ------- Event data loading (events + sessions + quotas + invitations) -------
      loadEvents: async () => {
        if (get().eventsLoading) return;
        set({ eventsLoading: true, eventsError: null });
        try {
          const res = await fetch("/api/pcm/data", { cache: "no-store" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = (await res.json()) as {
            events: FAEvent[];
            sessions: Session[];
            quotas: SessionQuota[];
            invitations: Invitation[];
            overrides?: EventBranchOverride[];
          };
          set({
            events: data.events,
            sessions: data.sessions,
            quotas: data.quotas,
            invitations: data.invitations,
            eventBranchOverrides: data.overrides ?? [],
            eventsLoaded: true,
            eventsLoading: false,
          });
        } catch (err) {
          set({
            eventsError: err instanceof Error ? err.message : "Unknown error",
            eventsLoading: false,
          });
        }
      },

      // ------- Reports -------
      loadReports: async () => {
        if (get().reportsLoading) return;
        set({ reportsLoading: true });
        try {
          const r = await apiJson<{ reports: PcmReport[] }>("/api/pcm/reports");
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          set({ reports: r.data.reports, reportsLoaded: true, reportsLoading: false });
        } catch {
          set({ reportsLoading: false });
        }
      },
      saveReport: async (report) => {
        const r = await apiJson<{ report: PcmReport }>("/api/pcm/reports", {
          method: "POST",
          body: JSON.stringify(report),
        });
        if (!r.ok) {
          const detail = (r.body as { error?: string })?.error ?? `HTTP ${r.status}`;
          throw new Error(`Save report failed: ${detail}`);
        }
        const saved = r.data.report;
        // Replace if exists (same invitation_id), else append.
        set((s) => {
          const without = s.reports.filter(x => x.invitationId !== saved.invitationId);
          return { reports: [saved, ...without] };
        });
        return saved;
      },

      // ------- Events -------
      createEvent: async (ev) => {
        const r = await apiJson<FAEvent>("/api/pcm/events", {
          method: "POST",
          body: JSON.stringify(ev),
        });
        if (!r.ok) {
          const detail = (r.body as { error?: string })?.error;
          throw new Error(
            `Create event failed (HTTP ${r.status})${detail ? ": " + detail : ""}`
          );
        }
        const newEvent = r.data;
        set((s) => ({ events: [...s.events, newEvent] }));
        return newEvent;
      },

      updateEvent: async (id, patch) => {
        const r = await apiJson<FAEvent>(`/api/pcm/events/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
        if (!r.ok) throw new Error(`Update event failed (HTTP ${r.status})`);
        const updated = r.data;
        set((s) => ({
          events: s.events.map((e) => (e.id === id ? updated : e)),
        }));
      },

      duplicateEvent: async (sourceId, args) => {
        const r = await apiJson<{ event: FAEvent }>(
          `/api/pcm/events/${encodeURIComponent(sourceId)}/duplicate`,
          { method: "POST", body: JSON.stringify(args) },
        );
        if (!r.ok) {
          const detail = (r.body as { error?: string })?.error ?? `HTTP ${r.status}`;
          throw new Error(`Duplicate failed: ${detail}`);
        }
        // Server cloned sessions + quotas — the simplest way to keep local
        // state in sync is to re-fetch the whole bundle. Cheaper than
        // mirroring every insert by hand.
        await get().loadEvents();
        return r.data.event;
      },

      deleteEvent: async (id) => {
        const r = await apiJson<{ ok: true }>(`/api/pcm/events/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (!r.ok) throw new Error(`Delete event failed (HTTP ${r.status})`);
        // Server cascades; mirror locally.
        const sessionIds = get().sessions.filter((s) => s.eventId === id).map((s) => s.id);
        set((s) => ({
          events: s.events.filter((e) => e.id !== id),
          sessions: s.sessions.filter((ss) => ss.eventId !== id),
          quotas: s.quotas.filter((q) => !sessionIds.includes(q.sessionId)),
          invitations: s.invitations.filter((i) => i.eventId !== id),
          // The DB cascades the override rows via FK; mirror locally.
          eventBranchOverrides: s.eventBranchOverrides.filter((o) => o.eventId !== id),
        }));
      },

      // ------- Sessions -------
      createSession: async (sess) => {
        const r = await apiJson<Session>("/api/pcm/sessions", {
          method: "POST",
          body: JSON.stringify(sess),
        });
        if (!r.ok) throw new Error(`Create session failed (HTTP ${r.status})`);
        const newSession = r.data;
        set((s) => ({ sessions: [...s.sessions, newSession] }));
        return newSession;
      },

      updateSession: async (id, patch) => {
        const r = await apiJson<Session>(`/api/pcm/sessions/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
        if (!r.ok) throw new Error(`Update session failed (HTTP ${r.status})`);
        const updated = r.data;
        set((s) => ({
          sessions: s.sessions.map((ss) => (ss.id === id ? updated : ss)),
        }));
      },

      deleteSession: async (id) => {
        const r = await apiJson<{ ok: true }>(`/api/pcm/sessions/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (!r.ok) throw new Error(`Delete session failed (HTTP ${r.status})`);
        set((s) => ({
          sessions: s.sessions.filter((ss) => ss.id !== id),
          quotas: s.quotas.filter((q) => q.sessionId !== id),
          invitations: s.invitations.filter((i) => i.sessionId !== id),
        }));
      },

      // ------- Quotas -------
      setQuota: async (sessionId, branch, quota) => {
        const r = await apiJson<{ quota: SessionQuota | null }>("/api/pcm/quotas", {
          method: "PUT",
          body: JSON.stringify({ sessionId, branch, quota }),
        });
        if (!r.ok) throw new Error(`Set quota failed (HTTP ${r.status})`);
        const result = r.data.quota;
        set((s) => {
          const without = s.quotas.filter(
            (q) => !(q.sessionId === sessionId && q.branch === branch)
          );
          return { quotas: result ? [...without, result] : without };
        });
      },

      removeQuota: async (sessionId, branch) => {
        await get().setQuota(sessionId, branch, 0);
      },

      // ------- Invitations -------
      inviteStudent: async ({
        eventId,
        sessionId,
        studentId,
        branch,
        targetGrade,
        invitedBy,
        initialStatus,
        allowOverQuota,
        inviteType,
      }) => {
        const r = await apiJson<{ invitation: Invitation | null; reason?: string }>(
          "/api/pcm/invitations",
          {
            method: "POST",
            body: JSON.stringify({
              eventId,
              sessionId,
              studentId,
              branch,
              targetGrade,
              invitedBy,
              initialStatus,
              allowOverQuota,
              inviteType,
            }),
          }
        );
        // 409 = business rule rejection; surface as `null` like the old store
        // so existing call sites that check `if (!created)` keep working.
        if (!r.ok && r.status === 409) return null;
        if (!r.ok && r.status === 404) return null;
        if (!r.ok) throw new Error(`Invite failed (HTTP ${r.status})`);
        const inv = r.data.invitation;
        if (!inv) return null;
        set((s) => ({ invitations: [...s.invitations, inv] }));
        return inv;
      },

      updateInvitationStatus: async (id, status, by) => {
        const r = await apiJson<Invitation>(`/api/pcm/invitations/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ status, markedBy: by }),
        });
        if (!r.ok) throw new Error(`Update invitation failed (HTTP ${r.status})`);
        const updated = r.data;
        set((s) => {
          const invitations = s.invitations.map((i) => (i.id === id ? updated : i));
          // When attendance is marked, persist the picked grade onto the
          // student's faHistory so the FA tick stays after the event.
          if (status === "attended" && updated.targetGrade != null) {
            const students = s.students.map((st) =>
              st.id === updated.studentId
                ? {
                    ...st,
                    faHistory: { ...st.faHistory, [updated.targetGrade]: true },
                  }
                : st
            );
            return { invitations, students };
          }
          return { invitations };
        });
      },

      rescheduleInvitation: async (id, targetEventId, targetSessionId) => {
        const r = await apiJson<Invitation>(
          `/api/pcm/invitations/${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            body: JSON.stringify({ eventId: targetEventId, sessionId: targetSessionId }),
          }
        );
        if (!r.ok) {
          const detail = (r.body as { error?: string })?.error ?? `HTTP ${r.status}`;
          throw new Error(`Reschedule failed: ${detail}`);
        }
        const updated = r.data;
        set((s) => ({
          invitations: s.invitations.map((i) => (i.id === id ? updated : i)),
        }));
      },

      setInvitationPaid: async (id, paid, pkg) => {
        const r = await apiJson<Invitation>(
          `/api/pcm/invitations/${encodeURIComponent(id)}`,
          { method: "PATCH", body: JSON.stringify({ paid, package: paid ? (pkg ?? null) : null }) },
        );
        if (!r.ok) throw new Error(`Set paid failed (HTTP ${r.status})`);
        const updated = r.data;
        set((s) => ({
          invitations: s.invitations.map((i) => (i.id === id ? updated : i)),
        }));
      },

      setInvitationVideoSent: async (id, videoSentToParent) => {
        const r = await apiJson<Invitation>(
          `/api/pcm/invitations/${encodeURIComponent(id)}`,
          { method: "PATCH", body: JSON.stringify({ videoSentToParent }) },
        );
        if (!r.ok) throw new Error(`Set video-sent failed (HTTP ${r.status})`);
        const updated = r.data;
        set((s) => ({
          invitations: s.invitations.map((i) => (i.id === id ? updated : i)),
        }));
      },

      setInvitationVideoLink: async (id, videoLink) => {
        const r = await apiJson<Invitation>(
          `/api/pcm/invitations/${encodeURIComponent(id)}`,
          { method: "PATCH", body: JSON.stringify({ videoLink }) },
        );
        if (!r.ok) throw new Error(`Set video-link failed (HTTP ${r.status})`);
        const updated = r.data;
        set((s) => ({
          invitations: s.invitations.map((i) => (i.id === id ? updated : i)),
        }));
      },

      setInvitationArrival: async (id, arrivalWindow, arrivalTime) => {
        const r = await apiJson<Invitation>(
          `/api/pcm/invitations/${encodeURIComponent(id)}`,
          { method: "PATCH", body: JSON.stringify({ arrivalWindow, arrivalTime }) },
        );
        if (!r.ok) throw new Error(`Set arrival failed (HTTP ${r.status})`);
        const updated = r.data;
        set((s) => ({
          invitations: s.invitations.map((i) => (i.id === id ? updated : i)),
        }));
      },

      updateInviteType: async (id, inviteType) => {
        const r = await apiJson<Invitation>(
          `/api/pcm/invitations/${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            body: JSON.stringify({ inviteType }),
          }
        );
        if (!r.ok) throw new Error(`Update invite type failed (HTTP ${r.status})`);
        const updated = r.data;
        set((s) => ({
          invitations: s.invitations.map((i) => (i.id === id ? updated : i)),
        }));
      },

      assignCoachToInvitation: async (id, coachId, coachName) => {
        const r = await apiJson<Invitation>(
          `/api/pcm/invitations/${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            body: JSON.stringify({ coachId, coachName }),
          }
        );
        if (!r.ok) throw new Error(`Assign coach failed (HTTP ${r.status})`);
        const updated = r.data;
        set((s) => ({
          invitations: s.invitations.map((i) => (i.id === id ? updated : i)),
        }));
      },

      removeInvitation: async (id) => {
        const r = await apiJson<{ ok: true }>(`/api/pcm/invitations/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (!r.ok) throw new Error(`Remove invitation failed (HTTP ${r.status})`);
        set((s) => ({
          invitations: s.invitations.filter((i) => i.id !== id),
          sessionOrder: Object.fromEntries(
            Object.entries(s.sessionOrder).map(([sid, ids]) => [sid, ids.filter((x) => x !== id)])
          ),
        }));
      },

      // ------- Multi-grade override toggles -------
      grantEventBranchOverride: async ({ eventId, branchCode, dayPolicy, reason }) => {
        const r = await apiJson<{ override: EventBranchOverride }>(
          "/api/pcm/event-overrides",
          {
            method: "POST",
            body: JSON.stringify({ eventId, branchCode, dayPolicy, reason }),
          }
        );
        if (!r.ok) {
          const status = r.status;
          const detail = (r.body as { error?: string })?.error ?? `HTTP ${status}`;
          throw new Error(`Grant override failed: ${detail}`);
        }
        const override = r.data.override;
        set((s) => {
          const without = s.eventBranchOverrides.filter(
            (o) => !(o.eventId === eventId && o.branchCode === branchCode)
          );
          return { eventBranchOverrides: [...without, override] };
        });
        return override;
      },

      revokeEventBranchOverride: async (eventId, branchCode) => {
        const r = await apiJson<{ ok: true }>("/api/pcm/event-overrides", {
          method: "DELETE",
          body: JSON.stringify({ eventId, branchCode }),
        });
        if (!r.ok) {
          const detail = (r.body as { error?: string })?.error ?? `HTTP ${r.status}`;
          throw new Error(`Revoke override failed: ${detail}`);
        }
        set((s) => ({
          eventBranchOverrides: s.eventBranchOverrides.filter(
            (o) => !(o.eventId === eventId && o.branchCode === branchCode)
          ),
        }));
      },

      moveInvitationToSession: async (invitationId, targetSessionId) => {
        const inv = get().invitations.find((i) => i.id === invitationId);
        if (!inv) return;
        const sourceSessionId = inv.sessionId;
        if (sourceSessionId === targetSessionId) return;

        const r = await apiJson<Invitation>(
          `/api/pcm/invitations/${encodeURIComponent(invitationId)}`,
          {
            method: "PATCH",
            body: JSON.stringify({ sessionId: targetSessionId }),
          }
        );
        if (!r.ok) throw new Error(`Move invitation failed (HTTP ${r.status})`);
        const updated = r.data;

        set((s) => {
          const newInvitations = s.invitations.map((i) => (i.id === invitationId ? updated : i));
          const sourceOrder = (s.sessionOrder[sourceSessionId] ?? []).filter(
            (x) => x !== invitationId
          );
          const existingTarget = s.sessionOrder[targetSessionId] ?? [];
          const targetOrder = existingTarget.includes(invitationId)
            ? existingTarget
            : [...existingTarget, invitationId];
          return {
            invitations: newInvitations,
            sessionOrder: {
              ...s.sessionOrder,
              [sourceSessionId]: sourceOrder,
              [targetSessionId]: targetOrder,
            },
          };
        });
      },

      // ------- Display order -------
      setSessionOrder: (sessionId, invitationIds) => {
        set((s) => ({
          sessionOrder: { ...s.sessionOrder, [sessionId]: invitationIds },
        }));
      },

      // ------- Inventory packing checklist -------
      togglePackedItem: (eventId, itemKey) => {
        set((s) => {
          const current = s.packedItems[eventId] ?? [];
          const next = current.includes(itemKey)
            ? current.filter((k) => k !== itemKey)
            : [...current, itemKey];
          return { packedItems: { ...s.packedItems, [eventId]: next } };
        });
      },
      setWalkInBufferForGrade: (eventId, grade, n) => {
        set((s) => {
          const current = s.walkInBuffer[eventId] ?? {};
          const value = Math.max(0, Math.floor(n));
          const next = { ...current };
          if (value === 0) {
            delete next[grade];
          } else {
            next[grade] = value;
          }
          return { walkInBuffer: { ...s.walkInBuffer, [eventId]: next } };
        });
      },

      // ------- Utilities -------
      resetToSeed: () => {
        // Clear everything that comes from the server so the next load
        // re-hydrates fresh from the DB.
        set({
          users: MOCK_USERS,
          students: [],
          studentsLoaded: false,
          studentsError: null,
          studentsReport: null,
          studentsFetchedAt: null,
          events: [],
          sessions: [],
          quotas: [],
          invitations: [],
          eventBranchOverrides: [],
          eventsLoaded: false,
          eventsError: null,
          sessionOrder: {},
          packedItems: {},
          walkInBuffer: {},
          currentUserId: null,
        });
        void get().loadStudents();
        void get().loadEvents();
      },
    }),
    {
      // Bumped from v2 → v3: events/sessions/quotas/invitations are no longer
      // persisted (server is source of truth). The key change forces existing
      // browsers to drop their stale local data on first load.
      name: "fa-system-storage-v3",
      partialize: (s) => ({
        // Only persist UI-only state. Domain data lives on the server.
        sessionOrder: s.sessionOrder,
        packedItems: s.packedItems,
        walkInBuffer: s.walkInBuffer,
        currentUserId: s.currentUserId,
      }),
    }
  )
);

// ------- Selectors -------
export const selectEventById = (id: string) => (state: FAStore) =>
  state.events.find((e) => e.id === id);

export const selectSessionsForEvent = (eventId: string) => (state: FAStore) =>
  state.sessions
    .filter((s) => s.eventId === eventId)
    .sort((a, b) => a.dayNumber - b.dayNumber || a.sessionNumber - b.sessionNumber);

export const selectQuotasForSession = (sessionId: string) => (state: FAStore) =>
  state.quotas.filter((q) => q.sessionId === sessionId);

export const selectInvitationsForSession = (sessionId: string) => (state: FAStore) =>
  state.invitations.filter((i) => i.sessionId === sessionId);

export const selectInvitationsForEvent = (eventId: string) => (state: FAStore) =>
  state.invitations.filter((i) => i.eventId === eventId);

export const selectStudentsForBranch = (branch: BranchCode) => (state: FAStore) =>
  state.students.filter((s) => s.branch === branch);
