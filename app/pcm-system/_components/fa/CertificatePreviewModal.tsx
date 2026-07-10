"use client";

import { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Award, ChevronRight, Clock, Printer, Download } from "lucide-react";
import { Modal } from "@pcm/_components/shared/Modal";
import { useFAStore } from "@pcm/_lib/store";
import { BRANCHES, FAEvent, Invitation, Session, Student } from "@pcm/_types";
import { formatDateRange } from "@pcm/_lib/date";
import { downloadCSV } from "@pcm/_lib/csv";

type View = "sessions" | "students" | "preview";

interface BulkBatch {
  items: { student: Student; grade: number; session: Session }[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  event: FAEvent;
  /** When provided, the wizard opens at the student picker for that session.
   *  When null, opens at the session picker. */
  initialSessionId?: string | null;
}

export function CertificatePreviewModal({ open, onClose, event, initialSessionId }: Props) {
  const allSessions = useFAStore(s => s.sessions);
  const allInvitations = useFAStore(s => s.invitations);
  const allStudents = useFAStore(s => s.students);

  // Holds the certificates to render into the print portal for a bulk print.
  // Cleared after window.print() fires. Single-preview still uses studentInv
  // below; the two flows render into the same print portal but only one is
  // populated at a time.
  const [bulk, setBulk] = useState<BulkBatch | null>(null);

  useEffect(() => {
    if (!bulk) return;
    // Let the DOM commit first so the cloned certificates exist when print
    // opens. Browsers freeze the page during print, so we clear immediately
    // afterwards.
    const t = setTimeout(() => {
      try { window.print(); } finally { setBulk(null); }
    }, 50);
    return () => clearTimeout(t);
  }, [bulk]);

  function buildBatch(invitations: Invitation[]): BulkBatch {
    const items: BulkBatch["items"] = [];
    for (const inv of invitations) {
      const student = allStudents.find(s => s.id === inv.studentId);
      const session = allSessions.find(s => s.id === inv.sessionId);
      if (!student || !session) continue;
      const grade = inv.targetGrade && inv.targetGrade > 0 ? inv.targetGrade : student.grade;
      items.push({ student, grade, session });
    }
    items.sort((a, b) =>
      a.session.dayNumber - b.session.dayNumber ||
      a.session.sessionNumber - b.session.sessionNumber ||
      a.student.name.localeCompare(b.student.name)
    );
    return { items };
  }

  function printAllForSession(sessId: string) {
    const invs = allInvitations.filter(
      i => i.sessionId === sessId && (i.status === "confirmed" || i.status === "attended")
    );
    if (invs.length === 0) return;
    setBulk(buildBatch(invs));
  }

  function printAllForEvent() {
    const invs = allInvitations.filter(
      i => i.eventId === event.id && (i.status === "confirmed" || i.status === "attended")
    );
    if (invs.length === 0) return;
    setBulk(buildBatch(invs));
  }

  // Canva "Bulk Create" reads a CSV where each column maps to one text
  // element on the user's cert template. Only ship the columns the user
  // actually wires up — fewer columns = less mapping friction in Canva.
  // Static labels like signatory names live IN the Canva template, so we
  // don't repeat them here on every row.
  function exportCanvaCSV(invs: Invitation[], filenameSuffix: string) {
    const branchNameByCode = Object.fromEntries(
      BRANCHES.map(b => [b.code, b.name])
    ) as Record<string, string>;
    const studentById = new Map(allStudents.map(s => [s.id, s]));

    // Header names match what we recommend the user uses for Canva text
    // placeholders ({Name}, {Module}, etc.). Plain words, no underscores —
    // Canva displays the column name in its mapping UI, so readable is good.
    const header = [
      "Name",            // student full name, uppercased
      "Module",          // JUNIOR / MIDDLER / SENIOR
      "Grade",           // G1 .. G8
      "Module Grade",    // e.g. "JUNIOR G1" — single field for layouts
      "Date",            // D/M/YYYY
      "Branch",          // branch name
      "Event",           // FA event name
    ];

    const completionDate = formatCertDate(event.endDate || event.startDate);
    const rows = invs
      .map(inv => {
        const student = studentById.get(inv.studentId);
        if (!student) return null;
        const g = inv.targetGrade && inv.targetGrade > 0 ? inv.targetGrade : student.grade;
        const moduleCode = moduleCodeForStudent(student);
        return [
          student.name.toUpperCase(),
          moduleCode,
          `G${g}`,
          `${moduleCode} G${g}`,
          completionDate,
          branchNameByCode[inv.branch] ?? inv.branch,
          event.name,
        ];
      })
      .filter((r): r is string[] => r !== null)
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

    if (rows.length === 0) return;
    const safeName = event.name.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
    downloadCSV(`FA_${safeName}_${filenameSuffix}_canva.csv`, [header, ...rows]);
  }

  function exportCanvaForSession(sessId: string) {
    const invs = allInvitations.filter(
      i => i.sessionId === sessId && (i.status === "confirmed" || i.status === "attended")
    );
    const sess = allSessions.find(s => s.id === sessId);
    const suffix = sess ? `D${sess.dayNumber}S${sess.sessionNumber}` : "session";
    exportCanvaCSV(invs, suffix);
  }

  function exportCanvaForEvent() {
    const invs = allInvitations.filter(
      i => i.eventId === event.id && (i.status === "confirmed" || i.status === "attended")
    );
    exportCanvaCSV(invs, "all");
  }

  function printAllForDay(day: number) {
    const dayInvs = allInvitations.filter(i => {
      if (i.eventId !== event.id) return false;
      if (i.status !== "confirmed" && i.status !== "attended") return false;
      const sess = allSessions.find(s => s.id === i.sessionId);
      return sess?.dayNumber === day;
    });
    if (dayInvs.length === 0) return;
    setBulk(buildBatch(dayInvs));
  }

  function exportCanvaForDay(day: number) {
    const dayInvs = allInvitations.filter(i => {
      if (i.eventId !== event.id) return false;
      if (i.status !== "confirmed" && i.status !== "attended") return false;
      const sess = allSessions.find(s => s.id === i.sessionId);
      return sess?.dayNumber === day;
    });
    exportCanvaCSV(dayInvs, `D${day}`);
  }

  // Initialise state from the prop. The parent conditionally mounts this
  // modal so each open is a fresh component instance — no useEffect needed.
  const [view, setView] = useState<View>(initialSessionId ? "students" : "sessions");
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId ?? null);
  const [studentInv, setStudentInv] = useState<Invitation | null>(null);

