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

    const appId = process.env.META_APP_ID
    if (!appId) {
      return NextResponse.json({ error: 'META_APP_ID not configured' }, { status: 500 })
    }

    const redirectUri = encodeURIComponent(
      `${process.env.NEXT_PUBLIC_APP_URL ?? `https://${req.headers.get('host')}`}/api/crm/integrations/meta/callback`,
    )
    const scope = 'pages_read_engagement,leads_retrieval,ads_read'
    const state = Buffer.from(JSON.stringify({ branchId: userBranch.branchId })).toString('base64url')

    const oauthUrl =
      `https://www.facebook.com/v20.0/dialog/oauth` +
      `?client_id=${appId}` +
      `&redirect_uri=${redirectUri}` +
      `&scope=${scope}` +
      `&state=${state}` +
      `&response_type=code`

    return NextResponse.redirect(oauthUrl)
  } catch (err) {
    console.error('[GET /api/crm/integrations/meta/connect]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
