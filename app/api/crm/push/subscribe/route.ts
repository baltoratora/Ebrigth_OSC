import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { z } from 'zod'

const Schema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string(),
  auth: z.string(),
  // Client hint only — the server resolves the real tenant from the session
  // so the toggle works even when the client couldn't supply a tenantId
  // (which previously made the toggle silently do nothing for some users).
  tenantId: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = Schema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid subscription payload' }, { status: 400 })
    }
    const body = parsed.data

    // Source of truth for the tenant: the user's branch link. Fall back to the
    // client-provided value only if the user has no link yet.
    const ub = await prisma.crm_user_branch.findFirst({
      where: { userId: session.user.id },
      select: { tenantId: true },
    })
    const tenantId = ub?.tenantId ?? body.tenantId
    if (!tenantId) {
      return NextResponse.json({ error: 'No tenant associated with this account' }, { status: 400 })
    }

    await prisma.crm_push_subscription.upsert({
      where: { userId_endpoint: { userId: session.user.id, endpoint: body.endpoint } },
      create: {
        userId: session.user.id,
        tenantId,
        endpoint: body.endpoint,
        p256dh: body.p256dh,
        auth: body.auth,
      },
      update: { p256dh: body.p256dh, auth: body.auth, tenantId },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/crm/push/subscribe]', err)
    return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 })
  }
}
