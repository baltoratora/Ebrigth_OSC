import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { scopedPrisma } from '@/lib/crm/tenancy'
import { z } from 'zod'
import { denyReadOnlyViewer } from '@/lib/crm/admin-session'

const CallSchema = z.object({
  outcome: z.string().optional(),
  notes: z.string().optional(),
  duration: z.number().int().nonnegative().nullable().optional(),
  userId: z.string().uuid().optional(),
})

async function resolveTenantId(userId: string): Promise<string | null> {
  const ub = await prisma.crm_user_branch.findFirst({
    where: { userId },
    select: { tenantId: true },
  })
  return ub?.tenantId ?? null
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await denyReadOnlyViewer(); if (denied) return denied
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tenantId = await resolveTenantId(session.user.id)
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const scope = scopedPrisma(tenantId)
    const { id: contactId } = await params

    const body = await req.json()
    const parsed = CallSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation error' }, { status: 400 })
    }

    const contact = await prisma.crm_contact.findFirst({
      where: scope.where({ id: contactId, deletedAt: null }),
      select: { id: true },
    })
    if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const call = await prisma.crm_call.create({
      data: scope.data({
        contactId,
        userId: session.user.id,
        outcome: parsed.data.outcome,
        notes: parsed.data.notes,
        duration: parsed.data.duration ?? null,
      }),
    })

    return NextResponse.json(call, { status: 201 })
  } catch (err) {
    console.error('[POST /api/crm/contacts/[id]/calls]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
