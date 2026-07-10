import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { resolveBranchAccess } from '@/lib/crm/branch-access'
import { RegionDashboard } from './region-dashboard'

export const metadata = {
  title: 'Region | Ebright Nexus',
}

/**
 * Region performance — role-aware scope.
 *
 *   • SUPER_ADMIN / AGENCY_ADMIN  (elevated)   → every region (A / B / C)
 *   • REGIONAL_MANAGER            (scoped)     → only the region(s) covered
 *                                                by their crm_user_branch links
 *   • anyone else                              → redirected to /crm/dashboard
 *                                                (sidebar already hides the
 *                                                link; this is the
 *                                                URL-typing defence)
 *
 * The server component does auth + role gating; the client component
 * (RegionDashboard) handles filter state, data fetching, and the
 * day-distribution grid render. /api/crm/region/day-distribution re-enforces
 * the same role scope server-side.
 */
export default async function RegionPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) redirect('/login')

  const access = await resolveBranchAccess(session.user.id)
  if (!access) redirect('/crm/awaiting-access')

  if (!access.elevated) {
    const rmLink = await prisma.crm_user_branch.findFirst({
      where: { userId: session.user.id, role: 'REGIONAL_MANAGER' },
      select: { id: true },
    })
    if (!rmLink) redirect('/crm/dashboard')
  }

  return <RegionDashboard />
}
