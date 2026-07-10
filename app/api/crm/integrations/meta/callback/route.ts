import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { encrypt } from '@/lib/crm/crypto'

interface MetaTokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) {
      return NextResponse.redirect(new URL('/crm/login', req.url))
    }

    const sp = req.nextUrl.searchParams
    const code = sp.get('code')
    const stateRaw = sp.get('state')
    const error = sp.get('error')

    if (error) {
      console.error('[Meta callback] OAuth error:', error, sp.get('error_description'))
      return NextResponse.redirect(new URL('/crm/integrations?error=meta_oauth', req.url))
    }

    if (!code || !stateRaw) {
      return NextResponse.redirect(new URL('/crm/integrations?error=meta_missing_code', req.url))
    }

    let branchId: string
    try {
      const state = JSON.parse(Buffer.from(stateRaw, 'base64url').toString('utf8')) as { branchId: string }
      branchId = state.branchId
    } catch {
      return NextResponse.redirect(new URL('/crm/integrations?error=meta_invalid_state', req.url))
    }

    const branch = await prisma.crm_branch.findUnique({
      where: { id: branchId },
      select: { tenantId: true },
    })
    if (!branch) {
      return NextResponse.redirect(new URL('/crm/integrations?error=meta_invalid_branch', req.url))
    }

    // Exchange code for access token
    const appId = process.env.META_APP_ID!
    const appSecret = process.env.META_APP_SECRET!
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? `https://${req.headers.get('host')}`}/api/crm/integrations/meta/callback`

    const tokenRes = await fetch(
      `https://graph.facebook.com/v20.0/oauth/access_token` +
        `?client_id=${appId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&client_secret=${appSecret}` +
        `&code=${code}`,
    )

    if (!tokenRes.ok) {
      const body = await tokenRes.text()
      console.error('[Meta callback] Token exchange failed:', body)
      return NextResponse.redirect(new URL('/crm/integrations?error=meta_token_exchange', req.url))
    }

    const tokenData = (await tokenRes.json()) as MetaTokenResponse
    const accessToken = tokenData.access_token

    // Store integration + token
    const integration = await prisma.crm_integration.upsert({
      where: { branchId_type: { branchId, type: 'META' } },
      create: {
        tenantId: branch.tenantId,
        branchId,
        type: 'META',
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
        expiresAt: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000)
          : null,
      },
    })

    // Subscribe to Meta Lead Ads webhook
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://${req.headers.get('host')}`
    const webhookUrl = `${appUrl}/api/webhooks/meta/${branchId}`
    const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN ?? 'ebright_meta_verify'

    try {
      await fetch(
        `https://graph.facebook.com/v20.0/${appId}/subscriptions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            object: 'page',
            callback_url: webhookUrl,
            fields: 'leadgen',
            verify_token: verifyToken,
            access_token: `${appId}|${appSecret}`,
          }).toString(),
        },
      )
    } catch (webhookErr) {
      console.warn('[Meta callback] Webhook subscription failed:', webhookErr)
    }

    return NextResponse.redirect(new URL('/crm/integrations?connected=meta', req.url))
  } catch (err) {
    console.error('[GET /api/crm/integrations/meta/callback]', err)
    return NextResponse.redirect(new URL('/crm/integrations?error=meta_unknown', req.url))
  }
}
