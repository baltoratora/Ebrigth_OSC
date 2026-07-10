"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface MyAccessResponse {
  units: string[] | "ALL";
}

/**
 * Client-side gate for a department page. Redirects to the editions index
 * if the current user isn't assigned to `unit` (and isn't ADMIN/SUPER_ADMIN,
 * which the /my-access endpoint reports as "ALL").
 *
 * This mirrors lib/dashboard-access.ts's model: UI-level gating only, so
 * staff don't see links/pages they can't use. It does not replace
 * server-side authorization on the API routes themselves.
 */
export function useDepartmentAccess(unit: string) {
  const router = useRouter();
  // Optimistic default avoids a flash of "redirecting" UI before the check
  // resolves, and fails open on network errors rather than locking everyone out.
  const [allowed, setAllowed] = useState(true);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/annual-showcase/my-access")
      .then(r => (r.ok ? r.json() : { units: "ALL" }))
      .then((data: MyAccessResponse) => {
        if (cancelled) return;
        const ok = data.units === "ALL" || (Array.isArray(data.units) && data.units.includes(unit));
        setAllowed(ok);
        setChecked(true);
        if (!ok) router.replace("/annual-showcase/editions");
      })
      .catch(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [unit, router]);

  return { allowed, checked };
}
