import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { isPreviewMode } from '@/lib/crm/preview-mode'
import { scopedDepartmentForEmail } from '@/lib/crm/departments'
import { isAgencyViewAccount } from '@/lib/crm/operation-accounts'
import { CrmProviders } from '@/components/crm/providers'
import { CrmShell } from '@/components/crm/shell'

export const metadata = {
  title: 'Ebright Nexus',
  description: 'Client Nexus System (CNS) — Ebright',
}

export default async function CrmProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth.api.getSession({ headers: await headers() })

  // Preview bypass is hard-gated to non-production by isPreviewMode().
  const previewMode = isPreviewMode()

  if (!session && !previewMode) {
    redirect('/login')
  }

  // Load ticket-module role + branch assignments so the shell can filter nav.
  // Swallow DB errors — a flaky connection shouldn't crash the whole page.
  let tktRole: string | null = null
  let tktBranchIds: string[] = []
  let hasBranchLink = false
  if (session?.user?.id) {
    try {
      const profile = await prisma.tkt_user_profile.findUnique({
        where: { user_id: session.user.id },
        include: { branches: { select: { branch_id: true } } },
      })
      tktRole = profile?.role ?? null
      tktBranchIds = profile?.branches.map((b) => b.branch_id) ?? []
    } catch (e) {
      console.warn('[CRM layout] Failed to load tkt profile:', (e as Error).message)
    }

    // If the user has no tkt profile (or is a regular tkt user) but is a CRM
    // admin, treat them as ticket super_admin so the Ticket sidebar exposes
    // Dashboard / Platforms / Branches / Users. Source of truth for "admin"
    // is the crm_user_branch role on any of their branch links.
    //
    // REGIONAL_MANAGER takes a separate path: it does NOT promote to
    // super_admin (no full tenant access), but it sets tktRole='regional_manager'
    // so the sidebar Region item becomes visible.
    let hasAdminLink = false
    try {
      const adminLink = await prisma.crm_user_branch.findFirst({
        where: {
          userId: session.user.id,
          role: { in: ['SUPER_ADMIN', 'AGENCY_ADMIN'] },
        },
        select: { id: true },
      })
      if (adminLink) {
        hasAdminLink = true
        if (!tktRole || tktRole === 'user') tktRole = 'super_admin'
      } else {
        // Not a super/agency admin — check for REGIONAL_MANAGER and tag the
        // sidebar role accordingly. Skipped when adminLink exists because
        // super_admin already covers the Region nav item's visibility.
        const rmLink = await prisma.crm_user_branch.findFirst({
          where: { userId: session.user.id, role: 'REGIONAL_MANAGER' },
          select: { id: true },
        })
        if (rmLink && (!tktRole || tktRole === 'user')) {
          tktRole = 'regional_manager'
        }
      }
    } catch (e) {
      console.warn('[CRM layout] Failed to load admin link:', (e as Error).message)
    }

    // Scoped department accounts are department-level ticket admins — never
    // elevate them to ticket super_admin even if they hold a CRM admin role
    // (marketing@ / operation@ are CRM SUPER_ADMIN but must stay dept-scoped).
    if (scopedDepartmentForEmail(session.user.email)) {
      tktRole = 'platform_admin'
    }

    // Agency-view accounts (CEO) get the full agency sidebar (super-level nav),
    // read-only via their AGENCY_ADMIN permissions — overrides the dept force
    // above. Their ticket DATA stays dept-scoped (handled in tkt-auth + the
    // ticket routes); only the nav breadth is widened here.
    if (isAgencyViewAccount(session.user.email)) {
      tktRole = 'super_admin'
    }

    // Awaiting-access gate: a real (non-preview) user with no branch link
    // can't be safely scoped to a tenant. Send them to the splash so they
    // know to ask an admin instead of seeing empty-state pages everywhere.
    // Admin links above already count, so super/agency admins always pass.
    try {
      if (hasAdminLink) {
        hasBranchLink = true
      } else {
        const anyLink = await prisma.crm_user_branch.findFirst({
          where: { userId: session.user.id },
          select: { id: true },
        })
        hasBranchLink = !!anyLink
      }
    } catch (e) {
      // DB hiccup — fail open so a transient outage doesn't lock everyone out.
      console.warn('[CRM layout] Failed to check branch link:', (e as Error).message)
      hasBranchLink = true
    }

    // Department accounts (ticket platform_admins) may legitimately have no CRM
    // branch link — they live in the ticket module only. Don't bounce them to
    // awaiting-access; their ticket profile is their access.
    if (!hasBranchLink && tktRole !== 'platform_admin' && !previewMode) {
      redirect('/crm/awaiting-access')
    }
  }

  const sessionProp = session
    ? {
        user: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name ?? null,
          tktRole,
          tktBranchIds,
        },
      }
    : {
        user: {
          id: 'preview-user',
          email: 'preview@ebright.my',
          name: 'Preview User',
          tktRole: 'super_admin' as const,
          tktBranchIds: [],
        },
      }

  return (
    <CrmProviders session={sessionProp}>
      <CrmShell session={sessionProp}>{children}</CrmShell>
    </CrmProviders>
  )
}
