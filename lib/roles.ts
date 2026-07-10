// Single source of truth for authentication roles stored on User.role.
//
// These are the values that appear in the `role` column of the User table and
// are copied into the NextAuth JWT / session. They are distinct from the
// employee-facing display labels in lib/constants.ts (CEO / FT HOD / etc.),
// which describe an Employee record, not an auth principal.
//
// Rules:
//   - All role checks in the app MUST go through the predicates below.
//   - Never compare session.user.role to a string literal directly — use a
//     predicate so typos, case drift, and future-added roles are caught once,
//     in one place.
//   - Predicates are fail-closed: an unknown / missing / malformed role
//     returns false, never true.

export const ROLES = {
  SUPER_ADMIN:    "SUPER_ADMIN",
  ADMIN:          "ADMIN",
  BRANCH_MANAGER: "BRANCH_MANAGER",
  // CRM regional managers. Authenticate via the HRFS portal but their access
  // is CRM-only — recognised here so middleware doesn't bounce them at /login;
  // they're not in any HR-admin ROLE_RULES, so HR pages stay blocked and the
  // CRM (/crm/*) is reachable (no rule matches → allowed).
  REGIONAL_MANAGER: "REGIONAL_MANAGER",
  HOD:            "HOD",
  HR:             "HR",
  EXECUTIVE:      "EXECUTIVE",
  INTERN:         "INTERN",
  FULL_TIME:      "Full_Time",
  PART_TIME:      "Part_Time",
  ACADEMY:        "ACADEMY",
  MARKETING:      "MARKETING",
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

export const ALL_ROLES: readonly Role[] = Object.values(ROLES);

// Tuple form for use with zod's z.enum(), which requires a non-empty tuple
// type rather than a plain array. Keep this in sync with ROLES.
export const ROLE_VALUES = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.BRANCH_MANAGER,
  ROLES.REGIONAL_MANAGER,
  ROLES.HOD,
  ROLES.HR,
  ROLES.EXECUTIVE,
  ROLES.INTERN,
  ROLES.FULL_TIME,
  ROLES.PART_TIME,
  ROLES.ACADEMY,
  ROLES.MARKETING,
] as const;

// Accepts common drift (case, underscores vs. hyphens, stray whitespace) and
// returns the canonical Role, or null when nothing matches. Any code reading
// session.user.role should route it through this once.
export function normalizeRole(raw: unknown): Role | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  for (const r of ALL_ROLES) if (r === trimmed) return r;

  const key = trimmed.toUpperCase().replace(/[-\s]+/g, "_");
  const aliases: Record<string, Role> = {
    SUPER_ADMIN:    ROLES.SUPER_ADMIN,
    SUPERADMIN:     ROLES.SUPER_ADMIN,
    ADMIN:          ROLES.ADMIN,
    BRANCH_MANAGER: ROLES.BRANCH_MANAGER,
    BRANCHMANAGER:  ROLES.BRANCH_MANAGER,
    BM:             ROLES.BRANCH_MANAGER,
    REGIONAL_MANAGER: ROLES.REGIONAL_MANAGER,
    REGIONALMANAGER:  ROLES.REGIONAL_MANAGER,
    RM:               ROLES.REGIONAL_MANAGER,
    HOD:            ROLES.HOD,
    HR:             ROLES.HR,
    EXECUTIVE:      ROLES.EXECUTIVE,
    EXEC:           ROLES.EXECUTIVE,
    INTERN:         ROLES.INTERN,
    INT:            ROLES.INTERN,
    FULL_TIME:      ROLES.FULL_TIME,
    FULLTIME:       ROLES.FULL_TIME,
    PART_TIME:      ROLES.PART_TIME,
    PARTTIME:       ROLES.PART_TIME,
    ACADEMY:        ROLES.ACADEMY,
    MARKETING:      ROLES.MARKETING,
    MKT:            ROLES.MARKETING,
    // BranchStaff job-title labels (ROLE_OPTIONS). User.role may now hold these
    // verbatim — they're synced from BranchStaff — so the auth layer must
    // resolve them to the correct access Role. Keys are post-normalisation
    // ("FT Coach" → "FT_COACH"). Mirrors authRoleForStaffRole().
    FT_COACH:       ROLES.FULL_TIME,
    PT_COACH:       ROLES.PART_TIME,
    FT_HOD:         ROLES.HOD,
    FT_EXEC:        ROLES.EXECUTIVE,
    CEO:            ROLES.ADMIN,
    FT_CEO:         ROLES.ADMIN,
  };
  return aliases[key] ?? null;
}

