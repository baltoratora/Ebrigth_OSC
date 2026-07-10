"use client";

import { BRANCHES, PcmReport } from "@pcm/_types";
import { format, parseISO } from "date-fns";

/**
 * Shared certificate render — used by:
 *   - the single-cert page at /pcm-system/shared/reports/[id]/certificate
 *   - the bulk-print page at /pcm-system/shared/reports/print
 *
 * Layout mirrors the eBright "Assessment Report" PDF template very closely
 * — the academy wants the printed cert to look familiar to parents. The
 * only departures from the PDF are small colour accents (green dot on
 * Strengths, amber on Improvement Plan, dark Total Score under the rubric)
 * so the document still reads "a little colourful, not too much".
 */
export function CertificateBody({ report }: { report: PcmReport }) {
  const branchName = BRANCHES.find(b => b.code === report.branch)?.name ?? report.branch;
  const total =
    report.confidenceScore +
    report.voiceClarityScore +
    report.eyeContactScore +
    report.ideaExpressionScore;

  return (
    // Outer wrapper has its own horizontal padding so the red banner and
    // grey identity panel DON'T run flush to the page edge — academy
    // wanted visible white-space framing the entire cert on A4.
    <div style={{ background: "white", padding: "0 28px" }}>
      {/* Red header bar with white wordmark + address. The "ebright"
          wordmark gets a faux-bracket frame so it reads as a logo lock-up
          rather than plain text — closest we can get without an SVG asset. */}
      {/* Banner red matched to the eBright PNG's brand red so the logo
          blends seamlessly with the banner instead of looking like a
          differently-shaded box. */}
      <div style={{ background: "#e30613", color: "white", padding: "16px 24px" }}>
        <div className="flex items-start justify-between gap-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/ebright-logo.png"
            alt="eBright"
            // White border drawn directly on the image with no extra
            // padding — matches the eBright brand lock-up where the
            // border hugs the red rectangle exactly, no gap.
            style={{
              height: 60,
              width: "auto",
              display: "block",
              border: "3px solid white",
              boxSizing: "content-box",
            }}
          />
          <div className="text-right text-[11px] leading-snug" style={{ opacity: 0.92 }}>
            <div className="font-semibold">EBRIGHT SDN. BHD.</div>
            <div>21-2, Jalan USJ 10/1D, Taipan Business Centre,</div>
            <div>47620 Subang Jaya, Selangor.</div>
          </div>
        </div>
        <h1
          className="text-center"
          style={{
            fontFamily: "var(--font-display, serif)",
            fontWeight: 800,
            fontSize: 40,
            marginTop: 14,
            letterSpacing: "0.01em",
          }}
        >
          Assessment Report
        </h1>
      </div>

      {/* Identity panel — slate-tinted to echo the PDF's pale blue-gray
          band. Pill-shaped fields exactly as the original. Bumped up to
          16px text per academy feedback so the printed cert is easier to
          read at arm's length. */}
      <div className="px-10 py-7" style={{ background: "#e7eaf0" }}>
        <div className="grid grid-cols-[200px_1fr] gap-y-4 gap-x-5 text-base">
          <div className="text-ink-700 font-semibold">Student&apos;s name</div>
          <div className="bg-white rounded-full border border-ink-300 px-5 py-2 text-ink-900">
            {report.studentName || "—"}
          </div>
          <div className="text-ink-700 font-semibold">Date of Assessment</div>
          <div className="bg-white rounded-full border border-ink-300 px-5 py-2 text-ink-900 font-mono">
            {format(parseISO(report.assessmentDate), "d MMMM yyyy")}
          </div>
          <div className="text-ink-700 font-semibold">Grade</div>
          <div className="flex items-center gap-3">
            <div className="bg-white rounded-full border border-ink-300 px-5 py-2 text-ink-900 font-mono w-24 text-center">
              G{report.grade}
            </div>
            <div className="text-ink-700 font-semibold">Branch</div>
            <div className="bg-white rounded-full border border-ink-300 px-5 py-2 text-ink-900 flex-1">
              {branchName} <span className="text-ink-500 font-mono">({report.branch})</span>
            </div>
          </div>
        </div>
      </div>

      {/* Everything below the red banner sits inside a generous inner
          padding so the content never crowds the A4 page edge. The user
          flagged the previous version as feeling "stuck to the side" — the
          extra horizontal breathing room here is the fix. */}
      <div className="px-10 pb-10">
        {/* "Score" heading — centred, plain. Matches the PDF. */}
        <h2
          className="text-center mt-8 mb-4"
          style={{
            fontFamily: "var(--font-display, serif)",
            fontWeight: 700,
            fontSize: 28,
          }}
        >
          Score
        </h2>

        {/* Rubric — full 4×5 grid. Picked cell stays highlighted in soft
            red with a 3-pixel red outline. Cell text bumped to 14px so it
            actually reads at print scale. */}
        <table className="w-full border-collapse" style={{ tableLayout: "fixed", fontSize: 14 }}>
          <thead>
            <tr>
              <th colSpan={6} className="border border-ink-400 font-bold py-2.5" style={{ background: "#e7eaf0", fontSize: 16 }}>
                Speech Preparation &amp; Delivery
              </th>
            </tr>
            <tr>
              <th className="border border-ink-400 py-2 w-[160px]" style={{ background: "#e7eaf0", fontSize: 15 }}>Criteria</th>
              {[1, 2, 3, 4, 5].map(n => (
                <th key={n} className="border border-ink-400 py-2" style={{ background: "#e7eaf0", fontSize: 15 }}>{n}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RUBRIC.map(r => {
              const score = report[r.key];
              return (
                <tr key={r.key}>
                  <td className="border border-ink-400 px-3 py-3 text-center font-semibold align-middle" style={{ fontSize: 14 }}>
                    {r.title}
                  </td>
                  {r.labels.map((label, i) => {
                    const picked = score === i + 1;
                    return (
                      <td
                        key={i}
                        className="border border-ink-400 align-top px-3 py-3"
                        style={picked
                          ? { background: "#fee2e2", outline: "3px solid #e30613", outlineOffset: "-3px", fontSize: 13, lineHeight: 1.4 }
                          : { fontSize: 13, lineHeight: 1.4 }
                        }
                      >
                        {label}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Subtle total-score note — bigger now (16px italic + 20px number)
            so it doesn't disappear next to the larger table. */}
        <div
          className="text-right mt-3"
          style={{
            fontFamily: "var(--font-display, serif)",
            fontSize: 16,
            color: "#475569",
          }}
        >
          <span style={{ fontStyle: "italic" }}>Total Score: </span>
          <span style={{ fontWeight: 700, color: "#1e293b", fontSize: 20 }}>{total}</span>
          <span style={{ color: "#94a3b8" }}> / 20</span>
        </div>

        {/* Strengths + Improvement Plan — red-bordered boxes with a small
            coloured dot beside the label for a touch of colour. */}
        <div className="grid grid-cols-2 gap-5 mt-6">
          <NarrativeBox label="Strengths"        dotColor="#16a34a" content={report.strengths} />
          <NarrativeBox label="Improvement Plan" dotColor="#d97706" content={report.improvementPlan} />
        </div>
      </div>
    </div>
  );
}

// ─── Internals ───────────────────────────────────────────────────────────

const RUBRIC = [
  { key: "confidenceScore"     as const, title: "Confidence & Courage",         labels: ["Very shy; refuses or unable to speak.","Speaks only with a lot of help.","Speaks with some hesitation.","Speaks confidently with small hesitation.","Very confident; speaks willingly and bravely."] },
  { key: "voiceClarityScore"   as const, title: "Voice Clarity",                labels: ["Too soft; cannot be heard.","Often unclear or too soft.","Audible but not consistent.","Clear voice most of the time.","Loud, clear, and easy to understand."] },
  { key: "eyeContactScore"     as const, title: "Eye Contact & Body Awareness", labels: ["Looks down/away; avoids audience.","Rare eye contact.","Some eye contact.","Good eye contact most of the time.","Strong eye contact; confident posture."] },
  { key: "ideaExpressionScore" as const, title: "Idea Expression",              labels: ["Unable to express ideas.","Very short or unclear ideas.","Simple ideas with some clarity.","Clear ideas with basic explanation.","Clear and slightly elaborated ideas."] },
];

/**
 * Red-bordered narrative box matching the PDF, with one small colour
 * accent: a coloured dot beside the label. Adds character without breaking
 * the formal feel.
 */
function NarrativeBox({
  label, dotColor, content,
}: { label: string; dotColor: string; content: string }) {
  return (
    <div
      className="rounded"
      style={{ border: "2px solid #e30613", padding: 16, minHeight: 160 }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            width: 10,
            height: 10,
            borderRadius: 999,
            background: dotColor,
          }}
        />
        <div className="font-bold" style={{ fontSize: 16 }}>{label}:</div>
      </div>
      <div className="text-ink-800 whitespace-pre-wrap leading-relaxed" style={{ fontSize: 15 }}>
        {content || <span className="text-ink-400 italic">—</span>}
      </div>
    </div>
  );
}
