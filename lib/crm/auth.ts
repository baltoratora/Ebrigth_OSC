/**
 * Better Auth configuration for the CRM module.
 *
 * Uses the shared Postgres database via the Prisma adapter.
 * Tables: crm_auth_user, crm_auth_session, crm_auth_account, crm_auth_verification
 */

import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import bcrypt from 'bcryptjs'
import { decode as decodeNextAuthJwt } from 'next-auth/jwt'
import { randomUUID } from 'crypto'
import { prisma } from './db'
import { isPreviewMode } from './preview-mode'

const secret = process.env.BETTER_AUTH_SECRET
// SKIP_ENV_VALIDATION=1 is set during `next build` (see Dockerfile + lib/env.ts).
// `next build` collects page data with NODE_ENV=production but no real secrets,
// so this throw would block every build otherwise. Runtime startup still has
// the secret loaded from env_file, so production servers still fail loudly.
if (
  !secret &&
  process.env.NODE_ENV === 'production' &&
  process.env.SKIP_ENV_VALIDATION !== '1'
) {
  throw new Error('[CRM] BETTER_AUTH_SECRET environment variable is required in production')
}

const _auth = betterAuth({
  secret: secret ?? 'dev-secret-change-in-production',
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000',
  basePath: '/api/crm/auth',

  database: prismaAdapter(prisma, {
    provider: 'postgresql',
    usePlural: false,
  }),

  // Map Better Auth's default model names to our crm_auth_* tables.
  // Replaces the old `modelPrefix` option that newer better-auth removed.
  user:         { modelName: 'crm_auth_user' },
  account:      { modelName: 'crm_auth_account' },
  verification: { modelName: 'crm_auth_verification' },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    password: {
      hash: (password: string) => bcrypt.hash(password, 10),
      verify: ({ password, hash }: { password: string; hash: string }) =>
        bcrypt.compare(password, hash),
    },
  },

  trustedOrigins: [
    'http://localhost:3000',
    process.env.NEXTAUTH_URL ?? '',
  ].filter(Boolean),

  session: {
    modelName: 'crm_auth_session',
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
})

// ─── Preview mode session wrapper ─────────────────────────────────────────────
// When CRM_PREVIEW_MODE=true, every getSession() call returns a fake session so
// routes work without an actual login. Two cookies tune this:
//   crm_preview_exit  = "1"      → skip the preview bypass, force the real login form
//   crm_preview_user  = "<uid>"  → impersonate a specific crm_auth_user
// Without either cookie, the bypass falls back to admin@ebright.my.

function parseCookie(headers: Headers, name: string): string | undefined {
  const raw = headers.get('cookie')
  if (!raw) return undefined
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return decodeURIComponent(rest.join('='))
  }
  return undefined
}

let _defaultPreviewUserId: string | null = null

async function getDefaultPreviewUserId(): Promise<string | null> {
  if (_defaultPreviewUserId) return _defaultPreviewUserId
  try {
    const u = await prisma.crm_auth_user.findFirst({
      where: { email: 'admin@ebright.my' },
      select: { id: true },
    })
    // Only cache a successful hit — don't cache null so a transient DB failure
    // doesn't permanently disable preview mode for the lifetime of the process.
    if (u?.id) _defaultPreviewUserId = u.id
    return _defaultPreviewUserId
  } catch {
    return null
  }
}

// ─── SSO bridge from NextAuth (HRMS) ─────────────────────────────────────────
// One login at /login (NextAuth) gives you access to the CRM too. We decode
// the next-auth JWT cookie and treat any HRMS user as a logged-in CRM user,
// auto-provisioning a crm_auth_user row + branch link the first time we see
// them.

const NEXTAUTH_COOKIE_NAMES = [
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
] as const

async function readNextAuthEmail(headers: Headers): Promise<{ email: string; name?: string } | null> {
  if (!process.env.NEXTAUTH_SECRET) return null
  let cookieValue: string | undefined
  for (const name of NEXTAUTH_COOKIE_NAMES) {
    const v = parseCookie(headers, name)
    if (v) {
      cookieValue = v
      break
    }
  }
  if (!cookieValue) return null
  try {
    const token = await decodeNextAuthJwt({
      token: cookieValue,
      secret: process.env.NEXTAUTH_SECRET,
    })
    const email = token?.email as string | undefined
    if (!email) return null
    return { email, name: (token?.name as string | undefined) ?? undefined }
  } catch {
    // Bad/expired token — let the rest of the resolver decide what to do.
    return null
  }
}

