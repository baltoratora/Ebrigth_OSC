import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { z } from 'zod'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'

const Schema = z.object({
  endpoint: z.string().url().optional(),
})

/**
 * POST /api/crm/push/unsubscribe
 *
 * If `endpoint` is provided, deletes that specific subscription row.
 * Otherwise deletes every subscription belonging to the current user
 * (used when the user toggles push off — they want to stop receiving on
 * every device they registered).
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = Schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { endpoint } = parsed.data

  const result = endpoint
    ? await prisma.crm_push_subscription.deleteMany({
        where: { userId: session.user.id, endpoint },
      })
    : await prisma.crm_push_subscription.deleteMany({
        where: { userId: session.user.id },
      })

  return NextResponse.json({ ok: true, deleted: result.count })
}
