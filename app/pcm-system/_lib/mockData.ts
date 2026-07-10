// ============================================================================
// PCM System — Seed Data
// Students come from the real database (see src/lib/students.server.ts).
// Users still seed locally because real auth isn't wired up yet — they're the
// mock login picker on /login. Everything else starts empty so Academy has
// to create real events / sessions / quotas before BMs can invite anyone.
// ============================================================================

import {
  BRANCHES,
  BranchCode,
  BranchRegion,
  FAEvent,
  Invitation,
  Session,
  SessionQuota,
  User,
} from "@pcm/_types";

// ----------------------------------------------------------------------------
// Users — 1 MKT + 1 BM per branch (20 branches). Used only by /login.
// ----------------------------------------------------------------------------
export const MOCK_USERS: User[] = [
  {
    id: "u-mkt",
    name: "Academy",
    email: "marketing@ebright.my",
    role: "MKT",
    branch: null,
  },
  ...BRANCHES.map(b => ({
    id: `u-bm-${b.code.toLowerCase()}`,
    name: `${b.code} — ${b.name}`,
    email: `${b.code.toLowerCase()}@ebright.my`,
    role: "BM" as const,
    branch: b.code as BranchCode,
  })),
  // One Regional Manager per region (A/B/C). SessionSync maps a real RM's
  // login email to the matching u-rm-* via RM_REGION_BY_EMAIL.
  ...(["A", "B", "C"] as BranchRegion[]).map(region => ({
    id: `u-rm-${region.toLowerCase()}`,
    name: `Regional Manager — Region ${region}`,
    email: `rm-${region.toLowerCase()}@ebright.my`,
    role: "RM" as const,
    branch: null,
    region,
  })),
];

// Empty seeds — Academy creates real events from the app.
export const MOCK_EVENTS: FAEvent[] = [];
export const MOCK_SESSIONS: Session[] = [];
export const MOCK_QUOTAS: SessionQuota[] = [];
export const MOCK_INVITATIONS: Invitation[] = [];