// Map an HRFS-side role string (whatever the HRMS stores in its `User.role`
// column — "SUPER_ADMIN", "BRANCH_MANAGER", "Part_Time", "Full_Time", "HR",
// "Intern", etc.) to the four-role CRM RBAC enum. Anything not explicitly
// promoted falls through to BRANCH_STAFF — the most restrictive level.
//
// IMPORTANT: do NOT default unknown roles to SUPER_ADMIN. The previous
// implementation auto-granted SUPER_ADMIN to every newly-provisioned SSO
// user, which meant any HRMS account (an intern, a part-time coach) became
// a CRM god on first login. This map closes that hole.
function mapHrfsRoleToCrmRole(hrfsRole: string | null | undefined): 'SUPER_ADMIN' | 'AGENCY_ADMIN' | 'REGIONAL_MANAGER' | 'BRANCH_MANAGER' | 'BRANCH_STAFF' {
  const r = (hrfsRole ?? '').trim().toUpperCase().replace(/[\s-]/g, '_')
  switch (r) {
    case 'SUPER_ADMIN':
      return 'SUPER_ADMIN'
    // NOTE: AGENCY_ADMIN is intentionally NOT auto-provisioned from HRFS. It is
    // a CRM-only privilege that may be granted ONLY through the CRM team /
    // branch-access UI by a super admin. An HRFS "AGENCY_ADMIN" therefore falls
    // through to BRANCH_STAFF here until a super admin promotes them in-app.
    case 'REGIONAL_MANAGER':
      return 'REGIONAL_MANAGER'
    case 'BRANCH_MANAGER':
      return 'BRANCH_MANAGER'
    default:
      // Coaches (Full_Time / Part_Time), HR, HOD, Executive, Intern, AGENCY_ADMIN, etc.
      return 'BRANCH_STAFF'
  }
}

async function getOrCreateCrmUserForEmail(email: string, name?: string) {
  // Atomic upsert. Two concurrent requests racing through the SSO bridge
  // (e.g. several React Server Components on the same page kicking off
  // getSession() in parallel) used to both pass a findFirst → null check
  // and then both call create(), with the second hitting the email
  // unique constraint. upsert avoids the race entirely.
  //
  // We also detect "is this row brand new?" by comparing createdAt and
  // updatedAt — Prisma sets them equal on insert and only updatedAt on
  // update, so equal timestamps means we just inserted and need to
  // auto-grant a branch role derived from HRFS.
  const user = await prisma.crm_auth_user.upsert({
    where:  { email },
    update: {}, // existing row → don't overwrite anything
    create: {
      id: randomUUID(),
      email,
      name: name ?? email,
      emailVerified: true,
    },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  const isNew = user.createdAt.getTime() === user.updatedAt.getTime()

  // Auto-link only on initial provisioning. Pulls role + branch from the
  // HRFS source of truth (via the `crm.hrfs_users` FDW view) so that an
  // HR intern in HRFS becomes a CRM BRANCH_STAFF — not SUPER_ADMIN.
  if (isNew) {
    try {
      // 1. Look up the user's HRFS row (live FDW read).
      const hrfsRows = await prisma.$queryRaw<Array<{
        role: string | null
        branchName: string | null
      }>>`
        SELECT role, "branchName"
        FROM crm.hrfs_users
        WHERE email = ${email}
        LIMIT 1
      `
      const hrfs = hrfsRows[0] ?? null

      const crmRole = mapHrfsRoleToCrmRole(hrfs?.role)
      const hrfsBranch = hrfs?.branchName?.trim()

      // 2. Find a CRM branch that matches HRFS's branchName (case-insensitive
      //    substring — CRM names are like "17 Ebright (Bandar Rimbayu)"
      //    while HRFS often stores just "Rimbayu").
      let branch: { id: string; tenantId: string } | null = null
      if (hrfsBranch) {
        branch = await prisma.crm_branch.findFirst({
          where: { name: { contains: hrfsBranch, mode: 'insensitive' } },
          select: { id: true, tenantId: true },
        })
      }
      // For elevated roles only, fall back to the first branch so they at
      // least have a tenant scope. Lower roles get NO branch link if HRFS
      // didn't tell us where they belong — they'll see "Awaiting access"
      // until an admin manually grants them via the branch-access modal.
      if (!branch && (crmRole === 'SUPER_ADMIN' || crmRole === 'AGENCY_ADMIN')) {
        branch = await prisma.crm_branch.findFirst({
          select: { id: true, tenantId: true },
          orderBy: { createdAt: 'asc' },
        })
      }

      if (branch) {
        await prisma.crm_user_branch.create({
          data: {
            tenantId: branch.tenantId,
            userId:   user.id,
            branchId: branch.id,
            role:     crmRole,
          },
        })
      }

      // 3. Audit trail — record what role we provisioned, so a security
      //    review can spot anomalies (e.g. someone elevating themselves
      //    by changing their HRFS role then hitting CRM).
      console.log(
        `[CRM auth SSO] Provisioned ${email} as ${crmRole}` +
        (branch ? ` on branch ${branch.id}` : ' with no branch (awaiting manual grant)') +
        ` (HRFS role="${hrfs?.role ?? 'n/a'}", HRFS branch="${hrfsBranch ?? 'n/a'}")`
      )
    } catch (e) {
      console.warn('[CRM auth SSO] Auto-link failed:', (e as Error).message)
    }
  }

  return { id: user.id, email: user.email, name: user.name }
}

async function loadUserById(id: string) {
  try {
    return await prisma.crm_auth_user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true },
    })
  } catch (e) {
    // DB unreachable or transient error — treat as user-not-found so auth wrapper
    // can fall back to the default admin instead of throwing a 500 through the page.
    console.warn('[CRM auth] loadUserById failed, falling back to default admin:', (e as Error).message)
    return null
  }
}

