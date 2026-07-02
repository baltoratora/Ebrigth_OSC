// ============================================================================
// FA System — Core Domain Types
// ============================================================================

/** All 20 eBright branches. Code is the shortform used throughout the app. */
export const BRANCHES = [
  { code: "ONL", name: "Online" },
  { code: "ST",  name: "Subang Taipan" },
  { code: "SA",  name: "Setia Alam" },
  { code: "SP",  name: "Sri Petaling" },
  { code: "KD",  name: "Kota Damansara" },
  { code: "PJY", name: "Putrajaya" },
  { code: "AMP", name: "Ampang" },
  { code: "CJY", name: "Cyberjaya" },
  { code: "KLG", name: "Klang" },
  { code: "DA",  name: "Denai Alam" },
  { code: "BBB", name: "Bandar Baru Bangi" },
  { code: "DK",  name: "Danau Kota" },
  { code: "SHA", name: "Shah Alam" },
  { code: "BTHO",name: "Bandar Tun Hussein Onn" },
  { code: "EGR", name: "Eco Grandeur" },
  { code: "BSP", name: "Bandar Seri Putra" },
  { code: "RBY", name: "Bandar Rimbayu" },
  { code: "TSG", name: "Taman Sri Gombak" },
  { code: "KW",  name: "Kota Warisan" },
  { code: "KTG", name: "Kajang TTDI" },
] as const;

export type BranchCode = typeof BRANCHES[number]["code"];

// ----------------------------------------------------------------------------
// Regions (Regional Manager scoping)
// ----------------------------------------------------------------------------
export type BranchRegion = "A" | "B" | "C";

/** Region → branch codes, per the ops "branch by region" sheet (10 Jun 2026).
 *  A few codes (AC, SBY, DSH, SLY, DP, SNT, SBN) aren't in BRANCHES yet — kept
 *  here so region scoping already works once those branches are added. */
export const BRANCHES_BY_REGION: Record<BranchRegion, string[]> = {
  A: ["AC", "DA", "EGR", "KLG", "RBY", "SA", "SHA", "ST", "SBY"],
  B: ["AMP", "BTHO", "DK", "DSH", "KTG", "KD", "SLY", "SP", "TSG"],
  C: ["BBB", "BSP", "CJY", "DP", "KW", "PJY", "SNT", "SBN", "ONL"],
};

/** Regional Manager accounts → the region they manage (matched by email). */
export const RM_REGION_BY_EMAIL: Record<string, BranchRegion> = {
  "irfanhairie02@gmail.com": "A",
  "kirtikha19@gmail.com": "B",
  "jothi2703@gmail.com": "C",
};

export function regionForEmail(email: string | null | undefined): BranchRegion | null {
  if (!email) return null;
  return RM_REGION_BY_EMAIL[email.trim().toLowerCase()] ?? null;
}

/** NextAuth role strings that mean "Regional Manager". */
export function isRegionalManagerRole(role: string | null | undefined): boolean {
  if (!role) return false;
  const r = role.toUpperCase().replace(/\s+/g, "_");
  return r === "REGIONAL_MANAGER" || r === "REGIONALMANAGER" || r === "RM";
}

/** NextAuth roles that count as "back-office" — they default to the FA
 *  Marketing view but can switch into any Branch Manager view through the
 *  /fa-system/login picker. Add a new role here when an HQ-side
 *  department should reach FA. BRANCH_MANAGER is intentionally NOT here —
 *  those users are locked to their own branch.
 *
 *  Both SessionSync (which maps NextAuth → FA store user) and AppShell
 *  (which decides whether the switch-view affordances render) read this
 *  set, so the two stay in lock-step. */
const BACK_OFFICE_ROLES: ReadonlySet<string> = new Set([
  "SUPER_ADMIN",
  "ADMIN",
  "MARKETING",
  "MKT",       // defensive alias in case the DB ever stores the short form
  "ACADEMY",
]);

