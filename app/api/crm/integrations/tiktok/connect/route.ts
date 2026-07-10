import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { denyReadOnlyViewer } from '@/lib/crm/admin-session'

export async function GET(req: NextRequest) {
  try {
    const denied = await denyReadOnlyViewer(); if (denied) return denied
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) {
      return NextResponse.redirect(new URL('/crm/login', req.url))
    }

    const userBranch = await prisma.crm_user_branch.findFirst({
      where: { userId: session.user.id },
      select: { branchId: true },
    })
    if (!userBranch) {
      return NextResponse.json({ error: 'No branch assigned' }, { status: 400 })
    }

    const appId = process.env.TIKTOK_APP_ID
    if (!appId) {
      return NextResponse.json({ error: 'TIKTOK_APP_ID not configured' }, { status: 500 })
    }

    const redirectUri = encodeURIComponent(
      `${process.env.NEXT_PUBLIC_APP_URL ?? `https://${req.headers.get('host')}`}/api/crm/integrations/tiktok/callback`,
    )
    const state = Buffer.from(JSON.stringify({ branchId: userBranch.branchId })).toString('base64url')
    const scope = 'lead.readonly'

    const oauthUrl =
      `https://business-api.tiktok.com/portal/auth` +
      `?app_id=${appId}` +
      `&redirect_uri=${redirectUri}` +
      `&state=${state}` +
      `&scope=${scope}`

    return NextResponse.redirect(oauthUrl)
  } catch (err) {
    console.error('[GET /api/crm/integrations/tiktok/connect]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
