"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useFAStore } from "@pcm/_lib/store";
import { useCurrentUser } from "@pcm/_hooks/useCurrentUser";
import { ArrowLeft, Printer } from "lucide-react";
import { CertificateBody } from "@pcm/_components/fa/CertificateBody";

// Single-certificate view. Wraps the shared <CertificateBody/> in a
// page container + floating toolbar (hidden when printing). The cert
// itself lives in CertificateBody so the bulk-print page renders the
// exact same markup with zero drift.

export default function CertificatePage() {
  const { invitationId } = useParams<{ invitationId: string }>();
  const user = useCurrentUser();
  const reports = useFAStore(s => s.reports);
  const report = useMemo(() => reports.find(r => r.invitationId === invitationId), [reports, invitationId]);

  if (!user) return null;
  if (!report) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ivory-100">
        <div className="text-center">
          <h1 className="fa-display text-2xl text-ink-900">Report not found</h1>
          <p className="text-ink-500 mt-2">It may not be filled yet.</p>
          <Link href="/pcm-system/shared/reports" className="fa-btn-primary mt-4 inline-flex">
            Back to reports
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ivory-100 py-8 print:py-0 print:bg-white">
      {/* Floating toolbar — hidden on print. */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 print:hidden flex items-center gap-2 bg-white shadow-lg rounded-full border border-ivory-300 px-3 py-2">
        <Link
          href={`/pcm-system/shared/reports/${invitationId}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-700 hover:text-ink-900"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to edit
        </Link>
        <span className="text-ink-300">|</span>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-xs font-semibold
                     bg-gradient-to-r from-violet-600 to-fuchsia-600
                     hover:from-violet-700 hover:to-fuchsia-700"
        >
          <Printer className="w-3.5 h-3.5" />
          Print / save as PDF
        </button>
      </div>

      {/* Outer wrapper. On screen we keep the 900px max-width so the cert
          mirrors A4 portrait. On print, the @page rule already enforces
          12mm A4 margins so the cert never butts against the paper edge.
          fa-print-cert-page (NOT fa-print-cert) is the class that:
            • is the print-visibility opt-out for this subtree
              (`body *` is visibility:hidden on print otherwise);
            • has no `display:none` on screen — `.fa-print-cert` does, and
              using that one made the on-screen view disappear.
          The page-break-after on .fa-print-cert-page is a no-op here
          because :last-child resets it (only one cert on the page). */}
      <div
        className="fa-print-cert-page mx-auto print:shadow-none"
        style={{ maxWidth: "900px", padding: "16px 24px" }}
      >
        <CertificateBody report={report} />
      </div>
    </div>
  );
}