export function isBackOfficeRole(role: string | null | undefined): boolean {
  return !!role && BACK_OFFICE_ROLES.has(role);
}

/** Look up an FA branch by a raw `User.branchName` string, tolerant of
 *  spelling/format drift between Heidi and the hardcoded BRANCHES list above.
 *
 *  Resolution order:
 *    1. Exact match (case-insensitive, trimmed)                  — Setia Alam
 *    2. Match by branch code in case the field stores the code   — "ST", " sa "
 *    3. Curated alias map for known DB rows that don't match     — typos, suffixes
 *    4. Substring containment (one contains the other)           — "Rimbayu" ↔ "Bandar Rimbayu"
 *    5. Token-overlap ≥ 75% of the FA branch's tokens            — "Bandar Tun Huseein Onn"
 *
 *  Returns null only when the name genuinely doesn't look like any FA branch
 *  (e.g. "00 Ebright OD" — that account should stay locked out). */
export function matchBranchByName(raw: string | null | undefined): BranchCode | null {
  if (!raw) return null;
  const cleaned = raw.trim();
  if (!cleaned) return null;
  const norm = cleaned.toLowerCase().replace(/\s+/g, " ");

  // 1. exact (case-insensitive)
  for (const b of BRANCHES) {
    if (b.name.toLowerCase() === norm) return b.code;
  }
  // 2. by code (e.g. "ST", "SA")
  const upper = cleaned.toUpperCase();
  for (const b of BRANCHES) {
    if (b.code === upper) return b.code;
  }
  // 3. curated aliases — extend here when a new branch label drift appears.
  const ALIASES: Record<string, BranchCode> = {
    "rimbayu": "RBY",
    "bandar rimbayu": "RBY",
    "kajang ttdi groove": "KTG",
    "ttdi groove": "KTG",
    "bandar tun huseein onn": "BTHO", // common typo in Heidi
    "bandar tun husein onn": "BTHO",  // another typo variant
    "tun hussein onn": "BTHO",
    "bth onn": "BTHO",
  };
  if (norm in ALIASES) return ALIASES[norm];

  // 4. substring containment in either direction
  for (const b of BRANCHES) {
    const branchNorm = b.name.toLowerCase();
    if (branchNorm.includes(norm) || norm.includes(branchNorm)) return b.code;
  }

  // 5. token-overlap (≥ 75% of the FA branch's tokens appear in the input)
  const inputTokens = new Set(norm.split(" ").filter(Boolean));
  let bestCode: BranchCode | null = null;
  let bestScore = 0;
  for (const b of BRANCHES) {
    const branchTokens = b.name.toLowerCase().split(" ").filter(Boolean);
    let hits = 0;
    for (const t of branchTokens) if (inputTokens.has(t)) hits++;
    const score = hits / branchTokens.length;
    if (score >= 0.75 && score > bestScore) {
      bestScore = score;
      bestCode = b.code;
    }
  }
  return bestCode;
}

// ----------------------------------------------------------------------------
// Users & Auth
// ----------------------------------------------------------------------------
export type Role = "MKT" | "BM" | "RM";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** For BM users — the branch they manage. Null otherwise. */
  branch: BranchCode | null;
  /** For RM users — the region they manage. Null otherwise. */
  region?: BranchRegion | null;
}

/** Branch codes a user may see/act on. `null` = all branches (MKT/back-office).
 *  BM → just their branch. RM → every branch in their region. */
export function allowedBranchCodes(
  user: Pick<User, "role" | "branch" | "region"> | null | undefined,
): string[] | null {
  if (!user) return [];
  if (user.role === "BM") return user.branch ? [user.branch] : [];
  if (user.role === "RM") return user.region ? BRANCHES_BY_REGION[user.region] : [];
  return null; // MKT / back-office → all branches
}

