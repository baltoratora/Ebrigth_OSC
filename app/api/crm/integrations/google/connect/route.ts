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

    const clientId = process.env.GOOGLE_CLIENT_ID
    if (!clientId) {
      return NextResponse.json({ error: 'GOOGLE_CLIENT_ID not configured' }, { status: 500 })
    }

    const redirectUri = encodeURIComponent(
      `${process.env.NEXT_PUBLIC_APP_URL ?? `https://${req.headers.get('host')}`}/api/crm/integrations/google/callback`,
    )
    const state = Buffer.from(JSON.stringify({ branchId: userBranch.branchId })).toString('base64url')

    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/spreadsheets.readonly',
      'https://www.googleapis.com/auth/drive.readonly',
    ].join(' ')

    const oauthUrl =
      `https://accounts.google.com/o/oauth2/v2/auth` +
      `?client_id=${clientId}` +
      `&redirect_uri=${redirectUri}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&access_type=offline` +
      `&prompt=consent` +
      `&state=${state}`

    return NextResponse.redirect(oauthUrl)
  } catch (err) {
    console.error('[GET /api/crm/integrations/google/connect]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
