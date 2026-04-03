"use client";

import Link from "next/link";

interface SidebarProps {
  sidebarOpen: boolean;
  onToggle: () => void;
  onCollapse?: () => void; // kept for backward compat
}

const navigationItems = [
  { name: "Home", href: "/home", icon: "🏠" },
  { name: "Library", href: "/dashboards/library", icon: "📚" },
  { name: "Internal Dashboard", href: "/dashboards/internal-dashboard", icon: "📊" },
  { name: "HRMS", href: "/dashboards/hrms", icon: "👥" },
  { name: "CRM", href: "/dashboards/crm", icon: "📰" },
  { name: "SMS", href: "/dashboards/sms", icon: "💬" },
  { name: "Inventory", href: "/dashboards/inventory", icon: "📦" },
  { name: "Academy", href: "/academy", icon: "🎓" },
  { name: "Attendance", href: "/attendance", icon: "📅" },
];

export default function Sidebar({ sidebarOpen, onToggle, onCollapse }: SidebarProps) {
  const handleToggle = onToggle ?? onCollapse ?? (() => {});

  return (
    <>
      {/* Fixed hamburger — always visible at top-left */}
      <button
        onClick={handleToggle}
        className="fixed top-4 left-4 z-[9999] p-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl shadow-md transition-all flex items-center justify-center"
        title={sidebarOpen ? "Close Sidebar" : "Open Sidebar"}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Sidebar panel */}
      <aside
        className={`bg-white shadow-lg overflow-hidden transition-all duration-300 flex flex-col shrink-0 ${
          sidebarOpen ? "w-64" : "w-0"
        }`}
      >
        <nav className="p-6 pt-16 space-y-2 flex-1 overflow-y-auto">
          {navigationItems.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="w-full text-left flex items-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors text-gray-700 hover:bg-gray-100 whitespace-nowrap"
            >
              <span>{item.icon}</span>
              <span>{item.name}</span>
            </Link>
          ))}
        </nav>

      </aside>
    </>
  );
}
