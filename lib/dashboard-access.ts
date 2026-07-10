// Single source of truth for which roles can see which dashboards.
//
// Pure frontend gating: edit this file, redeploy. There is no DB, no API, and
// no admin UI to flip these — the modal in AccountManagement is read-only.
//
// Real security is still enforced server-side by middleware.ts. This file
// controls UI visibility (sidebar items, dashboard cards) so users don't see
// links they can't reach.

import { ROLES, normalizeRole, type Role } from "./roles";

// ─── Tree definition ────────────────────────────────────────────────────────

export interface DashboardNode {
  /** Stable key. Parents and children share the same prefix: "hrms", "hrms.attendance". */
  key: string;
  label: string;
  /** Target route. Omit on group-only parents that have no landing page. */
  href?: string;
  icon?: string;
  /** Nesting is unlimited — canAccess/canSeeKey resolve keys by string prefix regardless of depth. */
  children?: DashboardNode[];
  /**
   * True when `href` itself renders no protected content of its own — it's a
   * pure navigation shell (a grid of tiles linking to `children`), e.g. the
   * Manpower Planning hub. Used by the path-gate below: a user with access to
   * ANY child may still load the hub itself so they have somewhere to click
   * into. Leave unset for nodes whose own route is real content (e.g. the
   * Employee Dashboard table) even if it also has sub-pages like a print view.
   */
  contentless?: boolean;
}

