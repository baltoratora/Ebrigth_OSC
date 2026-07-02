"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// ─── Types ─────────────────────────────────────────────────────────────────────

type NavItem = {
  href: string;
  label: string;
  icon: string;
  activeBg: string;
  activeText: string;
  dot: string;
  unit?: string;
  exact?: boolean;
};

const EDITION_ITEMS: NavItem[] = [
  {
    href:      "/annual-showcase/editions",
    label:     "Edition Management",
    icon:      "📅",
    activeBg:  "bg-gray-100",
    activeText: "text-gray-700",
    dot:       "bg-gray-600",
  },
];

const DEPT_ITEMS: NavItem[] = [
  { href: "/annual-showcase/oc",           label: "Organizing Committee",  icon: "🏛️", activeBg: "bg-blue-50",   activeText: "text-blue-700",   dot: "bg-blue-600",   unit: "OC"           },
  { href: "/annual-showcase/procurement",  label: "Procurement",           icon: "🛒", activeBg: "bg-green-50",  activeText: "text-green-700",  dot: "bg-green-600",  unit: "PROCUREMENT"  },
  { href: "/annual-showcase/sponsorship",  label: "Sponsorship & VVIP",    icon: "🤝", activeBg: "bg-yellow-50", activeText: "text-yellow-700", dot: "bg-yellow-500", unit: "SPONSORSHIP"  },
  { href: "/annual-showcase/media",        label: "Media & Publicity",     icon: "📣", activeBg: "bg-pink-50",   activeText: "text-pink-700",   dot: "bg-pink-500",   unit: "MEDIA"        },
  { href: "/annual-showcase/showcase",     label: "Showcase & Production",  icon: "🎤", activeBg: "bg-purple-50", activeText: "text-purple-700", dot: "bg-purple-600", unit: "SHOWCASE"     },
  { href: "/annual-showcase/logistics",   label: "Logistics",              icon: "🚛", activeBg: "bg-cyan-50",   activeText: "text-cyan-700",   dot: "bg-cyan-600",   unit: "LOGISTICS"    },
  { href: "/annual-showcase/youthpreneur",label: "Youthpreneur",           icon: "💡", activeBg: "bg-orange-50", activeText: "text-orange-700", dot: "bg-orange-500", unit: "YOUTHPRENEUR" },
  { href: "/annual-showcase/ceo",          label: "CEO Unit",              icon: "👔", activeBg: "bg-red-50",    activeText: "text-red-700",    dot: "bg-red-600",    unit: "CEO"          },
  { href: "/annual-showcase/registration", label: "Registration",          icon: "📋", activeBg: "bg-indigo-50", activeText: "text-indigo-700", dot: "bg-indigo-600", exact: true            },
  { href: "/annual-showcase/registration/area", label: "Registration Area", icon: "🚪", activeBg: "bg-indigo-50", activeText: "text-indigo-700", dot: "bg-indigo-600"                               },
];

// ─── NavLink ───────────────────────────────────────────────────────────────────

