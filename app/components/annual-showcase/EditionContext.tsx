"use client";

import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from "react";

export interface EditionSummary {
  id: string;
  name: string;
  theme: string;
  status: string;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  venueName: string | null;
  venueAddress: string | null;
  participantTarget: number;
  profitabilityTarget: number;
  registrationDeadline: string | null;
  testRunDate: string | null;
  currency: string;
  departmentLeads: Record<string, string> | null;
  goodieBagChecklist:     unknown;
  logisticsData:          unknown;
  sponsorPackages:        unknown;
  photographerGuidelines: unknown;
  pressCoverage:          unknown;
  photoDistribution:      unknown;
  scoringCriteria:        unknown;
  stageChecklist:         unknown;
  youthpreneurLayout:     unknown;
  waitlistEnabled:        boolean;
  waitlistCount:          number;
  createdAt: string;
  _count?: { participants: number; tasks: number };
}

interface EditionContextValue {
  edition: EditionSummary | null;
  allEditions: EditionSummary[];
  isLoading: boolean;
  setActiveEdition: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export const EditionContext = createContext<EditionContextValue | null>(null);

export function EditionProvider({ children }: { children: ReactNode }) {
  const [edition, setEdition]         = useState<EditionSummary | null>(null);
  const [allEditions, setAllEditions] = useState<EditionSummary[]>([]);
  const [isLoading, setIsLoading]     = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [activeRes, allRes] = await Promise.all([
        fetch("/api/annual-showcase/editions?active=true"),
        fetch("/api/annual-showcase/editions"),
      ]);
      if (activeRes.ok) setEdition((await activeRes.json()) ?? null);
      if (allRes.ok) {
        const all = await allRes.json();
        setAllEditions(Array.isArray(all) ? all : []);
      }
    } catch {
      // pages show their own error states
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    refresh().finally(() => setIsLoading(false));
  }, [refresh]);

  const setActiveEdition = useCallback(async (id: string) => {
    const res = await fetch(`/api/annual-showcase/editions/${id}/set-active`, { method: "POST" });
    if (!res.ok) throw new Error("Failed to set active edition");
    await refresh();
  }, [refresh]);

  return (
    <EditionContext.Provider value={{ edition, allEditions, isLoading, setActiveEdition, refresh }}>
      {children}
    </EditionContext.Provider>
  );
}