// ----------------------------------------------------------------------------
// Event
// ----------------------------------------------------------------------------
export type EventStatus =
  | "draft"      // Being set up by marketing, not visible to BMs yet
  | "open"       // BMs can now invite students
  | "closed"     // Invitation window closed, waiting for event day
  | "ongoing"    // Happening right now (between startDate and endDate)
  | "completed"; // Finished

export interface FAEvent {
  id: string;
  name: string;                 // e.g. "April 2026 Foundation Appraisal"
  month: number;                // 1–12
  year: number;
  venue: string;                // Free text — e.g. "eBright HQ Subang"
  startDate: string;            // ISO date
  endDate: string;              // ISO date (== startDate for 1-day events)
  numberOfDays: 1 | 2 | 3;
  invitationOpenDate: string;   // When BMs can start inviting
  invitationCloseDate: string;  // Deadline for invitations
  status: EventStatus;
  createdBy: string;            // User id
  createdAt: string;            // ISO timestamp
  notes?: string;
}

// ----------------------------------------------------------------------------
// Session — a time slot within an event day
// ----------------------------------------------------------------------------
export interface Session {
  id: string;
  eventId: string;
  dayNumber: 1 | 2 | 3;         // Which day of the event
  sessionNumber: number;        // 1, 2, 3... within the day
  startTime: string;            // "09:00"
  endTime: string;              // "10:00"
  /** Optional label — e.g. "Morning Batch A" */
  label?: string;
}

// ----------------------------------------------------------------------------
// Session Quota — per-branch allocation for a given session
// e.g. Session 1 → ST: 7 slots, SA: 5 slots, SP: 2 slots
// ----------------------------------------------------------------------------
export interface SessionQuota {
  id: string;
  sessionId: string;
  branch: BranchCode;
  quota: number;                // How many students this branch can invite
}

// ----------------------------------------------------------------------------
// Student
// ----------------------------------------------------------------------------
/** Age band stored on the student record (independent of curriculum grade —
 *  an older student joining at grade 1 still carries their real age band). */
export type AgeCategory = "Junior" | "Middler" | "Senior";

export interface Student {
  id: string;
  name: string;
  branch: BranchCode;
  grade: number;                // 1–8 (curriculum level)
  ageCategory: AgeCategory;     // age band — independent of grade
  credit: number;               // 1–12. Credit 12 IS the showcase itself.
  /** Record of past FA completions by grade. e.g. {1: true, 2: true, 3: false} */
  faHistory: Record<number, boolean>;
  parentName: string;
  parentPhone: string;
  enrolmentDate: string;        // ISO date
  active: boolean;
  /** True when this row comes from the `archived_students` table rather than
   *  the live `studentrecords` table. Archived students still appear in the
   *  list and can be invited to FA events — they just carry an "Archived"
   *  badge and live in their own section of the invite picker. */
  archived: boolean;
}

/** Eligibility rule: a student is eligible for FA when they have at least
 *  one grade slot the system would accept right now (past grade with a
 *  missed FA, or current grade after they hit C9 — see invitableGradesFor).
 *  Active-vs-Inactive status is intentionally NOT part of this rule —
 *  Marketing wants inactive students in the picker so they can still be
 *  invited if needed (they'll show with an "Inactive" badge on the row). */
export function isStudentEligible(student: Student): boolean {
  return invitableGradesFor(student).length > 0;
}

/** Stats about a single `fetchAllStudents` call — populated by the API and
 *  shipped to the client so the UI can surface dropped rows that need
 *  fixing in Heidi. Lives in the shared types module so both the
 *  server-only loader and the client store can reference it. */
export interface StudentLoadReport {
  loaded: number;
  skipped: {
    missing_branch: number;
    unknown_branch: number;
    missing_grade: number;
    bad_grade_format: number;
  };
  samples: Array<{
    id: number;
    reason: "missing_branch" | "unknown_branch" | "missing_grade" | "bad_grade_format";
    branch: string | null;
    grade_chapter: string | null;
  }>;
  /** True if the `ade_group` join succeeded. When false, age-category labels
   *  are still derived from grade as a fallback. */
  ageGroupJoinAvailable: boolean;
  /** How many rows were loaded from the separate `archived_students` table
   *  (counted toward `loaded` too). Lets the UI show an archived tally. */
  archivedLoaded?: number;
}