const originalGetSession = _auth.api.getSession.bind(_auth.api)

/**
 * Returns the impersonated user IFF:
 *   - cookie `crm_preview_user` is set, AND
 *   - the *real* session belongs to a SUPER_ADMIN / AGENCY_ADMIN, OR we're
 *     in dev preview mode (which doesn't require auth).
 *
 * Used to layer impersonation on top of any normal session — the dropdown
 * in the topbar's "Login as user" picker uses this.
 */
async function tryImpersonate(
  headers: Headers,
  realUserId: string | null,
  previewMode: boolean,
): Promise<ReturnType<typeof synthSession> | null> {
  if (parseCookie(headers, 'crm_preview_exit') === '1') return null
  const targetId = parseCookie(headers, 'crm_preview_user')
  if (!targetId || targetId === realUserId) return null

  // Dev preview mode bypasses the auth check (no real user needed).
  if (!previewMode) {
    if (!realUserId) return null
    try {
      const elevated = await prisma.crm_user_branch.findFirst({
        where: {
          userId: realUserId,
          role: { in: ['SUPER_ADMIN', 'AGENCY_ADMIN'] },
        },
        select: { id: true },
      })
      if (!elevated) return null
    } catch {
      return null
    }
  }

  const u = await loadUserById(targetId)
  return u ? synthSession(u) : null
}

_auth.api.getSession = (async (...args: Parameters<typeof originalGetSession>) => {
  const headers = (args[0] as { headers?: Headers } | undefined)?.headers
  // Hard-gates the preview bypass when NODE_ENV=production. See lib/crm/preview-mode.ts.
  const previewMode = isPreviewMode()

  // ── 1. SSO bridge — trust a NextAuth JWT cookie if present ──────────────
  //   Lets a user log in once at /login (HRMS) and reach the CRM without a
  //   second prompt. Auto-provisions a matching crm_auth_user on first sight.
  if (headers) {
    const fromNextAuth = await readNextAuthEmail(headers)
    if (fromNextAuth) {
      const u = await getOrCreateCrmUserForEmail(fromNextAuth.email, fromNextAuth.name)
      if (u) {
        // If the SSO'd user is a super admin and has set an impersonation
        // cookie, return the impersonated session instead of their own.
        const imp = await tryImpersonate(headers, u.id, previewMode)
        return imp ?? synthSession(u)
      }
    }
  }

  // ── 2. Better Auth (only if a real BA session cookie is present) ────────
  // Fast path: in preview mode, skip the DB-backed Better Auth lookup entirely
  // unless there's actually a session cookie present. Saves ~100–200ms remote
  // round-trip per request when no one is really logged in.
  const hasSessionCookie =
    headers &&
    (parseCookie(headers, 'better-auth.session_token') !== undefined ||
      parseCookie(headers, '__Secure-better-auth.session_token') !== undefined)

  const real = previewMode && !hasSessionCookie ? null : await originalGetSession(...args)
  if (real) {
    // Layer impersonation on top of a Better Auth session too.
    if (headers) {
      const realUserId = (real as { user?: { id?: string } }).user?.id ?? null
      const imp = await tryImpersonate(headers, realUserId, previewMode)
      if (imp) return imp
    }
    return real
  }
  if (!previewMode) return real

  if (headers) {
    if (parseCookie(headers, 'crm_preview_exit') === '1') return real
    const impersonateId = parseCookie(headers, 'crm_preview_user')
    if (impersonateId) {
      const u = await loadUserById(impersonateId)
      if (u) return synthSession(u)
    }
  }

  const uid = await getDefaultPreviewUserId()
  if (!uid) return real
  return synthSession({ id: uid, email: 'admin@ebright.my', name: 'Preview Admin' })
}) as typeof originalGetSession

function synthSession(u: { id: string; email: string; name: string | null }) {
  return {
    session: {
      id: 'preview-session',
      userId: u.id,
      token: 'preview',
      expiresAt: new Date(Date.now() + 3600_000),
      createdAt: new Date(),
      updatedAt: new Date(),
      ipAddress: null,
      userAgent: null,
    },
    user: {
      id: u.id,
      email: u.email,
      emailVerified: true,
      name: u.name ?? 'Preview User',
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  } as unknown as Awaited<ReturnType<typeof _auth.api.getSession>>
}

export const auth = _auth
export type Auth = typeof auth
