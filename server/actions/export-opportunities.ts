'use server'

import type { Prisma } from '@prisma/client'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { resolveBranchAccess } from '@/lib/crm/branch-access'

export interface OppExportRow {
  name: string
  parent: string
  phone: string
  email: string
  branch: string
  createdAt: string
  updatedAt: string
  stage: string
  leadSource: string
  remarks: string
}

/**
 * Detailed opportunities export for the kanban 3-dot menu. Exports EXACTLY the
 * cards currently shown on the board (the client passes the post-filter
 * opportunity IDs), so date / lead-source / age / search filters are honoured.
 * Still constrained to the caller's tenant + branch scope server-side so a
 * tampered request can't reach other branches' data.
 */
export async function exportOpportunities(
  ids: string[],
): Promise<{ ok: boolean; rows?: OppExportRow[]; error?: string }> {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    const userId = session?.user?.id
    if (!userId) return { ok: false, error: 'Unauthorized' }
    const access = await resolveBranchAccess(userId)
    if (!access) return { ok: false, error: 'No access' }
    const { tenantId, elevated, branchIds } = access

    if (!ids || ids.length === 0) return { ok: true, rows: [] }

    const where: Prisma.crm_opportunityWhereInput = {
      tenantId,
      deletedAt: null,
      contact: { deletedAt: null },
      id: { in: ids },
    }
    if (!elevated) where.branchId = { in: branchIds }

    const opps = await prisma.crm_opportunity.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        updatedAt: true,
        stage: { select: { name: true } },
        branch: { select: { name: true } },
        contact: {
          select: {
            firstName: true, lastName: true, parentFullName: true,
            phone: true, email: true, remarks: true,
            leadSource: { select: { name: true } },
          },
        },
      },
    })

    const fmt = (d: Date) =>
      new Date(d).toLocaleString('en-GB', {
        timeZone: 'Asia/Kuala_Lumpur',
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })

    const rows: OppExportRow[] = opps.map((o) => ({
      name: `${o.contact.firstName} ${o.contact.lastName ?? ''}`.trim(),
      parent: o.contact.parentFullName ?? '',
      phone: o.contact.phone ?? '',
      email: o.contact.email ?? '',
      branch: o.branch?.name ?? '',
      createdAt: fmt(o.createdAt),
      updatedAt: fmt(o.updatedAt),
      stage: o.stage.name,
      leadSource: o.contact.leadSource?.name ?? '',
      remarks: o.contact.remarks ?? '',
    }))

    return { ok: true, rows }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Export failed' }
  }
}
