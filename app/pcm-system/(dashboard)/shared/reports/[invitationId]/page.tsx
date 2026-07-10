"use client";

import { useState, useMemo, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useFAStore } from "@pcm/_lib/store";
import { useCurrentUser } from "@pcm/_hooks/useCurrentUser";
import { AppShell } from "@pcm/_components/shared/AppShell";
import { BRANCHES, BranchCode, resolveStudentById } from "@pcm/_types";
import { ArrowLeft, ClipboardCheck, Printer, AlertCircle, CheckCircle2, UserPlus } from "lucide-react";
import { format, parseISO } from "date-fns";

// The four rubric criteria. Wording is verbatim from the assessment-report
// PDF the academy provided. Each score has a short label rendered next to
// the radio button so the coach can pick the right score at a glance.
const RUBRIC = [
  {
    key: "confidence" as const,
    title: "Confidence & Courage",
    labels: [
      "Very shy; refuses or unable to speak.",
      "Speaks only with a lot of help.",
      "Speaks with some hesitation.",
      "Speaks confidently with small hesitation.",
      "Very confident; speaks willingly and bravely.",
    ],
  },
  {
    key: "voice" as const,
    title: "Voice Clarity",
    labels: [
      "Too soft; cannot be heard.",
      "Often unclear or too soft.",
      "Audible but not consistent.",
      "Clear voice most of the time.",
      "Loud, clear, and easy to understand.",
    ],
  },
  {
    key: "eyeContact" as const,
    title: "Eye Contact & Body Awareness",
    labels: [
      "Looks down/away; avoids audience.",
      "Rare eye contact.",
      "Some eye contact.",
      "Good eye contact most of the time.",
      "Strong eye contact; confident posture.",
    ],
  },
  {
    key: "ideaExpression" as const,
    title: "Idea Expression",
    labels: [
      "Unable to express ideas.",
      "Very short or unclear ideas.",
      "Simple ideas with some clarity.",
      "Clear ideas with basic explanation.",
      "Clear and slightly elaborated ideas.",
    ],
  },
];

type ScoreKey = typeof RUBRIC[number]["key"];
type Scores = Record<ScoreKey, number>;

// A session's actual calendar date = event.startDate + (dayNumber - 1) days —
// NOT just the event's overall startDate, which is only correct for day 1.
// Multi-day events (dayNumber 2, 3, ...) need the offset applied or every
// session after the first shows the wrong date on the report/certificate.
function sessionDate(eventStartDate: string | undefined, dayNumber: number | undefined): string {
  if (!eventStartDate) return "";
  if (!dayNumber || dayNumber <= 1) return eventStartDate.slice(0, 10);
  const d = new Date(eventStartDate.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + (dayNumber - 1));
  return d.toISOString().slice(0, 10);
}

