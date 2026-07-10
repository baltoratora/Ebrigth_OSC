"use client";

import dynamic from "next/dynamic";

// Skip SSR for this page. The dashboard hosts many <button>/<input>/<select>
// elements that browser autofill / form-filler extensions decorate with
// `fdprocessedid` attributes between server render and client hydration.
// Server-side rendering buys nothing here (the data is fetched client-side
// in useEffect anyway) and silences the hydration-mismatch overlay.
const AttendanceSummary = dynamic(
  () => import("@/app/components/AttendanceSummary"),
  { ssr: false }
);

export default function AttendanceSummaryPage() {
  return <AttendanceSummary />;
}
