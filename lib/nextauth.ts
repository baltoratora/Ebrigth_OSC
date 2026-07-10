import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { isSessionValid } from "@/lib/session-validity";

// Max staleness for the role/status cached in a JWT. After this window, the
// next request triggers a DB lookup so demoting/deactivating a user takes
// effect without requiring them to log out.
const ROLE_REFRESH_MS = 60_000;

// Source of truth for user credentials. We authenticate against the FDW view
// `crm.hrfs_users`, which proxies live to ebright_hrfs.public."User" via
// postgres_fdw. This means a user added in HRMS can immediately log in here
// — no replication, no migration step. Falls back to the local crm."User"
// table if the FDW isn't available (e.g. in a dev DB without the link).
type AuthUserRow = {
  id: number;
  email: string;
  passwordHash: string;
  role: string;
  branchName: string | null;
  name: string | null;
  status: string;
};

async function findAuthUserByEmail(email: string): Promise<AuthUserRow | null> {
  // Try the FDW view first (live HRFS data).
  try {
    const rows = await prisma.$queryRaw<AuthUserRow[]>`
      SELECT id, email, "passwordHash", role, "branchName", name, status
      FROM crm.hrfs_users
      WHERE email = ${email}
      LIMIT 1
    `;
    if (rows.length) return rows[0];
  } catch {
    // FDW view doesn't exist or HRFS link is down — fall through to local.
  }

  // Local fallback (matches the legacy behavior).
  const local = await prisma.user.findUnique({ where: { email } });
  return local ? (local as unknown as AuthUserRow) : null;
}

// Session revocation lives on a local crm.SessionRevocation table that OSC
// owns end-to-end — separate from crm."User" (an FDW view of HRFS, where DDL
// can't run). A null return means "no recorded revocation, trust the token".
async function readRevokedAfter(email: string): Promise<Date | null> {
  try {
    const row = await prisma.sessionRevocation.findUnique({
      where:  { email },
      select: { revokedAfter: true },
    });
    return row?.revokedAfter ?? null;
  } catch {
    return null;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email:    { label: "Username/Email", type: "text" },
        password: { label: "Password",       type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await findAuthUserByEmail(credentials.email);
        if (!user) return null;
        if (user.status !== "ACTIVE") return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        // Non-fatal: if the column is missing on this environment or the row
        // lives only behind the FDW view, this update will throw — but a
        // best-effort login-tracking write must never block sign-in.
        try {
          await prisma.user.update({
            where: { id: user.id },
            data: { lastLoggedInAt: new Date() },
          });
        } catch {
          /* swallow — sign-in proceeds without the timestamp update */
        }

        return {
          id:         user.id.toString(),
          email:      user.email,
          name:       user.name,
          role:       user.role,
          branchName: user.branchName,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // On sign-in, seed the token from the authorize() return value.
      if (user) {
        token.name       = user.name;
        token.role       = user.role;
        token.branchName = user.branchName;
        token.checkedAt  = Date.now();
        return token;
      }

      if (!token.email) return token;

      const email  = String(token.email);
      const dbUser = await findAuthUserByEmail(email);

      // Account gone (or never existed) → kill the session.
      if (!dbUser) {
        return null as unknown as typeof token;
      }

      const revokedAfter = await readRevokedAfter(email);

      // Inactive or revoked (iat predates the latest revocation) → kill.
      // Same check middleware.ts runs, kept in one place via isSessionValid().
      //
      // NextAuth v4 accepts a null return from jwt() at runtime (it clears
      // the session cookie and the next getToken() returns null), but its
      // public TypeScript signature only exposes Awaitable<JWT>. The cast
      // matches the documented runtime contract.
      if (!isSessionValid(token, { status: dbUser.status, revokedAfter })) {
        return null as unknown as typeof token;
      }

      // Re-read role/branch at most once per ROLE_REFRESH_MS. A role change
      // in the DB takes effect within ~60s without forcing the user to log
      // out.
      const checkedAt = token.checkedAt ?? 0;
      if (Date.now() - checkedAt >= ROLE_REFRESH_MS) {
        token.role       = dbUser.role;
        token.branchName = dbUser.branchName;
        token.name       = dbUser.name;
        token.checkedAt  = Date.now();
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.name       = token.name;
        session.user.role       = token.role;
        session.user.branchName = token.branchName;
      }
      return session;
    },
  },
  pages:   { signIn: '/login' },
  session: { strategy: 'jwt' },
  secret:  process.env.NEXTAUTH_SECRET,
};