// Mirrors the Sidebar + DashboardHome trees. When you add a new dashboard or
// sub-page anywhere, add it here too — otherwise it won't appear for anyone
// except SUPER_ADMIN / ADMIN (which get the "*" wildcard).
export const DASHBOARD_TREE: DashboardNode[] = [
  { key: "home", label: "Home", href: "/home", icon: "🏠" },

  {
    key: "library",
    label: "Library",
    href: "/dashboards/library",
    icon: "📚",
    children: [
      { key: "library.documents", label: "Documents", href: "#" },
      { key: "library.resources", label: "Resources", href: "#" },
    ],
  },

  {
    key: "internal-dashboard",
    label: "Internal Dashboard",
    href: "/dashboards/internal-dashboard",
    icon: "📊",
    children: [
      { key: "internal-dashboard.analytics", label: "Analytics", href: "#" },
      { key: "internal-dashboard.reports",   label: "Reports",   href: "#" },
    ],
  },

  {
    key: "hrms",
    label: "HRMS",
    href: "/dashboards/hrms",
    icon: "👥",
    children: [
      {
        key: "hrms.employee", label: "Employee Dashboard", href: "/dashboard-employee-management",
        children: [
          { key: "hrms.employee.print", label: "Print View", href: "/dashboard-employee-management/print" },
        ],
      },
      {
        key: "hrms.manpower-planning", label: "Manpower Planning", href: "/manpower-schedule", contentless: true,
        children: [
          { key: "hrms.manpower-planning.plan-new-week",           label: "Plan New Week",             href: "/manpower-schedule/plan-new-week" },
          { key: "hrms.manpower-planning.dashboard",                label: "Manpower Dashboard",        href: "/manpower-schedule/dashboard" },
          { key: "hrms.manpower-planning.update",                   label: "Update Manpower Schedule",  href: "/manpower-schedule/update" },
          { key: "hrms.manpower-planning.archive",                  label: "Archive Overview",          href: "/manpower-schedule/archive" },
          { key: "hrms.manpower-planning.branch-opening-planning",  label: "Branch Opening Planning",   href: "/manpower-schedule/branch-opening-planning" },
          { key: "hrms.manpower-planning.branch-operation-days",    label: "Branch Operation Days",     href: "/manpower-schedule/branch-operation-days" },
        ],
      },
      { key: "hrms.claims",           label: "Claims",               href: "/claim" },
      {
        key: "hrms.attendance", label: "Attendance", href: "/attendance", contentless: true,
        children: [
          { key: "hrms.attendance.summary", label: "Summary", href: "/attendance/summary" },
          { key: "hrms.attendance.report",  label: "Report",  href: "/attendance/report" },
          { key: "hrms.attendance.appeal",  label: "Appeal",  href: "/attendance/appeal" },
          { key: "hrms.attendance.leave",   label: "Leave",   href: "/attendance/leave" },
        ],
      },
      {
        key: "hrms.recruitment", label: "Recruitment", href: "/recruitment", contentless: true,
        children: [
          { key: "hrms.recruitment.dashboard",      label: "Dashboard",     href: "/recruitment/dashboard" },
          { key: "hrms.recruitment.contacts",       label: "Contacts",      href: "/recruitment/contacts" },
          { key: "hrms.recruitment.notifications",  label: "Notifications", href: "/recruitment/notifications" },
          { key: "hrms.recruitment.calendar",       label: "Calendar",      href: "/recruitment/calendar" },
          { key: "hrms.recruitment.library",        label: "Library",       href: "/recruitment/library" },
          { key: "hrms.recruitment.opportunity",    label: "Opportunity",   href: "/recruitment/opportunity" },
        ],
      },
      { key: "hrms.onboarding",       label: "Onboarding",           href: "/onboarding" },
      { key: "hrms.offboarding",      label: "Offboarding",          href: "/offboarding" },
      { key: "hrms.hr-dashboard",     label: "HR Dashboard",         href: "/hr-dashboard" },
      { key: "hrms.manpower-cost",    label: "Manpower Cost Report", href: "/manpower-cost-report" },
      { key: "hrms.staff-directory",  label: "Staff Directory",      href: "/staff-directory" },
      { key: "hrms.account",          label: "Account Management",   href: "/account-management" },
    ],
  },

  {
    key: "crm",
    label: "CRM",
    href: "/dashboards/crm",
    icon: "📰",
    children: [
      { key: "crm.lead",   label: "Lead",   href: "/crm/dashboard" },
      { key: "crm.ticket", label: "Ticket", href: "/crm/tickets/dashboard" },
    ],
  },

  {
    key: "sms",
    label: "SMS",
    href: "/dashboards/sms",
    icon: "💬",
    children: [
      { key: "sms.messages",  label: "Messages",  href: "#" },
      { key: "sms.templates", label: "Templates", href: "#" },
      { key: "sms.burnlist",  label: "Burnlist",  href: "/burnlist" },
    ],
  },

  {
    key: "inventory",
    label: "Inventory",
    href: "/dashboards/inventory",
    icon: "📦",
    children: [
      { key: "inventory.stock",     label: "Stock Management", href: "#" },
      { key: "inventory.warehouse", label: "Warehouse",        href: "#" },
    ],
  },

  {
    key: "academy",
    label: "Academy",
    href: "/dashboards/academy",
    icon: "🎓",
    children: [
      { key: "academy.events",  label: "Academy Dashboard", href: "/academy/dashboard" },
      { key: "academy.courses", label: "Ebright Class Syllabus", href: "/academy/syllabus" },
    ],
  },

  // FA System lives as its own top-level tile on the home dashboard (was
  // previously a sub-item under HRMS). The internal route /fa-system has
  // its own SessionSync-driven nav so we don't list children here.
  {
    key: "fa-system",
    label: "FA System",
    href: "/fa-system",
    icon: "🎗️",
  },

  // PCM System — academy-owned counterpart of FA. Mirrors the same
  // event/session/invitation shape but with its own pcm_* DB tables and
  // pcm_progress_json on studentrecords. The internal /pcm-system route
  // has its own SessionSync-driven nav (ACADEMY / ADMIN / SUPER_ADMIN
  // get the Academy view, BRANCH_MANAGER gets the BM view).
  {
    key: "pcm-system",
    label: "PCM System",
    href: "/pcm-system",
    icon: "🎯",
  },

  {
    key: "annual-showcase",
    label: "Annual Showcase",
    href: "/annual-showcase",
    icon: "🎪",
    children: [
      { key: "annual-showcase.oc",           label: "Organizing Committee", href: "/annual-showcase/oc" },
      { key: "annual-showcase.procurement",  label: "Procurement",          href: "/annual-showcase/procurement" },
      { key: "annual-showcase.sponsorship",  label: "Sponsorship & VVIP",   href: "/annual-showcase/sponsorship" },
      { key: "annual-showcase.media",        label: "Media & Publicity",    href: "/annual-showcase/media" },
      { key: "annual-showcase.showcase",     label: "Showcase & Production",href: "/annual-showcase/showcase" },
      { key: "annual-showcase.logistics",    label: "Logistics",            href: "/annual-showcase/logistics" },
      { key: "annual-showcase.youthpreneur", label: "Youthpreneur",         href: "/annual-showcase/youthpreneur" },
      { key: "annual-showcase.ceo",          label: "CEO Unit",             href: "/annual-showcase/ceo" },
    ],
  },
];