/** Check if student has a backlog — any completed grade below current where FA was not done. */
export function hasBacklog(student: Student): boolean {
  for (let g = 1; g < student.grade; g++) {
    if (student.faHistory[g] !== true) return true;
  }
  return false;
}

/** Kept for any existing references — no longer used as an invite gate. */
export const FA_CURRENT_GRADE_MIN_CHAPTER = 9;

/** The list of grades a student can be invited to appraise right now.
 *  All grades from 1 up to and including the student's current grade are
 *  returned with no conditions — chapter threshold and archived status are
 *  not checked here. Returned in ascending order. */
export function invitableGradesFor(student: Student): number[] {
  const grades: number[] = [];
  for (let g = 1; g <= student.grade; g++) grades.push(g);
  return grades;
}

/** Render a numeric grade back to its curriculum label. The ladder runs
 *  G1..G8 (1..8), then the GA series (9..12 → GA1..GA4), then the GB series
 *  (13..16 → GB1..GB4). Use this everywhere a grade is shown so advanced
 *  students read as "GA2" / "GB1" rather than "G10" / "G13". */
export function gradeLabel(grade: number): string {
  if (grade >= 13 && grade <= 16) return `GB${grade - 12}`;
  if (grade >= 9 && grade <= 12) return `GA${grade - 8}`;
  return `G${grade}`;
}

// ----------------------------------------------------------------------------
// Invitation — one student invited to one session
// ----------------------------------------------------------------------------
export type InvitationStatus =
  | "invited"       // BM has invited the student (called parent)
  | "confirmed"     // Parent confirmed attendance
  | "declined"      // Parent declined
  | "attended"      // Student showed up on the day
  | "no_show"       // Student did not show up
  | "walk_in";      // Student walked in WITHOUT an invitation — already attending.
                    // Tracked as its own status, but counts as attended everywhere.

/** Statuses that mean the student was PRESENT at the event. A walk-in is present
 *  by definition (they walked in), so it counts as attended in every metric and
 *  certificate/inventory check — it's only a distinct status for tracking. */
export function countsAsAttended(status: InvitationStatus): boolean {
  return status === "attended" || status === "walk_in";
}

/** Statuses that count toward the "confirmed" HEADCOUNT metric on dashboards:
 *  everyone who confirmed they'd join — whether they then attended, walked in,
 *  didn't show (no_show), or are still pending on the day. */
export function countsAsConfirmed(status: InvitationStatus): boolean {
  return status === "confirmed" || status === "no_show" || countsAsAttended(status);
}

/** Resolve the Student an invitation points at, tolerant of archived-id drift.
 *  Active students are keyed by their raw id; archived students load as
 *  `arch-<no>`. A few legacy/backfilled invitations stored the bare number for
 *  an archived student, so when an exact match fails we retry with the `arch-`
 *  prefix. Returns undefined only when the id exists in neither form (a
 *  genuinely orphaned invitation — no student record anywhere). */
export function resolveStudentById<T extends { id: string }>(students: T[], studentId: string): T | undefined {
  const exact = students.find(s => s.id === studentId);
  if (exact) return exact;
  if (/^\d+$/.test(studentId)) return students.find(s => s.id === `arch-${studentId}`);
  return undefined;
}

