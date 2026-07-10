import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/nextauth';
import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import { hasAnyRole, isAdmin, isHOD, isHR, isAcademy, isSuperAdmin, type Role } from '@/lib/roles';

export type AuthResult =
  | { session: Session; error: null }
  | { session: null; error: NextResponse };

// Requires a logged-in user. Returns { error } with a 401 response if not.
export async function requireSession(): Promise<AuthResult> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return {
      session: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  return { session, error: null };
}

// Requires a logged-in user whose role is in the allowlist. Returns { error }
// with 401 if not logged in, 403 if logged in but role not permitted. The role
// is normalized via normalizeRole, so "branch_manager", "BM", etc. are handled.
export async function requireRole(allowed: readonly Role[]): Promise<AuthResult> {
  const { session, error } = await requireSession();
  if (error) return { session: null, error };
  const role = (session.user as { role?: unknown } | undefined)?.role;
  // SUPER_ADMIN bypasses every allowlist — they can hit any route handler.
  // Identity predicates (isHR, isBranchManager, ...) are intentionally NOT
  // affected by this so callers using them as identity checks (e.g. "show
  // the BM-specific dashboard layout") still behave correctly.
  if (isSuperAdmin(role)) return { session, error: null };
  if (!hasAnyRole(role, allowed)) {
    return {
      session: null,
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }
  return { session, error: null };
}

type SessionUser = { role?: unknown; branchName?: string | null };

// Returns true when the caller's role is allowed to act across branches
// (ADMIN, SUPER_ADMIN, HOD, HR). Other roles are scoped to their own branch.
export function canSeeAllBranches(session: { user?: SessionUser } | null): boolean {
  const role = session?.user?.role;
  return isAdmin(role) || isHOD(role) || isHR(role) || isAcademy(role);
}

// Returns a 403 NextResponse if the caller's role isn't allowed to act on
// `targetBranch`. Returns null when the operation is permitted.
//
// Permitted roles for cross-branch ops: ADMIN, SUPER_ADMIN, HOD.
// Other roles must have `targetBranch === session.user.branchName`.
//
// Interim helper. Step 3 replaces this with scopedDb(session) + can(...).
export function assertSameBranch(
  session: { user?: SessionUser } | null,
  targetBranch: string | null | undefined,
): NextResponse | null {
  if (canSeeAllBranches(session)) return null;
  if (targetBranch && targetBranch !== session?.user?.branchName) {
    return NextResponse.json({ error: 'Forbidden: cross-branch operation' }, { status: 403 });
  }
  return null;
}
