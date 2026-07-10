import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { z } from 'zod'
import { denyReadOnlyViewer } from '@/lib/crm/admin-session'

const Schema = z.object({ enabled: z.boolean() })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await denyReadOnlyViewer(); if (denied) return denied
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = Schema.parse(await req.json())

  const automation = await prisma.crm_automation.update({
    where: { id },
    data: { enabled: body.enabled, updatedAt: new Date() },
  })

  return NextResponse.json(automation)
}
