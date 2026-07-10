import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { resolveBranchAccess } from '@/lib/crm/branch-access'
import { BranchesAdminClient, type BranchRow } from '@/components/crm/branches/branches-admin-client'

export const metadata = { title: 'Branches | Ebright Nexus' }
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function BranchesAdminPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) redirect('/login')

  const access = await resolveBranchAccess(session.user.id)
  if (!access) redirect('/crm/awaiting-access')

  // Tenant-wide admin page — gate to elevated roles only. Non-admins land
  // back on their dashboard with no error UI since the sidebar item is
  // already hidden from them.
  if (!access.elevated) redirect('/crm/dashboard')

  const rows = await prisma.crm_branch.findMany({
    where: { tenantId: access.tenantId },
    orderBy: { name: 'asc' },
    select: {
      id:        true,
      name:      true,
      code:      true,
      region:    true,
      address:   true,
      phone:     true,
      email:     true,
      createdAt: true,
    },
  })

  const branches: BranchRow[] = rows.map((b) => ({
    id:      b.id,
    name:    b.name,
    code:    b.code,
    region:  (b.region as 'A' | 'B' | 'C' | null) ?? null,
    address: b.address,
    phone:   b.phone,
    email:   b.email,
  }))

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
            Branches
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Tenant-wide branch directory. Renames + region edits propagate
            instantly. Adding a branch here auto-creates the kanban pipeline
            and ticket-module branch row.
          </p>
        </div>
      </header>

      <BranchesAdminClient initial={branches} />
    </div>
  )
}
