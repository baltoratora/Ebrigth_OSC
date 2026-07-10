"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@pcm/_hooks/useCurrentUser";

export default function HomePage() {
  const router = useRouter();
  const user = useCurrentUser();

  useEffect(() => {
    if (!user) {
      router.replace("/login");
    } else if (user.role === "MKT") {
      router.replace("/pcm-system/academy");
    } else {
      router.replace("/pcm-system/bm");
    }
  }, [user, router]);

  return (
    <div className="min-h-screen flex items-center justify-center text-ink-400">
      Loading…
    </div>
  );
}
