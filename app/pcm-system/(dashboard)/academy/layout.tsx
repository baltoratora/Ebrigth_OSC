"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCurrentUser } from "@pcm/_hooks/useCurrentUser";

/** Route-group guard: any visitor under /pcm-system/academy/* must be MKT.
 *  BMs are bounced to their own home; signed-out users to login. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser();
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    // Don't bounce to /login while the session is still hydrating on refresh
    // (SessionSync populates the PCM store right after). Only redirect when the
    // session is definitively unauthenticated.
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.replace("/login");
    } else if (user && user.role !== "MKT") {
      router.replace("/pcm-system/bm");
    }
  }, [user, status, router]);

  if (!user || user.role !== "MKT") return null;
  return <>{children}</>;
}
