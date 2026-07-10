import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { denyReadOnlyViewer } from '@/lib/crm/admin-session'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await denyReadOnlyViewer(); if (denied) return denied
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const original = await prisma.crm_automation.findUniqueOrThrow({ where: { id } })

  const copy = await prisma.crm_automation.create({
    data: {
      tenantId: original.tenantId,
      branchId: original.branchId,
      name: `Copy of ${original.name}`,
      triggerType: original.triggerType,
      triggerConfig: original.triggerConfig as object,
      graph: original.graph as object,
      enabled: false,
    },
  })

  return NextResponse.json(copy)
}