// ─── Staff (job) role → auth role ────────────────────────────────────────────
//
// BranchStaff.role holds an HR *job* title (the ROLE_OPTIONS values in
// lib/constants.ts: "CEO", "FT HOD", "FT Coach", "BM", "INT", …). User.role
// holds an *auth* Role that drives middleware + dashboard access. Sign-up needs
// to translate the former into the latter so a new account inherits the access
// HR already implied by the staff record.
//
// This is deliberately separate from normalizeRole(): that one tolerates drift
// in strings that are *already* auth roles; this one maps job titles across to
// the auth vocabulary. Keys are matched after stripping separators / casing, so
// "FT - Coach", "FT Coach", and "ft  coach" all resolve to the same entry —
// which means sign-up keeps working whether or not the naming migration has run.
const STAFF_ROLE_TO_AUTH: Record<string, Role> = {
  CEO:        ROLES.ADMIN,
  "FT HOD":   ROLES.HOD,
  "FT EXEC":  ROLES.EXECUTIVE,
  "FT COACH": ROLES.FULL_TIME,
  "PT COACH": ROLES.PART_TIME,
  BM:         ROLES.BRANCH_MANAGER,
  INT:        ROLES.INTERN,
};

export function authRoleForStaffRole(raw: unknown): Role | null {
  if (typeof raw !== "string") return null;
  const key = raw.replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
  if (!key) return null;
  if (STAFF_ROLE_TO_AUTH[key]) return STAFF_ROLE_TO_AUTH[key];
  // Not a recognised job title — maybe the row already stores an auth role
  // (e.g. "HR"). Fall back to the generic normaliser.
  return normalizeRole(raw);
}

// ─── Role groupings ──────────────────────────────────────────────────────────

export const ADMIN_ROLES: readonly Role[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR];

export const MANAGEMENT_ROLES: readonly Role[] = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.BRANCH_MANAGER,
  ROLES.HOD,
  ROLES.HR,
];

export const EMPLOYEE_ROLES: readonly Role[] = [ROLES.PART_TIME, ROLES.FULL_TIME];

export const TRAINING_EDIT_ROLES: readonly Role[] = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.ACADEMY,
];

// ─── Predicates ──────────────────────────────────────────────────────────────

function hasRole(raw: unknown, allowed: readonly Role[]): boolean {
  const r = normalizeRole(raw);
  return r !== null && allowed.includes(r);
}

export const isSuperAdmin    = (raw: unknown) => hasRole(raw, [ROLES.SUPER_ADMIN]);
export const isAdmin         = (raw: unknown) => hasRole(raw, ADMIN_ROLES);
export const isBranchManager = (raw: unknown) => hasRole(raw, [ROLES.BRANCH_MANAGER]);
export const isHOD           = (raw: unknown) => hasRole(raw, [ROLES.HOD]);
export const isHR            = (raw: unknown) => hasRole(raw, [ROLES.HR]);
export const isExecutive     = (raw: unknown) => hasRole(raw, [ROLES.EXECUTIVE]);
export const isIntern        = (raw: unknown) => hasRole(raw, [ROLES.INTERN]);
export const isFullTime      = (raw: unknown) => hasRole(raw, [ROLES.FULL_TIME]);
export const isPartTime      = (raw: unknown) => hasRole(raw, [ROLES.PART_TIME]);
export const isAcademy       = (raw: unknown) => hasRole(raw, [ROLES.ACADEMY]);
export const isMarketing     = (raw: unknown) => hasRole(raw, [ROLES.MARKETING]);
export const isEmployee      = (raw: unknown) => hasRole(raw, EMPLOYEE_ROLES);
export const isManagement    = (raw: unknown) => hasRole(raw, MANAGEMENT_ROLES);

export function hasAnyRole(raw: unknown, allowed: readonly Role[]): boolean {
  return hasRole(raw, allowed);
}
