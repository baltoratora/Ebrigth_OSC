"use client";

import { useState, useMemo, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useFAStore } from "@fa/_lib/store";
import { useRouter } from "next/navigation";
import { Modal } from "@fa/_components/shared/Modal";

/** The FA "view switcher" page. Renders the Marketing / Branch Managers
 *  picker. Real BRANCH_MANAGER users can't actually impersonate Marketing
 *  because SessionSync (see SessionSync.tsx) force-overrides their FA user
 *  on the next render. So we don't need to gate the picker UI — we just
 *  need to bounce unauthenticated visitors to the NextAuth sign-in. */
export default function FAViewSwitcher() {
  const users = useFAStore(s => s.users);
  const login = useFAStore(s => s.login);
  const router = useRouter();
  const { data: session, status } = useSession();
  const [bmModalOpen, setBmModalOpen] = useState(false);

  const authRole = (session?.user as { role?: string } | undefined)?.role;

  useEffect(() => {
    if (status === "loading") return;
    if (status !== "authenticated") router.replace("/login");
  }, [status, router]);

  function handleLogin(userId: string, role: "MKT" | "BM") {
    login(userId);
    router.push(role === "MKT" ? "/fa-system/marketing" : "/fa-system/bm");
  }

  const mktUsers = useMemo(() => users.filter(u => u.role === "MKT"), [users]);
  const bmUsers  = useMemo(() => users.filter(u => u.role === "BM"),  [users]);

  // Brief loader while NextAuth resolves the session, then render the picker.
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink-400 fa-mono text-xs uppercase">
        Loading…
      </div>
    );
  }
  if (status !== "authenticated") return null;

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">

        {/* ── Brand masthead ── */}
        <div className="text-center mb-10 fa-enter">
          <div
            className="fa-mono text-[10px] uppercase text-gold-600 mb-3"
            style={{ letterSpacing: "0.12em" }}
          >
            FA System
          </div>
          <h1 className="fa-display-italic text-7xl text-ink-900 leading-none">Ebright</h1>
          <hr className="border-0 border-t border-gold-200 mt-5 mb-4" />
          <div
            className="fa-mono text-[10px] uppercase text-gold-600"
            style={{ letterSpacing: "0.1em" }}
          >
            Switch view — pick the side to enter
          </div>
        </div>

        {/* ── User picker ── */}
        <div className="grid md:grid-cols-2 gap-5 fa-enter fa-delay-1">

          {/* Marketing */}
          <div className="fa-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-px h-5 bg-gold-400 flex-shrink-0" />
              <h2 className="fa-display text-lg text-ink-900">Marketing</h2>
              <span className="fa-mono text-[10px] text-ink-400 ml-auto">
                {mktUsers.length} user
              </span>
            </div>
            <div className="space-y-2">
              {mktUsers.map(u => (
                <button
                  key={u.id}
                  onClick={() => handleLogin(u.id, "MKT")}
                  className="w-full text-left px-4 py-3 rounded-[10px] border border-ink-200 hover:border-gold-400 hover:bg-ivory-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full border border-gold-200 bg-ivory-50 text-ink-800 flex items-center justify-center font-semibold text-sm flex-shrink-0">
                      {u.name.charAt(0)}
                    </div>
                    <div className="text-sm font-medium text-ink-900">{u.name}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Branch Managers */}
          <div className="fa-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-px h-5 bg-gold-400 flex-shrink-0" />
              <h2 className="fa-display text-lg text-ink-900">Branch Managers</h2>
              <span className="fa-mono text-[10px] text-ink-400 ml-auto">
                {bmUsers.length} users
              </span>
            </div>
            <button
              onClick={() => setBmModalOpen(true)}
              className="w-full text-left px-4 py-3 rounded-[10px] border border-ink-200 hover:border-gold-400 hover:bg-ivory-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full border border-gold-200 bg-ivory-50 text-ink-800 flex items-center justify-center font-semibold text-sm flex-shrink-0">
                  B
                </div>
                <div>
                  <div className="text-sm font-medium text-ink-900">Branch Manager</div>
                  <div className="fa-mono text-[11px] text-ink-400 mt-0.5">Choose your branch →</div>
                </div>
              </div>
            </button>
          </div>
        </div>

        <p className="text-center fa-mono text-[11px] text-ink-400 mt-8 fa-enter fa-delay-2">
          Signed in as {session?.user?.email ?? authRole}. You can switch views any time.
        </p>
      </div>

      {/* ── Branch picker modal ── */}
      <Modal
        open={bmModalOpen}
        onClose={() => setBmModalOpen(false)}
        kicker="Branch Managers"
        title="Select a branch"
        size="md"
      >
        <div className="grid grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto pr-1">
          {bmUsers.map(u => (
            <button
              key={u.id}
              onClick={() => handleLogin(u.id, "BM")}
              className="w-full text-left px-4 py-3 rounded-[10px] border border-gold-200 bg-ivory-50 hover:border-gold-400 hover:bg-ivory-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full border border-gold-200 bg-ivory-50 text-ink-800 flex items-center justify-center font-semibold text-sm flex-shrink-0">
                  {u.name.charAt(0)}
                </div>
                <div className="text-sm font-medium text-ink-900 truncate">{u.name}</div>
              </div>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
