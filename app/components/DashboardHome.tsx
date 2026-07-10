"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { canSeeKey } from "@/lib/dashboard-access";
import { useMyPermissions } from "@/lib/use-my-permissions";

interface DashboardCard {
  id: string;
  title: string;
  icon: string;
  color: string;
  items: {
    name: string;
    href: string;
    icon: string;
  }[];
}

const dashboards: DashboardCard[] = [
  {
    id: "library",
    title: "Library",
    icon: "📚",
    color: "bg-purple-500",
    items: [
      { name: "Documents", href: "#", icon: "📄" },
      { name: "Resources", href: "#", icon: "📁" },
    ],
  },
  {
    id: "internal-dashboard",
    title: "Internal Dashboard",
    icon: "📊",
    color: "bg-green-500",
    items: [
      { name: "Analytics", href: "#", icon: "📈" },
      { name: "Reports", href: "#", icon: "📋" },
    ],
  },
  {
    id: "hrms",
    title: "HRMS",
    icon: "👥",
    color: "bg-blue-500",
    items: [
      { name: "Employee Dashboard", href: "/dashboard-employee-management", icon: "📊" },
      { name: "Manpower Planning", href: "/manpower-schedule", icon: "🗂️" },
      { name: "Attendance", href: "/attendance", icon: "📅" },
      { name: "Claims", href: "/claim", icon: "💰" },
      { name: "Manpower Cost Report", href: "/manpower-cost-report", icon: "💸" },
    ],
  },
  {
    id: "crm",
    title: "CNS",
    icon: "🤝",
    color: "bg-yellow-500",
    items: [
      { name: "Content Manager", href: "#", icon: "✏️" },
      { name: "Media", href: "#", icon: "🖼️" },
    ],
  },
  {
    id: "sms",
    title: "SMS",
    icon: "💬",
    color: "bg-indigo-500",
    items: [
      { name: "Messages", href: "#", icon: "💌" },
      { name: "Templates", href: "#", icon: "📧" },
    ],
  },
  {
    id: "inventory",
    title: "Inventory",
    icon: "📦",
    color: "bg-pink-500",
    items: [
      { name: "Stock Management", href: "#", icon: "📊" },
      { name: "Warehouse", href: "#", icon: "🏭" },
    ],
  },
  {
    id: "academy",
    title: "Academy",
    icon: "🎓",
    color: "bg-indigo-600",
    items: [
      { name: "Event Management", href: "/academy", icon: "📅" },
      { name: "Courses", href: "#", icon: "📖" },
    ],
  },
  {
    // FA System lives as its own top-level tile (was previously buried as
    // a sub-item under HRMS in DashboardDetail). The inner /fa-system
    // route handles its own role-based nav, so we don't list children.
    id: "fa-system",
    title: "FA System",
    icon: "🎗️",
    color: "bg-rose-500",
    items: [],
  },
  {
    // PCM System — academy-owned assessment, mirrors FA's structure but
    // with its own pcm_* DB tables and pcm_progress_json on studentrecords.
    // Inner /pcm-system route handles its own role-based nav.
    id: "pcm-system",
    title: "PCM System",
    icon: "🎯",
    color: "bg-amber-500",
    items: [],
  },
  {
    id: "annual-showcase",
    title: "Annual Showcase",
    icon: "🎪",
    color: "bg-orange-500",
    items: [
      { name: "Organizing Committee", href: "/annual-showcase/oc",           icon: "🏛️" },
      { name: "Procurement",          href: "/annual-showcase/procurement",   icon: "🛒" },
      { name: "Sponsorship & VVIP",   href: "/annual-showcase/sponsorship",   icon: "🤝" },
      { name: "Media & Publicity",    href: "/annual-showcase/media",         icon: "📣" },
      { name: "Showcase & Production",href: "/annual-showcase/showcase",      icon: "🎤" },
      { name: "Logistics",            href: "/annual-showcase/logistics",     icon: "🚛" },
      { name: "Youthpreneur",         href: "/annual-showcase/youthpreneur",  icon: "💡" },
      { name: "CEO Unit",             href: "/annual-showcase/ceo",           icon: "👔" },
    ],
  },
];

export default function DashboardHome({ userRole }: { userRole?: string; userEmail?: string }) {
  // Prefer session role from the hook (live) over the prop (server-rendered).
  // Falls back to the prop for SSR / non-hook callers.
  const { role: sessionRole, overrides } = useMyPermissions();
  const effectiveRole = (sessionRole as string | undefined) ?? userRole;

  // Annual Showcase card is hidden entirely unless the user has at least one
  // assigned unit (or is ADMIN/SUPER_ADMIN, which /my-access reports as "ALL").
  // Defaults to hidden until the fetch resolves — fail closed, not open.
  const [showcaseVisible, setShowcaseVisible] = useState(false);

  useEffect(() => {
    fetch("/api/annual-showcase/my-access")
      .then(r => (r.ok ? r.json() : { units: [] }))
      .then((data: { units: string[] | "ALL" }) => {
        setShowcaseVisible(data.units === "ALL" || (Array.isArray(data.units) && data.units.length > 0));
      })
      .catch(() => {});
  }, []);

  const visibleDashboards = dashboards.filter((d) => d.id !== "annual-showcase" || showcaseVisible);

  const accessibleCount = visibleDashboards.filter((d) => canSeeKey(effectiveRole, d.id, overrides)).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:py-8">
          <h1 className="text-2xl sm:text-4xl font-bold text-center text-red-600 mb-1 sm:mb-2">Welcome</h1>
          <p className="text-center text-sm sm:text-base text-gray-600">{accessibleCount} accessible dashboard{accessibleCount !== 1 ? "s" : ""}</p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 sm:py-12">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6">
          {visibleDashboards.map((dashboard) => {
            const isDisabled = !canSeeKey(effectiveRole, dashboard.id, overrides);

const targetHref =
  dashboard.id === "academy" ? "/academy" :
  dashboard.id === "inventory" ? "/api/launch-inventory" :
  dashboard.id === "fa-system" ? "/fa-system" :
  dashboard.id === "pcm-system" ? "/pcm-system" :
  dashboard.id === "annual-showcase" ? "/annual-showcase/editions" :
  `/dashboards/${dashboard.id}`;

const href = isDisabled ? "#" : targetHref;

            return (
              <Link key={dashboard.id} href={href} aria-disabled={isDisabled} className={isDisabled ? "pointer-events-none" : ""}>
                <div className={`p-2 sm:p-3 rounded-lg flex items-center justify-center gap-3 aspect-square transition-all duration-300
                  ${isDisabled ? "bg-slate-300 text-slate-500 opacity-60 grayscale" : `${dashboard.color} text-white hover:shadow-lg hover:scale-105`}
                `}>
                  <div className="text-center">
                    <span className="text-2xl sm:text-3xl block mb-1">{dashboard.icon}</span>
                    <h2 className="text-xs sm:text-sm font-bold leading-tight">{dashboard.title}</h2>
                    {isDisabled && (
                      <span className="text-[9px] sm:text-[10px] uppercase font-black tracking-widest mt-2 block bg-slate-400/20 px-2 py-1 rounded">Locked</span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
