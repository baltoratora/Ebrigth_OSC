import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { scopedPrisma } from '@/lib/crm/tenancy'
import { z } from 'zod'
import { denyReadOnlyViewer } from '@/lib/crm/admin-session'

const NoteSchema = z.object({
  body: z.string().min(1),
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
    const parsed = NoteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation error' }, { status: 400 })
    }

    // Verify contact belongs to tenant
    const contact = await prisma.crm_contact.findFirst({
      where: scope.where({ id: contactId, deletedAt: null }),
      select: { id: true },
    })
    if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const note = await prisma.crm_note.create({
      data: scope.data({
        contactId,
        body: parsed.data.body,
        userId: session.user.id,
      }),
    })

    return NextResponse.json(note, { status: 201 })
  } catch (err) {
    console.error('[POST /api/crm/contacts/[id]/notes]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
