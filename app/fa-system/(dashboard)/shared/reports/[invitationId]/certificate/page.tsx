"use client";

import { useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useFAStore } from "@fa/_lib/store";
import { useCurrentUser } from "@fa/_hooks/useCurrentUser";
import { ArrowLeft, Printer } from "lucide-react";
import { CertificateBody } from "@fa/_components/fa/CertificateBody";

// Single-certificate view. Wraps the shared <CertificateBody/> in a
// page container + floating toolbar (hidden when printing). The cert
// itself lives in CertificateBody so the bulk-print page renders the
// exact same markup with zero drift.

export default function FaCertificatePage() {
  const { invitationId } = useParams<{ invitationId: string }>();
  const user = useCurrentUser();
  const reports = useFAStore(s => s.reports);
  const report = useMemo(() => reports.find(r => r.invitationId === invitationId), [reports, invitationId]);

  // This view is typically opened with target="_blank", which means
  // AppShell never wraps it and the FA store is empty in the new tab.
  // Trigger the lazy loaders manually so the lookup above resolves.
  const reportsLoaded = useFAStore(s => s.reportsLoaded);
  const loadReports = useFAStore(s => s.loadReports);
  useEffect(() => { if (!reportsLoaded) void loadReports(); }, [reportsLoaded, loadReports]);

  if (!user) return null;
  if (!reportsLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink-500 text-sm">
        Loading report…
      </div>
    );
  }
  if (!report) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ivory-100">
        <div className="text-center">
          <h1 className="fa-display text-2xl text-ink-900">Report not found</h1>
          <p className="text-ink-500 mt-2">It may not be filled yet.</p>
          <Link href="/fa-system/shared/reports" className="fa-btn-primary mt-4 inline-flex">
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
          href={`/fa-system/shared/reports/${invitationId}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-700 hover:text-ink-900"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to edit
        </Link>
        <span className="text-ink-300">|</span>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-xs font-semibold
                     bg-gradient-to-r from-rose-600 to-red-600
                     hover:from-rose-700 hover:to-red-700"
        >
          <Printer className="w-3.5 h-3.5" />
          Print / save as PDF
        </button>
      </div>

      {/* Outer wrapper. On screen we cap at 900px so the cert mirrors A4
          portrait. Extra top padding so the floating toolbar doesn't sit
          on top of the red banner. On print, print:pt-0 removes it and the
          @page rule in fa-globals.css enforces A4 page size + margins.
          fa-print-cert-page (NOT fa-print-cert) is the class that reveals
          this subtree during print. The bare .fa-print-cert rule has
          `display:none` for on-screen — using it would hide the cert in
          the browser. fa-print-cert-page has no such on-screen hide; its
          page-break-after is reset by :last-child for a single cert. */}
      <div
        className="fa-print-cert-page mx-auto print:shadow-none pt-20 print:pt-0"
        style={{ maxWidth: "900px", padding: "0 24px 16px" }}
      >
        <CertificateBody report={report} />
      </div>
    </div>
  );
}
