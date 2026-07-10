"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCurrentUser } from "@fa/_hooks/useCurrentUser";

/** Route-group guard: any visitor under /fa-system/marketing/* must be MKT.
 *  BMs are bounced to their own home; signed-out users to login. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser();
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    // On refresh the next-auth session hydrates async and SessionSync then
    // populates the FA store. Don't bounce to /login during that window —
    // only redirect when the session is definitively unauthenticated.
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.replace("/login");
    } else if (user && user.role !== "MKT") {
      router.replace("/fa-system/bm");
    }
  }, [user, status, router]);

  if (!user || user.role !== "MKT") return null;
  return <>{children}</>;
}
