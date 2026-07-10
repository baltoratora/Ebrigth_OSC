import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { triggerAutomationTest } from '@/server/actions/automations'
import { denyReadOnlyViewer } from '@/lib/crm/admin-session'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await denyReadOnlyViewer(); if (denied) return denied
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { contactId } = await req.json() as { contactId: string }
  if (!contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 })

  const result = await triggerAutomationTest(id, contactId)
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ runId: result.runId })
}
