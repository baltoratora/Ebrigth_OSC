"use client";

import Link from "next/link";

const items = [
  {
    name: "Academy Dashboard",
    href: "/academy/dashboard",
    icon: "📅",
  },
  {
    name: "Learnual",
    href: "#",
    icon: "📚",
  },
];

export default function AcademyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <h1 className="text-4xl font-bold text-center text-red-600 mb-2">
            Academy
          </h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {items.map((item) => (
            <Link key={item.name} href={item.href}>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer p-8 h-full flex flex-col items-center justify-center text-center aspect-square">
                <span className="text-6xl mb-4">{item.icon}</span>
                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">
                  {item.name}
                </h2>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
