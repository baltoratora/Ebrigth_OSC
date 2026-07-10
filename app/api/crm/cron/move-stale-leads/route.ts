/**
 * Cron endpoint — fires the stale-lead auto-progression scan on demand.
 *
 * In production the BullMQ staleLeadWorker runs this every hour
 * automatically. This HTTP endpoint exists for two cases:
 *
 *   1. Staging (no Redis) — an external cron service (or a curl in the
 *      host crontab) can hit this to keep the funnel moving.
 *   2. Manual one-off runs from ops — useful for testing or for catching
 *      up after a worker outage.
 *
 * Auth: pass `Authorization: Bearer ${CRON_SECRET}`. If CRON_SECRET is
 * unset the endpoint refuses every request so it can't be hit anonymously
 * by accident. There is NO session-cookie path here — this is a server-
 * to-server endpoint.
 */

import { NextRequest, NextResponse } from 'next/server'
import { moveStaleLeads } from '@/lib/crm/stale-leads'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured on this server' },
      { status: 503 },
    )
  }

  const auth = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`
  if (auth !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await moveStaleLeads()
    return NextResponse.json({
      ok: true,
      ranAt: new Date().toISOString(),
      ...result,
    })
  } catch (err) {
    console.error('[cron/move-stale-leads]', err)
    return NextResponse.json(
      { error: (err as Error).message ?? 'Internal error' },
      { status: 500 },
    )
  }
}

// GET — return a small dry-summary so ops can hit the URL in a browser to
// verify the endpoint is reachable without firing the scan. Same auth.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ status: 'CRON_SECRET not configured' }, { status: 503 })
  }
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({
    status: 'ready',
    description: 'POST to this URL with the same Authorization header to run the scan.',
  })
}
