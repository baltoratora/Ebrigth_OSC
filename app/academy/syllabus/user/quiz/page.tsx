"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { recordResponse } from "../quiz-data";

export default function UserQuizPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const email = session?.user?.email ?? null;
  const branchName =
    (session?.user as { branchName?: string | null } | undefined)?.branchName ?? null;

  const [submitted, setSubmitted] = useState(false);

  const canSubmit = status === "authenticated" && !!email && !!branchName && !submitted;

  const onSubmit = () => {
    if (!canSubmit || !email || !branchName) return;
    recordResponse(branchName, email);
    setSubmitted(true);
  };

  return (
    <div className="w-full max-w-6xl mx-auto">
      {/* Header chip + back button */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4 mb-8">
        <button
          onClick={() => router.push("/academy/syllabus/user")}
          className="bg-slate-100 text-slate-700 hover:bg-cyan-700 hover:text-white px-4 py-2 rounded-xl flex items-center justify-center shadow-md transition-colors"
          aria-label="Back to User"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
            <line x1="20" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <div className="bg-cyan-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-md">
          <span className="text-xl">📝</span>
          <h1 className="text-lg font-black uppercase tracking-wide m-0 leading-none">
            QUIZ
          </h1>
        </div>
      </div>

      <section
        className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 flex flex-col cursor-text mx-auto"
        style={{ width: "794px", maxWidth: "100%", minHeight: "400px" }}
      >
        {/* Identity strip — shows the respondent and their branch so it's
            clear who the submission will be attributed to. */}
        <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-700 border-b border-slate-200 pb-4">
          <div>
            <span className="font-bold text-slate-500">Email:</span>{" "}
            <span className="text-slate-800">{email ?? "—"}</span>
          </div>
          <div>
            <span className="font-bold text-slate-500">Branch:</span>{" "}
            <span className="text-slate-800">{branchName ?? "—"}</span>
          </div>
        </div>

        {/* Placeholder for the actual quiz questions — to be designed. */}
        <p className="text-slate-400 italic text-sm mb-6">
          Quiz content goes here.
        </p>

        {/* Submission */}
        {!branchName && status === "authenticated" && (
          <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-4">
            Your account doesn&apos;t have a branch assigned. Ask an admin to set
            your branch before you can submit a quiz.
          </p>
        )}

        {submitted ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              ✓ Submitted. Your response has been recorded for {branchName}.
            </p>
            <button
              type="button"
              onClick={() => router.push("/academy/syllabus/user")}
              className="px-4 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-800 text-white font-bold text-sm shadow-md transition-colors"
            >
              Back to USER
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className={`self-start px-4 py-2 rounded-lg font-bold text-sm shadow-md transition-colors ${
              canSubmit
                ? "bg-cyan-700 hover:bg-cyan-800 text-white"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            Submit Quiz
          </button>
        )}
      </section>
    </div>
  );
}