// ─── Role allowlists ────────────────────────────────────────────────────────

/**
 * "*" = full access (every dashboard, including ones added later).
 *
 * Otherwise a list of keys. Listing a parent key (e.g. "hrms") grants every
 * descendant ("hrms.attendance", "hrms.claims", ...). To be more granular,
 * list specific child keys instead of the parent.
 *
 * Roles not listed here fall through to an empty allowlist (no access).
 */
export const ROLE_ACCESS: Record<Role, readonly string[] | "*"> = {
  [ROLES.SUPER_ADMIN]:    "*",
  [ROLES.ADMIN]:          "*",

  // Matches the original DashboardDetail rule "HR sees everything in HRMS
  // except manpower-planning" — granting the whole "hrms" branch then it's
  // narrowed by the user-specific override map if needed.
  [ROLES.HR]: [
    "home",
    "hrms.employee",
    "hrms.claims",
    "hrms.attendance",
    "hrms.recruitment",
    "hrms.onboarding",
    "hrms.offboarding",
    "hrms.hr-dashboard",
    "hrms.manpower-cost",
    "fa-system",
    "hrms.account",
    "internal-dashboard",
    "library",
  ],

  [ROLES.HOD]: [
    "home",
    "hrms",                       // HODs see the whole HRMS branch
    "fa-system",                  // explicit since fa-system is now top-level
    "library",
  ],

  // Original BM rule was "manpower-planning + fa-system" inside HRMS, plus
  // other tiles outside HRMS. Kept narrow so overrides can extend per-BM.
  // BMs also get pcm-system (they're the branch-side of every assessment).
  [ROLES.BRANCH_MANAGER]: [
    "home",
    "hrms.manpower-planning",
    "hrms.manpower-cost",         // branch-scoped cost report + Branch Team roster
    "fa-system",
    "pcm-system",
    "crm",
    "inventory",
    "sms",
  ],

  // Regional managers are a CRM-only role: they reach the portal solely to get
  // into the CRM (regional dashboard). Home shell + the CRM tile, nothing else.
  [ROLES.REGIONAL_MANAGER]: [
    "home",
    "crm",
  ],

  [ROLES.EXECUTIVE]: [
    "home",
    "hrms.attendance",
    "hrms.claims",
    "library",
  ],

  [ROLES.ACADEMY]: [
    "home",
    "hrms.employee",
    "inventory",
    "academy",
    "fa-system",                  // Academy has full FA access (matches SessionSync)
    "pcm-system",                 // PCM is academy-owned — full access
    "annual-showcase",            // Annual Showcase is academy-managed
  ],

  [ROLES.INTERN]:    ["home", "hrms.attendance", "hrms.claims", "library"],
  // "hrms.attendance" (not the narrower ".report" key) so the single shared
  // "Attendance" tile unlocks — DashboardDetail.tsx points FT/PT at
  // /attendance/report directly instead of the /attendance hub, so they never
  // actually reach Summary/Appeal/Leave despite this broader-looking grant.
  [ROLES.FULL_TIME]: ["home", "hrms.manpower-cost", "hrms.attendance"],
  [ROLES.PART_TIME]: ["home", "hrms.manpower-cost", "hrms.attendance"],

  // Marketing department — full FA access (matches SessionSync's back-office
  // role rule). Same baseline tiles as Academy until requirements diverge.
  [ROLES.MARKETING]: [
    "home",
    "fa-system",
    "crm",
    "inventory",
  ],
};

