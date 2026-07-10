import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { encrypt } from '@/lib/crm/crypto'

interface GoogleTokenResponse {
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
      console.error('[Google callback] OAuth error:', error)
      return NextResponse.redirect(new URL('/crm/integrations?error=google_oauth', req.url))
    }

    if (!code || !stateRaw) {
      return NextResponse.redirect(new URL('/crm/integrations?error=google_missing_code', req.url))
    }

    let branchId: string
    try {
      const state = JSON.parse(Buffer.from(stateRaw, 'base64url').toString('utf8')) as { branchId: string }
      branchId = state.branchId
    } catch {
      return NextResponse.redirect(new URL('/crm/integrations?error=google_invalid_state', req.url))
    }

    const branch = await prisma.crm_branch.findUnique({
      where: { id: branchId },
      select: { tenantId: true },
    })
    if (!branch) {
      return NextResponse.redirect(new URL('/crm/integrations?error=google_invalid_branch', req.url))
    }

    const clientId = process.env.GOOGLE_CLIENT_ID!
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? `https://${req.headers.get('host')}`}/api/crm/integrations/google/callback`

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    })

    if (!tokenRes.ok) {
      const body = await tokenRes.text()
      console.error('[Google callback] Token exchange failed:', body)
      return NextResponse.redirect(new URL('/crm/integrations?error=google_token_exchange', req.url))
    }

    const tokenData = (await tokenRes.json()) as GoogleTokenResponse

    if (tokenData.error) {
      console.error('[Google callback] Token error:', tokenData.error_description)
      return NextResponse.redirect(new URL('/crm/integrations?error=google_token_error', req.url))
    }

    // Determine integration type from scope
    const scope = tokenData.scope ?? ''
    const isCalendar = scope.includes('calendar')
    const isForms = scope.includes('spreadsheets') || scope.includes('drive')

    // Upsert both integration records (Google provides all scopes in one OAuth)
    const typesToCreate: Array<'GOOGLE_CALENDAR' | 'GOOGLE_FORMS'> = []
    if (isCalendar) typesToCreate.push('GOOGLE_CALENDAR')
    if (isForms) typesToCreate.push('GOOGLE_FORMS')
    if (typesToCreate.length === 0) typesToCreate.push('GOOGLE_CALENDAR', 'GOOGLE_FORMS')

    for (const intType of typesToCreate) {
      const integration = await prisma.crm_integration.upsert({
        where: { branchId_type: { branchId, type: intType } },
        create: {
          tenantId: branch.tenantId,
          branchId,
          type: intType,
          status: 'CONNECTED',
        },
        update: {
          status: 'CONNECTED',
          lastSyncAt: new Date(),
        },
      })

      // Only store token on first integration (shared OAuth)
      const existingTokens = await prisma.crm_integration_oauth_token.count({
        where: { integrationId: integration.id },
      })
      if (existingTokens === 0) {
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
      } else {
        // Update existing token
        await prisma.crm_integration_oauth_token.updateMany({
          where: { integrationId: integration.id },
          data: {
            accessToken: encrypt(tokenData.access_token),
            refreshToken: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null,
            expiresAt: tokenData.expires_in
              ? new Date(Date.now() + tokenData.expires_in * 1000)
              : null,
            updatedAt: new Date(),
          },
        })
      }
    }

    return NextResponse.redirect(new URL('/crm/integrations?connected=google', req.url))
  } catch (err) {
    console.error('[GET /api/crm/integrations/google/callback]', err)
    return NextResponse.redirect(new URL('/crm/integrations?error=google_unknown', req.url))
  }
}
