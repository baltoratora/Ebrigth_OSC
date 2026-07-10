"use client";

import Link from "next/link";

const contentModules = [
  // descColor chosen to contrast the dominant hue of each emoji icon
  { name: "JNR", desc: "7 to 9 years old",   href: "/academy/syllabus/jnr", icon: "🎒", descColor: "text-teal-800" },   // backpack reads warm red
  { name: "MDR", desc: "10 to 12 years old", href: "/academy/syllabus/mdr", icon: "💼", descColor: "text-rose-800" },   // briefcase reads brown/tan
  { name: "SNR", desc: "15 to 16 years old", href: "/academy/syllabus/snr", icon: "🎓", descColor: "text-amber-700" },  // mortarboard reads black
];

type CourseModule = {
  name: string;
  href: string;
  icon: string;
  /** Optional small-print note shown under the card name (e.g. access requirement). */
  note?: string;
};

const courseModules: CourseModule[] = [
  { name: "INDUCTION", href: "/academy/syllabus/induction", icon: "🎬" },
  { name: "TRAINING",  href: "/academy/syllabus/training", icon: "📝" },
  {
    name: "USER",
    href: "/academy/syllabus/user",
    icon: "👤",
    note: "🔒 Requires your email and password to access.",
  },
];

export default function SyllabusPage() {
  return (
    <div className="w-full max-w-6xl mx-auto">
      {/* Header chip + back arrow — matches CRM sub-menu style */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4 mb-8">
        <Link
          href="/dashboards/academy"
          aria-label="Back to Academy"
          title="Back to Academy"
          className="bg-slate-100 text-slate-700 hover:bg-indigo-600 hover:text-white px-4 py-2 rounded-xl flex items-center justify-center shadow-md transition-colors"
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
        </Link>
        <div className="bg-indigo-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-md">
          <span className="text-xl">🎓</span>
          <h1 className="text-lg font-black uppercase tracking-wide m-0 leading-none">
            Ebright Class Syllabus
          </h1>
        </div>
      </div>

      {/* CONTENT section */}
      <section className="mb-10">
        <h2 className="text-2xl font-black uppercase tracking-wide text-slate-800 mb-4">
          Content
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {contentModules.map((m) => (
            <Link key={m.name} href={m.href}>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer p-8 h-full flex flex-col items-center justify-center text-center">
                <span className="text-5xl mb-4">{m.icon}</span>
                <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">
                  {m.name}
                </h2>
                <p className={`mt-2 font-serif italic tracking-wide text-sm ${m.descColor}`}>
                  {m.desc}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* COURSE section */}
      <section>
        <h2 className="text-2xl font-black uppercase tracking-wide text-slate-800 mb-4">
          Course
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courseModules.map((m) => (
            <Link key={m.name} href={m.href}>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer p-8 h-full flex flex-col items-center justify-center text-center">
                <span className="text-5xl mb-4">{m.icon}</span>
                <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">
                  {m.name}
                </h2>
                {m.note && (
                  <p className="mt-3 text-xs text-slate-500 italic">{m.note}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
