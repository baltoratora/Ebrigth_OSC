import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { normalizeRole, ROLES, type Role } from "@/lib/roles";
import { isReadOnlyViewer } from "@/lib/crm/operation-accounts";

// ─── Read-only viewer (marketing-advisor monitor) write-block ────────────────
// Hard backstop for the view-only account (see AGENCY_VIEW_EMAILS): it may VIEW
// the whole lead CRM like a super admin but must never mutate anything. This
// catches every mutating request (HTTP method or RSC server action) under
// /crm + /api/crm, EXCEPT the ticket system and auth. Per-route guards are the
// first line; this guarantees a missed guard can't leak a write.
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isLeadCrmMutation(req: NextRequest): boolean {
  const p = req.nextUrl.pathname;
  const inCrm = p.startsWith("/crm") || p.startsWith("/api/crm");
  if (!inCrm) return false;
  // Tickets are explicitly out of scope; auth must keep working (login/session).
  if (/^\/(api\/)?crm\/(tickets|tkt-)/.test(p)) return false;
  if (p.startsWith("/api/crm/auth")) return false;
  if (p === "/crm/login") return false;
  // A mutation is either a write HTTP method or a server-action invocation
  // (Next sends those as POST with a `next-action` header to the page route).
  return MUTATING_METHODS.has(req.method) || req.headers.has("next-action");
}

// Runs on the Node.js runtime, not Edge. The Edge runtime cannot load
// @prisma/client without a driver adapter, and we need Prisma here to mirror
// the session-invalidation check that lives in lib/nextauth.ts's jwt()
// callback. getToken() only decrypts the JWT cookie — it does NOT invoke the
// jwt() callback, which means a stale token (issued before a password
// change on another device) would otherwise glide past middleware on direct
// page navigation. One indexed findUnique per page request closes that
// window.
export const runtime = "nodejs";

// ─── Role rules ─────────────────────────────────────────────────────────────
// Path-prefix-based role rules. First matching prefix wins — so list more
// specific prefixes before shorter ones that would also match.
//
// Any path NOT matched here only needs the user to be logged in.
// SUPER_ADMIN is granted everything via an explicit bypass below.
//
// Per-role intent:
//   BRANCH_MANAGER → /manpower-schedule (+ Inventory tile, gated client-side)
//   HR             → keeps prior management access EXCEPT /manpower-schedule
//   ACADEMY        → keeps prior access (+ Inventory tile, client-side)
//   FULL_TIME / PART_TIME → see EMPLOYEE_ALLOWED_PATHS below (very narrow)
const ROLE_RULES: Array<{ prefix: string; allowed: readonly Role[] }> = [
  { prefix: "/user-management",               allowed: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR, ROLES.ACADEMY] },
  { prefix: "/account-management",            allowed: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR] },
  { prefix: "/register-employee",             allowed: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR] },
  { prefix: "/dashboard-employee-management", allowed: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR, ROLES.HOD, ROLES.ACADEMY] },

  { prefix: "/manpower-schedule",             allowed: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.HOD] },

  { prefix: "/hr-dashboard",                  allowed: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR, ROLES.HOD] },
  { prefix: "/recruitment",                   allowed: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR, ROLES.HOD] },
  { prefix: "/onboarding",                    allowed: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR, ROLES.HOD] },
  { prefix: "/offboarding",                   allowed: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR, ROLES.HOD] },
  { prefix: "/annual-showcase",               allowed: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.ACADEMY, ROLES.HOD, ROLES.EXECUTIVE, ROLES.HR, ROLES.MARKETING] },
];

// FT/PT users see the same home/HRMS chrome as everyone else, with the
// locked-tile UI showing every other module as disabled. So we explicitly let
// them VIEW the navigation pages they need to reach the cost report, and
// redirect everything else back to the cost report.
//
// EMPLOYEE_ALLOWED_PATHS is enforced ahead of ROLE_RULES below so it cannot be
// widened accidentally by adding a new ROLE_RULES entry that happens to
// include FULL_TIME / PART_TIME.
const EMPLOYEE_FALLBACK_PATH = "/manpower-cost-report";
// FT/PT coaches may reach only two feature pages — the Manpower Cost Report
// (scoped to their own data by /api/manpower-cost) and the Staff Directory.
// /home + /dashboards/hrms are kept as the navigation shell (every other tile
// renders locked client-side); /profile stays for self-service. Anything else
// redirects to EMPLOYEE_FALLBACK_PATH.
const EMPLOYEE_ALLOWED_PATHS = [
  "/home",              // tile dashboard — non-HRMS tiles are locked client-side
  "/dashboards/hrms",   // HRMS hub — only the two allowed tiles are enabled
  "/manpower-cost-report",
  "/staff-directory",   // coaches may view the staff directory
  "/profile",           // standard self-service page
];
const EMPLOYEE_LOCKED_ROLES: readonly Role[] = [ROLES.FULL_TIME, ROLES.PART_TIME];

