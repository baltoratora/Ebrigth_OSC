"use client";

import { useParams, useRouter } from "next/navigation";

// Per-grade chapter list. Grades without an explicit entry fall back to
// the default 4 generic chapters.
const chaptersByGrade: Record<number, string[]> = {
  1: Array.from({ length: 12 }, (_, i) => `G1 C${i + 1}`),
  2: Array.from({ length: 12 }, (_, i) => `G2 C${i + 1}`),
  3: Array.from({ length: 12 }, (_, i) => `G3 C${i + 1}`),
  4: Array.from({ length: 12 }, (_, i) => `G4 C${i + 1}`),
  5: Array.from({ length: 12 }, (_, i) => `G5 C${i + 1}`),
  6: Array.from({ length: 12 }, (_, i) => `G6 C${i + 1}`),
  7: Array.from({ length: 12 }, (_, i) => `G7 C${i + 1}`),
  8: Array.from({ length: 12 }, (_, i) => `G8 C${i + 1}`),
};

export default function MdrModulePage() {
  const params = useParams<{ module: string }>();
  const router = useRouter();
  const n = Number(params?.module);

  const chapterNames =
    chaptersByGrade[n] ?? [1, 2, 3, 4].map((i) => `Chapter ${i}`);

  // Only grades 1–8 are valid for MDR
  if (!Number.isInteger(n) || n < 1 || n > 8) {
    return (
      <div className="w-full max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
          <h1 className="text-2xl font-black text-slate-800 mb-2">Grade not found</h1>
          <p className="text-slate-500 mb-6">MDR has grades 1 through 8.</p>
          <button
            onClick={() => router.push("/academy/syllabus/mdr")}
            className="px-5 py-2 rounded-lg bg-rose-800 text-white font-semibold hover:bg-rose-900"
          >
            ← Back to MDR
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto">
      {/* Header chip + back button */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4 mb-8">
        <button
          onClick={() => router.push("/academy/syllabus/mdr")}
          className="bg-slate-100 text-slate-700 hover:bg-rose-800 hover:text-white px-4 py-2 rounded-xl flex items-center justify-center shadow-md transition-colors"
          aria-label="Back to MDR"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-6 h-6"
          >
            <line x1="20" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <div className="bg-rose-800 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-md">
          <span className="text-xl">💼</span>
          <h1 className="text-lg font-black uppercase tracking-wide m-0 leading-none">
            Grade {n}
          </h1>
        </div>
      </div>

      {/* Content slot — fill in grade-specific content later */}
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 min-h-[60vh]">
        <h2 className="text-2xl font-black uppercase tracking-wide text-slate-800 mb-4">
          Chapters
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {chapterNames.map((name, idx) => (
            <div
              key={name}
              onClick={() => router.push(`/academy/syllabus/mdr/${n}/${idx + 1}`)}
              className="bg-red-200 text-red-900 rounded-2xl shadow-md p-8 h-full flex flex-col items-center justify-center text-center transition-transform hover:scale-105 cursor-pointer"
            >
              <span className="text-5xl mb-3">📘</span>
              <h3 className="text-lg font-black uppercase tracking-tight">
                {name}
              </h3>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
