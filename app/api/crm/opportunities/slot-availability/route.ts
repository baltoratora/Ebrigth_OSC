import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { TRIAL_CAPACITY } from '@/lib/crm/trial-config'

/**
 * Counts existing trial-class bookings for each time slot on a given date, so
 * the "Confirmed for Trial" modal can grey out slots that are already full.
 *
 * Query params:
 *   - date     YYYY-MM-DD  (required)
 *   - branchId uuid        (optional — if omitted, counts across all branches)
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userBranch = await prisma.crm_user_branch.findFirst({
    where: { userId: session.user.id },
    select: { tenantId: true },
  })
  if (!userBranch) {
    return NextResponse.json({ error: 'No tenant' }, { status: 403 })
  }

  const date = req.nextUrl.searchParams.get('date')
  const branchId = req.nextUrl.searchParams.get('branchId') ?? undefined
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  }

  const dayStart = new Date(`${date}T00:00:00`)
  const dayEnd = new Date(`${date}T23:59:59.999`)

  const appointments = await prisma.crm_appointment.findMany({
    where: {
      tenantId: userBranch.tenantId,
      title: 'Trial Class',
      startAt: { gte: dayStart, lte: dayEnd },
      ...(branchId ? { branchId } : {}),
    },
    select: { startAt: true },
  })

  // Bucket by HH:MM (24h, local time).
  const counts: Record<string, number> = {}
  for (const a of appointments) {
    const d = new Date(a.startAt)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const key = `${hh}:${mm}`
    counts[key] = (counts[key] ?? 0) + 1
  }

  return NextResponse.json({ date, branchId: branchId ?? null, capacity: TRIAL_CAPACITY, counts })
}
