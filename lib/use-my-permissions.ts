"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { parseOverrides, isCnsOnlyAccount, cnsOnlyOverrides, type DashboardOverrides } from "./dashboard-access";

// Shared hook for the current user's role + dashboard overrides.
//
// Why the localStorage cache:
//   The Sidebar, DashboardHome and DashboardDetail all need overrides at
//   first paint to decide what to lock. The API fetch costs ~1 round-trip,
//   so without a cache the user sees role-default state for one frame, then
//   the override-aware state — a visible "flash" of wrong UI.
//
//   We cache the last-known good overrides under the user's email and seed
//   useState() from it. Subsequent navigations paint correctly on frame 1.
//   The background fetch still runs every mount so changes pushed from the
//   admin UI are picked up on the next page load.
//
// The cache is scoped by email so logging in as a different account doesn't
// reuse the previous user's overrides.

const CACHE_PREFIX = "me-permissions:";

function readCache(email?: string | null): DashboardOverrides {
  if (typeof window === "undefined" || !email) return {};
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + email);
    return raw ? parseOverrides(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

function writeCache(email: string | null | undefined, overrides: DashboardOverrides) {
  if (typeof window === "undefined" || !email) return;
  try {
    window.localStorage.setItem(CACHE_PREFIX + email, JSON.stringify(overrides));
  } catch {
    /* quota errors, private mode, etc. — don't care */
  }
}

export interface MyPermissions {
  /** Raw role string from the session. May be undefined while session loads. */
  role: unknown;
  /** Per-user overrides on top of role defaults. */
  overrides: DashboardOverrides;
  /**
   * True once the fresh fetch has resolved at least once this mount. Cached
   * state lets the first render be correct; this flag is for callers that
   * want to suppress UI until the *authoritative* fetch arrives.
   */
  ready: boolean;
}

export function useMyPermissions(): MyPermissions {
  const { data: session, status } = useSession();
  const email = session?.user?.email;
  const role = (session?.user as { role?: unknown } | undefined)?.role;

  // SSR returns {}; client first render runs the lazy initializer and reads
  // localStorage. That keeps the server output deterministic (no hydration
  // mismatch) while still making the client's first paint correct.
  const [overrides, setOverrides] = useState<DashboardOverrides>({});
  const [ready,     setReady]     = useState(false);

  // Hydrate from cache on mount / when email changes. Runs before the fetch
  // resolves so the UI is correct from frame ~2.
  useEffect(() => {
    if (status !== "authenticated") return;
    const cached = readCache(email);
    setOverrides(cached);
  }, [status, email]);

  // Authoritative fetch — always runs after mount.
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    fetch("/api/users/me/permissions")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const fresh = parseOverrides(data.overrides);
        setOverrides(fresh);
        writeCache(email, fresh);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true); // unblock UI even on failure
      });
    return () => { cancelled = true; };
  }, [status, email]);

  // CNS-only accounts (external CRM observers): force the homepage + sidebar to
  // show only the CNS module by merging synthetic overrides OVER the fetched
  // ones, so a permissive role default can't widen them. Lead in, ticket out.
  const effectiveOverrides = useMemo(
    () => (isCnsOnlyAccount(email) ? { ...overrides, ...cnsOnlyOverrides() } : overrides),
    [email, overrides],
  );

  return { role, overrides: effectiveOverrides, ready };
}