// ─── Access check ──────────────────────────────────────────────────────────

/**
 * Keys that are visible to every role by default — no need to list them in
 * each role's allowlist. Per-user DENIED overrides still hide them.
 *
 * Use sparingly: only add keys here that genuinely belong to "everyone in
 * the company can see this" (e.g. the staff directory).
 */
const PUBLIC_KEYS: ReadonlySet<string> = new Set([
  "hrms.staff-directory",
]);

/** Per-user override map. Missing key = no override; falls through to role default. */
export type DashboardOverrides = Record<string, "ALLOWED" | "DENIED">;

/**
 * Resolves ONLY the override layer for `key` — exact match, else the closest
 * ancestor override cascading down. Returns undefined when neither applies,
 * leaving the fallback (role default, or "no policy here") to the caller.
 * Shared by canAccess and the path-gate override check below so the two
 * never drift on what "closest ancestor" means.
 */
function resolveOverride(
  key: string,
  overrides?: DashboardOverrides | null,
): "ALLOWED" | "DENIED" | undefined {
  const exact = overrides?.[key];
  if (exact === "ALLOWED" || exact === "DENIED") return exact;

  if (overrides) {
    let bestPrefix = "";
    let bestValue: "ALLOWED" | "DENIED" | undefined;
    for (const [overrideKey, value] of Object.entries(overrides)) {
      if (key.startsWith(overrideKey + ".") && overrideKey.length > bestPrefix.length) {
        bestPrefix = overrideKey;
        bestValue  = value;
      }
    }
    return bestValue;
  }
  return undefined;
}

/**
 * Returns true if the dashboard with `key` is visible.
 *
 * Resolution order (most specific wins): exact-key override, else the
 * closest ancestor override cascading down (e.g. an override on "crm"
 * covers "crm.lead" / "crm.ticket"), else the role default from
 * ROLE_ACCESS. Fail-closed: an unknown / missing role returns false.
 */
export function canAccess(
  rawRole: unknown,
  key: string,
  overrides?: DashboardOverrides | null,
): boolean {
  // Steps 1-2: exact override, else closest ancestor override.
  const ov = resolveOverride(key, overrides);
  if (ov === "ALLOWED") return true;
  if (ov === "DENIED")  return false;

  // Step 3: public keys — visible to every role. Skipped if the override
  // layer above already returned (so a per-user DENIED still wins).
  if (PUBLIC_KEYS.has(key)) return true;

  // Step 4: role default
  return resolveRoleDefault(rawRole, key);
}

/** Pure role-default lookup, ignoring overrides. Useful for "what does this role get?" UI. */
export function resolveRoleDefault(rawRole: unknown, key: string): boolean {
  const role = normalizeRole(rawRole);
  if (!role) return false;

  const allow = ROLE_ACCESS[role];
  if (allow === "*") return true;
  if (!allow) return false;

  for (const granted of allow) {
    if (key === granted) return true;
    if (key.startsWith(granted + ".")) return true;
  }
  return false;
}

/** True if any descendant (child, grandchild, ...) of `node` is accessible. */
function anyDescendantAccessible(
  node: DashboardNode,
  rawRole: unknown,
  overrides?: DashboardOverrides | null,
): boolean {
  for (const child of node.children ?? []) {
    if (canAccess(rawRole, child.key, overrides)) return true;
    if (anyDescendantAccessible(child, rawRole, overrides)) return true;
  }
  return false;
}

/**
 * True when the parent itself is allowed OR any descendant at any depth is.
 * Use this when rendering a group header that should appear whenever the user
 * can reach anything inside the group.
 */
export function isParentVisible(
  rawRole: unknown,
  parent: DashboardNode,
  overrides?: DashboardOverrides | null,
): boolean {
  if (canAccess(rawRole, parent.key, overrides)) return true;
  return anyDescendantAccessible(parent, rawRole, overrides);
}

