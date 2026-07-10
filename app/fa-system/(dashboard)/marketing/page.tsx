"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { Plus, Search, Check, KeyRound } from "lucide-react";
import { useFAStore } from "@fa/_lib/store";
import { useCurrentUser } from "@fa/_hooks/useCurrentUser";
import { AppShell } from "@fa/_components/shared/AppShell";
import { EditEventModal, EditEventPatch } from "@fa/_components/fa/EditEventModal";
import { PreviewEventModal } from "@fa/_components/fa/PreviewEventModal";
import { HeroCard } from "@fa/_components/fa/HeroCard";
import { EventRow } from "@fa/_components/fa/EventRow";
import { ArchiveRow } from "@fa/_components/fa/ArchiveRow";
import { MultiGradeManagerModal } from "@fa/_components/fa/MultiGradeManagerModal";
import { DuplicateEventModal } from "@fa/_components/fa/DuplicateEventModal";
import { Z } from "@fa/_lib/zIndex";
import { EventStatus, FAEvent, countsAsConfirmed, countsAsAttended } from "@fa/_types";

export default function MarketingEventsPage() {
  const user = useCurrentUser();
  const events = useFAStore(s => s.events);
  const sessions = useFAStore(s => s.sessions);
  const invitations = useFAStore(s => s.invitations);
  const quotas = useFAStore(s => s.quotas);
  const updateEvent = useFAStore(s => s.updateEvent);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatus] = useState<EventStatus | "all">("all");
  const [previewEvent, setPreviewEvent] = useState<FAEvent | null>(null);
  const [editEvent,    setEditEvent]    = useState<FAEvent | null>(null);
  const [savedToast,   setSavedToast]   = useState(false);
  const [multiGradeOpen, setMultiGradeOpen] = useState(false);
  const [duplicateSource, setDuplicateSource] = useState<FAEvent | null>(null);

  // Total branches currently unlocked across all events — surfaced as a
  // counter pip on the "Multi-Grade" button so Marketing notices at a
  // glance how many overrides are active.
  const overrides = useFAStore(s => s.eventBranchOverrides);
  const totalUnlocked = overrides.length;

  function handleSaveEdit(patch: EditEventPatch) {
    if (!editEvent) return;
    updateEvent(editEvent.id, patch);
    setEditEvent(null);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2200);
  }

  const filtered = useMemo(() =>
    events
      .filter(e => statusFilter === "all" || e.status === statusFilter)
      .filter(e =>
        !search ||
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.venue.toLowerCase().includes(search.toLowerCase())
      ),
    [events, statusFilter, search]
  );

  const upcoming = useMemo(() =>
    filtered
      .filter(e => e.status !== "completed")
      .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [filtered]
  );

  const archive = useMemo(() =>
    filtered
      .filter(e => e.status === "completed")
      .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [filtered]
  );

  const sessionCount  = (id: string) => sessions.filter(s => s.eventId === id).length;
  const invitationCount = (id: string) => invitations.filter(i => i.eventId === id).length;
  // Confirmed = everyone who confirmed (attended + no_show both confirmed first).
  const confirmedCount = (id: string) =>
    invitations.filter(i => i.eventId === id && countsAsConfirmed(i.status)).length;
  // Attended = students who actually showed up (marked attended, or walked in).
  const attendedCount = (id: string) =>
    invitations.filter(i => i.eventId === id && countsAsAttended(i.status)).length;
  const quotaTotal = (id: string) => {
    const sessionIds = new Set(sessions.filter(s => s.eventId === id).map(s => s.id));
    return quotas.filter(q => sessionIds.has(q.sessionId)).reduce((sum, q) => sum + q.quota, 0);
  };

  const heroEvent    = upcoming[0] ?? null;
  const alsoUpcoming = upcoming.slice(1);
  const isEmpty      = upcoming.length === 0 && archive.length === 0;

  if (!user || user.role !== "MKT") return null;

  return (
    <AppShell>
      {/* ── Masthead ─────────────────────────────────────────────────── */}
      <div className="fa-enter">
        <div className="flex items-end justify-between gap-6">
          <div>
            <div
              className="fa-mono text-[10px] uppercase text-gold-600 mb-3"
              style={{ letterSpacing: "0.12em" }}
            >
              FA Marketing
            </div>
            <h1 className="fa-display-italic text-8xl text-ink-900">Events</h1>
          </div>
          <div className="mb-1 flex-shrink-0">
            <Link href="/fa-system/marketing/events/new" className="fa-btn-primary">
              <Plus className="w-4 h-4" />
              New event
            </Link>
          </div>
        </div>
        <hr className="border-0 border-t border-gold-200 mt-6" />
      </div>

      {/* ── Sticky filter strip ──────────────────────────────────────── */}
      <div
        className="sticky top-0 bg-ivory-50/85 backdrop-blur-md border-b border-gold-200/50 rounded-t-xl -mx-8 px-8 fa-enter fa-delay-1"
        style={{
          zIndex: Z.sticky,
          boxShadow: "0 4px 12px -8px rgba(12, 10, 9, 0.08)",
        }}
      >
        <div className="flex flex-wrap items-center gap-3 py-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400" />
            <input
              className="fa-input fa-input-icon-left rounded-full"
              style={{ height: "36px", minWidth: "240px", paddingLeft: "2.75rem" }}
              placeholder="Search events or venues…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="w-px h-5 bg-gold-200" />
          <div className="flex flex-wrap items-center gap-1.5">
            {(["all", "draft", "open", "ongoing", "closed", "completed"] as const).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`fa-mono text-[10px] px-2.5 py-1 rounded-[6px] border transition-all ${
                  statusFilter === s
                    ? "bg-ink-900 text-ivory-50 border-ink-900"
                    : "text-ink-500 border-ink-200 hover:border-gold-300 hover:text-ink-800 bg-transparent"
                }`}
                style={{ letterSpacing: "0.06em" }}
              >
                {s === "all" ? "All" : s}
              </button>
            ))}
          </div>

          {/* Push the multi-grade button to the right end of the filter row. */}
          <div className="ml-auto flex items-center">
            <button
              type="button"
              onClick={() => setMultiGradeOpen(true)}
              title="Unlock specific branches to invite the same student to multiple grades on one day (different sessions)."
              className="inline-flex items-center gap-1.5 fa-mono text-[10px] uppercase px-3 py-1.5 rounded-[6px] border border-gold-300 bg-gold-50 text-gold-700 hover:bg-gold-100 hover:border-gold-500 transition-all"
              style={{ letterSpacing: "0.06em" }}
            >
              <KeyRound className="w-3.5 h-3.5" />
              Multi-Grade
              {totalUnlocked > 0 && (
                <span className="ml-1 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-gold-500 text-ivory-50 text-[10px] font-semibold leading-none">
                  {totalUnlocked}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Empty state ───────────────────────────────────────────────── */}
      {isEmpty && (
        <div className="py-20 text-center fa-enter fa-delay-2">
          <div
            className="fa-mono text-[10px] uppercase text-ink-300 mb-3"
            style={{ letterSpacing: "0.12em" }}
          >
            No events
          </div>
          <p className="fa-display-italic text-4xl text-ink-300 mb-8">Nothing here yet</p>
          <Link href="/fa-system/marketing/events/new" className="fa-btn-primary">
            <Plus className="w-4 h-4" />
            New event
          </Link>
        </div>
      )}

      {/* ── Hero: next event ─────────────────────────────────────────── */}
      {heroEvent && (
        <section className="mb-10 fa-enter fa-delay-2">
          <div
            className="fa-mono text-[10px] uppercase text-gold-600 mb-4"
            style={{ letterSpacing: "0.12em" }}
          >
            Next event
          </div>
          <HeroCard
            event={heroEvent}
            sessionCount={sessionCount(heroEvent.id)}
            invitationCount={invitationCount(heroEvent.id)}
            confirmedCount={confirmedCount(heroEvent.id)}
            quotaTotal={quotaTotal(heroEvent.id)}
            onView={() => setPreviewEvent(heroEvent)}
            onEdit={() => setEditEvent(heroEvent)}
            onDuplicate={() => setDuplicateSource(heroEvent)}
          />
        </section>
      )}

      {/* ── Also upcoming ────────────────────────────────────────────── */}
      {alsoUpcoming.length > 0 && (
        <section className="mb-10 fa-enter fa-delay-3">
          <hr className="border-0 border-t border-gold-200 mb-5" />
          <div
            className="fa-mono text-[10px] uppercase text-gold-600 mb-4"
            style={{ letterSpacing: "0.12em" }}
          >
            Also upcoming
          </div>
          <div className="grid gap-2.5">
            {alsoUpcoming.map(event => (
              <EventRow
                key={event.id}
                event={event}
                sessionCount={sessionCount(event.id)}
                invitationCount={invitationCount(event.id)}
                confirmedCount={confirmedCount(event.id)}
                quotaTotal={quotaTotal(event.id)}
                onView={() => setPreviewEvent(event)}
                onEdit={() => setEditEvent(event)}
                onDuplicate={() => setDuplicateSource(event)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Archive ──────────────────────────────────────────────────── */}
      {archive.length > 0 && (
        <section className="fa-enter fa-delay-4">
          <hr className="border-0 border-t border-gold-200 mb-5" />
          <div
            className="fa-mono text-[10px] uppercase text-ink-400 mb-4"
            style={{ letterSpacing: "0.12em" }}
          >
            Archive
          </div>
          <div className="rounded-[12px] border border-gold-200 overflow-hidden">
            {archive.map((event, i) => (
              <ArchiveRow
                key={event.id}
                event={event}
                sessionCount={sessionCount(event.id)}
                invitationCount={invitationCount(event.id)}
                confirmedCount={confirmedCount(event.id)}
                attendedCount={attendedCount(event.id)}
                quotaTotal={quotaTotal(event.id)}
                isLast={i === archive.length - 1}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Preview modal ────────────────────────────────────────────── */}
      <PreviewEventModal
        open={!!previewEvent}
        onClose={() => setPreviewEvent(null)}
        event={previewEvent}
      />

      {/* ── Edit modal ───────────────────────────────────────────────── */}
      {editEvent && (
        <EditEventModal
          open={!!editEvent}
          onClose={() => setEditEvent(null)}
          event={editEvent}
          onSave={handleSaveEdit}
        />
      )}

      {/* ── Multi-Grade exceptions manager ─────────────────────────── */}
      <MultiGradeManagerModal
        open={multiGradeOpen}
        onClose={() => setMultiGradeOpen(false)}
      />

      <DuplicateEventModal
        open={!!duplicateSource}
        onClose={() => setDuplicateSource(null)}
        source={duplicateSource}
      />

      {/* ── Save toast ──────────────────────────────────────────────── */}
      {savedToast && typeof document !== "undefined" && createPortal(
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
            Event updated
          </span>
        </div>,
        document.body
      )}
    </AppShell>
  );
}