export default function CoachReportFormPage() {
  const { invitationId } = useParams<{ invitationId: string }>();
  const router = useRouter();
  const user = useCurrentUser();

  const invitation = useFAStore(s => s.invitations.find(i => i.id === invitationId));
  const events     = useFAStore(s => s.events);
  const sessions   = useFAStore(s => s.sessions);
  const students   = useFAStore(s => s.students);
  const reports    = useFAStore(s => s.reports);
  const saveReport = useFAStore(s => s.saveReport);

  const existing  = useMemo(
    () => reports.find(r => r.invitationId === invitationId),
    [reports, invitationId],
  );
  const event     = useMemo(() => events.find(e => e.id === invitation?.eventId), [events, invitation]);
  const session   = useMemo(() => sessions.find(s => s.id === invitation?.sessionId), [sessions, invitation]);
  const student   = useMemo(() => invitation ? resolveStudentById(students, invitation.studentId) : undefined, [students, invitation]);

  // Seed form state from the existing report (if any) or sane defaults.
  const [scores, setScores] = useState<Scores>({ confidence: 0, voice: 0, eyeContact: 0, ideaExpression: 0 });
  const [strengths, setStrengths]               = useState("");
  const [improvementPlan, setImprovementPlan]   = useState("");
  const [preparedBy, setPreparedBy]             = useState("");
  /** Coach signature as a base64 data URL. Uploaded via <input type=file>;
   *  shown in a small preview box and round-tripped through the API on save. */
  const [signature, setSignature]               = useState<string>("");
  const [receivedBy, setReceivedBy]             = useState("");
  const [assessmentDate, setAssessmentDate]     = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState(false);

  // Hydrate once the invitation/report data is available.
  useEffect(() => {
    // Date of Assessment = the date of the SESSION the student attended
    // (event.startDate offset by the session's dayNumber), filled
    // automatically. Coaches no longer pick it.
    const joinDate = sessionDate(event?.startDate, session?.dayNumber);
    if (existing) {
      setScores({
        confidence: existing.confidenceScore,
        voice: existing.voiceClarityScore,
        eyeContact: existing.eyeContactScore,
        ideaExpression: existing.ideaExpressionScore,
      });
      setStrengths(existing.strengths);
      setImprovementPlan(existing.improvementPlan);
      setPreparedBy(existing.preparedBy);
      setSignature(existing.preparedBySignature ?? "");
      setReceivedBy(existing.receivedBy);
      setAssessmentDate(joinDate || existing.assessmentDate);
    } else if (invitation) {
      // Fresh report: date = the event join date (fallback to today only if the
      // event has no date). Coach name kept for the record (not shown on cert).
      setAssessmentDate(joinDate || new Date().toISOString().slice(0, 10));
      setPreparedBy(invitation.coachName ?? "");
    }
  }, [existing, invitation, event, events, session]);

  if (!user) return null;

  if (!invitation) {
    return (
      <AppShell>
        <div className="text-center py-20">
          <h1 className="fa-display text-3xl text-ink-900">Invitation not found</h1>
          <p className="text-ink-500 mt-2">This invitation may have been removed.</p>
          <Link href="/pcm-system/shared/invitations" className="fa-btn-primary mt-4 inline-flex">
            Back to invitations
          </Link>
        </div>
      </AppShell>
    );
  }

  const allScored = (Object.values(scores) as number[]).every(v => v >= 1 && v <= 5);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!invitation || !student) return setError("Missing student data.");
    if (!allScored)              return setError("Pick a score (1–5) for every criterion.");

    setSubmitting(true);
    try {
      await saveReport({
        invitationId: invitation.id,
        studentId: invitation.studentId,
        studentName: student.name,
        branch: invitation.branch as BranchCode,
        grade: invitation.targetGrade || student.grade,
        assessmentDate,
        confidenceScore:      scores.confidence,
        voiceClarityScore:    scores.voice,
        eyeContactScore:      scores.eyeContact,
        ideaExpressionScore:  scores.ideaExpression,
        strengths,
        improvementPlan,
        preparedBy: preparedBy.trim(),
        preparedById: invitation.coachId,
        preparedBySignature: signature || undefined,
        receivedBy: receivedBy.trim(),
      });
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save report.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <Link
          href="/pcm-system/shared/invitations"
          className="inline-flex items-center gap-1.5 text-sm text-ink-600 hover:text-ink-900"
        >
          <ArrowLeft className="w-4 h-4" /> Back to invitations
        </Link>
        {/* Shortcut into the BM event page for the same event the invitation
            belongs to. Lets a coach jump straight from finishing one report
            to inviting / picking the next student without going back two pages. */}
        {invitation && (
          <Link
            href={`/pcm-system/bm/events/${invitation.eventId}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-semibold shadow
                       bg-gradient-to-r from-violet-600 to-fuchsia-600
                       hover:from-violet-700 hover:to-fuchsia-700 transition-all"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Invite new student
          </Link>
        )}
      </div>

      {/* Hero */}
      <div className="mb-6 relative overflow-hidden rounded-2xl p-6
                      bg-gradient-to-r from-rose-600 to-orange-600 text-white">
        <ClipboardCheck className="absolute -right-4 -top-6 w-32 h-32 text-white/10" aria-hidden="true" />
        <div className="fa-mono text-[10px] uppercase text-white/80 mb-1" style={{ letterSpacing: "0.14em" }}>
          PCM · Coach assessment
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          {existing ? "Edit assessment report" : "Fill assessment report"}
        </h1>
        <p className="text-white/80 text-sm mt-1.5">
          {student?.name ?? "—"} · G{invitation.targetGrade || student?.grade}
          {invitation.coachName && <> · Coach {invitation.coachName}</>}
        </p>
      </div>

      {/* Status pill */}
      {existing ? (
        <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 p-3 flex items-center gap-2 text-emerald-700 text-sm">
          <CheckCircle2 className="w-4 h-4" />
          Report saved on <strong>{format(parseISO(existing.updatedAt), "d MMM yyyy, HH:mm")}</strong>.
          You're editing it now.
        </div>
      ) : (
        <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-center gap-2 text-amber-700 text-sm">
          <AlertCircle className="w-4 h-4" />
          No report yet. Fill it in below — the student's certificate uses these scores.
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        {/* Student / event context — styled to mirror the printed
            certificate's identity block (red header → pill fields). Filling
            the form feels like filling the cert itself, which makes the
            preview-to-print mental jump trivial. */}
        <section className="rounded-2xl bg-white border border-ivory-300 shadow-sm overflow-hidden">
          {/* Mini red banner — same colour as the certificate header. */}
          <div
            className="px-5 py-3 text-white flex items-baseline justify-between gap-4 flex-wrap"
            style={{ background: "#dc2626" }}
          >
            <div
              style={{ fontFamily: "var(--font-display, serif)", fontWeight: 700, fontSize: 22, lineHeight: 1 }}
            >
              Assessment Report
            </div>
            <div className="text-[10px] uppercase tracking-wider text-white/85">
              eBright Sdn. Bhd.
            </div>
          </div>

          {/* Pill-style identity fields */}
          <div className="bg-ivory-50 px-5 py-5 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="fa-mono text-[11px] uppercase text-ink-600 font-bold w-[150px]" style={{ letterSpacing: "0.06em" }}>
                Student's name
              </span>
              <div className="flex-1 min-w-[260px] bg-white rounded-full border border-ivory-300 px-4 py-1.5 text-sm font-semibold text-ink-900">
                {student?.name ?? "—"}
                <span className="ml-2 text-[11px] font-normal text-ink-400 font-mono">#{student?.id ?? "—"}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <span className="fa-mono text-[11px] uppercase text-ink-600 font-bold w-[150px]" style={{ letterSpacing: "0.06em" }}>
                Date of Assessment
              </span>
              {/* Automatic: the date the student joined the event (event start
                  date). Not user-editable. */}
              <div className="flex-1 min-w-[260px] bg-white rounded-full border border-ivory-300 px-4 py-1.5 text-sm font-mono text-ink-900">
                {event?.startDate
                  ? format(parseISO(event.startDate), "d MMMM yyyy")
                  : existing
                    ? format(parseISO(existing.assessmentDate), "d MMMM yyyy")
                    : <span className="text-ink-400 italic">—</span>
                }
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <span className="fa-mono text-[11px] uppercase text-ink-600 font-bold w-[150px]" style={{ letterSpacing: "0.06em" }}>
                Grade
              </span>
              <div className="bg-white rounded-full border border-ivory-300 px-4 py-1.5 text-sm font-mono font-bold text-ink-900 w-20 text-center">
                G{invitation.targetGrade || student?.grade}
              </div>
              <span className="fa-mono text-[11px] uppercase text-ink-600 font-bold ml-3" style={{ letterSpacing: "0.06em" }}>
                Branch
              </span>
              <div className="flex-1 min-w-[200px] bg-white rounded-full border border-ivory-300 px-4 py-1.5 text-sm text-ink-900">
                {BRANCHES.find(b => b.code === invitation.branch)?.name ?? invitation.branch}
                <span className="ml-1 text-ink-500 font-mono">({invitation.branch})</span>
              </div>
            </div>

            {event && session && (
              <div className="text-[11px] text-ink-400 pt-1 italic">
                From <strong className="not-italic text-ink-600">{event.name}</strong>
                {" · "}Session {session.sessionNumber}{" "}
                <span className="font-mono">({session.startTime}–{session.endTime})</span>
              </div>
            )}
          </div>
        </section>

        {/* Rubric */}
        <section className="rounded-2xl bg-white border border-ivory-300 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-rose-500 to-orange-500 px-5 py-3 text-white">
            <h2 className="text-base font-bold">Speech Preparation &amp; Delivery</h2>
            <div className="text-xs text-white/85 mt-0.5">Pick a score (1 = lowest · 5 = highest) for each criterion.</div>
          </div>
          <div className="divide-y divide-ivory-200">
            {RUBRIC.map(r => {
              const val = scores[r.key];
              return (
                <div key={r.key} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-ink-900">{r.title}</h3>
                    <span className={`fa-mono text-xs font-bold ${val ? "text-rose-700" : "text-ink-400"}`}>
                      {val ? `Score: ${val}` : "Not scored"}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                    {r.labels.map((label, i) => {
                      const score = i + 1;
                      const isPicked = val === score;
                      return (
                        <button
                          key={score}
                          type="button"
                          onClick={() => setScores(s => ({ ...s, [r.key]: score }))}
                          className={`text-left rounded-xl border-2 p-2.5 text-xs transition-all ${
                            isPicked
                              ? "border-rose-500 bg-rose-50 ring-2 ring-rose-200"
                              : "border-ivory-300 bg-white hover:border-rose-300 hover:bg-rose-50/40"
                          }`}
                        >
                          <div className={`font-mono text-sm font-bold mb-1 ${isPicked ? "text-rose-700" : "text-ink-700"}`}>
                            {score}
                          </div>
                          <div className="text-ink-600 leading-tight">{label}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Narrative — capped at 400 chars each so the printed cert
            always fits within one A4 page at zoom 0.85 (the cert
            wrapper has overflow:hidden so anything over the limit
            would otherwise be clipped silently). The counter goes red
            near the limit so the coach can pace themselves. */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white border border-emerald-200 shadow-sm overflow-hidden">
            <div className="bg-emerald-50 px-4 py-2 text-emerald-700 font-semibold text-sm border-b border-emerald-200 flex items-center justify-between">
              <span>Strengths</span>
              <span className={`fa-mono text-[11px] ${strengths.length > 380 ? "text-rose-600 font-bold" : "text-emerald-600"}`}>
                {strengths.length}/400
              </span>
            </div>
            <textarea
              className="fa-input border-0 rounded-none min-h-[140px] resize-y"
              placeholder="What did the student do well?"
              value={strengths}
              maxLength={400}
              onChange={e => setStrengths(e.target.value)}
            />
          </div>
          <div className="rounded-2xl bg-white border border-amber-200 shadow-sm overflow-hidden">
            <div className="bg-amber-50 px-4 py-2 text-amber-700 font-semibold text-sm border-b border-amber-200 flex items-center justify-between">
              <span>Improvement plan</span>
              <span className={`fa-mono text-[11px] ${improvementPlan.length > 380 ? "text-rose-600 font-bold" : "text-amber-600"}`}>
                {improvementPlan.length}/400
              </span>
            </div>
            <textarea
              className="fa-input border-0 rounded-none min-h-[140px] resize-y"
              placeholder="What should they work on before next assessment?"
              value={improvementPlan}
              maxLength={400}
              onChange={e => setImprovementPlan(e.target.value)}
            />
          </div>
        </section>

        {error && (
          <div className="rounded-xl bg-rose-50 border-2 border-rose-200 text-rose-700 text-sm px-4 py-3">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 sticky bottom-4 z-10">
          {existing && (
            <Link
              href={`/pcm-system/shared/reports/${invitation.id}/certificate`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-violet-200 bg-violet-50 text-violet-700 font-semibold text-sm hover:bg-violet-100 hover:border-violet-400 transition-all"
            >
              <Printer className="w-4 h-4" /> Print certificate
            </Link>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-white font-semibold shadow
                       bg-gradient-to-r from-rose-600 to-orange-600
                       hover:from-rose-700 hover:to-orange-700
                       disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <ClipboardCheck className="w-4 h-4" />
            {submitting ? "Saving…" : existing ? "Update report" : "Save report"}
          </button>
        </div>
      </form>

      {savedToast && (
        <div
          className="fixed bottom-6 right-6 bg-emerald-600 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-lg z-50"
          role="status"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span className="text-sm font-semibold">Report saved</span>
        </div>
      )}
    </AppShell>
  );
}
