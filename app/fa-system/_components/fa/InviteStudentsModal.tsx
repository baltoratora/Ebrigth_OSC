"use client";

import { useState, useMemo } from "react";
import { Search, Check, KeyRound } from "lucide-react";
import { useFAStore } from "@fa/_lib/store";
import { useCurrentUser } from "@fa/_hooks/useCurrentUser";
import { Modal } from "@fa/_components/shared/Modal";
import { StatusPill } from "@fa/_components/fa/StatusPill";
import { DayPolicy, Invitation, Session, isStudentEligible, hasBacklog, invitableGradesFor, gradeLabel } from "@fa/_types";

export interface InvitePick {
  studentId: string;
  targetGrade: number;
}

export function InviteStudentsModal({
  open, onClose, session, quota, currentInvitations, allInvitationsForEvent, onInvite,
}: {
  open: boolean;
  onClose: () => void;
  session: Session;
  /** Marketing-set confirm target for this session/branch. Invite cap is 3× this. */
  quota: number;
  currentInvitations: Invitation[];
  allInvitationsForEvent: Invitation[];
  onInvite: (picks: InvitePick[]) => void;
}) {
  const user = useCurrentUser();
  const allStudents = useFAStore(s => s.students);
  const allSessions = useFAStore(s => s.sessions);
  const overrides = useFAStore(s => s.eventBranchOverrides);

  const students = useMemo(
    () => allStudents.filter(st => st.branch === user?.branch),
    [allStudents, user?.branch]
  );

  // Is this branch unlocked for multi-grade invites in this event?
  const branchOverride = useMemo(() => {
    if (!user?.branch) return undefined;
    return overrides.find(
      o => o.eventId === session.eventId && o.branchCode === user.branch
    );
  }, [overrides, session.eventId, user?.branch]);
  const multiGradeAllowed = !!branchOverride;
  // Which extra invites this branch may issue (defaults to legacy same-day).
  const dayPolicy: DayPolicy = branchOverride?.dayPolicy ?? "SAME_DAY";

  const [search, setSearch] = useState("");
  // Pick map keyed by `${studentId}:${grade}` so multi-grade students can have
  // multiple picks at once. Stored grade is the actual target grade.
  const [picks, setPicks] = useState<Map<string, { studentId: string; grade: number }>>(new Map());
  const [filterMode, setFilterMode] = useState<"eligible" | "all" | "archived">("eligible");
  const archivedCount = useMemo(() => students.filter(s => s.archived).length, [students]);
  const [gradeFilter, setGradeFilter] = useState<number | "all">("all");

  const inviteCap = quota * 3;
  const remaining = inviteCap - currentInvitations.length;

  // Build per-student summary of existing invites in this event:
  //   - grades: set of grades already invited for (dedup is day-independent)
  //   - days:   every day they're already booked on (a student may be on more
  //             than one day once DIFF_DAY / BOTH policies are in play)
  // Used both for the visibility gate and to suppress "duplicate" grade pills.
  const sessionById = useMemo(() => {
    const m = new Map<string, Session>();
    for (const s of allSessions) m.set(s.id, s);
    return m;
  }, [allSessions]);

  const bookingByStudent = useMemo(() => {
    const m = new Map<string, { days: Set<number>; grades: Set<number> }>();
    for (const inv of allInvitationsForEvent) {
      const sess = sessionById.get(inv.sessionId);
      if (!sess) continue;
      const existing = m.get(inv.studentId);
      if (existing) {
        existing.grades.add(inv.targetGrade);
        existing.days.add(sess.dayNumber);
      } else {
        m.set(inv.studentId, { days: new Set([sess.dayNumber]), grades: new Set([inv.targetGrade]) });
      }
    }
    return m;
  }, [allInvitationsForEvent, sessionById]);

  const visibleStudents = useMemo(() => {
    let list = students;
    // Archived students are kept in their own tab. The eligible/all tabs show
    // only the live roster; the archived tab shows only archived students.
    if (filterMode === "archived") {
      list = list.filter(s => s.archived);
    } else {
      list = list.filter(s => !s.archived);
      if (filterMode === "eligible") list = list.filter(s => isStudentEligible(s));
    }
    if (gradeFilter !== "all") list = list.filter(s => s.grade === gradeFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        s => s.name.toLowerCase().includes(q) ||
             s.id.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => {
      const ae = isStudentEligible(a) ? 0 : 1;
      const be = isStudentEligible(b) ? 0 : 1;
      if (ae !== be) return ae - be;
      return a.name.localeCompare(b.name);
    });
  }, [students, search, filterMode, gradeFilter]);

  function toggleGrade(studentId: string, grade: number) {
    const key = `${studentId}:${grade}`;
    setPicks(prev => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (next.size >= remaining) return prev;
        next.set(key, { studentId, grade });
      }
      return next;
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Invite students — Day ${session.dayNumber} Session ${session.sessionNumber}`}
      description={`${session.startTime}–${session.endTime}${session.label ? ` · ${session.label}` : ""} · ${remaining} of ${inviteCap} invite slots open (target: ${quota} confirmed)`}
      size="xl"
    >
      {/* Multi-grade unlocked banner (only shown when Marketing unlocked this branch) */}
      {multiGradeAllowed && branchOverride && (
        <div className="mb-4 p-3 rounded-[10px] bg-gold-50 border border-gold-300 flex items-center gap-3">
          <div className="w-8 h-8 rounded-[8px] bg-gold-500 text-ivory-50 flex items-center justify-center flex-shrink-0">
            <KeyRound className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="fa-mono text-[10px] uppercase text-gold-600 font-semibold" style={{ letterSpacing: "0.12em" }}>
              Multi-Grade unlocked
            </div>
            <div className="text-xs text-ink-700 mt-0.5">
              {dayPolicy === "DIFF_DAY"
                ? "Your branch may invite the same student to additional grades, each on a different day."
                : dayPolicy === "BOTH"
                  ? "Your branch may invite the same student to multiple grades on the same day or a different day."
                  : "Your branch may invite the same student to multiple grades on the same day (different sessions)."}
              <span className="text-ink-400 ml-1">
                Granted by <span className="font-mono">{branchOverride.grantedBy}</span>
                {" · "}
                {new Date(branchOverride.grantedAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4 pb-4 border-b border-ivory-300">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
          <input
            className="fa-input fa-input-icon-left"
            placeholder="Search by name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select
          className="fa-input w-32"
          value={gradeFilter}
          onChange={e => setGradeFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
          aria-label="Filter by grade"
        >
          <option value="all">All grades</option>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map(g => (
            <option key={g} value={g}>{gradeLabel(g)}</option>
          ))}
        </select>

        <div className="flex items-center gap-1 bg-ivory-200 p-1 rounded-lg">
          <button
            onClick={() => setFilterMode("eligible")}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              filterMode === "eligible" ? "bg-white text-ink-900 shadow-sm" : "text-ink-500"
            }`}
          >
            Eligible only
          </button>
          <button
            onClick={() => setFilterMode("all")}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              filterMode === "all" ? "bg-white text-ink-900 shadow-sm" : "text-ink-500"
            }`}
          >
            All active
          </button>
          <button
            onClick={() => setFilterMode("archived")}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              filterMode === "archived" ? "bg-white text-ink-900 shadow-sm" : "text-ink-500"
            }`}
          >
            Archived{archivedCount > 0 ? ` (${archivedCount})` : ""}
          </button>
        </div>

        <div className="text-sm text-ink-500">
          <strong className="text-ink-900">{picks.size}</strong> / {remaining} selected
        </div>
      </div>

      {/* Legend — the green ✓ is COMPLETION history (from Heidi), not an
          invitation. Spelled out so a tick is never mistaken for "invited". */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-[11px] text-ink-500">
        <span><span className="text-success font-mono">G✓</span> completed (history)</span>
        <span><span className="text-danger font-mono">G✗</span> not done — can invite</span>
        <span><span className="font-mono line-through text-ink-400">G✓</span> already invited this event</span>
        <span><span className="font-mono text-brand-600">G✓</span> selected now</span>
      </div>

      {/* List */}
      <div className="max-h-[50vh] overflow-y-auto">
        {visibleStudents.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-400">
            No students match.
          </div>
        ) : (
          <div className="space-y-1">
            {visibleStudents.map(student => {
              const eligible = isStudentEligible(student);
              const backlog = hasBacklog(student);
              const booking = bookingByStudent.get(student.id);
              const hasPriorBookingInEvent = !!booking;

              // Visibility / lock rules (the branch's dayPolicy drives the day
              // dimension; a different grade is always required either way):
              //   • No prior booking → eligible, all invitable grades pickable.
              //   • Prior booking, toggle OFF → fully locked (old behaviour).
              //   • Toggle ON, SAME_DAY → locked if booked on a different day
              //     (all invites must share one day).
              //   • Toggle ON, DIFF_DAY → locked if already booked on THIS day
              //     (extra invites must land on a different day).
              //   • Toggle ON, BOTH → never day-locked; pick any unbooked grade.
              let lockReason: null | "already-invited" | string = null;
              if (hasPriorBookingInEvent) {
                if (!multiGradeAllowed) {
                  lockReason = "already-invited";
                } else if (dayPolicy === "SAME_DAY") {
                  const otherDay = Array.from(booking!.days).find(d => d !== session.dayNumber);
                  if (otherDay !== undefined) lockReason = `Booked on day ${otherDay}`;
                } else if (dayPolicy === "DIFF_DAY") {
                  if (booking!.days.has(session.dayNumber)) {
                    lockReason = `Already on day ${session.dayNumber}`;
                  }
                }
              }

              // Per-student pick count (a student can be selected for multiple
              // grades when multiGradeAllowed and the row is unlocked).
              const studentPicks = Array.from(picks.values()).filter(p => p.studentId === student.id);
              const isSelected = studentPicks.length > 0;

              return (
                <div
                  key={student.id}
                  className={`w-full flex items-start gap-3 p-3 rounded-[10px] border text-left transition-all ${
                    isSelected
                      ? "border-brand-600 bg-brand-50"
                      : lockReason
                        ? "border-ivory-300 bg-ivory-100 opacity-60"
                        : "border-ivory-300 bg-white"
                  }`}
                >
                  <div
                    className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                      isSelected ? "border-brand-600 bg-brand-600" : "border-ink-200 bg-white"
                    }`}
                    aria-hidden="true"
                  >
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-ink-900">{student.name}</span>
                      <span className="font-mono text-xs text-ink-400">{gradeLabel(student.grade)}·C{student.credit}</span>
                      {student.archived ? (
                        <StatusPill tone="warning" showDot={false}>Archived</StatusPill>
                      ) : !student.active && (
                        <StatusPill tone="danger" showDot={false}>Inactive</StatusPill>
                      )}
                      {eligible && !lockReason && !hasPriorBookingInEvent && (
                        <StatusPill tone="success" showDot={false}>Eligible</StatusPill>
                      )}
                      {!eligible && !backlog && (
                        <StatusPill tone="neutral" showDot={false}>No grades to appraise</StatusPill>
                      )}
                      {backlog && (
                        <StatusPill tone="warning" showDot={false}>Has backlog</StatusPill>
                      )}
                      {lockReason === "already-invited" && (
                        <StatusPill tone="info" showDot={false}>Already invited</StatusPill>
                      )}
                      {lockReason && lockReason !== "already-invited" && (
                        <StatusPill tone="info" showDot={false}>{lockReason}</StatusPill>
                      )}
                      {/* Booked grades pill — only visible when row is pickable */}
                      {!lockReason && hasPriorBookingInEvent && booking!.grades.size > 0 && (
                        <StatusPill tone="info" showDot={false}>
                          Already: {Array.from(booking!.grades).sort((a,b)=>a-b).map(g=>`G${g}`).join(", ")}
                        </StatusPill>
                      )}
                    </div>
                    <div className="text-xs text-ink-400 mt-1 flex items-center gap-2">
                      <span>{student.parentName}</span>
                      <span>·</span>
                      <span className="font-mono">{student.parentPhone}</span>
                    </div>

                    {!lockReason && (
                      <div className="mt-2">
                        <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-1">
                          {multiGradeAllowed && backlog ? "Pick one or more grades" : "Pick grade to appraise"}
                        </div>
                        {(() => {
                          const grades = invitableGradesFor(student);
                          return (
                            <div className="flex items-center gap-1 flex-wrap">
                              {grades.map(g => {
                                const done = student.faHistory[g] === true;
                                const alreadyBooked = booking?.grades.has(g) ?? false;
                                const isPicked = picks.has(`${student.id}:${g}`);
                                const capReached = !isPicked && picks.size >= remaining;
                                const disabled = capReached || alreadyBooked;
                                const baseCls = isPicked
                                  ? "bg-brand-600 text-white border-brand-600 ring-2 ring-brand-200"
                                  : alreadyBooked
                                    ? "bg-ivory-200 text-ink-400 border-ivory-300 line-through"
                                    : done
                                      ? "bg-success-soft text-success border-success/30 hover:border-success"
                                      : "bg-danger-soft text-danger border-danger/30 hover:border-danger";
                                const marker = isPicked ? "✓" : alreadyBooked ? "✓" : done ? "✓" : "✗";
                                return (
                                  <button
                                    key={g}
                                    type="button"
                                    onClick={() => toggleGrade(student.id, g)}
                                    disabled={disabled}
                                    title={
                                      alreadyBooked
                                        ? `Already invited for ${gradeLabel(g)} in this event`
                                        : done
                                          ? `${gradeLabel(g)} already completed (history) — not an invitation. Pickable if you want to re-appraise.`
                                          : `${gradeLabel(g)} not done yet — click to invite`
                                    }
                                    className={`text-[11px] font-mono px-2 py-1 rounded border transition-colors ${baseCls} ${
                                      disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                                    }`}
                                  >
                                    {gradeLabel(g)} {marker}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-4 mt-4 border-t border-ivory-300">
        <div className="text-xs text-ink-400">
          Showing <strong className="text-ink-600">{visibleStudents.length}</strong> student{visibleStudents.length !== 1 ? "s" : ""}
          {filterMode === "eligible" && <> with at least one prior grade (eligible)</>}
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="fa-btn-secondary">Cancel</button>
          <button
            onClick={() =>
              onInvite(
                Array.from(picks.values()).map(({ studentId, grade }) => ({
                  studentId,
                  targetGrade: grade,
                }))
              )
            }
            disabled={picks.size === 0}
            className="fa-btn-primary"
          >
            Invite {picks.size > 0 && `${picks.size} student${picks.size !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