// Build a quick lookup once so canSeeKey() doesn't re-walk the tree on every
// sidebar render.
const NODE_BY_KEY: Record<string, DashboardNode> = (() => {
  const out: Record<string, DashboardNode> = {};
  for (const parent of DASHBOARD_TREE) {
    out[parent.key] = parent;
    for (const child of parent.children ?? []) out[child.key] = child;
  }
  return out;
})();

/**
 * Visibility check for UI surfaces (sidebar items, dashboard tiles).
 *
 * Differs from `canAccess` in one important way: if `key` names a node with
 * descendants, this returns true when ANY descendant at any depth is
 * accessible — not only when the node's own key is granted. This is what lets
 * a FT/PT user (granted only `hrms.manpower-cost`) still see the HRMS card so
 * they can click into it, and what lets the top-level "HRMS" nav item stay
 * unlocked for a user granted only a single leaf page three levels down
 * (e.g. `hrms.manpower-planning.archive`).
 *
 * For routing/middleware decisions, keep using `canAccess` — it answers the
 * stricter "does this exact route apply" question.
 */
export function canSeeKey(
  rawRole: unknown,
  key: string,
  overrides?: DashboardOverrides | null,
): boolean {
  if (canAccess(rawRole, key, overrides)) return true;
  const node = NODE_BY_KEY[key];
  if (node) return anyDescendantAccessible(node, rawRole, overrides);
  return false;
}

/**
 * Coerce arbitrary JSON into a DashboardOverrides map. Anything that doesn't
 * match the shape is dropped — never throws. Use this on the response of any
 * API that returns the column straight from Prisma.
 */
export function parseOverrides(raw: unknown): DashboardOverrides {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: DashboardOverrides = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === "ALLOWED" || v === "DENIED") out[k] = v;
  }
  return out;
}

// ─── CNS-only accounts (external CRM observers) ──────────────────────────────
// Accounts that should see ONLY the CNS (CRM → Lead) module on the portal
// homepage + sidebar — everything else locked, and the Ticket sub-module still
// restricted. Reuses the read-only-viewer email gate so one set
// (AGENCY_VIEW_EMAILS) controls both "view-only CRM" and "CNS-only homepage".

import { isReadOnlyViewer } from "@/lib/crm/operation-accounts";

export function isCnsOnlyAccount(email: string | null | undefined): boolean {
  return isReadOnlyViewer(email);
}

/**
 * Synthetic overrides that hide every module except CNS. Built from
 * DASHBOARD_TREE so a newly-added module is locked by default. Merged OVER the
 * account's real overrides (so it can't be widened by a permissive role).
 *   - every top-level module except `home` + `crm` → DENIED
 *   - `crm` + `crm.lead` → ALLOWED
 *   - `crm.ticket` → DENIED (ticket stays restricted)
 */
export function cnsOnlyOverrides(): DashboardOverrides {
  const o: DashboardOverrides = {};
  for (const node of DASHBOARD_TREE) {
    if (node.key === "home" || node.key === "crm") continue;
    o[node.key] = "DENIED";
  }
  o["crm"] = "ALLOWED";
  o["crm.lead"] = "ALLOWED";
  o["crm.ticket"] = "DENIED";
  return o;
}

// ─── Path-gated modules (real per-user enforcement in middleware) ───────────
//
// Everything above this line is UI-only, per the file header. These modules
// are the exception: they have real, distinct sub-page routes now exposed as
// grandchildren in the tree (Manpower Planning, Attendance, Recruitment,
// Employee Dashboard), and admins expect ticking/unticking one of those boxes
// in the permission modal to actually change what loads — not just what's
// shown in the sidebar. middleware.ts calls checkGatedPathOverride() for any
// pathname under these roots.
//
// Deliberately narrow: fa-system/pcm-system have their own SessionSync-driven
// per-role nav (see their DASHBOARD_TREE comments) and aren't part of this
// model; CRM/academy/inventory/etc. don't have per-page overrides defined
// yet. Extend PATH_GATED_MODULE_HREFS + the tree together when they do.
const PATH_GATED_MODULE_HREFS: readonly string[] = [
  "/manpower-schedule",
  "/attendance",
  "/recruitment",
  "/dashboard-employee-management",
];

