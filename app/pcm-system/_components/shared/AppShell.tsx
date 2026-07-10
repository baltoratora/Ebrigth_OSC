"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useFAStore } from "@pcm/_lib/store";
import { useCurrentUser } from "@pcm/_hooks/useCurrentUser";
import { BRANCHES, isBackOfficeRole } from "@pcm/_types";
import { ThemePicker } from "@pcm/_components/shared/ThemePicker";
import { Modal } from "@pcm/_components/shared/Modal";
import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  ClipboardList,
  ChartBar,
  Building2,
  LogOut,
  Home,
  Users,
  ListOrdered,
  ClipboardCheck,
  Gift,
} from "lucide-react";
import { useEffect, useState } from "react";

interface NavItem {
  /** Plain href for normal links. */
  href?: string;
  /** Custom click handler for action items (e.g. "BM View" opening the
   *  branch picker modal). When set, the entry renders as a <button>
   *  instead of a <Link> and href is ignored for navigation. */
  action?: "openBranchPicker" | "switchToMarketing";
  /** Used for the active-state check on link items. */
  matchPath?: string;
  label: string;
  icon: LucideIcon;
}

const MKT_NAV: NavItem[] = [
  { href: "/pcm-system/academy", label: "Events", icon: CalendarDays },
  { href: "/pcm-system/academy/students", label: "Student List", icon: Users },
  { href: "/pcm-system/shared/invitations", label: "Invitations", icon: ListOrdered },
  { href: "/pcm-system/shared/reports", label: "Reports", icon: ClipboardCheck },
  { href: "/pcm-system/shared/attendance", label: "Attendance", icon: ClipboardList },
  { href: "/pcm-system/shared/inventory", label: "Inventory", icon: Gift },
  { href: "/pcm-system/shared/dashboard", label: "Dashboard", icon: ChartBar },
];

const BM_NAV: NavItem[] = [
  { href: "/pcm-system/bm", label: "Events", icon: CalendarDays },
  { href: "/pcm-system/shared/invitations", label: "Invitations", icon: ListOrdered },
  { href: "/pcm-system/shared/reports", label: "Reports", icon: ClipboardCheck },
  { href: "/pcm-system/shared/attendance", label: "Attendance", icon: ClipboardList },
  { href: "/pcm-system/shared/inventory", label: "Inventory", icon: Gift },
  { href: "/pcm-system/shared/dashboard", label: "Dashboard", icon: ChartBar },
];

