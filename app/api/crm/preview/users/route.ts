import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { prisma } from '@/lib/crm/db'
import { isPreviewMode } from '@/lib/crm/preview-mode'
import { auth } from '@/lib/crm/auth'

/**
 * Lists all crm_auth_users that can be impersonated.
 *
 * Two gates:
 *   1. Dev preview mode (CRM_PREVIEW_MODE=true and NODE_ENV != production) —
 *      no auth required, useful for local testing.
 *   2. Production: caller must have SUPER_ADMIN or AGENCY_ADMIN role on at
 *      least one branch. The role check goes through crm_user_branch — the
 *      same source of truth used everywhere else for "elevated" privilege.
 */
async function callerIsSuperAdmin(): Promise<boolean> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return false
  const link = await prisma.crm_user_branch.findFirst({
    where: {
      userId: session.user.id,
      role: { in: ['SUPER_ADMIN', 'AGENCY_ADMIN'] },
    },
    select: { id: true },
  })
  return !!link
}

export async function GET() {
  if (!isPreviewMode() && !(await callerIsSuperAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Pull from BOTH stores so the picker shows every account that could
  // potentially log into the CRM:
  //   - crm_auth_user: people who already logged in once (SSO-provisioned)
  //   - User (HRMS):   people who exist in HRMS but have never logged in
  // We union by email so a user who exists in both shows up exactly once,
  // taking the crm_auth_user.id when available (so the impersonation cookie
  // works without a provisioning round-trip).
  const [crmUsers, hrmsUsers] = await Promise.all([
    prisma.crm_auth_user.findMany({
      orderBy: { email: 'asc' },
      select: { id: true, email: true, name: true },
      take: 200,
    }),
    prisma.user.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { email: 'asc' },
      select: { email: true, name: true, role: true, branchName: true },
      take: 500,
    }),
  ])

  const ids = crmUsers.map((u) => u.id)
  const tktProfiles = await prisma.tkt_user_profile.findMany({
    where: { user_id: { in: ids } },
    select: { user_id: true, role: true },
  })
  const crmBranches = await prisma.crm_user_branch.findMany({
    where: { userId: { in: ids } },
    select: { userId: true, role: true },
  })
  const tktMap = new Map(tktProfiles.map((p) => [p.user_id, p.role]))
  const crmMap = new Map(crmBranches.map((b) => [b.userId, b.role]))

  // crm_auth_user rows first — keyed by lower-cased email for case-insensitive merge.
  const byEmail = new Map<
    string,
    {
      id: string | null
      email: string
      name: string | null
      crmRole: string | null
      tktRole: string | null
      hrmsRole: string | null
      hrmsBranchName: string | null
      provisioned: boolean
    }
  >()

  for (const u of crmUsers) {
    byEmail.set(u.email.toLowerCase(), {
      id: u.id,
      email: u.email,
      name: u.name,
      crmRole: crmMap.get(u.id) ?? null,
      tktRole: tktMap.get(u.id) ?? null,
      hrmsRole: null,
      hrmsBranchName: null,
      provisioned: true,
    })
  }

  // Layer HRMS info on top — fills hrmsRole/hrmsBranchName, and adds new
  // entries for users who haven't logged in yet (id stays null until they do
  // — the impersonation endpoint provisions them on first click).
  for (const u of hrmsUsers) {
    const key = u.email.toLowerCase()
    const existing = byEmail.get(key)
    if (existing) {
      existing.hrmsRole = u.role
      existing.hrmsBranchName = u.branchName
    } else {
      byEmail.set(key, {
        id: null,
        email: u.email,
        name: u.name,
        crmRole: null,
        tktRole: null,
        hrmsRole: u.role,
        hrmsBranchName: u.branchName,
        provisioned: false,
      })
    }
  }

  const merged = Array.from(byEmail.values()).sort((a, b) =>
    a.email.localeCompare(b.email),
  )

  return NextResponse.json(merged)
}
