"use client";

import { useMemo } from "react";
import { useFAStore } from "@fa/_lib/store";

export function useCurrentUser() {
  const currentUserId = useFAStore(s => s.currentUserId);
  const users = useFAStore(s => s.users);
  return useMemo(() => users.find(u => u.id === currentUserId) ?? null, [users, currentUserId]);
}