  const eventSessions = useMemo(
    () => allSessions
      .filter(s => s.eventId === event.id)
      .sort((a, b) => a.dayNumber - b.dayNumber || a.sessionNumber - b.sessionNumber),
    [allSessions, event.id]
  );

  // Per-session expected-attendee counts for the session picker view.
  const sessionExpectedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of eventSessions) {
      counts[s.id] = allInvitations.filter(
        i => i.sessionId === s.id && (i.status === "confirmed" || i.status === "attended")
      ).length;
    }
    return counts;
  }, [eventSessions, allInvitations]);

  const selectedSession = sessionId
    ? eventSessions.find(s => s.id === sessionId) ?? null
    : null;

  // Attendees for the currently picked session — used by the student-picker view.
  const sessionAttendees = useMemo(() => {
    if (!selectedSession) return [];
    return allInvitations
      .filter(i => i.sessionId === selectedSession.id && (i.status === "confirmed" || i.status === "attended"))
      .map(i => ({ inv: i, student: allStudents.find(s => s.id === i.studentId) ?? null }))
      .filter((x): x is { inv: Invitation; student: Student } => x.student !== null)
      .sort((a, b) => a.student.name.localeCompare(b.student.name));
  }, [selectedSession, allInvitations, allStudents]);

  const previewStudent = studentInv
    ? allStudents.find(s => s.id === studentInv.studentId) ?? null
    : null;
  const previewSession = studentInv
    ? eventSessions.find(s => s.id === studentInv.sessionId) ?? null
    : null;

  const titleByView: Record<View, string> = {
    sessions: "Browse certificates",
    students: selectedSession
      ? `Day ${selectedSession.dayNumber} · Session ${selectedSession.sessionNumber}`
      : "Choose a session",
    preview: previewStudent ? previewStudent.name : "Certificate preview",
  };
  const descByView: Record<View, string> = {
    sessions: "Pick a session to see the students who'll receive certificates.",
    students: "Pick a student to preview their certificate.",
    preview: "Use Ctrl+P to save this certificate as a PDF.",
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      kicker="Certificates"
      title={titleByView[view]}
      description={descByView[view]}
      size="lg"
    >
      {view === "sessions" && (
        <div>
          {/* Canva workflow — short, in-line guide so non-technical users
              know what to do with the CSV download. Always visible at the
              top of the session picker. */}
          <CanvaGuide />

          {/* Bulk-print actions */}
          {(() => {
            const eventTotal = eventSessions.reduce(
              (sum, s) => sum + (sessionExpectedCounts[s.id] ?? 0),
              0
            );
            return eventTotal > 0 ? (
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-ivory-300 gap-2 flex-wrap">
                <span className="text-xs text-ink-500">
                  <span className="fa-mono font-semibold text-ink-900">{eventTotal}</span> certificate{eventTotal !== 1 ? "s" : ""} ready
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={exportCanvaForEvent}
                    className="fa-btn-secondary text-xs"
                    title="Download a Canva-ready CSV of every certificate for this event"
                  >
                    <Download className="w-3.5 h-3.5" /> Canva CSV ({eventTotal})
                  </button>
                  <button
                    type="button"
                    onClick={printAllForEvent}
                    className="fa-btn-primary text-xs"
                    title="Print every confirmed/attended student's certificate for the whole event"
                  >
                    <Printer className="w-3.5 h-3.5" /> Print all ({eventTotal})
                  </button>
                </div>
              </div>
            ) : null;
          })()}
          <div className="space-y-4 max-h-[55vh] overflow-y-auto">
            {eventSessions.length === 0 ? (
              <div className="p-8 text-center text-sm text-ink-400">No sessions scheduled.</div>
            ) : (() => {
              // Group sessions by day so each day gets its own header row with
              // a Print + Canva CSV action pair for the whole day.
              const byDay: Record<number, Session[]> = {};
              for (const s of eventSessions) {
                (byDay[s.dayNumber] ??= []).push(s);
              }
              const dayNumbers = Object.keys(byDay).map(Number).sort((a, b) => a - b);
              return dayNumbers.map(day => {
                const sessionsForDay = byDay[day];
                const dayTotal = sessionsForDay.reduce(
                  (sum, s) => sum + (sessionExpectedCounts[s.id] ?? 0),
                  0
                );
                return (
                  <div key={day}>
                    {/* Day group header with Print all + Canva CSV for the whole day */}
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <span className="fa-mono text-[11px] uppercase font-semibold text-gold-700" style={{ letterSpacing: "0.1em" }}>
                        Day {day}
                      </span>
                      <span className="fa-mono text-[10px] text-ink-400">
                        · {sessionsForDay.length} session{sessionsForDay.length !== 1 ? "s" : ""} · {dayTotal} cert{dayTotal !== 1 ? "s" : ""}
                      </span>
                      <div className="flex-1 h-px bg-gold-200 ml-2" />
                      {dayTotal > 0 && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => exportCanvaForDay(day)}
                            className="fa-btn-ghost text-xs"
                            title={`Download a Canva-ready CSV of all ${dayTotal} certificates for Day ${day}`}
                          >
                            <Download className="w-3.5 h-3.5" /> Canva Day {day}
                          </button>
                          <button
                            type="button"
                            onClick={() => printAllForDay(day)}
                            className="fa-btn-secondary text-xs"
                            title={`Print all ${dayTotal} certificates for Day ${day}`}
                          >
                            <Printer className="w-3.5 h-3.5" /> Print Day {day}
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      {sessionsForDay.map(s => {
                        const count = sessionExpectedCounts[s.id] ?? 0;
                        return (
                          <div
                            key={s.id}
                            className="flex items-center gap-3 p-3 rounded-[10px] border border-ivory-300 bg-white hover:border-gold-400 hover:bg-ivory-100/60 transition-colors"
                          >
                            <button
                              type="button"
                              onClick={() => { setSessionId(s.id); setView("students"); }}
                              className="flex items-center gap-3 flex-1 min-w-0 text-left"
                            >
                              <span className="flex-shrink-0 fa-mono text-xs font-semibold text-ink-700 bg-ivory-200 px-2 py-1 rounded">
                                D{s.dayNumber}·S{s.sessionNumber}
                              </span>
                              <Clock className="w-3 h-3 text-ink-400 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-ink-900">
                                  {s.startTime}–{s.endTime}
                                  {s.label && <span className="text-ink-500 ml-2 font-normal">· {s.label}</span>}
                                </div>
                              </div>
                              <span className="fa-mono text-sm text-ink-700">{count}</span>
                              <ChevronRight className="w-4 h-4 text-ink-400" />
                            </button>
                            {count > 0 && (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); exportCanvaForSession(s.id); }}
                                  className="fa-btn-ghost text-xs flex-shrink-0"
                                  title={`Download a Canva-ready CSV for these ${count} certificate${count !== 1 ? "s" : ""}`}
                                >
                                  <Download className="w-3.5 h-3.5" /> Canva
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); printAllForSession(s.id); }}
                                  className="fa-btn-ghost text-xs flex-shrink-0"
                                  title={`Print all ${count} certificate${count !== 1 ? "s" : ""} for this session`}
                                >
                                  <Printer className="w-3.5 h-3.5" /> Print
                                </button>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {view === "students" && selectedSession && (
        <div>
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-ivory-300">
            <button
              type="button"
              onClick={() => { setView("sessions"); setStudentInv(null); }}
              className="fa-btn-ghost text-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> All sessions
            </button>
            <div className="text-xs text-ink-500 ml-auto">
              {sessionAttendees.length} certificate{sessionAttendees.length !== 1 ? "s" : ""}
            </div>
            {sessionAttendees.length > 0 && (
              <button
                type="button"
                onClick={() => printAllForSession(selectedSession.id)}
                className="fa-btn-primary text-xs"
                title="Print every certificate in this session"
              >
                <Printer className="w-3.5 h-3.5" /> Print all ({sessionAttendees.length})
              </button>
            )}
          </div>

          <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
            {sessionAttendees.length === 0 ? (
              <div className="p-8 text-center text-sm text-ink-400">
                No expected attendees in this session yet.
              </div>
            ) : (
              sessionAttendees.map(({ inv, student }) => (
                <div
                  key={inv.id}
                  className="flex items-center gap-3 p-3 rounded-[10px] border border-ivory-300 bg-white"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-ink-900">{student.name}</div>
                    <div className="text-xs text-ink-400 mt-0.5 flex items-center gap-1.5">
                      <span className="font-mono">G{inv.targetGrade && inv.targetGrade > 0 ? inv.targetGrade : student.grade}</span>
                      <span>·</span>
                      <span className="font-mono text-xs font-semibold bg-ivory-200 px-1.5 py-0.5 rounded">
                        {inv.branch}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setStudentInv(inv); setView("preview"); }}
                    className="fa-btn-secondary text-xs"
                  >
                    <Award className="w-3.5 h-3.5" /> Preview
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {view === "preview" && previewStudent && previewSession && (
        <div>
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-ivory-300">
            <button
              type="button"
              onClick={() => { setStudentInv(null); setView("students"); }}
              className="fa-btn-ghost text-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to students
            </button>
          </div>
          <CertificateRender
            student={previewStudent}
            grade={studentInv && studentInv.targetGrade > 0 ? studentInv.targetGrade : previewStudent.grade}
            session={previewSession}
            event={event}
          />
          {typeof document !== "undefined" && createPortal(
            <div className="fa-print-cert">
              <CertificateRender
                student={previewStudent}
                grade={studentInv && studentInv.targetGrade > 0 ? studentInv.targetGrade : previewStudent.grade}
                session={previewSession}
                event={event}
              />
            </div>,
            document.body
          )}
        </div>
      )}

      {/* Bulk-print portal — populated only while a bulk print is firing. */}
      {bulk && typeof document !== "undefined" && createPortal(
        <div className="fa-print-cert">
          {bulk.items.map((it, idx) => (
            <div
              key={`${it.student.id}-${it.session.id}-${idx}`}
              className="fa-print-cert-page"
            >
              <CertificateRender
                student={it.student}
                grade={it.grade}
                session={it.session}
                event={event}
              />
            </div>
          ))}
        </div>,
        document.body
      )}
    </Modal>
  );
}

/* ── Certificate render ─────────────────────────────────────────────────── */
/** Constants shared across every printed cert. Mirror what's on the physical
 *  Ebright cert template so the on-screen preview and the eventual Canva
 *  bulk-print stay in sync. */
const CERT_COMPANY = "Ebright Public Speaking";
const CERT_SIGNATORIES = [
  { name: "KEVIN KHOO", title: "Managing Director" },
  { name: "NIK NUR ATHIRAH", title: "Head of Academy" },
] as const;

/** "DD/M/YYYY" — matches the format printed on the physical cert (e.g. 25/4/2026). */
function formatCertDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

/** Module code derived from the student's age band. Until the DB carries a
 *  DOB column we fall back to the grade-based AgeCategory the server already
 *  computes (Junior G1–G3, Middler G4–G6, Senior G7+). When the DB ships an
 *  age field, just swap the input — the mapping is the same. */
function moduleCodeForStudent(student: Student): string {
  switch (student.ageCategory) {
    case "Junior":  return "JUNIOR";
    case "Middler": return "MIDDLER";
    case "Senior":  return "SENIOR";
  }
}

function CertificateRender({
  student, grade, session, event,
}: { student: Student; grade: number; session: Session; event: FAEvent }) {
  // A4 landscape (1123 × 794 px @ 96dpi → aspect 1.414:1).
  const completionDate = formatCertDate(event.endDate || event.startDate);
  const moduleCode = moduleCodeForStudent(student);

  return (
    <div
      className="relative bg-white overflow-hidden mx-auto"
      style={{
        width: "100%",
        maxWidth: "1100px",
        aspectRatio: "1.414 / 1",
        fontFamily: "var(--font-sans)",
        color: "#1a1a1a",
      }}
    >
      {/* ── Red ribbon/swoop on the right ── Two layered SVG paths that arc
          from top to bottom on the right half, mimicking the curve on the
          physical cert. viewBox is the landscape canvas (1414×1000). */}
      <svg
        aria-hidden="true"
        viewBox="0 0 1414 1000"
        preserveAspectRatio="none"
        className="absolute inset-0 pointer-events-none"
        style={{ width: "100%", height: "100%", zIndex: 0 }}
      >
        {/* Outer (back) ribbon — darker red, sweeps wider */}
        <path
          d="M 1414 0
             L 1414 1000
             L 580 1000
             C 820 850, 980 540, 940 280
             C 920 140, 980 60, 1080 0
             Z"
          fill="#9e2e26"
        />
        {/* Inner (front) ribbon — primary red, tighter sweep, leaves a thin
            band of the darker red visible like a folded ribbon edge */}
        <path
          d="M 1414 0
             L 1414 1000
             L 720 1000
             C 920 870, 1060 580, 1020 320
             C 1000 180, 1060 80, 1160 0
             Z"
          fill="#bf3d33"
        />
      </svg>

      {/* ── Decorative "Certificate / OF COMPLETION" header ──
          Sits over the white background on the upper-half, the curl of the
          script wraps slightly onto the red. Big, rotated, eye-catching. */}
      <div
        aria-hidden="true"
        className="absolute"
        style={{
          top: "10%",
          right: "8%",
          transform: "rotate(-8deg)",
          transformOrigin: "right top",
          color: "#0c0a09",
          lineHeight: 0.9,
          textAlign: "right",
          zIndex: 2,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "4.8rem",
            fontStyle: "italic",
            fontWeight: 500,
          }}
        >
          Certificate
        </div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "1.1rem",
            letterSpacing: "0.5em",
            textTransform: "uppercase",
            marginTop: "0.4rem",
            fontWeight: 500,
            paddingRight: "0.5em",
          }}
        >
          of Completion
        </div>
      </div>

      {/* ── ebright logo block ── Sits ON the red ribbon area, slightly
          rotated to follow the curve. White text on red box. */}
      <div
        aria-hidden="true"
        className="absolute"
        style={{
          top: "30%",
          right: "5%",
          background: "#ffffff",
          color: "#bf3d33",
          padding: "0.6rem 1.1rem",
          fontWeight: 900,
          fontStyle: "italic",
          fontSize: "2.2rem",
          letterSpacing: "-0.03em",
          fontFamily: "var(--font-display)",
          transform: "rotate(-8deg)",
          transformOrigin: "right center",
          zIndex: 3,
          boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
          lineHeight: 1,
        }}
      >
        ebright
      </div>

      {/* ── Main content area (left side, clear of the ribbon) ── */}
      <div
        className="absolute"
        style={{
          left: "7%",
          right: "42%",
          top: "26%",
          bottom: "20%",
          zIndex: 1,
        }}
      >
        <div
          className="fa-mono"
          style={{
            fontSize: "0.75rem",
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "#9e2e26",
            marginBottom: "0.8rem",
            fontWeight: 600,
          }}
        >
          This certificate is awarded to
        </div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: "2.6rem",
            lineHeight: 1.05,
            letterSpacing: "0.005em",
            textTransform: "uppercase",
            color: "#0c0a09",
            marginBottom: "1.6rem",
          }}
        >
          {student.name}
        </div>
        <div style={{ fontSize: "1rem", lineHeight: 1.6, color: "#1a1a1a" }}>
          For completing&nbsp;
          <span style={{ fontWeight: 800 }}>
            {moduleCode} G{grade}
          </span>
          &nbsp;of public speaking classes conducted by {CERT_COMPANY}.
        </div>
      </div>

      {/* ── Signatures (bottom-left) ── */}
      <div
        className="absolute"
        style={{
          left: "7%",
          bottom: "8%",
          display: "flex",
          gap: "2.4rem",
          zIndex: 1,
        }}
      >
        {CERT_SIGNATORIES.map(sig => (
          <div key={sig.name} style={{ minWidth: "180px" }}>
            <div style={{
              borderBottom: "1px solid #1a1a1a",
              height: "1.8rem",
              marginBottom: "0.3rem",
            }} />
            <div className="fa-mono" style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.06em" }}>
              {sig.name}
            </div>
            <div className="fa-mono" style={{ fontSize: "0.65rem", color: "#555", letterSpacing: "0.03em" }}>
              {sig.title}
            </div>
          </div>
        ))}
      </div>

      {/* ── DATE block (bottom-centre/right of white area) ── */}
      <div
        className="absolute"
        style={{
          right: "44%",
          bottom: "8%",
          textAlign: "center",
          minWidth: "140px",
          zIndex: 1,
        }}
      >
        <div style={{ borderBottom: "1px solid #1a1a1a", height: "1.8rem", marginBottom: "0.3rem" }}>
          <span className="fa-mono" style={{ fontSize: "0.95rem", lineHeight: "1.8rem", display: "inline-block" }}>
            {completionDate}
          </span>
        </div>
        <div className="fa-mono" style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em" }}>
          DATE
        </div>
      </div>

      {/* Hidden metadata for QA / accessibility. Not visible on screen. */}
      <div className="sr-only">
        Event: {event.name} · {formatDateRange(event.startDate, event.endDate)} · {event.venue} ·
        Day {session.dayNumber} · Session {session.sessionNumber} · {session.startTime}–{session.endTime}
      </div>
    </div>
  );
}

/* ── Canva usage guide ────────────────────────────────────────────────────
 * Short, dismissible info card that explains the Bulk Create workflow and
 * lists what the CSV columns map to. Dismissal persists in localStorage so
 * the user doesn't keep seeing it once they know the flow.
 * ──────────────────────────────────────────────────────────────────────── */
const CANVA_GUIDE_STORAGE_KEY = "fa-cert-canva-guide-dismissed";

function CanvaGuide() {
  const [dismissed, setDismissed] = useState<boolean>(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(CANVA_GUIDE_STORAGE_KEY) === "1") {
        setDismissed(true);
      }
    } catch {
      // localStorage unavailable — just show the guide every time.
    }
  }, []);

  function dismiss() {
    setDismissed(true);
    try { window.localStorage.setItem(CANVA_GUIDE_STORAGE_KEY, "1"); } catch {}
  }

  if (dismissed) return null;

  return (
    <div className="mb-4 p-3 rounded-[10px] border border-gold-200 bg-ivory-50">
      <div className="flex items-start gap-2">
        <Award className="w-4 h-4 text-gold-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 text-xs text-ink-700 leading-relaxed">
          <div className="fa-mono font-semibold text-ink-900 mb-1" style={{ letterSpacing: "0.04em" }}>
            How the Canva CSV works
          </div>
          <ol className="list-decimal pl-4 space-y-0.5">
            <li>Design your cert once in Canva (red curves, ebright logo, signatures — everything that stays the same on every cert).</li>
            <li>For each piece of data that changes per student, type a placeholder where it should go (e.g. type <code className="font-mono bg-ivory-200 px-1 rounded">Name</code> where the name belongs).</li>
            <li>Click <strong>Apps → Bulk Create</strong> in Canva, upload the CSV from below.</li>
            <li>Canva will let you connect each piece of text to a CSV column. Match column names to placeholders, then click <strong>Continue</strong>.</li>
          </ol>
          <div className="mt-2 fa-mono text-[10px] uppercase text-ink-500" style={{ letterSpacing: "0.08em" }}>
            Columns in the CSV
          </div>
          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
            <div><span className="font-mono font-semibold">Name</span> — student name (uppercase)</div>
            <div><span className="font-mono font-semibold">Module</span> — JUNIOR / MIDDLER / SENIOR</div>
            <div><span className="font-mono font-semibold">Grade</span> — G1 to G8</div>
            <div><span className="font-mono font-semibold">Module Grade</span> — e.g. JUNIOR G1</div>
            <div><span className="font-mono font-semibold">Date</span> — D/M/YYYY</div>
            <div><span className="font-mono font-semibold">Branch</span> — branch name</div>
            <div className="col-span-2"><span className="font-mono font-semibold">Event</span> — FA event name</div>
          </div>
          <div className="mt-1.5 text-[11px] text-ink-500">
            Signatures and the &ldquo;conducted by Ebright Public Speaking&rdquo; line stay inside your Canva template — no column needed for them.
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="fa-btn-ghost text-[10px] flex-shrink-0"
          aria-label="Hide this guide"
          title="Hide this guide (reset by clearing browser data)"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
