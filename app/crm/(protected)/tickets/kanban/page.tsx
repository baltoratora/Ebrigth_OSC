import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { resolveBranchAccess } from '@/lib/crm/branch-access'
import { getTktSession } from '@/lib/crm/tkt-auth'
import { departmentNameForSubType } from '@/lib/crm/departments'
import { TicketKanbanBoard, type TicketCard, type PlatformOption } from '@/components/crm/tickets/TicketKanbanBoard'

export const dynamic = 'force-dynamic'

/**
 * Ticket System kanban — opportunity-style view of every ticket in the tenant
 * grouped by status. Super-admin / agency-admin only. Branch managers and HR
 * have no business reordering tickets across the funnel.
 *
 * Stages map 1:1 to tkt_ticket.status:
 *   received    → "New Ticket Received"
 *   approved    → "Approved"
 *   rejected    → "Rejected"
 *   in_progress → "In Progress"
 *   complete    → "Finish"
 *
 * URL `?branch=NN` scopes the board to a single branch — driven by the topbar
 * branch switcher (see TicketKanbanBoard's branch-context sync).
 */
export default async function TicketKanbanPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; dept?: string }>
}) {
  const sp = await searchParams
  const branchNumber = sp.branch ?? null
  const deptFilter = sp.dept ?? null
  const hdrs = await headers()
  const session = await auth.api.getSession({ headers: hdrs })
  if (!session?.user?.id) redirect('/login')

  const access = await resolveBranchAccess(session.user.id)
  const tkt = await getTktSession(hdrs)

  // Who sees the board:
  //   • Super admins (CRM elevated / HRMS super/agency / tkt super_admin) → ALL tickets.
  //   • Department platform_admins → ONLY their own platform(s)' tickets.
  const hrmsRole = (session.user as { role?: string } | undefined)?.role
  // A scoped DEPARTMENT account is never a super-viewer here, even if it holds
  // an elevated CRM role (the CEO is AGENCY_ADMIN for leads but stays scoped to
  // its own department's tickets).
  const isSuper =
    !tkt?.departmentSubType &&
    ((access?.elevated ?? false) ||
      hrmsRole === 'SUPER_ADMIN' || hrmsRole === 'AGENCY_ADMIN' ||
      tkt?.role === 'super_admin')
  const isDeptAdmin = !isSuper && tkt?.role === 'platform_admin'
  if (!isSuper && !isDeptAdmin) {
    redirect('/crm/tickets')
  }

  const tenantId = access?.tenantId ?? tkt?.tenantId
  if (!tenantId) redirect('/login')

  // Scope: super sees all; a scoped DEPARTMENT account sees only tickets
  // directed to its department (by sub_type); any other platform_admin sees
  // its assigned platform(s).
  const ticketScope = isSuper
    ? (deptFilter ? { sub_type: deptFilter } : {})
    : tkt?.departmentSubType
      ? { sub_type: tkt.departmentSubType }
      : { platform_id: { in: tkt?.platformIds.length ? tkt.platformIds : ['__none__'] } }

  // Pull every active ticket. The "Finish" column can have thousands; we cap
  // it at 200 most-recent here and rely on the kanban's virtualization for
  // smooth scroll. Open columns are usually small.
  const branchFilter = branchNumber
    ? { branch: { branch_number: branchNumber } }
    : {}

  const [open, finished, platformsRaw] = await Promise.all([
    prisma.tkt_ticket.findMany({
      where: { tenant_id: tenantId, status: { not: 'complete' }, ...branchFilter, ...ticketScope },
      orderBy: { created_at: 'desc' },
      take: 1000,
      select: {
        id: true,
        ticket_number: true,
        status: true,
        sub_type: true,
        created_at: true,
        platform: { select: { id: true, name: true, slug: true, code: true, accent_color: true } },
        branch:   { select: { id: true, name: true, branch_number: true, code: true } },
      },
    }),
    prisma.tkt_ticket.findMany({
      where: { tenant_id: tenantId, status: 'complete', ...branchFilter, ...ticketScope },
      orderBy: { completed_at: 'desc' },
      take: 200,
      select: {
        id: true,
        ticket_number: true,
        status: true,
        sub_type: true,
        created_at: true,
        platform: { select: { id: true, name: true, slug: true, code: true, accent_color: true } },
        branch:   { select: { id: true, name: true, branch_number: true, code: true } },
      },
    }),
    prisma.tkt_platform.findMany({
      where: {
        tenant_id: tenantId,
        ...(isSuper ? {} : { id: { in: tkt?.platformIds.length ? tkt.platformIds : ['__none__'] } }),
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true, code: true, accent_color: true },
    }),
  ])

  const tickets: TicketCard[] = [...open, ...finished].map((t) => ({
    id: t.id,
    ticketNumber: t.ticket_number,
    status: t.status,
    subType: t.sub_type,
    createdAt: t.created_at.toISOString(),
    platform: {
      id: t.platform.id,
      name: t.platform.name,
      slug: t.platform.slug,
      code: t.platform.code,
      accentColor: t.platform.accent_color,
    },
    branch: {
      id: t.branch.id,
      name: t.branch.name,
      branchNumber: t.branch.branch_number,
      code: t.branch.code,
    },
  }))

  const platforms: PlatformOption[] = platformsRaw.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    code: p.code,
    accentColor: p.accent_color,
  }))

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
            {(() => {
              const sub = isSuper ? deptFilter : tkt?.departmentSubType
              const name = sub ? departmentNameForSubType(sub) : null
              return name ? `${name} — Tickets` : 'Ticket System'
            })()}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {tickets.length.toLocaleString()} tickets in view
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <TicketKanbanBoard tickets={tickets} platforms={platforms} />
      </div>
    </div>
  )
}
