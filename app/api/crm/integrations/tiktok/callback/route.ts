import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { encrypt } from '@/lib/crm/crypto'

interface TikTokTokenResponse {
  data?: {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    scope?: string
  }
  code?: number
  message?: string
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) {
      return NextResponse.redirect(new URL('/crm/login', req.url))
    }

    const sp = req.nextUrl.searchParams
    const authCode = sp.get('auth_code') ?? sp.get('code')
    const stateRaw = sp.get('state')

    if (!authCode || !stateRaw) {
      return NextResponse.redirect(new URL('/crm/integrations?error=tiktok_missing_code', req.url))
    }

    let branchId: string
    try {
      const state = JSON.parse(Buffer.from(stateRaw, 'base64url').toString('utf8')) as { branchId: string }
      branchId = state.branchId
    } catch {
      return NextResponse.redirect(new URL('/crm/integrations?error=tiktok_invalid_state', req.url))
    }

    const branch = await prisma.crm_branch.findUnique({
      where: { id: branchId },
      select: { tenantId: true },
    })
    if (!branch) {
      return NextResponse.redirect(new URL('/crm/integrations?error=tiktok_invalid_branch', req.url))
    }

    const appId = process.env.TIKTOK_APP_ID!
    const appSecret = process.env.TIKTOK_APP_SECRET!

    const tokenRes = await fetch('https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: appId,
        secret: appSecret,
        auth_code: authCode,
      }),
    })

    if (!tokenRes.ok) {
      console.error('[TikTok callback] Token exchange failed:', await tokenRes.text())
      return NextResponse.redirect(new URL('/crm/integrations?error=tiktok_token_exchange', req.url))
    }

    const tokenData = (await tokenRes.json()) as TikTokTokenResponse
    const accessToken = tokenData.data?.access_token
    const refreshToken = tokenData.data?.refresh_token

    if (!accessToken) {
      console.error('[TikTok callback] No access token in response:', tokenData)
      return NextResponse.redirect(new URL('/crm/integrations?error=tiktok_no_token', req.url))
    }

    const integration = await prisma.crm_integration.upsert({
      where: { branchId_type: { branchId, type: 'TIKTOK' } },
      create: {
        tenantId: branch.tenantId,
        branchId,
        type: 'TIKTOK',
        status: 'CONNECTED',
      },
      update: {
        status: 'CONNECTED',
        lastSyncAt: new Date(),
      },
    })

    await prisma.crm_integration_oauth_token.deleteMany({
      where: { integrationId: integration.id },
    })
    await prisma.crm_integration_oauth_token.create({
      data: {
        integrationId: integration.id,
        accessToken: encrypt(accessToken),
        refreshToken: refreshToken ? encrypt(refreshToken) : null,
        expiresAt: tokenData.data?.expires_in
          ? new Date(Date.now() + tokenData.data.expires_in * 1000)
          : null,
        scope: tokenData.data?.scope ?? null,
      },
    })

    return NextResponse.redirect(new URL('/crm/integrations?connected=tiktok', req.url))
  } catch (err) {
    console.error('[GET /api/crm/integrations/tiktok/callback]', err)
    return NextResponse.redirect(new URL('/crm/integrations?error=tiktok_unknown', req.url))
  }
}
