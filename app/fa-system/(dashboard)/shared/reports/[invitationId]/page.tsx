"use client";

import { useState, useMemo, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useFAStore } from "@fa/_lib/store";
import { useCurrentUser } from "@fa/_hooks/useCurrentUser";
import { AppShell } from "@fa/_components/shared/AppShell";
import {
  BRANCHES, BranchCode, FA_REPORT_MAX_PER_CRITERION, resolveStudentById, countsAsAttended,
} from "@fa/_types";
import {
  ArrowLeft, ClipboardCheck, Printer, AlertCircle, CheckCircle2,
  MessageSquare, BarChart3, Users, Handshake, Sparkles,
} from "lucide-react";
import { format, parseISO } from "date-fns";

/** The four FA criteria — wording is verbatim from the eBright FA template
 *  PDF. Each criterion is scored 0–25 (per the user's brief). */
const CRITERIA = [
  {
    key: "communication" as const,
    title: "Communication",
    icon: MessageSquare,
    accent: "from-rose-500 to-pink-500",
    accentSoft: "from-rose-50 to-pink-50",
    accentRing: "ring-rose-500",
    accentText: "text-rose-700",
    description:
      "Did you understand what was said to you? Are you talking about the right thing? Can you be understood despite errors? Have you conveyed your idea clearly? Is your language creative?",
  },
  {
    key: "analysis" as const,
    title: "Analysis",
    icon: BarChart3,
    accent: "from-violet-500 to-fuchsia-500",
    accentSoft: "from-violet-50 to-fuchsia-50",
    accentRing: "ring-violet-500",
    accentText: "text-violet-700",
    description:
      "Did you understand the main idea? Have you broken down key points effectively? Are you considering different perspectives? Can you explain your reasoning clearly? Did you support your ideas with strong evidence?",
  },
  {
    key: "interaction" as const,
    title: "Interaction",
    icon: Handshake,
    accent: "from-cyan-500 to-teal-500",
    accentSoft: "from-cyan-50 to-teal-50",
    accentRing: "ring-cyan-500",
    accentText: "text-cyan-700",
    description:
      "Are you actively engaging with others? Are you responding appropriately to what is said? Do you encourage discussion and teamwork? Are you showing interest and listening well? Are you making the conversation enjoyable and meaningful?",
  },
  {
    key: "performance" as const,
    title: "Performance",
    icon: Sparkles,
    accent: "from-amber-500 to-orange-500",
    accentSoft: "from-amber-50 to-orange-50",
    accentRing: "ring-amber-500",
    accentText: "text-amber-700",
    description:
      "Did you present with confidence? Was your voice clear and engaging? Did you use body language effectively? Were you well-prepared? Did you connect with your audience?",
  },
];

type ScoreKey = typeof CRITERIA[number]["key"];
type Scores = Record<ScoreKey, number>;

/** Roles that can fill an FA report. Matches the server-side gate in
 *  /api/fa/reports. Marketing + Admin only — BMs view but cannot edit. */
const FILL_ROLES = new Set(["MARKETING", "MKT", "ADMIN", "SUPER_ADMIN"]);

