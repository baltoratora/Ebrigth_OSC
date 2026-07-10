"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Trophy, Mic, Ribbon, Award, CalendarDays, MapPin, ChevronRight, Check, UserPlus,
} from "lucide-react";
import { useFAStore } from "@fa/_lib/store";
import { useCurrentUser } from "@fa/_hooks/useCurrentUser";
import { AppShell } from "@fa/_components/shared/AppShell";
import { EventPickerGrid } from "@fa/_components/fa/EventPickerGrid";
import { EventStatusPill } from "@fa/_components/fa/StatusPill";
import { CertificatePreviewModal } from "@fa/_components/fa/CertificatePreviewModal";
import { formatDateRange } from "@fa/_lib/date";
import { BRANCHES, countsAsAttended } from "@fa/_types";

// Stable empty default — keeps the Zustand selector referentially stable so
// the page doesn't re-render on every unrelated store update.
const EMPTY_PACKED: string[] = [];

export default function InventoryPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const events = useFAStore(s => s.events);
  const sessions = useFAStore(s => s.sessions);
  const invitations = useFAStore(s => s.invitations);
  const students = useFAStore(s => s.students);

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [previewSessionId, setPreviewSessionId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Packing checklist + walk-in buffer (persisted per event in the store).
  // Stable empty default — keeps the Zustand selector referentially stable.
  const EMPTY_BUFFER: Record<number, number> = useMemo(() => ({}), []);
  const bufferByGrade = useFAStore(s =>
    selectedEventId ? (s.walkInBuffer[selectedEventId] ?? EMPTY_BUFFER) : EMPTY_BUFFER
  );
  const setBufferForGrade = useFAStore(s => s.setWalkInBufferForGrade);
  const totalBuffer = useMemo(
    () => Object.values(bufferByGrade).reduce((sum, n) => sum + n, 0),
    [bufferByGrade]
  );
  const packedKeys = useFAStore(s =>
    selectedEventId ? (s.packedItems[selectedEventId] ?? EMPTY_PACKED) : EMPTY_PACKED
  );
  const togglePacked = useFAStore(s => s.togglePackedItem);

  // Eligible events for inventory: any event past draft (open / closed / ongoing / completed).
  const inventoryEvents = useMemo(
    () =>
      events
        .filter(
          e =>
            e.status === "open" ||
            e.status === "closed" ||
            e.status === "ongoing" ||
            e.status === "completed"
        )
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [events]
  );

  const selectedEvent = inventoryEvents.find(e => e.id === selectedEventId) ?? null;

  const inventory = useMemo(() => {
    if (!selectedEvent) return null;

    const eventSessions = sessions
      .filter(s => s.eventId === selectedEvent.id)
      .sort((a, b) => a.dayNumber - b.dayNumber || a.sessionNumber - b.sessionNumber);
    const eventInvitations = invitations.filter(i => i.eventId === selectedEvent.id);

    // Expected attendees — confirmed or attended. Same denominator across
    // medals, microphones and certificates: every kid we expect to be at
    // the showcase.
    const expectedAttendees = eventInvitations.filter(
      i => i.status === "confirmed" || countsAsAttended(i.status)
    );

    // ── Grade counts (shared by medals + microphones). Uses the BM-picked
    //    target grade (what the medal/mic will be engraved with), falling
    //    back to the student's current grade for legacy invitations that
    //    pre-date the targetGrade field.
    const gradeCounts = new Map<number, number>();
    for (const inv of expectedAttendees) {
      const student = students.find(s => s.id === inv.studentId);
      if (!student) continue;
      const grade = inv.targetGrade && inv.targetGrade > 0 ? inv.targetGrade : student.grade;
      gradeCounts.set(grade, (gradeCounts.get(grade) ?? 0) + 1);
    }
    const byGrade = Array.from(gradeCounts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([grade, count]) => ({ grade, count }));

    // ── Medals: 1 per attendee — engraved with their grade level.
    const medalsByGrade = byGrade;

    // ── Microphones: 1 per attendee — engraved with their grade. Order is
    //    placed in bulk per grade level, so the breakdown is by grade.
    const micsByGrade = byGrade;

    // ── Sashes: reused per session, not taken home. For each branch we need
    //    enough sashes to cover the worst session — i.e. the session that
    //    has the most attendees from that branch. Total is the sum of those
    //    per-branch maxes (excess is OK; running short mid-day is not).
    const sashesByBranch = BRANCHES
      .map(b => {
        const perSession = eventSessions.map(s =>
          expectedAttendees.filter(i => i.branch === b.code && i.sessionId === s.id).length
        );
        const max = perSession.length > 0 ? Math.max(...perSession) : 0;
        return { branch: b, count: max };
      })
      .filter(x => x.count > 0)
      .sort((a, b) => b.count - a.count || a.branch.code.localeCompare(b.branch.code));

    // ── Certificates: 1 per attendee, personalised with name + grade.
    //    Broken down by session — each session row is clickable to drill
    //    in and preview an example certificate.
    const certsBySession = eventSessions.map(s => ({
      session: s,
      count: expectedAttendees.filter(i => i.sessionId === s.id).length,
    }));

    return {
      medalsTotal: expectedAttendees.length,
      medalsByGrade,
      microphonesTotal: expectedAttendees.length,
      micsByGrade,
      sashesTotal: sashesByBranch.reduce((sum, x) => sum + x.count, 0),
      sashesByBranch,
      certificatesTotal: expectedAttendees.length,
      certsBySession,
    };
  }, [selectedEvent, sessions, invitations, students]);

  // Merge attendee grade counts with buffer-only grades so a grade with
  // buffer > 0 and zero attendees still gets a row in medals + mics.
  const gradeRows = useMemo(() => {
    const counts = new Map<number, number>();
    inventory?.medalsByGrade.forEach(({ grade, count }) => counts.set(grade, count));
    Object.keys(bufferByGrade).forEach(g => {
      const grade = Number(g);
      if (!counts.has(grade)) counts.set(grade, 0);
    });
    return Array.from(counts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([grade, count]) => ({ grade, count }));
  }, [inventory, bufferByGrade]);

  // BMs are bounced back to /marketing if they hit this URL directly.
  useEffect(() => {
    if (user && user.role !== "MKT") {
      router.replace("/fa-system/marketing");
    }
  }, [user, router]);

  if (!user || user.role !== "MKT") return null;

  const isPacked = (key: string) => packedKeys.includes(key);
  const onToggle = (key: string) => {
    if (selectedEvent) togglePacked(selectedEvent.id, key);
  };

  // Helper: per-section packed-progress count.
  function progress(rowKeys: string[]) {
    return {
      packed: rowKeys.filter(k => isPacked(k)).length,
      total: rowKeys.length,
    };
  }

  return (
    <AppShell>
      {/* Page header */}
      <div className="mb-8">
        <div className="text-xs uppercase tracking-wider font-semibold text-ink-400 mb-1">
          FA Marketing
        </div>
        <h1 className="fa-display text-4xl text-ink-900">Event inventory</h1>
        <p className="text-sm text-ink-500 mt-1">
          Use your browser&apos;s print function (Ctrl+P) to save as PDF.
        </p>
      </div>

      {!selectedEvent ? (
        <EventPickerGrid
          events={inventoryEvents}
          onSelect={setSelectedEventId}
          emptyTitle="No inventory to prepare"
          emptyDescription="Inventory checklists appear here once Marketing opens an event for invitations."
        />
      ) : inventory && (
        <>
          {/* Event header bar */}
          <div className="fa-card p-4 mb-4 flex items-center gap-4">
            <button
              onClick={() => setSelectedEventId(null)}
              className="fa-btn-ghost text-sm"
            >
              ← Change event
            </button>
            <div className="w-px h-8 bg-ivory-300" />
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h2 className="fa-display text-lg text-ink-900">{selectedEvent.name}</h2>
                <EventStatusPill status={selectedEvent.status} />
              </div>
              <div className="text-xs text-ink-400 flex items-center gap-3 mt-0.5">
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="w-3 h-3" />
                  {formatDateRange(selectedEvent.startDate, selectedEvent.endDate)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {selectedEvent.venue}
                </span>
              </div>
            </div>
          </div>

          {/* Walk-in buffer strip — per-grade spares for medals + microphones */}
          <div className="fa-card p-4 mb-6">
            <div className="flex items-start gap-4 mb-3">
              <div className="flex-shrink-0 w-9 h-9 rounded-[10px] bg-warning-soft text-warning flex items-center justify-center">
                <UserPlus className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="text-xs uppercase tracking-wider font-semibold text-ink-400 mb-0.5">
                  Walk-in buffer
                </div>
                <div className="text-sm text-ink-700">
                  {totalBuffer === 0
                    ? "No buffer — totals reflect confirmed attendees only."
                    : <>Pack <strong className="text-ink-900">{totalBuffer}</strong> extra{totalBuffer === 1 ? "" : "s"} (medals + mics) for unannounced students.</>}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(g => {
                const value = bufferByGrade[g] ?? 0;
                return (
                  <label key={g} className="flex flex-col items-center gap-1">
                    <span className="fa-mono text-[10px] uppercase text-ink-400" style={{ letterSpacing: "0.1em" }}>
                      Grade {g}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={99}
                      value={value}
                      onChange={e => setBufferForGrade(selectedEvent.id, g, Number(e.target.value) || 0)}
                      className="fa-mono w-full text-center px-2 py-1 rounded-[6px] border border-ink-200 text-sm bg-ivory-50 focus:outline-none focus:border-gold-400"
                      aria-label={`Walk-in buffer for grade ${g}`}
                    />
                  </label>
                );
              })}
            </div>
          </div>

          {/* Inventory cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Medals — by grade (buffer-only grades render as rows too) */}
            {(() => {
              const rowKeys = gradeRows.map(({ grade }) => `medals:G${grade}`);
              const { packed, total } = progress(rowKeys);
              return (
                <InventorySection
                  icon={<Trophy className="w-5 h-5" />}
                  iconClass="bg-gold-100 text-gold-700"
                  title="Medals"
                  subtitle="One per expected attendee (engraved by grade)"
                  total={inventory.medalsTotal + totalBuffer}
                  breakdownTitle="By grade"
                  packed={packed}
                  totalItems={total}
                >
                  {gradeRows.length === 0 ? (
                    <div className="text-sm text-ink-400">No expected attendees yet.</div>
                  ) : (
                    <div className="space-y-0.5">
                      {gradeRows.map(({ grade, count }) => {
                        const key = `medals:G${grade}`;
                        const extra = bufferByGrade[grade] ?? 0;
                        return (
                          <PackingRow
                            key={key}
                            packed={isPacked(key)}
                            onToggle={() => onToggle(key)}
                            label={
                              <>
                                Grade {grade}
                                {extra > 0 && (
                                  <span className="text-xs text-warning ml-2 font-medium">+{extra} buffer</span>
                                )}
                              </>
                            }
                            count={`× ${count + extra}`}
                          />
                        );
                      })}
                    </div>
                  )}
                </InventorySection>
              );
            })()}

            {/* Microphones — by grade (buffer-only grades render as rows too) */}
            {(() => {
              const rowKeys = gradeRows.map(({ grade }) => `mics:G${grade}`);
              const { packed, total } = progress(rowKeys);
              return (
                <InventorySection
                  icon={<Mic className="w-5 h-5" />}
                  iconClass="bg-info-soft text-info"
                  title="Microphones"
                  subtitle="One per student (takeaway gift, engraved with grade)"
                  total={inventory.microphonesTotal + totalBuffer}
                  breakdownTitle="By grade"
                  packed={packed}
                  totalItems={total}
                >
                  {gradeRows.length === 0 ? (
                    <div className="text-sm text-ink-400">No expected attendees yet.</div>
                  ) : (
                    <div className="space-y-0.5">
                      {gradeRows.map(({ grade, count }) => {
                        const key = `mics:G${grade}`;
                        const extra = bufferByGrade[grade] ?? 0;
                        return (
                          <PackingRow
                            key={key}
                            packed={isPacked(key)}
                            onToggle={() => onToggle(key)}
                            label={
                              <>
                                Grade {grade}
                                {extra > 0 && (
                                  <span className="text-xs text-warning ml-2 font-medium">+{extra} buffer</span>
                                )}
                              </>
                            }
                            count={`× ${count + extra}`}
                          />
                        );
                      })}
                    </div>
                  )}
                </InventorySection>
              );
            })()}

            {/* Sashes — worst-case per branch (buffer doesn't apply: sashes are per-branch, not per-grade) */}
            {(() => {
              const rowKeys = inventory.sashesByBranch.map(({ branch }) => `sashes:${branch.code}`);
              const { packed, total } = progress(rowKeys);
              return (
                <InventorySection
                  icon={<Ribbon className="w-5 h-5" />}
                  iconClass="bg-brand-50 text-brand-700"
                  title="Sashes"
                  subtitle="Reused per session — pack the worst-case session for each branch"
                  total={inventory.sashesTotal}
                  breakdownTitle="By branch (max session count)"
                  packed={packed}
                  totalItems={total}
                >
                  {inventory.sashesByBranch.length === 0 ? (
                    <div className="text-sm text-ink-400">No branches with expected attendees yet.</div>
                  ) : (
                    <div className="space-y-0.5">
                      {inventory.sashesByBranch.map(({ branch, count }) => {
                        const key = `sashes:${branch.code}`;
                        return (
                          <PackingRow
                            key={key}
                            packed={isPacked(key)}
                            onToggle={() => onToggle(key)}
                            label={
                              <>
                                <span className="font-mono text-xs font-semibold text-ink-700 bg-ivory-200 px-2 py-0.5 rounded mr-2">
                                  {branch.code}
                                </span>
                                {branch.name}
                              </>
                            }
                            count={`× ${count}`}
                          />
                        );
                      })}
                    </div>
                  )}
                </InventorySection>
              );
            })()}

            {/* Certificates — by session, click to preview (personalised — no buffer) */}
            {(() => {
              const rowKeys = inventory.certsBySession.map(({ session }) => `certs:${session.id}`);
              const { packed, total } = progress(rowKeys);
              return (
                <InventorySection
                  icon={<Award className="w-5 h-5" />}
                  iconClass="bg-success-soft text-success"
                  title="Certificates"
                  subtitle="One per student — click a session to preview"
                  total={inventory.certificatesTotal}
                  breakdownTitle="By session"
                  packed={packed}
                  totalItems={total}
                >
                  {inventory.certsBySession.length === 0 ? (
                    <div className="text-sm text-ink-400">No sessions yet.</div>
                  ) : (
                    <div className="space-y-0.5">
                      {inventory.certsBySession.map(({ session, count }) => {
                        const key = `certs:${session.id}`;
                        return (
                          <ClickablePackingRow
                            key={key}
                            packed={isPacked(key)}
                            onToggle={() => onToggle(key)}
                            onClick={() => {
                              setPreviewSessionId(session.id);
                              setPreviewOpen(true);
                            }}
                            label={
                              <>
                                D{session.dayNumber}·S{session.sessionNumber}
                                <span className="fa-mono text-xs text-ink-400 ml-2">
                                  {session.startTime}–{session.endTime}
                                </span>
                                {session.label && (
                                  <span className="text-xs text-ink-500 ml-2">· {session.label}</span>
                                )}
                              </>
                            }
                            count={count}
                          />
                        );
                      })}
                    </div>
                  )}
                </InventorySection>
              );
            })()}
          </div>
        </>
      )}

      {/* Certificate preview modal — opens from the certificates breakdown */}
      {selectedEvent && previewOpen && (
        <CertificatePreviewModal
          open={previewOpen}
          onClose={() => { setPreviewOpen(false); setPreviewSessionId(null); }}
          event={selectedEvent}
          initialSessionId={previewSessionId}
        />
      )}

    </AppShell>
  );
}

