"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { canSeeKey } from "@/lib/dashboard-access";
import { useMyPermissions } from "@/lib/use-my-permissions";

interface SidebarProps {
  sidebarOpen: boolean;
  onToggle?: () => void;
  onCollapse?: () => void;
}

// `key` ties each entry to lib/dashboard-access.ts so canAccess() decides
// visibility. Entries unmatched by any role allowlist render as locked tiles.
const navigationItems = [
  { key: "home",               name: "Home",                href: "/home",                          icon: "🏠" },
  { key: "library",            name: "Library",             href: "/dashboards/library",            icon: "📚" },
  { key: "internal-dashboard", name: "Internal Dashboard",  href: "/dashboards/internal-dashboard", icon: "📊" },
  { key: "hrms",               name: "HRMS",                href: "/dashboards/hrms",               icon: "👥" },
  { key: "crm",                name: "CNS",                 href: "/dashboards/crm",                icon: "🤝" },
  { key: "sms",                name: "SMS",                 href: "/dashboards/sms",                icon: "💬" },
  { key: "inventory",          name: "Inventory",           href: "/dashboards/inventory",          icon: "📦" },
  { key: "academy",            name: "Academy",             href: "/academy",                       icon: "🎓" },
  { key: "hrms.attendance",    name: "Attendance",          href: "/attendance",                    icon: "📅" },
  { key: "hrms.account",       name: "Account Management",  href: "/account-management",            icon: "🔐" },
  { key: "annual-showcase",   name: "Annual Showcase",     href: "/annual-showcase",               icon: "🎪" },
];

export default function Sidebar({ sidebarOpen, onToggle, onCollapse }: SidebarProps) {
  const handleToggle = onToggle ?? onCollapse ?? (() => {});
  const { role, overrides } = useMyPermissions();

  // Same gate as DashboardHome: hide the Annual Showcase link entirely unless
  // the user has at least one assigned unit. Defaults to hidden (fail closed).
  const [showcaseVisible, setShowcaseVisible] = useState(false);

  useEffect(() => {
    fetch("/api/annual-showcase/my-access")
      .then(r => (r.ok ? r.json() : { units: [] }))
      .then((data: { units: string[] | "ALL" }) => {
        setShowcaseVisible(data.units === "ALL" || (Array.isArray(data.units) && data.units.length > 0));
      })
      .catch(() => {});
  }, []);

  const visibleNavigationItems = navigationItems.filter(
    (item) => item.key !== "annual-showcase" || showcaseVisible,
  );

  const handleNavClick = () => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      handleToggle();
    }
  };

  return (
    <>
      {/* Fixed hamburger — always visible at top-left */}
      <button
        onClick={handleToggle}
        className="fixed top-3 left-3 z-9999 p-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl shadow-md transition-all flex items-center justify-center"
        title={sidebarOpen ? "Close Sidebar" : "Open Sidebar"}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Mobile-only backdrop when drawer open */}
      {sidebarOpen && (
        <div
          onClick={handleToggle}
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          aria-hidden="true"
        />
      )}

      {/* Sidebar:
          - Mobile: fixed slide-in drawer over content (with backdrop)
          - Desktop: inline column that pushes content via width animation
      */}
      <aside
        className={`bg-white shadow-lg flex flex-col overflow-hidden transition-all duration-300
          fixed inset-y-0 left-0 z-50 w-64
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          md:static md:z-auto md:translate-x-0 md:shrink-0 md:h-auto
          ${sidebarOpen ? "md:w-64" : "md:w-0"}
        `}
      >
        <nav className="p-6 pt-16 space-y-2 flex-1 overflow-y-auto">
          {visibleNavigationItems.map((item) => {
            const locked = !canSeeKey(role, item.key, overrides);
            if (locked) {
              return (
                <div
                  key={item.name}
                  aria-disabled="true"
                  title="Locked — not available for your role yet"
                  className="w-full text-left flex items-center gap-2 px-4 py-3 rounded-lg font-medium text-gray-400 bg-gray-50 whitespace-nowrap cursor-not-allowed opacity-60 select-none"
                >
                  <span className="grayscale">{item.icon}</span>
                  <span className="flex-1">{item.name}</span>
                  <span aria-hidden className="text-xs">🔒</span>
                </div>
              );
            }
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={handleNavClick}
                className="w-full text-left flex items-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors text-gray-700 hover:bg-gray-100 whitespace-nowrap"
              >
                <span>{item.icon}</span>
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

      </aside>
    </>
  );
}
