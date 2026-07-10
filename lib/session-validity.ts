// Shared session-validity check.
//
// Both middleware.ts (every page navigation) and lib/nextauth.ts's jwt()
// callback (every /api/auth/session call and every getServerSession()) need
// to ask the same question: is this token still valid?
//
// We split the answer into two inputs that live in different places:
//   - `status` lives on the User row, which in production is the FDW view
//     crm."User" pointing at ebright_hrfs. Owned by HRMS.
//   - `revokedAfter` lives on the local crm.SessionRevocation table, written
//     by /api/auth/change-password. Null = no recorded revocation, trust the
//     token.
//
// Returning false means the caller should:
//   - In middleware: clear the cookie + redirect to /login.
//   - In nextauth.ts: return null from the jwt callback.

export type SessionCheckInputs = {
  status:       string;
  revokedAfter: Date | null;
};

// Token shape is intentionally `unknown` — NextAuth's JWT type extends
// `Record<string, unknown>` plus `DefaultJWT`, neither of which declares
// `iat` statically (NextAuth attaches it at sign time), so a strict
// `{ iat?: unknown }` signature triggers the "weak type / no properties in
// common" TS check. Accepting `unknown` and pulling `iat` defensively
// side-steps the mismatch.
export function isSessionValid(token: unknown, input: SessionCheckInputs): boolean {
  if (input.status !== "ACTIVE") return false;

  const iat = readIat(token);
  if (input.revokedAfter && typeof iat === "number") {
    const revokedAfterSec = Math.floor(input.revokedAfter.getTime() / 1000);
    if (iat < revokedAfterSec) return false;
  }

  return true;
}

function readIat(token: unknown): unknown {
  if (token === null || typeof token !== "object") return undefined;
  return (token as { iat?: unknown }).iat;
}