export default function FaReportFormPage() {
  const { invitationId } = useParams<{ invitationId: string }>();
  const router = useRouter();
  const user = useCurrentUser();

  const invitation = useFAStore(s => s.invitations.find(i => i.id === invitationId));
  const events     = useFAStore(s => s.events);
  const students   = useFAStore(s => s.students);
  const reports    = useFAStore(s => s.reports);
  const saveReport = useFAStore(s => s.saveReport);

  const existing = useMemo(
    () => reports.find(r => r.invitationId === invitationId),
    [reports, invitationId],
  );

  const [nameInput, setNameInput] = useState("");

  // The FA store user has role "MKT" or "BM" — SessionSync collapses
  // back-office NextAuth roles (ADMIN/SUPER_ADMIN/MARKETING/ACADEMY) into
  // "MKT" for the FA store. So "MKT" here covers Marketing AND Admin.
  // The server still enforces this independently against the NextAuth role.
  const canFill = user?.role === "MKT";
  void FILL_ROLES; // server-side constant; kept imported so future role list edits touch both files.

  const studentFromStore = useMemo(() => {
    if (!invitation) return undefined;
    return resolveStudentById(students, invitation.studentId);
  }, [students, invitation]);

  // Resolve student identity from the loaded roster first, then any
  // previously-saved report snapshot, then fall back to a placeholder
  // built from the invitation's student_id.
  const resolvedName = studentFromStore?.name ?? existing?.studentName ?? "";
  const studentNameMissing = !resolvedName;
  // Sync the editable name field once store data arrives (store loads async).
  useEffect(() => {
    if (resolvedName && !nameInput) setNameInput(resolvedName);
  }, [resolvedName, nameInput]);
  const grade        = invitation?.targetGrade || studentFromStore?.grade || existing?.grade || 1;
  const branch       = (invitation?.branch ?? existing?.branch ?? null) as BranchCode | null;
  const eventForInv  = events.find(e => e.id === invitation?.eventId);

  // ----- form state -----
  // Default scores: existing values if editing, otherwise the middle of the
  // 0–25 range so the slider has somewhere reasonable to start.
  const MID = Math.round(FA_REPORT_MAX_PER_CRITERION / 2);
  const [scores, setScores] = useState<Scores>(() => ({
    communication: existing?.communicationScore ?? MID,
    analysis:      existing?.analysisScore      ?? MID,
    interaction:   existing?.interactionScore   ?? MID,
    performance:   existing?.performanceScore   ?? MID,
  }));
  const [remarks,     setRemarks]     = useState(existing?.remarks ?? "");
  const [preparedBy,  setPreparedBy]  = useState(existing?.preparedBy ?? "");
  /** Optional URL of a recording of the student's performance. */
  const [videoLink,   setVideoLink]   = useState(existing?.videoLink ?? "");
  // Default the assessment date to today on first fill, or whatever was
  // saved previously when editing. Marketing can override either way.
  const [assessDate,  setAssessDate]  = useState(
    existing?.assessmentDate ?? format(new Date(), "yyyy-MM-dd"),
  );
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // Full-time coaches for the "Prepared by" dropdown (FT* + BM roles).
  const [coaches, setCoaches] = useState<{ id: string; name: string; branch: string | null; role: string | null }[]>([]);
  const [coachesLoading, setCoachesLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    setCoachesLoading(true);
    fetch("/api/fa/coaches", { cache: "no-store" })
      .then(r => (r.ok ? r.json() : { coaches: [] }))
      .then(d => { if (alive) setCoaches(d.coaches ?? []); })
      .catch(() => { if (alive) setCoaches([]); })
      .finally(() => { if (alive) setCoachesLoading(false); });
    return () => { alive = false; };
  }, []);

  // Preparedy-by is intentionally NOT auto-filled. The FA store
  // user.name resolves to a role/branch label (e.g. "CJY — Cyberjaya"),
  // not the person's actual name. Each report should record who
  // actually filled it, so we leave the field empty and let them type.

  const total = scores.communication + scores.analysis + scores.interaction + scores.performance;
  const totalMax = FA_REPORT_MAX_PER_CRITERION * 4;

  async function handleSave() {
    // Explicit guard rails — surface the reason to the UI instead of
    // silently returning, so Marketing knows what to fix.
    if (!invitation) { setError("Invitation not loaded. Refresh and try again."); return; }
    if (!branch)     { setError("Branch is missing from this invitation. Cannot save."); return; }
    if (!nameInput.trim()) { setError("Student name is required. Enter the name before saving."); return; }
    if (!preparedBy.trim()) { setError("Fill in your name in \"Prepared by\" before saving."); return; }
    setSaving(true);
    setError(null);
    try {
      await saveReport({
        invitationId: invitation.id,
        studentId: invitation.studentId,
        studentName: nameInput.trim(),
        branch,
        grade,
        assessmentDate: assessDate,
        communicationScore: scores.communication,
        analysisScore: scores.analysis,
        interactionScore: scores.interaction,
        performanceScore: scores.performance,
        remarks: remarks.trim(),
        preparedBy: preparedBy.trim(),
        preparedById: user?.id,
        videoLink: videoLink.trim() || undefined,
      });
      router.push("/fa-system/shared/reports");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  if (!invitation) {
    return (
      <AppShell>
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-6 max-w-2xl">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-amber-900">Invitation not found</div>
              <div className="text-sm text-amber-800 mt-1">
                This report links to an invitation that doesn&apos;t exist on this device yet.
                Try reloading — events may still be loading.
              </div>
              <Link href="/fa-system/shared/reports" className="inline-block mt-3 text-xs font-semibold text-amber-700 underline">
                ← Back to reports
              </Link>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!countsAsAttended(invitation.status)) {
    return (
      <AppShell>
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-6 max-w-2xl">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-amber-900">This student hasn&apos;t been marked attended yet</div>
              <div className="text-sm text-amber-800 mt-1">
                FA reports are only meaningful for students who showed up. Mark them &quot;Attended&quot; on the Attendance page first.
              </div>
              <Link href="/fa-system/shared/attendance" className="inline-block mt-3 text-xs font-semibold text-amber-700 underline">
                Go to Attendance →
              </Link>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const branchName = branch ? BRANCHES.find(b => b.code === branch)?.name : null;

  return (
    <AppShell>
      {/* Header strip — links back, plus quick certificate preview link if
          a report already exists. Sticky so it stays visible as Marketing
          scrolls through the long form. */}
      <div className="sticky top-0 z-20 -mx-8 px-8 py-3 bg-ivory-50/95 backdrop-blur border-b border-ivory-300 mb-6 flex items-center gap-3 flex-wrap">
        <Link href="/fa-system/shared/reports" className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-700 hover:text-ink-900">
          <ArrowLeft className="w-3.5 h-3.5" /> All reports
        </Link>
        <span className="text-ink-300">·</span>
        <span className="text-xs text-ink-500">
          {existing ? "Editing existing report" : "Filling new report"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {existing && (
            <Link
              href={`/fa-system/shared/reports/${invitation.id}/certificate`}
              target="_blank"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
            >
              <Printer className="w-3.5 h-3.5" /> Preview certificate
            </Link>
          )}
        </div>
      </div>

      {/* Hero card — student identity. Different colour palette from the
          PDF cert (which is dark red); here we use a softer rose gradient
          so the "fill" view feels friendlier and more inviting. */}
      <div className="mb-6 relative overflow-hidden rounded-2xl p-6
                      bg-gradient-to-br from-rose-500 via-pink-500 to-red-500 text-white">
        <Sparkles className="absolute -right-4 -top-4 w-32 h-32 text-white/15" aria-hidden="true" />
        <div className="fa-mono text-[10px] uppercase text-white/80 mb-1" style={{ letterSpacing: "0.14em" }}>
          FA · Foundation Appraisal Assessment
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{nameInput || `#${invitation.studentId}`}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-white/90 text-sm">
          <span>Grade <strong>G{grade || "?"}</strong></span>
          <span className="opacity-50">·</span>
          <span>Branch <strong>{branchName ?? branch}</strong></span>
          <span className="opacity-50">·</span>
          {eventForInv && (
            <>
              <span>{eventForInv.name}</span>
              <span className="opacity-50">·</span>
              <span className="font-mono">{format(parseISO(eventForInv.startDate), "d MMM yyyy")}</span>
            </>
          )}
        </div>
      </div>

      {/* Student name field — always editable so Marketing can correct a
          wrong or missing name before it gets printed on the certificate. */}
      <div className={`rounded-xl border p-4 mb-4 ${studentNameMissing ? "bg-amber-50 border-amber-200" : "bg-white border-ivory-300 shadow-sm"}`}>
        <label className="fa-mono text-[10px] uppercase font-bold mb-1.5 block" style={{ letterSpacing: "0.12em", color: studentNameMissing ? "#92400e" : undefined }}>
          Student Name {studentNameMissing && <span className="text-amber-600">(not found in records — enter manually)</span>}
        </label>
        <input
          type="text"
          value={nameInput}
          onChange={e => setNameInput(e.target.value)}
          disabled={!canFill}
          placeholder="Enter student name…"
          className={`fa-input w-full ${studentNameMissing ? "border-amber-300 bg-amber-50 focus:border-amber-500" : ""}`}
        />
        {studentNameMissing && (
          <p className="text-[11px] text-amber-700 mt-1.5 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 flex-shrink-0" />
            This name will appear on the printed certificate. Fix branch + grade in Heidi and refresh to auto-fill.
          </p>
        )}
      </div>

      {/* Date + filler. Slim row so the form gets straight to the scoring. */}
      <div className="rounded-xl bg-white border border-ivory-300 shadow-sm p-4 mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="fa-mono text-[10px] uppercase text-ink-500 font-bold mb-1.5 block" style={{ letterSpacing: "0.12em" }}>
            Date of Assessment
          </label>
          <input
            type="date"
            value={assessDate}
            onChange={e => setAssessDate(e.target.value)}
            disabled={!canFill}
            className="fa-input w-full"
          />
        </div>
        <div>
          <label className="fa-mono text-[10px] uppercase text-ink-500 font-bold mb-1.5 block" style={{ letterSpacing: "0.12em" }}>
            Prepared by
          </label>
          <select
            value={preparedBy}
            onChange={e => setPreparedBy(e.target.value)}
            disabled={!canFill}
            className="fa-input w-full"
          >
            <option value="">{coachesLoading ? "Loading coaches…" : "Select full-time coach…"}</option>
            {/* Keep a previously-saved preparer selectable even if they're no
                longer in the full-time list. */}
            {preparedBy && !coaches.some(c => c.name === preparedBy) && (
              <option value={preparedBy}>{preparedBy}</option>
            )}
            {coaches.map(c => (
              <option key={c.id} value={c.name}>
                {c.name}{c.branch ? ` · ${c.branch}` : ""}{c.role ? ` (${c.role})` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Score cards — one per criterion. Each card has:
          - colourful gradient header with icon
          - description text
          - a big slider with live score readout and tick marks every 5
          The four cards stack vertically; each is its own visual unit so
          Marketing focuses on one criterion at a time. */}
      <div className="space-y-4">
        {CRITERIA.map(c => {
          const score = scores[c.key];
          const Icon = c.icon;
          return (
            <div key={c.key} className="rounded-2xl bg-white border border-ivory-300 shadow-sm overflow-hidden">
              <div className={`bg-gradient-to-r ${c.accent} px-5 py-3 flex items-center justify-between text-white`}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="text-lg font-bold">{c.title}</div>
                </div>
                <div className="flex items-baseline gap-1">
                  <div className="text-3xl font-black">{score}</div>
                  <div className="text-sm opacity-80">/ {FA_REPORT_MAX_PER_CRITERION}</div>
                </div>
              </div>
              <div className="p-5">
                <p className="text-sm text-ink-600 leading-relaxed mb-4">{c.description}</p>
                <ScoreSlider
                  value={score}
                  onChange={(n) =>
                    setScores(prev => ({ ...prev, [c.key]: n }))
                  }
                  disabled={!canFill}
                />
                {/* Quick presets — give Marketing a fast way to set 0/13/25
                    without dragging when the answer is obvious. */}
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {[0, 10, 15, 20, 25].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setScores(prev => ({ ...prev, [c.key]: preset }))}
                      disabled={!canFill}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                        score === preset
                          ? `bg-gradient-to-r ${c.accent} text-white shadow-sm`
                          : "bg-ivory-100 text-ink-600 hover:bg-ivory-200"
                      } ${!canFill ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Remarks block — capped at 400 chars so the printed cert always
          fits within one A4 page at zoom 0.85. Counter goes red near
          the limit so Marketing can pace themselves. */}
      <div className="rounded-2xl bg-white border border-ivory-300 shadow-sm overflow-hidden mt-4">
        <div className="bg-gradient-to-r from-slate-700 to-slate-900 px-5 py-3 flex items-center justify-between gap-2.5 text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div className="text-lg font-bold">Remarks</div>
          </div>
          <span className={`fa-mono text-[11px] ${remarks.length > 380 ? "text-rose-300 font-bold" : "text-white/70"}`}>
            {remarks.length}/400
          </span>
        </div>
        <div className="p-5">
          <textarea
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
            disabled={!canFill}
            rows={6}
            maxLength={400}
            placeholder="Strengths shown, areas to work on, anything notable from the showcase…"
            className="fa-input w-full resize-y"
            style={{ minHeight: 140 }}
          />
        </div>
      </div>

      {/* Video link — optional URL of a recording of the student's
          performance. Marketing pastes a Google Drive / YouTube / Vimeo
          link after the session; the certificate renders it as a
          clickable link so parents can watch back. */}
      <div className="rounded-2xl bg-white border border-ivory-300 shadow-sm overflow-hidden mt-4">
        <div className="bg-gradient-to-r from-cyan-600 to-teal-600 px-5 py-3 flex items-center gap-2.5 text-white">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-xs font-bold">
            ▶
          </div>
          <div className="text-lg font-bold">Video link <span className="font-normal text-white/80 text-sm">(optional)</span></div>
        </div>
        <div className="p-5">
          <input
            type="url"
            value={videoLink}
            onChange={e => setVideoLink(e.target.value)}
            disabled={!canFill}
            placeholder="https://drive.google.com/… or https://youtu.be/…"
            className="fa-input w-full"
          />
        </div>
      </div>

      {/* Total + Save bar. The total auto-sums the 4 sliders so Marketing
          never has to add manually — also matches what the certificate
          will render. */}
      <div className="sticky bottom-0 -mx-8 px-8 py-4 bg-white/95 backdrop-blur border-t border-ivory-300 mt-6 flex items-center gap-4 flex-wrap">
        <div className="flex items-baseline gap-2">
          <span className="fa-mono text-[10px] uppercase text-ink-500 font-bold" style={{ letterSpacing: "0.12em" }}>
            Total Score
          </span>
          <span className="text-3xl font-black text-rose-700">{total}</span>
          <span className="text-sm text-ink-400">/ {totalMax}</span>
        </div>

        <div className="flex-1 min-w-[200px]">
          <div className="w-full h-2.5 bg-ivory-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-rose-500 to-red-500 rounded-full transition-all"
              style={{ width: `${(total / totalMax) * 100}%` }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={!canFill || saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-bold shadow-sm
                     bg-gradient-to-r from-rose-600 to-red-600
                     hover:from-rose-700 hover:to-red-700 transition-all
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>Saving…</>
          ) : existing ? (
            <><CheckCircle2 className="w-4 h-4" /> Update report</>
          ) : (
            <><ClipboardCheck className="w-4 h-4" /> Save report</>
          )}
        </button>
      </div>

      {!canFill && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 mt-4 text-xs text-amber-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>Only Marketing or Admin can fill FA reports — you can view it but the form is read-only.</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 mt-4 text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Hidden helper to keep the imported `Users` icon referenced — used
          conditionally in a future iteration so removing it here would mean
          re-importing later. */}
      <Users className="hidden" aria-hidden="true" />
    </AppShell>
  );
}

/** Range-input wrapper with custom styling — shows the 0–25 scale and tick
 *  markers every 5 so Marketing can eyeball where the slider lands without
 *  squinting at the live numeric readout. */
function ScoreSlider({
  value, onChange, disabled,
}: { value: number; onChange: (n: number) => void; disabled: boolean }) {
  return (
    <div>
      <input
        type="range"
        min={0}
        max={FA_REPORT_MAX_PER_CRITERION}
        step={1}
        value={value}
        disabled={disabled}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-rose-500"
      />
      <div className="flex justify-between text-[10px] text-ink-400 font-mono mt-1 px-0.5">
        {[0, 5, 10, 15, 20, 25].map(t => (
          <span key={t}>{t}</span>
        ))}
      </div>
    </div>
  );
}