function NavLink({
  item,
  pathname,
  expanded,
}: {
  item: NavItem;
  pathname: string;
  expanded: boolean;
}) {
  const isActive = item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(item.href + "/");

  return (
    <Link
      href={item.href}
      title={!expanded ? item.label : undefined}
      className={`relative flex items-center gap-3 px-2 py-2.5 rounded-lg transition-colors ${
        isActive
          ? `${item.activeBg} ${item.activeText}`
          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
      }`}
    >
      {/* Active left border */}
      {isActive && (
        <span
          className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 ${item.dot} rounded-r-full`}
        />
      )}

      {/* Icon — always visible */}
      <span className="text-xl flex-shrink-0 w-8 flex items-center justify-center leading-none">
        {item.icon}
      </span>

      {/* Label — hidden when collapsed, shown when expanded */}
      <span
        className={`text-sm font-medium whitespace-nowrap overflow-hidden transition-all duration-150 ${
          expanded
            ? "opacity-100 translate-x-0"
            : "opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0"
        }`}
      >
        {item.label}
      </span>
    </Link>
  );
}

// ─── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children, expanded }: { children: string; expanded: boolean }) {
  return (
    <div className="px-3 mb-1 h-5 flex items-end overflow-hidden">
      <p
        className={`text-[10px] font-semibold text-gray-400 uppercase tracking-widest whitespace-nowrap
                    transition-opacity duration-150 ${
                      expanded ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
      >
        {children}
      </p>
    </div>
  );
}

// ─── Sidebar nav body ──────────────────────────────────────────────────────────

function SidebarBody({
  expanded,
  onLinkClick,
}: {
  expanded: boolean;
  onLinkClick?: () => void;
}) {
  const pathname = usePathname();

  // Show departments on any /annual-showcase/* page except the editions index itself
  const showDepartments =
    pathname !== "/annual-showcase/editions" &&
    pathname !== "/annual-showcase";

  const [allowedUnits, setAllowedUnits] = useState<string[] | "ALL">([]);
  const [accessLoaded,  setAccessLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/annual-showcase/my-access")
      .then(r => (r.ok ? r.json() : { units: "ALL" }))
      .then((data: { units: string[] | "ALL" }) => setAllowedUnits(data.units))
      .catch(() => setAllowedUnits("ALL"))
      .finally(() => setAccessLoaded(true));
  }, [pathname]);

  const canAccess = (unit: string) =>
    allowedUnits === "ALL" || allowedUnits.includes(unit);

  const visibleDeptItems = DEPT_ITEMS.filter(item => !item.unit || canAccess(item.unit));
  const noDeptsAssigned  = accessLoaded && allowedUnits !== "ALL" && allowedUnits.length === 0;

  return (
    <>
      <nav className="flex-1 py-3 overflow-y-auto" onClick={onLinkClick}>
        <SectionLabel expanded={expanded}>Editions</SectionLabel>
        <div className="space-y-0.5 px-2 mb-2">
          {EDITION_ITEMS.map(item => (
            <NavLink key={item.href} item={item} pathname={pathname} expanded={expanded} />
          ))}
        </div>

        {showDepartments && (
          <>
            <div className="mx-3 border-t border-gray-100 my-2" />
            <SectionLabel expanded={expanded}>Departments</SectionLabel>
            {noDeptsAssigned ? (
              <p className={`px-3 text-xs italic text-gray-400 transition-opacity duration-150 ${
                expanded ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              }`}>
                No departments assigned. Contact your admin.
              </p>
            ) : (
              <div className="space-y-0.5 px-2">
                {visibleDeptItems.map(item => (
                  <NavLink key={item.href} item={item} pathname={pathname} expanded={expanded} />
                ))}
              </div>
            )}
          </>
        )}
      </nav>

      {/* Back to portal */}
      <div className="px-2 py-3 border-t border-gray-100 shrink-0">
        <Link
          href="/home"
          title={!expanded ? "Back to Portal" : undefined}
          className="relative flex items-center gap-3 px-2 py-2 text-gray-500
                     hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
          onClick={onLinkClick}
        >
          <span className="text-lg flex-shrink-0 w-8 flex items-center justify-center">←</span>
          <span
            className={`text-sm whitespace-nowrap transition-all duration-150 ${
              expanded
                ? "opacity-100 translate-x-0"
                : "opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0"
            }`}
          >
            Back to Portal
          </span>
        </Link>
      </div>
    </>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────────

export interface ShowcaseSidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function ShowcaseSidebar({ mobileOpen, onMobileClose }: ShowcaseSidebarProps) {
  return (
    <>
      {/* ── Desktop: 56 px collapsed → 220 px on hover ────────────────────── */}
      <aside
        className="group hidden md:flex flex-col shrink-0
                   w-14 hover:w-56 transition-all duration-200 ease-in-out
                   bg-white border-r border-gray-200 overflow-x-hidden"
      >
        {/* expanded=false → labels use group-hover CSS */}
        <SidebarBody expanded={false} />
      </aside>

      {/* ── Mobile: hidden by default, slides in as fixed overlay ─────────── */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 z-40 md:hidden"
            onClick={onMobileClose}
            aria-hidden="true"
          />

          {/* Drawer */}
          <aside
            className="fixed left-0 top-0 h-full w-56 bg-white border-r border-gray-200
                       flex flex-col z-50 md:hidden shadow-2xl group"
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
              <span className="font-semibold text-gray-800 text-sm">🎪 Annual Showcase</span>
              <button
                onClick={onMobileClose}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none p-1"
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>

            {/* expanded=true → labels always visible */}
            <SidebarBody expanded={true} onLinkClick={onMobileClose} />
          </aside>
        </>
      )}
    </>
  );
}
