import { NextResponse } from 'next/server'

/**
 * Full sign-out: clears CRM preview cookies AND the next-auth HRMS session
 * cookies, then 302s to /login.
 */
function buildResponse(target: string) {
  const res = NextResponse.redirect(new URL(target, process.env.NEXTAUTH_URL ?? 'http://localhost:3000'))

  // Mark preview as exited so the CRM login page shows the form instead of
  // auto-redirecting back to the dashboard.
  res.cookies.set('crm_preview_exit', '1', {
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
  })

  // Clear any active impersonation
  res.cookies.set('crm_preview_user', '', { path: '/', maxAge: 0 })

  // Clear next-auth (HRMS) session cookies. Both names are checked because
  // next-auth prefixes with __Secure- when NEXTAUTH_URL is https.
  for (const name of [
    'next-auth.session-token',
    '__Secure-next-auth.session-token',
    'next-auth.csrf-token',
    '__Host-next-auth.csrf-token',
    'next-auth.callback-url',
    '__Secure-next-auth.callback-url',
  ]) {
    res.cookies.set(name, '', { path: '/', maxAge: 0 })
  }

  // Clear Better Auth CRM session cookies too
  for (const name of ['better-auth.session_token', '__Secure-better-auth.session_token']) {
    res.cookies.set(name, '', { path: '/', maxAge: 0 })
  }

  return res
}

export async function GET() {
  return buildResponse('/login')
}

export async function POST() {
  return buildResponse('/login')
}