function isGatedModuleHref(pathname: string): boolean {
  return PATH_GATED_MODULE_HREFS.some((base) => pathname === base || pathname.startsWith(base + "/"));
}

/**
 * Resolves `pathname` to the most specific DASHBOARD_TREE node covering it
 * (searching every depth, skipping "#" placeholders), returning its key and
 * whether it's a `contentless` hub. Returns null when `pathname` isn't under
 * one of PATH_GATED_MODULE_HREFS — callers should treat that as "not this
 * system's concern."
 */
type GatedMatch = { key: string; href: string; contentless: boolean };

// Longest matching href wins (a grandchild's href is always a longer, more
// specific match than its hub's), so a leaf key beats its ancestor hub key.
function longerHref(a: GatedMatch | null, b: GatedMatch | null): GatedMatch | null {
  if (!a) return b;
  if (!b) return a;
  return b.href.length > a.href.length ? b : a;
}

function findGatedMatch(node: DashboardNode, pathname: string): GatedMatch | null {
  let best: GatedMatch | null = null;
  if (node.href && node.href !== "#" && (pathname === node.href || pathname.startsWith(node.href + "/"))) {
    best = { key: node.key, href: node.href, contentless: !!node.contentless };
  }
  for (const child of node.children ?? []) {
    best = longerHref(best, findGatedMatch(child, pathname));
  }
  return best;
}

function resolveGatedPathKey(pathname: string): { key: string; contentless: boolean } | null {
  if (!isGatedModuleHref(pathname)) return null;

  let best: GatedMatch | null = null;
  for (const top of DASHBOARD_TREE) {
    best = longerHref(best, findGatedMatch(top, pathname));
  }

  return best ? { key: best.key, contentless: best.contentless } : null;
}

/**
 * Cheap pre-check middleware can use to decide whether it's worth fetching
 * the signed-in user's overrides from the DB at all (avoids a DB round trip
 * on every navigation for the vast majority of paths, which aren't gated).
 */
export function isPathGated(pathname: string): boolean {
  return isGatedModuleHref(pathname);
}

/**
 * Real server-side enforcement of admin-configured per-user overrides for
 * PATH_GATED_MODULE_HREFS. Deliberately overrides-only — it NEVER makes a
 * role-based decision, so accounts nobody has customized are unaffected and
 * fall straight through to the caller's existing role rule. Only fires when
 * an admin has actually ticked/unticked a box for this specific user.
 *
 * Returns:
 *   true / false — an explicit override (exact key, inherited from a granted
 *                  ancestor, or "some child of this hub is ALLOWED") decided
 *                  this path; honor it.
 *   null         — not a gated path, or no override applies here; fall back
 *                  to the caller's normal role-based rule.
 */
export function checkGatedPathOverride(
  pathname: string,
  overrides: DashboardOverrides | null | undefined,
): boolean | null {
  if (!overrides || Object.keys(overrides).length === 0) return null;

  const resolved = resolveGatedPathKey(pathname);
  if (!resolved) return null;

  const ov = resolveOverride(resolved.key, overrides);
  if (ov === "ALLOWED") return true;
  if (ov === "DENIED")  return false;

  // Contentless hub (e.g. the Manpower Planning tile grid): an ALLOWED
  // override on any child lets the hub itself load, so the user has
  // somewhere to click into.
  if (resolved.contentless) {
    const anyChildAllowed = Object.entries(overrides).some(
      ([k, v]) => v === "ALLOWED" && k.startsWith(resolved.key + "."),
    );
    if (anyChildAllowed) return true;
  }

  return null;
}

/** Flatten the tree into one ordered list of (parent, child?) pairs. */
export function flattenTree(): Array<{ parent: DashboardNode; child?: DashboardNode }> {
  const out: Array<{ parent: DashboardNode; child?: DashboardNode }> = [];
  for (const node of DASHBOARD_TREE) {
    out.push({ parent: node });
    for (const child of node.children ?? []) out.push({ parent: node, child });
  }
  return out;
}
