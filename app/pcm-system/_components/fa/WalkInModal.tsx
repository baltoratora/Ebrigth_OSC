"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, AlertTriangle, Clock, Search } from "lucide-react";
import { Modal } from "@pcm/_components/shared/Modal";
import { useFAStore } from "@pcm/_lib/store";
import { useCurrentUser } from "@pcm/_hooks/useCurrentUser";
import {
  BRANCHES,
  BranchCode,
  FAEvent,
  Session,
  Student,
} from "@pcm/_types";

type Step = "branch" | "student" | "session" | "confirm";

interface WalkInModalProps {
  open: boolean;
  onClose: () => void;
  /** The event the walk-in will be added to. */
  event: FAEvent;
  /** Currently selected day in the parent attendance page; used to surface
   *  same-day sessions first in step 3. Pass null if no day is selected. */
  preferredDay: number | null;
  /** Fired after a successful add. The parent shows a success banner. */
  onSuccess: (studentName: string) => void;
}

export function WalkInModal({ open, onClose, event, preferredDay, onSuccess }: WalkInModalProps) {
  const user = useCurrentUser();
  const allStudents = useFAStore(s => s.students);
  const allSessions = useFAStore(s => s.sessions);
  const invitations = useFAStore(s => s.invitations);
  const quotas = useFAStore(s => s.quotas);
  const overrides = useFAStore(s => s.eventBranchOverrides);
  const inviteStudent = useFAStore(s => s.inviteStudent);

  // Wizard state
  const [step, setStep] = useState<Step>("branch");
  const [branch, setBranch] = useState<BranchCode | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState<number | "all">("all");
  const [error, setError] = useState<string | null>(null);

  function resetAll() {
    setStep("branch");
    setBranch(null);
    setStudent(null);
    setSession(null);
    setSearch("");
    setGradeFilter("all");
    setError(null);
  }

  function handleClose() {
    resetAll();
    onClose();
  }

  // Is the chosen branch unlocked for multi-grade invites in this event?
  const branchMultiGradeAllowed = useMemo(() => {
    if (!branch) return false;
    return overrides.some(o => o.eventId === event.id && o.branchCode === branch);
  }, [overrides, event.id, branch]);

  // Step 2 data — every student from the chosen branch (active OR inactive),
  // optionally narrowed by search. Inactive students stay in the list per
  // Academy's request; the row wears an Inactive badge so it's obvious.
  //
  // When the branch has the multi-grade override, students who already have
  // an invite in this event are KEPT in the list — they may legitimately
  // need a walk-in for a different grade on the same day. The server
  // validates same-day + unique-grade at insert and surfaces a clear error
  // in step 4 if the pick is wrong.
  const branchStudents = useMemo(() => {
    if (!branch) return [];
    let list = allStudents.filter(s => s.branch === branch);
    if (!branchMultiGradeAllowed) {
      const alreadyInvited = new Set(
        invitations.filter(i => i.eventId === event.id).map(i => i.studentId)
      );
      list = list.filter(s => !alreadyInvited.has(s.id));
    }
    if (gradeFilter !== "all") list = list.filter(s => s.grade === gradeFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [branch, branchMultiGradeAllowed, allStudents, invitations, event.id, search, gradeFilter]);

  // Step 3 data — sessions for this event in canonical order.
  const eventSessions = useMemo(
    () => allSessions
      .filter(s => s.eventId === event.id)
      .sort((a, b) => a.dayNumber - b.dayNumber || a.sessionNumber - b.sessionNumber),
    [allSessions, event.id]
  );

  function quotaFor(sessionId: string, branchCode: BranchCode): { quota: number; used: number } | null {
    const q = quotas.find(qq => qq.sessionId === sessionId && qq.branch === branchCode);
    if (!q) return null;
    const used = invitations.filter(
      i => i.sessionId === sessionId && i.branch === branchCode
    ).length;
    return { quota: q.quota, used };
  }

  // Step 4 derivations
  const targetQuota = session && branch ? quotaFor(session.id, branch) : null;
  const wouldExceedQuota = !!(targetQuota && targetQuota.used >= targetQuota.quota);
  const noQuotaAllocated = !!(session && branch && !targetQuota);

  async function handleConfirm() {
    if (!student || !session || !branch || !user) return;
    setError(null);
    try {
      const created = await inviteStudent({
        eventId: event.id,
        sessionId: session.id,
        studentId: student.id,
        branch,
        // Walk-ins default to the student's current grade. Add a picker here
        // later if walk-ins need to clear backlog grades too.
        targetGrade: student.grade,
        invitedBy: user.id,
        initialStatus: "confirmed",
        allowOverQuota: true,
      });
      if (!created) {
        // Server rejected with a business-rule reason (already invited, wrong
        // day, duplicate grade, etc.). When the branch is unlocked the most
        // common case is "this student already booked on a different day" or
        // "this grade is already taken" — surface a friendly hint.
        setError(
          branchMultiGradeAllowed
            ? "Could not add walk-in — this student may already have an invite on another day, or already booked for this grade."
            : "Could not add walk-in. The student may already be invited to this event."
        );
        return;
      }
      const studentName = student.name;
      resetAll();
      onSuccess(studentName);
      onClose();
    } catch (err) {
      console.error("[walk-in] failed:", err);
      setError("Could not add walk-in. Try again.");
    }
  }

  const stepNum = step === "branch" ? 1 : step === "student" ? 2 : step === "session" ? 3 : 4;
  const stepTitle: Record<Step, string> = {
    branch: "Select branch",
    student: "Find student",
    session: "Assign to session",
    confirm: "Confirm walk-in",
  };
  const stepDescription: Record<Step, string> = {
    branch: "Pick the branch this walk-in student belongs to.",
    student: branch
      ? `Choose from active ${BRANCHES.find(b => b.code === branch)?.name ?? branch} students who haven't been invited to this event yet.`
      : "",
    session: student
      ? `Pick a session for ${student.name}.${preferredDay ? " Day " + preferredDay + " sessions are listed first." : ""}`
      : "",
    confirm: "Review the walk-in details before adding.",
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      kicker={`Walk-in · Step ${stepNum} of 4`}
      title={stepTitle[step]}
      description={stepDescription[step]}
      size="xl"
      disableBackdropClose
    >
      {step === "branch" && (
        <BranchStep onPick={(b) => { setBranch(b); setStep("student"); }} />
      )}

      {step === "student" && branch && (
        <StudentStep
          branch={branch}
          students={branchStudents}
          search={search}
          setSearch={setSearch}
          gradeFilter={gradeFilter}
          setGradeFilter={setGradeFilter}
          onBack={() => { setStep("branch"); setStudent(null); setSearch(""); setGradeFilter("all"); }}
          onPick={(s) => { setStudent(s); setStep("session"); }}
        />
      )}

      {step === "session" && student && branch && (
        <SessionStep
          eventSessions={eventSessions}
          preferredDay={preferredDay}
          quotaFor={(sid) => quotaFor(sid, branch)}
          onBack={() => setStep("student")}
          onPick={(s) => { setSession(s); setStep("confirm"); }}
        />
      )}

      {step === "confirm" && student && session && branch && (
        <ConfirmStep
          student={student}
          session={session}
          branch={branch}
          wouldExceedQuota={wouldExceedQuota}
          noQuotaAllocated={noQuotaAllocated}
          targetQuota={targetQuota}
          error={error}
          onBack={() => { setStep("session"); setError(null); }}
          onCancel={handleClose}
          onConfirm={handleConfirm}
        />
      )}
    </Modal>
  );
}

/* ── Step 1 ─────────────────────────────────────────────────────────────── */
function BranchStep({ onPick }: { onPick: (b: BranchCode) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[55vh] overflow-y-auto p-1">
      {BRANCHES.map(b => (
        <button
          key={b.code}
          type="button"
          onClick={() => onPick(b.code as BranchCode)}
          className="flex flex-col items-start gap-1 p-3 rounded-[10px] border border-ivory-300 bg-white hover:border-gold-400 hover:bg-ivory-100/60 transition-all text-left"
        >
          <span className="font-mono text-xs font-semibold text-ink-700 bg-ivory-200 px-2 py-0.5 rounded">
            {b.code}
          </span>
          <span className="text-xs text-ink-700">{b.name}</span>
        </button>
      ))}
    </div>
  );
}

/* ── Step 2 ─────────────────────────────────────────────────────────────── */
function StudentStep({
  branch, students, search, setSearch, gradeFilter, setGradeFilter, onBack, onPick,
}: {
  branch: BranchCode;
  students: Student[];
  search: string;
  setSearch: (s: string) => void;
  gradeFilter: number | "all";
  setGradeFilter: (g: number | "all") => void;
  onBack: () => void;
  onPick: (s: Student) => void;
}) {
  const branchInfo = BRANCHES.find(b => b.code === branch);
  return (
    <div>
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-ivory-300">
        <button type="button" onClick={onBack} className="fa-btn-ghost text-sm">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <div className="w-px h-6 bg-ivory-300" />
        <div className="text-sm text-ink-600">
          <span className="font-mono text-xs font-semibold text-ink-700 bg-ivory-200 px-2 py-0.5 rounded mr-2">
            {branch}
          </span>
          {branchInfo?.name}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select
            className="fa-input w-32"
            value={gradeFilter}
            onChange={e => setGradeFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            aria-label="Filter by grade"
          >
            <option value="all">All grades</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map(g => (
              <option key={g} value={g}>Grade {g}</option>
            ))}
          </select>
          <div className="relative flex-1 min-w-[16rem]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
            <input
              className="fa-input fa-input-icon-left w-full"
              placeholder="Search by name…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        </div>
      </div>
      <div className="max-h-[50vh] overflow-y-auto space-y-1">
        {students.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-400">
            No matching students. Either everyone from this branch is already invited or no one matches your search.
          </div>
        ) : (
          students.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => onPick(s)}
              className="w-full flex items-center gap-3 p-3 rounded-[10px] border border-ivory-300 bg-white hover:border-gold-400 hover:bg-ivory-100/60 text-left transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-ink-900">{s.name}</span>
                  <span className="font-mono text-xs text-ink-400">G{s.grade}</span>
                  {!s.active && (
                    <span className="fa-mono text-[10px] uppercase px-1.5 py-0.5 rounded bg-danger-soft text-danger" style={{ letterSpacing: "0.06em" }}>
                      Inactive
                    </span>
                  )}
                </div>
                <div className="text-xs text-ink-400 mt-1 flex items-center gap-2">
                  <span>{s.parentName}</span>
                  <span>·</span>
                  <span className="font-mono">{s.parentPhone}</span>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/* ── Step 3 ─────────────────────────────────────────────────────────────── */
function SessionStep({
  eventSessions, preferredDay, quotaFor, onBack, onPick,
}: {
  eventSessions: Session[];
  preferredDay: number | null;
  quotaFor: (sessionId: string) => { quota: number; used: number } | null;
  onBack: () => void;
  onPick: (s: Session) => void;
}) {
  const sorted = useMemo(() => {
    if (!preferredDay) return eventSessions;
    const onDay = eventSessions.filter(s => s.dayNumber === preferredDay);
    const offDay = eventSessions.filter(s => s.dayNumber !== preferredDay);
    return [...onDay, ...offDay];
  }, [eventSessions, preferredDay]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-ivory-300">
        <button type="button" onClick={onBack} className="fa-btn-ghost text-sm">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
      </div>
      {sorted.length === 0 ? (
        <div className="p-8 text-center text-sm text-ink-400">
          No sessions scheduled for this event.
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
          {sorted.map(s => {
            const q = quotaFor(s.id);
            const isFull = !!(q && q.used >= q.quota);
            const isPreferred = preferredDay === s.dayNumber;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onPick(s)}
                className="w-full flex items-center gap-3 p-3 rounded-[10px] border border-ivory-300 bg-white hover:border-gold-400 hover:bg-ivory-100/60 text-left transition-colors"
              >
                <div className="flex-shrink-0 fa-mono text-xs font-semibold text-ink-700 bg-ivory-200 px-2 py-1 rounded">
                  D{s.dayNumber}·S{s.sessionNumber}
                </div>
                <Clock className="w-3 h-3 text-ink-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink-900">
                    {s.startTime}–{s.endTime}
                    {s.label && <span className="text-ink-500 ml-2 font-normal">· {s.label}</span>}
                  </div>
                  {isPreferred && (
                    <div className="text-[10px] uppercase tracking-wider text-gold-600 mt-0.5" style={{ letterSpacing: "0.1em" }}>
                      Selected day
                    </div>
                  )}
                </div>
                <div className="text-right">
                  {q ? (
                    <>
                      <div className={`fa-mono text-sm font-semibold ${isFull ? "text-warning" : "text-ink-700"}`}>
                        {q.used} / {q.quota}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-ink-400" style={{ letterSpacing: "0.08em" }}>
                        {isFull ? "At quota" : "Branch slots"}
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-ink-400 italic">No quota for branch</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Step 4 ─────────────────────────────────────────────────────────────── */
function ConfirmStep({
  student, session, branch, wouldExceedQuota, noQuotaAllocated, targetQuota, error,
  onBack, onCancel, onConfirm,
}: {
  student: Student;
  session: Session;
  branch: BranchCode;
  wouldExceedQuota: boolean;
  noQuotaAllocated: boolean;
  targetQuota: { quota: number; used: number } | null;
  error: string | null;
  onBack: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const branchInfo = BRANCHES.find(b => b.code === branch);
  return (
    <div>
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-ivory-300">
        <button type="button" onClick={onBack} className="fa-btn-ghost text-sm">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
      </div>

      <div className="fa-card bg-ivory-50 p-5 mb-4">
        <div className="fa-mono text-[10px] uppercase text-gold-600 mb-3" style={{ letterSpacing: "0.12em" }}>
          Walk-in summary
        </div>
        <dl className="space-y-3">
          <div>
            <dt className="text-xs text-ink-400 uppercase tracking-wider">Student</dt>
            <dd className="text-base font-medium text-ink-900 mt-0.5 flex items-center gap-2 flex-wrap">
              {student.name}
              <span className="font-mono text-xs text-ink-500">G{student.grade}</span>
              <span className="font-mono text-xs font-semibold text-ink-700 bg-ivory-200 px-2 py-0.5 rounded">
                {branch}
              </span>
              <span className="text-xs text-ink-500">{branchInfo?.name}</span>
            </dd>
            <dd className="text-xs text-ink-400 mt-0.5">
              Parent: {student.parentName} · {student.parentPhone}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-400 uppercase tracking-wider">Session</dt>
            <dd className="text-base text-ink-900 mt-0.5">
              Day {session.dayNumber} · Session {session.sessionNumber} · {session.startTime}–{session.endTime}
              {session.label && <span className="text-ink-500 font-normal"> · {session.label}</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-400 uppercase tracking-wider">Status on add</dt>
            <dd className="text-sm text-ink-700 mt-0.5">
              <span className="font-medium">Confirmed</span> — walk-ins are recorded as confirmed on arrival.
            </dd>
          </div>
        </dl>
      </div>

      {(wouldExceedQuota || noQuotaAllocated) && (
        <div className="rounded-[10px] bg-warning-soft text-ink-700 px-4 py-3 mb-4 flex items-start gap-2.5 border border-warning/30">
          <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            {noQuotaAllocated ? (
              <>
                <strong>{branch}</strong> has no quota allocation for this session. The walk-in will still be added — emergency walk-ins bypass quota checks.
              </>
            ) : (
              <>
                Adding this walk-in will exceed the <strong>{branch}</strong> quota for this session ({targetQuota?.used} / {targetQuota?.quota} already used). The walk-in will be added anyway.
              </>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-[10px] bg-danger-soft text-danger px-4 py-3 text-sm mb-4">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="fa-btn-secondary">Cancel</button>
        <button type="button" onClick={onConfirm} className="fa-btn-primary">Add walk-in student</button>
      </div>
    </div>
  );
}