export interface Invitation {
  id: string;
  eventId: string;
  sessionId: string;
  studentId: string;
  branch: BranchCode;
  /** Grade the student is being appraised for in this invitation.
   *  May differ from student.grade when clearing backlog. */
  targetGrade: number;
  status: InvitationStatus;
  invitedBy: string;            // User id (BM)
  invitedAt: string;
  confirmedAt?: string;
  attendanceMarkedAt?: string;
  attendanceMarkedBy?: string;
  notes?: string;
  /** Student's name captured at invite time. Display fallback so the roster
   *  still shows who this is if the student id later can't be resolved
   *  (archived/restored/deleted). Mirrors PCM's student_name_snapshot. */
  studentNameSnapshot?: string;
  /** Captured when the BM confirms the invitation: a link to the student's
   *  practice/testing video, and a Google Drive link to the uploaded proof
   *  image showing the student completed the testing BEFORE joining the event.
   *  Both are surfaced to Marketing. */
  videoLink?: string;
  proofUrl?: string;
}

// ----------------------------------------------------------------------------
// Event branch overrides — per-event, per-branch toggle that lets a single
// branch invite the same student to multiple grades within one event.
// Defaults to OFF for every branch on every event. Only Marketing/Admin can
// toggle it. When ON, `dayPolicy` decides which extra invites are allowed.
// ----------------------------------------------------------------------------

/**
 * Which extra multi-grade invites an unlocked branch may issue for the same
 * student within one event. A different target_grade is ALWAYS required on top
 * of this, regardless of policy.
 *   • SAME_DAY — extra invites must be on the same day (different session). [default]
 *   • DIFF_DAY — extra invites must be on a different day from existing ones.
 *   • BOTH     — no day restriction; any day is allowed.
 */
export type DayPolicy = "SAME_DAY" | "DIFF_DAY" | "BOTH";

export interface EventBranchOverride {
  eventId: string;
  branchCode: BranchCode;
  dayPolicy: DayPolicy;         // which extra invites this branch may issue
  grantedBy: string;            // email of the Marketing/Admin user who toggled it on
  grantedAt: string;            // ISO timestamp
  reason?: string;              // optional free-text audit note
}

// ----------------------------------------------------------------------------
// Derived / view-model types (used by pages, not stored)
// ----------------------------------------------------------------------------
export interface SessionWithDetails extends Session {
  quotas: SessionQuota[];
  invitations: Invitation[];
  totalQuota: number;
  totalInvited: number;
  totalConfirmed: number;
  totalAttended: number;
}

export interface EventWithStats extends FAEvent {
  totalSessions: number;
  totalQuota: number;
  totalInvited: number;
  totalConfirmed: number;
  totalAttended: number;
}

// ----------------------------------------------------------------------------
// FA Assessment Report — Marketing-filled appraisal attached to one invitation.
// ----------------------------------------------------------------------------
/** Maximum score per criterion. Total = 4 × this = /100. */
export const FA_REPORT_MAX_PER_CRITERION = 25;

export interface FAReport {
  id: string;
  invitationId: string;
  studentId: string;
  /** Snapshot of student state at the time the report was written. */
  studentName: string;
  branch: BranchCode;
  grade: number;
  /** ISO date — when the assessment took place. */
  assessmentDate: string;
  /** Four criteria from the FA template, each 0–25. */
  communicationScore: number;
  analysisScore: number;
  interactionScore: number;
  performanceScore: number;
  /** Combined free-text remarks. */
  remarks: string;
  /** Person who filled the form. */
  preparedBy: string;
  preparedById?: string;
  /** Optional URL of a recorded performance — Marketing pastes a Drive
   *  /Vimeo/YouTube link so parents can watch the student's session.
   *  Shown on the certificate as a clickable link. */
  videoLink?: string;
  /** Optional Google Drive link to a photo the BRANCH uploads as proof that
   *  the printed report was handed to the student. Branch uploads (only once
   *  the report is filled); Marketing/Academy view it read-only. */
  evidencePhotoLink?: string;
  createdAt: string;
  updatedAt: string;
}

/** Helper: derive the total score from the four criteria. */
export function faReportTotal(r: Pick<FAReport, "communicationScore" | "analysisScore" | "interactionScore" | "performanceScore">): number {
  return r.communicationScore + r.analysisScore + r.interactionScore + r.performanceScore;
}

