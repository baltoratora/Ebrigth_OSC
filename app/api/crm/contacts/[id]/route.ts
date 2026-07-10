import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { getContactById } from '@/server/queries/contacts'
import { UpdateContactSchema } from '@/lib/crm/validations/contact'
import { updateContact, deleteContact } from '@/server/actions/contacts'
import { logAudit } from '@/lib/crm/audit'
import { createHash } from 'crypto'
import { isReadOnlyViewer } from '@/lib/crm/operation-accounts'

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function resolveSession(req: NextRequest): Promise<{ userId: string; userEmail: string; tenantId: string } | null> {
  const apiKey = req.headers.get('x-api-key')
  if (apiKey) {
    const hashed = createHash('sha256').update(apiKey, 'utf8').digest('hex')
    const keyRecord = await prisma.crm_api_key.findUnique({
      where: { hashedKey: hashed },
      select: { tenantId: true, revokedAt: true, createdByUserId: true },
    })
    if (keyRecord && !keyRecord.revokedAt) {
      return {
        userId: keyRecord.createdByUserId ?? 'api',
        userEmail: 'api',
        tenantId: keyRecord.tenantId,
      }
    }
  }

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return null

  const userBranch = await prisma.crm_user_branch.findFirst({
    where: { userId: session.user.id },
    select: { tenantId: true },
  })
  if (userBranch) {
    return {
      userId: session.user.id,
      userEmail: session.user.email ?? '',
      tenantId: userBranch.tenantId,
    }
  }

  // Read-only viewer (CEO) without a branch link: allow VIEWING a contact's
  // detail. PATCH/DELETE here call updateContact/deleteContact, which enforce
  // contacts:write/delete (AGENCY_ADMIN lacks both) — and middleware backstops.
  if (isReadOnlyViewer(session.user.email)) {
    const tenant =
      (await prisma.crm_tenant.findFirst({ where: { slug: { in: ['ebright', 'ebright-demo'] } }, select: { id: true } })) ??
      (await prisma.crm_tenant.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } }))
    if (tenant) {
      return { userId: session.user.id, userEmail: session.user.email ?? '', tenantId: tenant.id }
    }
  }
  return null
}

// ─── GET /api/crm/contacts/[id] ──────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sess = await resolveSession(req)
    if (!sess) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const contact = await getContactById(sess.tenantId, id)
    if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // PDPA audit log for READ
    void logAudit({
      tenantId: sess.tenantId,
      userId: sess.userId,
      userEmail: sess.userEmail,
      action: 'READ',
      entity: 'crm_contact',
      entityId: id,
    })

    return NextResponse.json(contact)
  } catch (err) {
    console.error('[GET /api/crm/contacts/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── PATCH /api/crm/contacts/[id] ────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sess = await resolveSession(req)
    if (!sess) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const body = await req.json()
    const parsed = UpdateContactSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', issues: parsed.error.issues },
        { status: 400 },
      )
    }

    const result = await updateContact(id, parsed.data, sess.userId)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[PATCH /api/crm/contacts/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── DELETE /api/crm/contacts/[id] ───────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sess = await resolveSession(req)
    if (!sess) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const result = await deleteContact(id, sess.userId)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/crm/contacts/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