/* ── Section card ───────────────────────────────────────────────────────── */

function InventorySection({
  icon, iconClass, title, subtitle, total, breakdownTitle, packed, totalItems, children,
}: {
  icon: React.ReactNode;
  iconClass: string;
  title: string;
  subtitle: string;
  total: number;
  breakdownTitle: string;
  packed: number;
  totalItems: number;
  children: React.ReactNode;
}) {
  const allPacked = totalItems > 0 && packed === totalItems;
  return (
    <div className="fa-card p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className={`w-10 h-10 rounded-[10px] ${iconClass} flex items-center justify-center flex-shrink-0`}>
          {icon}
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider font-semibold text-ink-400">{subtitle}</div>
          <div className="fa-display text-xl text-ink-900">{title}</div>
        </div>
        <div className="ml-auto fa-display text-5xl text-ink-900 leading-none">{total}</div>
      </div>
      <hr className="border-0 border-t border-gold-200 my-4" />
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wider font-semibold text-ink-400">
          {breakdownTitle}
        </div>
        {totalItems > 0 && (
          <div
            className={`fa-mono text-[10px] uppercase ${allPacked ? "text-success font-semibold" : "text-ink-400"}`}
            style={{ letterSpacing: "0.1em" }}
          >
            {allPacked ? "✓ All packed" : `${packed} / ${totalItems} packed`}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

/* ── Row helpers ────────────────────────────────────────────────────────── */

function PackedCheckmark({ packed }: { packed: boolean }) {
  return (
    <span
      className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all ${
        packed ? "border-success bg-success" : "border-ink-300 bg-white"
      }`}
      aria-hidden
    >
      {packed && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
    </span>
  );
}

function PackingRow({
  packed, onToggle, label, count,
}: {
  packed: boolean;
  onToggle: () => void;
  label: React.ReactNode;
  count: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={packed}
      className="w-full flex items-center gap-2.5 text-sm py-1.5 px-2 -mx-2 rounded hover:bg-ivory-100 transition-colors text-left"
    >
      <PackedCheckmark packed={packed} />
      <span className={`flex-1 ${packed ? "line-through text-ink-400" : "text-ink-700"}`}>
        {label}
      </span>
      <span className={`fa-mono font-semibold ${packed ? "text-ink-400 line-through" : "text-ink-900"}`}>
        {count}
      </span>
    </button>
  );
}

// Two-button row: left checkbox toggles packed state, right button opens
// a drill-in (cert preview, medal student list, etc.). Used by certs and
// medals — the parent provides the onClick handler.
function ClickablePackingRow({
  packed, onToggle, onClick, label, count,
}: {
  packed: boolean;
  onToggle: () => void;
  onClick: () => void;
  label: React.ReactNode;
  count: number;
}) {
  return (
    <div className="w-full flex items-center gap-2.5 text-sm py-1.5 px-2 -mx-2 rounded hover:bg-ivory-100 transition-colors">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={packed}
        aria-label={packed ? "Mark unpacked" : "Mark packed"}
        className="flex-shrink-0"
      >
        <PackedCheckmark packed={packed} />
      </button>
      <button
        type="button"
        onClick={onClick}
        className="flex-1 flex items-center justify-between gap-2 text-left"
      >
        <span className={`${packed ? "line-through text-ink-400" : "text-ink-700"}`}>{label}</span>
        <span className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`fa-mono font-semibold ${packed ? "text-ink-400 line-through" : "text-ink-900"}`}>
            {count}
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-ink-400" />
        </span>
      </button>
    </div>
  );
}

function BufferRow({
  packed, onToggle, buffer,
}: {
  packed: boolean;
  onToggle: () => void;
  buffer: number;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={packed}
      className="w-full flex items-center gap-2.5 text-sm py-1.5 px-2 -mx-2 mt-1 rounded border-l-2 border-l-warning bg-warning-soft/30 hover:bg-warning-soft/50 transition-colors text-left"
    >
      <PackedCheckmark packed={packed} />
      <span className={`flex-1 ${packed ? "line-through text-ink-400" : "text-warning font-medium"}`}>
        Walk-in buffer
        <span className="fa-mono text-xs text-ink-400 ml-2 font-normal">spares</span>
      </span>
      <span className={`fa-mono font-semibold ${packed ? "text-ink-400 line-through" : "text-ink-900"}`}>
        + {buffer}
      </span>
    </button>
  );
}
