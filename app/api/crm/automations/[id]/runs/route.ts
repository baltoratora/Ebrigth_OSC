import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const runs = await prisma.crm_automation_run.findMany({
    where: { automationId: id },
    orderBy: { startedAt: 'desc' },
    take: 20,
    include: { contact: { select: { id: true, firstName: true, lastName: true } } },
  })

  return NextResponse.json(runs)
}
