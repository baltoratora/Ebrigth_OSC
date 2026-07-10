import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/crm/db'
import { scopedPrisma } from '@/lib/crm/tenancy'
import { normalizePhone } from '@/lib/crm/utils'
import type { Prisma } from '@prisma/client'

// GET /api/crm/contacts/check-duplicate?phone=xxx&email=xxx&tenantId=xxx

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const phone = sp.get('phone') ?? undefined
    const email = sp.get('email') ?? undefined
    const tenantId = sp.get('tenantId')

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 })
    }

    if (!phone && !email) {
      return NextResponse.json({ duplicate: false })
    }

    const scope = scopedPrisma(tenantId)
    const orClauses: Prisma.crm_contactWhereInput[] = []

    if (phone) {
      const normalized = normalizePhone(phone)
      orClauses.push({ phone: normalized })
      // Also check original in case stored differently
      if (normalized !== phone) orClauses.push({ phone })
    }

    if (email && email !== '') {
      orClauses.push({ email: { equals: email, mode: 'insensitive' } })
    }

    if (orClauses.length === 0) {
      return NextResponse.json({ duplicate: false })
    }

    const existing = await prisma.crm_contact.findFirst({
      where: {
        ...scope.whereOnly(),
        deletedAt: null,
        OR: orClauses,
      },
      select: { id: true, firstName: true, lastName: true },
    })

    if (!existing) {
      return NextResponse.json({ duplicate: false })
    }

    return NextResponse.json({
      duplicate: true,
      contact: {
        id: existing.id,
        name: `${existing.firstName}${existing.lastName ? ' ' + existing.lastName : ''}`,
      },
    })
  } catch (err) {
    console.error('[GET /api/crm/contacts/check-duplicate]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
