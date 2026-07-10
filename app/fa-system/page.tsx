"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@fa/_hooks/useCurrentUser";

export default function HomePage() {
  const router = useRouter();
  const user = useCurrentUser();

  useEffect(() => {
    if (!user) {
      router.replace("/login");
    } else if (user.role === "MKT") {
      router.replace("/fa-system/marketing");
    } else {
      router.replace("/fa-system/bm");
    }
  }, [user, router]);

  return (
    <div className="min-h-screen flex items-center justify-center text-ink-400">
      Loading…
    </div>
  );
}
