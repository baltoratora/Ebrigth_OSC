import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { encrypt } from '@/lib/crm/crypto'

interface MicrosoftTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  token_type: string
  error?: string
  error_description?: string
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
      console.error('[Outlook callback] OAuth error:', error, sp.get('error_description'))
      return NextResponse.redirect(new URL('/crm/integrations?error=outlook_oauth', req.url))
    }

    if (!code || !stateRaw) {
      return NextResponse.redirect(new URL('/crm/integrations?error=outlook_missing_code', req.url))
    }

    let branchId: string
    try {
      const state = JSON.parse(Buffer.from(stateRaw, 'base64url').toString('utf8')) as { branchId: string }
      branchId = state.branchId
    } catch {
      return NextResponse.redirect(new URL('/crm/integrations?error=outlook_invalid_state', req.url))
    }

    const branch = await prisma.crm_branch.findUnique({
      where: { id: branchId },
      select: { tenantId: true },
    })
    if (!branch) {
      return NextResponse.redirect(new URL('/crm/integrations?error=outlook_invalid_branch', req.url))
    }

    const tenantAzure = process.env.MICROSOFT_TENANT_ID ?? 'common'
    const clientId = process.env.MICROSOFT_CLIENT_ID!
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET!
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? `https://${req.headers.get('host')}`}/api/crm/integrations/outlook/callback`

    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${tenantAzure}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }).toString(),
      },
    )

    if (!tokenRes.ok) {
      const body = await tokenRes.text()
      console.error('[Outlook callback] Token exchange failed:', body)
      return NextResponse.redirect(new URL('/crm/integrations?error=outlook_token_exchange', req.url))
    }

    const tokenData = (await tokenRes.json()) as MicrosoftTokenResponse

    if (tokenData.error) {
      console.error('[Outlook callback] Token error:', tokenData.error_description)
      return NextResponse.redirect(new URL('/crm/integrations?error=outlook_token_error', req.url))
    }

    const integration = await prisma.crm_integration.upsert({
      where: { branchId_type: { branchId, type: 'OUTLOOK' } },
      create: {
        tenantId: branch.tenantId,
        branchId,
        type: 'OUTLOOK',
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
        accessToken: encrypt(tokenData.access_token),
        refreshToken: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null,
        expiresAt: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000)
          : null,
        scope: tokenData.scope ?? null,
      },
    })

    return NextResponse.redirect(new URL('/crm/integrations?connected=outlook', req.url))
  } catch (err) {
    console.error('[GET /api/crm/integrations/outlook/callback]', err)
    return NextResponse.redirect(new URL('/crm/integrations?error=outlook_unknown', req.url))
  }
}