// Mirror nav for super admin while they're acting as a branch manager —
// "Academy View" pops them back to the Academy user with one click.
const BM_NAV_FOR_ADMIN: NavItem[] = [
  { href: "/pcm-system/bm", label: "Events", icon: CalendarDays },
  { action: "switchToMarketing", label: "Academy View", icon: Building2 },
  { href: "/pcm-system/shared/invitations", label: "Invitations", icon: ListOrdered },
  { href: "/pcm-system/shared/reports", label: "Reports", icon: ClipboardCheck },
  { href: "/pcm-system/shared/attendance", label: "Attendance", icon: ClipboardList },
  { href: "/pcm-system/shared/inventory", label: "Inventory", icon: Gift },
  { href: "/pcm-system/shared/dashboard", label: "Dashboard", icon: ChartBar },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const currentUser = useCurrentUser();
  const logout = useFAStore(s => s.logout);
  const login = useFAStore(s => s.login);
  const loadStudents = useFAStore(s => s.loadStudents);
  const refreshStudents = useFAStore(s => s.refreshStudents);
  const studentsLoaded = useFAStore(s => s.studentsLoaded);
  const loadEvents = useFAStore(s => s.loadEvents);
  const eventsLoaded = useFAStore(s => s.eventsLoaded);
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);

  // Middleware (withAuth) already blocks unauthenticated visitors from
  // /pcm-system/*, so if we got here we are signed in via NextAuth and just
  // need to wait for SessionSync to map our role onto a FA user. No
  // client-side redirect needed.

  useEffect(() => {
    if (currentUser && !studentsLoaded) loadStudents();
  }, [currentUser, studentsLoaded, loadStudents]);

  useEffect(() => {
    if (currentUser && !eventsLoaded) loadEvents();
  }, [currentUser, eventsLoaded, loadEvents]);

  const loadReports = useFAStore(s => s.loadReports);
  const reportsLoaded = useFAStore(s => s.reportsLoaded);
  useEffect(() => {
    if (currentUser && !reportsLoaded) loadReports();
  }, [currentUser, reportsLoaded, loadReports]);

  // useSession lives up here (above the early-return) so React sees the same
  // hook order on every render — otherwise the first render returns null
  // before useSession is reached, and the next render adds it, which trips
  // React's Rules-of-Hooks check.
  const { data: session } = useSession();
  const authRole = (session?.user as { role?: string } | undefined)?.role;
  const canSwitchView = isBackOfficeRole(authRole);

  // Whenever the FA tab regains focus (e.g. the user finished editing in
  // Heidi and switched back), re-fetch studentrecords so the FA UI always
  // mirrors the database. Both `focus` and `visibilitychange` fire so it
  // works for alt-tabbing AND switching browser tabs.
  useEffect(() => {
    if (!currentUser) return;
    function refreshIfVisible() {
      if (document.visibilityState === "visible") refreshStudents();
    }
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [currentUser, refreshStudents]);

  if (!currentUser) return null;

  // Sidebar nav is driven by the *FA store* user role, not the NextAuth
  // role, so MARKETING-role NextAuth users (who SessionSync maps to u-mkt)
  // correctly see the full Academy nav. The BM_NAV_FOR_ADMIN variant
  // (with the switch-back "Academy View" link) is only used when a
  // super admin is impersonating a branch.
  let nav: NavItem[];
  if (currentUser.role === "MKT") {
    nav = MKT_NAV;
  } else if (canSwitchView) {
    nav = BM_NAV_FOR_ADMIN;
  } else {
    nav = BM_NAV;
  }

  const branchName = currentUser.branch
    ? BRANCHES.find(b => b.code === currentUser.branch)?.name
    : null;
  const roleLabel =
    currentUser.role === "MKT"
      ? "Academy"
      : canSwitchView
        ? `Branch · ${branchName ?? currentUser.branch ?? ""}`
        : (branchName ?? currentUser.branch ?? "");

  return (
    <div className="h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-ivory-50 border-r border-gold-200 flex flex-col">

        {/* Brand masthead */}
        <div className="px-6 pt-7 pb-5">
          {/* Role kicker */}
          <div className="fa-mono text-[10px] uppercase text-gold-600 mb-3" style={{ letterSpacing: "0.12em" }}>
            {roleLabel}
          </div>

          {/* Wordmark */}
          <div className="fa-display-italic text-2xl text-ink-900 leading-none mb-4">
            Ebright
          </div>

          {/* Gold hairline */}
          <hr className="fa-rule-gold mb-3 border-0 border-t border-gold-300" />

          {/* System label */}
          <div className="fa-mono text-[11px] uppercase text-ink-500" style={{ letterSpacing: "0.1em" }}>
            PCM System
          </div>
        </div>

        {/* Nav */}
        <nav className="px-3 flex-1 pb-2">
          {nav.map((item, idx) => {
            const Icon = item.icon;
            // Action items render as buttons (open modal / switch instantly).
            if (item.action) {
              const onClick = () => {
                if (item.action === "openBranchPicker") {
                  setBranchPickerOpen(true);
                } else if (item.action === "switchToMarketing") {
                  login("u-mkt");
                  router.push("/pcm-system/academy");
                }
              };
              return (
                <button
                  key={`action-${idx}`}
                  type="button"
                  onClick={onClick}
                  className="w-full text-left relative flex items-center gap-3 px-3 py-[9px] rounded-[10px] text-sm font-medium mb-0.5 transition-colors duration-200 border-l-2 border-l-transparent text-ink-600 hover:bg-ivory-100 hover:text-ink-900"
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1">{item.label}</span>
                </button>
              );
            }

            // Link item — guard on item.href being defined.
            const href = item.href;
            if (!href) return null;
            // Longest matching href wins so /marketing/inventory only highlights
            // "Inventory", not the broader "/pcm-system/academy" Events entry.
            const matchesItem = pathname === href || pathname.startsWith(href + "/");
            const moreSpecific = nav.some(o => {
              if (o === item || !o.href) return false;
              return (
                o.href.length > href.length &&
                (pathname === o.href || pathname.startsWith(o.href + "/"))
              );
            });
            const active = matchesItem && !moreSpecific;
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex items-center gap-3 px-3 py-[9px] rounded-[10px] text-sm font-medium mb-0.5 transition-colors duration-200 border-l-2 ${
                  active
                    ? "bg-ivory-100 text-ink-900 border-l-gold-400"
                    : "text-ink-600 hover:bg-ivory-100 hover:text-ink-900 border-l-transparent"
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="p-4 border-t border-gold-200">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full border border-gold-200 bg-ivory-50 text-ink-800 flex items-center justify-center text-sm font-semibold flex-shrink-0">
              {currentUser.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-ink-900 truncate">{currentUser.name}</div>
            </div>
            <ThemePicker />
            {/* The "exit" icon is repurposed as the view switcher — clicking
                it opens the FA picker page so back-office roles (admin +
                marketing) can switch between Academy and Branch views.
                Hidden for real branch managers — they're locked to their
                own branch by SessionSync, so the button would just no-op
                for them. Sign-out lives in the top bar. */}
            {canSwitchView && (
              <button
                onClick={() => router.push("/pcm-system/login")}
                className="p-1.5 text-ink-400 hover:text-gold-500 hover:bg-ivory-100 rounded-md flex-shrink-0 transition-colors duration-200"
                title="Switch view"
                aria-label="Switch view"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {/* Top bar — eBright Dashboard pill + Sign out. The dashboard link
            keeps the NextAuth session alive; sign-out fully clears it. */}
        <div className="sticky top-0 z-30 backdrop-blur bg-ivory-50/70 border-b border-gold-200/60">
          <div className="max-w-7xl mx-auto px-8 py-2.5 flex items-center justify-end gap-2">
            <Link
              href="/home"
              className="group inline-flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full bg-white border border-gold-300 text-ink-700 hover:text-ink-900 hover:border-gold-500 hover:shadow-sm transition-all"
              title="Leave PCM System and return to the main eBright dashboard"
            >
              <span className="w-6 h-6 rounded-full bg-gold-100 group-hover:bg-gold-200 flex items-center justify-center transition-colors">
                <Home className="w-3.5 h-3.5 text-gold-700" />
              </span>
              <span className="fa-mono text-[11px] uppercase tracking-wider">
                eBright Dashboard
              </span>
            </Link>
            <button
              type="button"
              onClick={() => { logout(); signOut({ callbackUrl: "/login" }); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-ink-200 text-ink-500 hover:text-danger hover:border-danger/40 hover:shadow-sm transition-all fa-mono text-[11px] uppercase tracking-wider"
              title="Sign out of eBright"
            >
              <LogOut className="w-3 h-3" />
              Sign out
            </button>
          </div>
        </div>
        <div className="max-w-7xl mx-auto p-8">
          {children}
        </div>
      </main>

      {/* Branch picker — opened from the "BM View" sidebar action. Picking a
          branch logs the FA store in as that branch's BM user and navigates
          to the branch side. SessionSync leaves this manual pick alone for
          admins. */}
      <Modal
        open={branchPickerOpen}
        onClose={() => setBranchPickerOpen(false)}
        kicker="Branch Managers"
        title="Pick a branch to view"
        size="md"
      >
        <div className="grid grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto pr-1">
          {BRANCHES.map(b => (
            <button
              key={b.code}
              type="button"
              onClick={() => {
                login(`u-bm-${b.code.toLowerCase()}`);
                setBranchPickerOpen(false);
                router.push("/pcm-system/bm");
              }}
              className="w-full text-left px-4 py-3 rounded-[10px] border border-gold-200 bg-ivory-50 hover:border-gold-400 hover:bg-ivory-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full border border-gold-200 bg-ivory-50 text-ink-800 flex items-center justify-center font-semibold text-sm flex-shrink-0">
                  {b.code.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink-900 truncate">{b.name}</div>
                  <div className="fa-mono text-[10px] uppercase text-ink-400">{b.code}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
