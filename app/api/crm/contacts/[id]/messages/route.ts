import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { scopedPrisma } from '@/lib/crm/tenancy'
import { z } from 'zod'
import { denyReadOnlyViewer } from '@/lib/crm/admin-session'

const MessageSchema = z.object({
  channel: z.enum(['EMAIL', 'WHATSAPP', 'SMS']),
  direction: z.enum(['IN', 'OUT']).default('OUT'),
  body: z.string().min(1),
  subject: z.string().optional(),
})

async function resolveTenantAndBranch(userId: string) {
  const ub = await prisma.crm_user_branch.findFirst({
    where: { userId },
    select: { tenantId: true, branchId: true },
  })
  return ub ?? null
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await denyReadOnlyViewer(); if (denied) return denied
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await resolveTenantAndBranch(session.user.id)
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const scope = scopedPrisma(ctx.tenantId)
    const { id: contactId } = await params

    const body = await req.json()
    const parsed = MessageSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation error' }, { status: 400 })
    }

    const contact = await prisma.crm_contact.findFirst({
      where: scope.where({ id: contactId, deletedAt: null }),
      select: { id: true },
    })
    if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const message = await prisma.crm_message.create({
      data: scope.data({
        branchId: ctx.branchId,
        contactId,
        userId: session.user.id,
        channel: parsed.data.channel,
        direction: parsed.data.direction,
        body: parsed.data.body,
        subject: parsed.data.subject ?? null,
        status: 'pending',
      }),
    })

    // TODO: Trigger actual delivery via messaging queue

    return NextResponse.json(message, { status: 201 })
  } catch (err) {
    console.error('[POST /api/crm/contacts/[id]/messages]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