function matchRule(pathname: string) {
  return ROLE_RULES.find(
    (r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"),
  );
}

function isEmployeeAllowed(pathname: string): boolean {
  return EMPLOYEE_ALLOWED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// Covers dev (http, "next-auth.session-token") and prod (https,
// "__Secure-next-auth.session-token"). Deleting both is cheap and safe.
function clearSessionCookies(res: NextResponse): void {
  res.cookies.delete("next-auth.session-token");
  res.cookies.delete("__Secure-next-auth.session-token");
}

function redirectToLogin(
  req: NextRequest,
  opts: { withCallback: boolean; clearCookies: boolean },
): NextResponse {
  const url = new URL("/login", req.url);
  if (opts.withCallback) {
    const { pathname, search } = req.nextUrl;
    url.searchParams.set("callbackUrl", pathname + search);
  }
  const res = NextResponse.redirect(url);
  if (opts.clearCookies) clearSessionCookies(res);
  return res;
}

// ─── Middleware ─────────────────────────────────────────────────────────────

export async function middleware(req: NextRequest) {
  const isApi = req.nextUrl.pathname.startsWith("/api");

  // 0a. API fast-path: reads (and anything that isn't a lead-CRM mutation) need
  //     no middleware work — the route enforces its own auth. This keeps the
  //     /api/crm matcher (added only for the viewer write-block) cheap: no token
  //     decrypt, no DB, on the hot read path.
  if (isApi && !isLeadCrmMutation(req)) {
    return NextResponse.next();
  }

  // 1. Decrypt the JWT cookie. A malformed cookie or missing secret throws —
  //    we treat that the same as "no session".
  let token: Awaited<ReturnType<typeof getToken>>;
  try {
    token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  } catch {
    token = null;
  }

  // 0b. Read-only viewer (CEO monitor) hard write-block — covers /crm server
  //     actions AND /api/crm mutations. Runs before everything else so a missed
  //     per-route guard still can't leak a write.
  if (token?.email && isReadOnlyViewer(String(token.email)) && isLeadCrmMutation(req)) {
    return NextResponse.json(
      { error: "Read-only access — this account cannot modify the CRM." },
      { status: 403 },
    );
  }

  // API routes do their own role/scope enforcement and must not receive the
  // page-navigation redirects below (a redirect would corrupt a JSON/RSC
  // response). The viewer write-block above is the only middleware concern here.
  if (isApi) return NextResponse.next();

  if (!token) {
    return redirectToLogin(req, { withCallback: true, clearCookies: false });
  }

  // 2. Token must normalize to a known role. A null result here means the
  //    DB role column was hand-edited to something off-list, or the token is
  //    forged. Either way: clear the cookie and force re-login. Without this
  //    branch, ROLE_RULES would receive null elsewhere and a coach with a
  //    corrupted role could loop redirecting to /home.
  const role = normalizeRole(token.role);
  if (!role) {
    return redirectToLogin(req, { withCallback: false, clearCookies: true });
  }

  // 3. Session-revocation check. Mirrors lib/nextauth.ts's jwt() callback so
  //    the kick is immediate even on a pure middleware navigation —
  //    getToken() only decrypts the cookie, it doesn't trigger that callback.
  //    Reads from crm.SessionRevocation (a local OSC table, not the User
  //    FDW view), so the lookup is one indexed PK query against a tiny
  //    table.
  //
  //    Fail OPEN on DB error: a brief outage shouldn't sign everyone out at
  //    once. The jwt() callback will catch up the next time
  //    /api/auth/session fires.
  if (token.email && typeof token.iat === "number") {
    try {
      const revocation = await prisma.sessionRevocation.findUnique({
        where:  { email: String(token.email) },
        select: { revokedAfter: true },
      });

      // No row = no recorded revocation, trust the token. Otherwise compare
      // iat (seconds since epoch) against revokedAfter and clear the cookie
      // on a stale token.
      if (revocation?.revokedAfter) {
        const revokedAfterSec = Math.floor(revocation.revokedAfter.getTime() / 1000);
        if (token.iat < revokedAfterSec) {
          return redirectToLogin(req, { withCallback: false, clearCookies: true });
        }
      }
    } catch (err) {
      // Log so an outage is visible in monitoring, but continue.
      console.error("[middleware] revocation check DB error — failing open:", err);
    }
  }

  const { pathname } = req.nextUrl;

  // 4. Employee lockdown (PT/FT): allow the navigation shell paths so they
  //    can see the locked-tile chrome, and bounce anything else back to the
  //    cost report. Runs BEFORE ROLE_RULES so adding a new rule that
  //    accidentally includes FT/PT can't widen their access.
  if (EMPLOYEE_LOCKED_ROLES.includes(role)) {
    if (isEmployeeAllowed(pathname)) return NextResponse.next();
    return NextResponse.redirect(new URL(EMPLOYEE_FALLBACK_PATH, req.url));
  }

  // 5. SUPER_ADMIN bypasses every per-route rule.
  if (role === ROLES.SUPER_ADMIN) return NextResponse.next();

  // 6. Per-prefix role rules. Any path not in ROLE_RULES is allowed for any
  //    authenticated, non-locked role — the API layer is the actual data
  //    boundary, and this middleware is just navigation UX.
  const rule = matchRule(pathname);
  if (!rule) return NextResponse.next();
  if (rule.allowed.includes(role)) return NextResponse.next();

  // Logged in but wrong role — send to /home with a flag so the UI can
  // surface "you don't have access to X" if it wants to.
  const homeUrl = new URL("/home", req.url);
  homeUrl.searchParams.set("forbidden", pathname);
  return NextResponse.redirect(homeUrl);
}

export const config = {
  // Run on every page navigation, but skip:
  //   - API routes (they enforce their own role/scope and return JSON 401/403)
  //   - Static assets (_next/static, _next/image, favicon)
  //   - /login, /signup and /forgot-password (public auth pages)
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|login|signup|forgot-password|showcase-register|showcase-checkin).*)",
    // Also run on /api/crm so the read-only viewer write-block can backstop API
    // mutations. The fast-path in middleware() returns immediately for API reads,
    // so this adds no cost to the hot path.
    "/api/crm/:path*",
  ],
};
