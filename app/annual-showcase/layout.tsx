"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import UserHeader from "@/app/components/UserHeader";
import ShowcaseSidebar from "@/app/components/annual-showcase/ShowcaseSidebar";
import { EditionProvider } from "@/app/components/annual-showcase/EditionContext";
import { useActiveEdition } from "@/app/hooks/useActiveEdition";
import CreateEditionModal from "@/app/components/annual-showcase/CreateEditionModal";
import type { EditionSummary } from "@/app/components/annual-showcase/EditionContext";

// ─── Status badge (white on orange) ──────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="border border-white/60 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ─── Edition switcher dropdown item badge ─────────────────────────────────────

const SWITCHER_STATUS_STYLE: Record<string, string> = {
  DRAFT:             "bg-gray-100 text-gray-600",
  REGISTRATION_OPEN: "bg-green-100 text-green-700",
  TEST_RUN:          "bg-blue-100 text-blue-700",
  EVENT_ACTIVE:      "bg-red-100 text-red-700",
  POST_EVENT:        "bg-purple-100 text-purple-700",
  ARCHIVED:          "bg-gray-100 text-gray-400",
};

function SwitcherBadge({ status }: { status: string }) {
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${SWITCHER_STATUS_STYLE[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ─── Inner layout ─────────────────────────────────────────────────────────────

function LayoutInner({
  userName,
  userEmail,
  children,
}: {
  userName: string;
  userEmail: string;
  children: React.ReactNode;
}) {
  const { edition, allEditions, isLoading, setActiveEdition, refresh } = useActiveEdition();

  const [dropdownOpen,    setDropdownOpen   ] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [mobileOpen,      setMobileOpen     ] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  async function handleSetActive(id: string) {
    setDropdownOpen(false);
    try {
      await setActiveEdition(id);
      toast.success("Active edition updated");
    } catch {
      toast.error("Failed to switch edition");
    }
  }

  async function handleCreated(newEd: EditionSummary) {
    setCreateModalOpen(false);
    try {
      await setActiveEdition(newEd.id);
      toast.success(`"${newEd.name}" is now the active edition`);
    } catch {
      await refresh();
    }
  }

  const participantCount  = edition?._count?.participants ?? 0;
  const participantTarget = edition?.participantTarget ?? 0;
  const pct = participantTarget > 0
    ? Math.min(100, Math.round((participantCount / participantTarget) * 100))
    : 0;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ── Single unified orange header ─────────────────────────────────────── */}
      <header className="w-full bg-orange-500 h-16 flex items-center justify-between
                         px-4 gap-3 sticky top-0 z-50 shadow-md shrink-0">

        {/* LEFT: hamburger + title + edition info */}
        <div className="flex items-center gap-3 min-w-0">

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-1.5 rounded-lg text-white/80 hover:bg-white/20
                       transition-colors shrink-0"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>

          {/* Title */}
          <span className="text-white font-bold text-lg shrink-0">
            🎪 Annual Showcase
          </span>

          {/* Edition details — only when loaded */}
          {!isLoading && edition && (
            <>
              <div className="w-px h-6 bg-white opacity-40 shrink-0 hidden sm:block" />
              <span className="text-white font-medium text-sm truncate hidden sm:block max-w-[160px]">
                {edition.name}
              </span>
              <StatusBadge status={edition.status} />
              <span className="text-white/70 text-sm truncate hidden lg:block max-w-[160px]">
                {edition.theme}
              </span>
            </>
          )}
        </div>

        {/* RIGHT: progress + switcher + user */}
        <div className="flex items-center gap-3 shrink-0">

          {/* Participant progress */}
          {!isLoading && edition && (
            <>
              <span className="text-white text-sm whitespace-nowrap hidden md:block">
                {participantCount.toLocaleString()} / {participantTarget.toLocaleString()}
                <span className="opacity-70"> · {pct}% of target</span>
              </span>
              <div className="w-px h-6 bg-white opacity-40 hidden md:block" />
            </>
          )}

          {/* Edition switcher */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(o => !o)}
              className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white
                         border border-white/30 rounded-lg px-3 py-1.5 text-xs font-medium
                         transition-colors max-w-[160px]"
            >
              <span className="truncate">
                {isLoading ? "Loading…" : (edition?.name ?? "No edition")}
              </span>
              <span className="opacity-60 shrink-0 text-[10px]">▾</span>
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl
                              border border-gray-200 z-50 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Switch Edition
                  </p>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {allEditions.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">No editions yet</p>
                  ) : (
                    allEditions.map(ed => (
                      <div
                        key={ed.id}
                        className="flex items-center gap-2 px-4 py-3 hover:bg-gray-50
                                   border-b border-gray-50 last:border-0"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{ed.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <SwitcherBadge status={ed.status} />
                            {ed.startDate && (
                              <span className="text-[10px] text-gray-400">
                                {new Date(ed.startDate).getFullYear()}
                              </span>
                            )}
                          </div>
                        </div>
                        {ed.isActive ? (
                          <span className="text-xs text-green-600 font-semibold bg-green-50 px-2 py-0.5 rounded shrink-0">
                            Active
                          </span>
                        ) : (
                          <button
                            onClick={() => handleSetActive(ed.id)}
                            className="text-xs text-blue-600 font-medium hover:bg-blue-50 px-2 py-0.5 rounded transition-colors shrink-0"
                          >
                            Set Active
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
                <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                  <button
                    onClick={() => { setDropdownOpen(false); setCreateModalOpen(true); }}
                    className="text-sm text-orange-600 hover:text-orange-800 font-medium"
                  >
                    + New Edition
                  </button>
                  <Link
                    href="/annual-showcase/editions"
                    onClick={() => setDropdownOpen(false)}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Manage all →
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* User avatar */}
          <UserHeader userName={userName} userEmail={userEmail} />
        </div>
      </header>

      {/* ── Body: sidebar + content, flush below header ──────────────────────── */}
      <div className="flex flex-1 min-h-0">
        <ShowcaseSidebar
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />
        <main className="flex-1 overflow-y-auto bg-gray-50 min-w-0">
          {children}
        </main>
      </div>

      <CreateEditionModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}

// ─── Root layout ──────────────────────────────────────────────────────────────

export default function AnnualShowcaseLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      redirect("/login");
    },
  });

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-orange-600 font-medium text-sm">Loading...</p>
      </div>
    );
  }

  const userName  = (session?.user as { name?: string } | undefined)?.name ?? session?.user?.email ?? "";
  const userEmail = session?.user?.email ?? "";

  return (
    <EditionProvider>
      <LayoutInner userName={userName} userEmail={userEmail}>
        {children}
      </LayoutInner>
    </EditionProvider>
  );
}
