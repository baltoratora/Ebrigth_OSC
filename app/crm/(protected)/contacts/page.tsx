import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { resolveBranchAccess } from '@/lib/crm/branch-access'
import { hasPermission } from '@/lib/crm/permissions'
import { ContactsPageClient } from './contacts-page-client'

export const dynamic = 'force-dynamic'

export default async function ContactsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) redirect('/crm/login')

  const userBranch = await prisma.crm_user_branch.findFirst({
    where: { userId: session.user.id },
    include: {
      branch: {
        include: {
          pipelines: {
            include: {
              stages: { orderBy: { order: 'asc' } },
            },
          },
          tags: true,
        },
      },
    },
  })

  if (!userBranch) redirect('/crm/login')

  const tenantId = userBranch.tenantId
  const branchId = userBranch.branchId

  // Load lead sources, users, branches for the tenant
  const [leadSources, users, branches] = await Promise.all([
    prisma.crm_lead_source.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.crm_user_branch.findMany({
      where: { tenantId },
      distinct: ['userId'],
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
    }),
    prisma.crm_branch.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    }),
  ])

  const stages = userBranch.branch.pipelines.flatMap((p) => p.stages)
  const tags = userBranch.branch.tags

  // Only SUPER_ADMIN may delete contacts (the deleteContact action re-checks).
  const access = await resolveBranchAccess(session.user.id)
  const canDelete = access ? hasPermission(access.role, 'contacts:delete') : false

  const usersData = users.map((ub) => ({
    id: ub.user.id,
    name: ub.user.name,
    email: ub.user.email,
    image: ub.user.image,
  }))

  return (
    <ContactsPageClient
      branchId={branchId}
      tenantId={tenantId}
      currentUserId={session.user.id}
      stages={stages.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
      leadSources={leadSources}
      users={usersData}
      branches={branches}
      tags={tags.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
      canDelete={canDelete}
    />
  )
}
